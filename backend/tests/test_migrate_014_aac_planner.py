"""Opt-in disposable PostgreSQL DDL coverage for migration 014; never runs by default."""
from __future__ import annotations

import os, sys, threading, unittest, uuid
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("JWT_SECRET", "aac-postgres-migration-test-secret-0123456789")
from schema.bootstrap_v010 import apply_bootstrap
from schema.migrate_011_cat4_cohort_schema import apply_migration as apply_011
from schema.migrate_012_account_entitlements import apply_migration as apply_012
from schema.migrate_013_stripe_webhook_inbox import apply_migration as apply_013
from schema.migrate_014_aac_planner import MigrationRefused, apply_down_migration, apply_migration, check_migration, verify_applied_migration
from schemas import AacApproveRequest, AacRevisionDraft
import main, models

ATOMIC_FAILURE_SQL = BACKEND / "tests" / "fixtures" / "migration_014_atomic_failure.sql"

RUN = os.getenv("ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS") == "1"

@unittest.skipUnless(RUN, "set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1 for disposable loopback PostgreSQL")
class Migration014PostgresTests(unittest.TestCase):
    def setUp(self):
        from db import DATABASE_URL
        self.source = make_url(DATABASE_URL)
        if self.source.drivername.split("+", 1)[0] != "postgresql" or self.source.host not in {"127.0.0.1", "localhost", "::1"}: self.skipTest("requires loopback PostgreSQL")
        self.admin, self.databases = self.source.set(database="postgres"), []

    def tearDown(self):
        for name in self.databases:
            engine = create_engine(self.admin, isolation_level="AUTOCOMMIT")
            try:
                with engine.connect() as c:
                    c.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:name AND pid<>pg_backend_pid()"), {"name": name})
                    c.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
            finally: engine.dispose()

    def new_v013(self):
        name = "elume_m014_" + uuid.uuid4().hex[:10]; engine = create_engine(self.admin, isolation_level="AUTOCOMMIT")
        with engine.connect() as c: c.execute(text(f'CREATE DATABASE "{name}"'))
        engine.dispose(); self.databases.append(name); url = self.source.set(database=name).render_as_string(hide_password=False)
        apply_bootstrap(url); apply_011(url, expected_database=name, confirm_migration_011=True); apply_012(url, expected_database=name, confirm_migration_012=True); apply_013(url, expected_database=name, confirm_migration_013=True)
        return name, url

    def test_upgrade_verify_and_guarded_down(self):
        name, url = self.new_v013(); check_migration(url, expected_database=name); apply_migration(url, expected_database=name, confirm_migration_014=True); verify_applied_migration(url, expected_database=name)
        engine = create_engine(url)
        try:
            with engine.begin() as c:
                self.assertEqual(tuple(r[0] for r in c.execute(text("SELECT version FROM schema_migrations ORDER BY version"))), tuple(f"{i:03d}" for i in range(1, 15)))
                self.assertEqual(c.execute(text("SELECT aac_planner_enabled FROM classes LIMIT 1")).scalar_one_or_none(), None)
                self.assertEqual(c.execute(text("SELECT count(*) FROM information_schema.tables WHERE table_name IN ('aac_projects','aac_plan_revisions','aac_student_progress','aac_practical_sessions','aac_source_documents')")).scalar_one(), 5)
                c.execute(text("INSERT INTO classes(name,subject,is_archived,aac_planner_enabled) VALUES('AAC','Physics',FALSE,TRUE)"))
            with self.assertRaises(MigrationRefused): apply_down_migration(url, expected_database=name, confirm_migration_014_down=True)
        finally: engine.dispose()

    def test_empty_database_allows_guarded_down_and_removes_ledger_entry(self):
        name, url = self.new_v013(); apply_migration(url, expected_database=name, confirm_migration_014=True)
        apply_down_migration(url, expected_database=name, confirm_migration_014_down=True)
        engine = create_engine(url)
        try:
            with engine.connect() as c:
                self.assertNotIn("014", [row[0] for row in c.execute(text("SELECT version FROM schema_migrations"))])
                self.assertIsNone(c.execute(text("SELECT to_regclass('public.aac_projects')")).scalar_one())
                self.assertIsNone(c.execute(text("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='classes' AND column_name='aac_planner_enabled'")).first())
        finally: engine.dispose()

    def test_catalog_and_atomic_failure_are_real_postgresql_transactions(self):
        name, url = self.new_v013()
        with self.assertRaises(Exception):
            apply_migration(url, expected_database=name, confirm_migration_014=True, sql_path=ATOMIC_FAILURE_SQL)
        engine = create_engine(url)
        try:
            with engine.connect() as c:
                self.assertIsNone(c.execute(text("SELECT to_regclass('public.aac_atomic_probe')")).scalar_one())
                self.assertNotIn("014", [row[0] for row in c.execute(text("SELECT version FROM schema_migrations"))])
            apply_migration(url, expected_database=name, confirm_migration_014=True)
            with engine.connect() as c:
                self.assertEqual(c.execute(text("SELECT data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='aac_plan_revisions' AND column_name='plan_json'")).scalar_one(), "jsonb")
                constraints = {row[0] for row in c.execute(text("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace"))}
                indexes = {row[0] for row in c.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname='public'"))}
                self.assertTrue({"ck_aac_plan_revisions_approval", "uq_aac_projects_class"} <= constraints)
                self.assertTrue({"ix_aac_projects_owner_class", "ix_aac_source_documents_project_purpose"} <= indexes)
        finally: engine.dispose()

    def test_advisory_and_aac_row_locks_serialize_competing_writers(self):
        name, url = self.new_v013(); engine = create_engine(url)
        try:
            with engine.begin() as held:
                held.execute(text("SELECT pg_advisory_xact_lock(81102014)"))
                with self.assertRaises(MigrationRefused): apply_migration(url, expected_database=name, confirm_migration_014=True)
            apply_migration(url, expected_database=name, confirm_migration_014=True)
            Session = sessionmaker(bind=engine)
            seed = Session()
            try:
                teacher = models.UserModel(email="fictional-lock-teacher@example.test", password_hash="x", role="teacher", is_active=True, email_verified=True)
                seed.add(teacher); seed.flush()
                cls = models.ClassModel(owner_user_id=teacher.id, name="Fictional lock class", subject="Physics", aac_planner_enabled=True)
                seed.add(cls); seed.flush()
                project = models.AacProjectModel(class_id=cls.id, owner_user_id=teacher.id, title="Fictional AAC", subject="Physics")
                seed.add(project); seed.flush()
                inputs = {"weekly_minutes":30,"fifth_year_end":"2026-05-29","sixth_year_restart":"2026-09-14","controlling_deadline":"2027-04-20","internal_completion_target":"2027-04-06","sixth_year_calendar_status":"reviewed"}
                revision = models.AacPlanRevisionModel(project_id=project.id, version=1, state="draft", source_requirements_json=[], assumptions_json=[], source_document_ids_json=[], planning_inputs_json=inputs, plan_json={"stages":[{"id":"fictional","name":"Fictional stage","estimated_minutes":30,"completion_date":"2027-03-20"}]})
                seed.add(revision); seed.commit(); token = main._aac_review_token(project, revision)
                teacher_id, class_id, revision_id = teacher.id, cls.id, revision.id
            finally: seed.close()
            held = Session(); held.begin()
            held.query(models.AacProjectModel).filter_by(class_id=class_id, owner_user_id=teacher_id).with_for_update().one()
            held.query(models.AacPlanRevisionModel).filter_by(id=revision_id).with_for_update().one()
            started, finished, failures = threading.Event(), threading.Event(), []
            def approve_in_other_session():
                session = Session()
                try:
                    user = session.query(models.UserModel).filter_by(id=teacher_id).one(); started.set()
                    main.approve_aac_plan(class_id, AacApproveRequest(revision_id=revision_id, review_token=token), session, user)
                except Exception as exc: failures.append(exc)
                finally: session.close(); finished.set()
            worker = threading.Thread(target=approve_in_other_session); worker.start(); self.assertTrue(started.wait(1)); self.assertFalse(finished.wait(0.2))
            held.commit(); worker.join(5)
            self.assertFalse(worker.is_alive()); self.assertEqual(failures, [])
            verify = Session()
            try:
                self.assertEqual(verify.query(models.AacPlanRevisionModel).filter_by(id=revision_id).one().state, "approved")
                self.assertEqual(verify.query(models.CalendarEvent).filter_by(class_id=class_id, event_type="aac").count(), 1)
            finally: verify.close()
        finally: engine.dispose()

    def test_saved_draft_change_invalidates_a_previously_reviewed_token(self):
        name, url = self.new_v013(); apply_migration(url, expected_database=name, confirm_migration_014=True); engine = create_engine(url)
        try:
            Session = sessionmaker(bind=engine); seed = Session()
            try:
                teacher = models.UserModel(email="fictional-stale-teacher@example.test", password_hash="x", role="teacher", is_active=True, email_verified=True)
                seed.add(teacher); seed.flush(); cls = models.ClassModel(owner_user_id=teacher.id, name="Fictional stale class", subject="Physics", aac_planner_enabled=True)
                seed.add(cls); seed.flush(); project = models.AacProjectModel(class_id=cls.id, owner_user_id=teacher.id, title="Fictional AAC", subject="Physics")
                seed.add(project); seed.flush()
                inputs = {"weekly_minutes":30,"fifth_year_end":"2026-05-29","sixth_year_restart":"2026-09-14","controlling_deadline":"2027-04-20","internal_completion_target":"2027-04-06","sixth_year_calendar_status":"reviewed"}
                revision = models.AacPlanRevisionModel(project_id=project.id, version=1, state="draft", source_requirements_json=[], assumptions_json=[], source_document_ids_json=[], planning_inputs_json=inputs, plan_json={"stages":[{"id":"fictional","name":"Fictional stage","estimated_minutes":30,"completion_date":"2027-03-20"}]})
                seed.add(revision); seed.commit(); token = main._aac_review_token(project, revision); teacher_id, class_id, revision_id = teacher.id, cls.id, revision.id
            finally: seed.close()
            writer = Session()
            try:
                user = writer.query(models.UserModel).filter_by(id=teacher_id).one()
                main.save_aac_revision(class_id, AacRevisionDraft(source_requirements=[], plan={"stages":[{"id":"fictional","name":"Fictional stage","estimated_minutes":45,"completion_date":"2027-03-20"}]}, assumptions=[], source_document_ids=[], planning_inputs={**inputs, "weekly_minutes":45}), writer, user)
            finally: writer.close()
            approver = Session()
            try:
                user = approver.query(models.UserModel).filter_by(id=teacher_id).one()
                with self.assertRaises(HTTPException) as refusal:
                    main.approve_aac_plan(class_id, AacApproveRequest(revision_id=revision_id, review_token=token), approver, user)
                self.assertEqual(refusal.exception.status_code, 409)
                self.assertEqual(approver.query(models.CalendarEvent).filter_by(class_id=class_id, event_type="aac").count(), 0)
            finally: approver.close()
        finally: engine.dispose()
