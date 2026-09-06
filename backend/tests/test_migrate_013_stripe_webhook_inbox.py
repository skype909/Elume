"""Disposable local PostgreSQL tests for the ledger-gated Stripe webhook inbox migration."""
from __future__ import annotations

import json
import os
import sys
import unittest
import uuid
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from schema.bootstrap_v010 import apply_bootstrap
from schema.migrate_011_cat4_cohort_schema import apply_migration as apply_011
from schema.migrate_012_account_entitlements import apply_migration as apply_012, verify_applied_migration as verify_012
from schema.migrate_013_stripe_webhook_inbox import (
    EXPECTED_POST_MIGRATION_VERSIONS as V013,
    EXPECTED_PRE_MIGRATION_VERSIONS as V012,
    MIGRATION_ADVISORY_LOCK_KEY,
    MigrationRefused,
    apply_down_migration,
    apply_migration,
    check_migration,
    verify_applied_migration,
)

RUN = os.getenv("ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS") == "1"
HASH = "a" * 64


@unittest.skipUnless(RUN, "set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1 for local PostgreSQL tests")
class Migration013Tests(unittest.TestCase):
    def setUp(self):
        from db import DATABASE_URL

        self.source = make_url(DATABASE_URL)
        if self.source.drivername.split("+", 1)[0] != "postgresql" or self.source.host not in {"127.0.0.1", "localhost", "::1"}:
            self.skipTest("requires a loopback PostgreSQL database")
        self.admin = self.source.set(database="postgres")
        self.databases: list[str] = []

    def tearDown(self):
        for database in self.databases:
            engine = create_engine(self.admin, isolation_level="AUTOCOMMIT")
            try:
                with engine.connect() as connection:
                    connection.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:name AND pid<>pg_backend_pid()"), {"name": database})
                    connection.execute(text(f'DROP DATABASE IF EXISTS "{database}"'))
            finally:
                engine.dispose()

    def new_v012(self):
        database = "elume_m013_" + uuid.uuid4().hex[:10]
        engine = create_engine(self.admin, isolation_level="AUTOCOMMIT")
        try:
            with engine.connect() as connection:
                connection.execute(text(f'CREATE DATABASE "{database}"'))
        finally:
            engine.dispose()
        self.databases.append(database)
        url = self.source.set(database=database).render_as_string(hide_password=False)
        apply_bootstrap(url)
        apply_011(url, expected_database=database, confirm_migration_011=True)
        apply_012(url, expected_database=database, confirm_migration_012=True)
        return database, url

    @staticmethod
    def tables(connection):
        return {row[0] for row in connection.execute(text("SELECT tablename FROM pg_tables WHERE schemaname='public'"))}

    @staticmethod
    def insert_event(connection, **overrides):
        values = {
            "stripe_event_id": "evt_" + uuid.uuid4().hex,
            "event_type": "invoice.paid",
            "stripe_created_at": "2026-09-06T12:00:00+00:00",
            "livemode": True,
            "payload_sha256": HASH,
            "event_data": json.dumps({"object": "invoice", "id": "in_test"}),
            "processing_state": "received",
        }
        values.update(overrides)
        columns = ", ".join(values)
        params = ", ".join("CAST(:event_data AS jsonb)" if key == "event_data" else ":" + key for key in values)
        return connection.execute(
            text(f"INSERT INTO stripe_webhook_events ({columns}) VALUES ({params}) RETURNING id"), values
        ).scalar_one()

    def assert_event_rejected(self, connection, **overrides):
        nested = connection.begin_nested()
        try:
            with self.assertRaises(Exception):
                self.insert_event(connection, **overrides)
        finally:
            nested.rollback()

    def test_upgrade_ledger_and_exact_schema(self):
        database, url = self.new_v012()
        engine = create_engine(url)
        try:
            with engine.connect() as connection:
                before_tables = self.tables(connection)
                before_ledger = tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version")))
        finally:
            engine.dispose()
        check_migration(url, expected_database=database)
        engine = create_engine(url)
        try:
            with engine.connect() as connection:
                self.assertEqual(self.tables(connection), before_tables)
                self.assertEqual(tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version"))), before_ledger)
        finally:
            engine.dispose()
        apply_migration(url, expected_database=database, confirm_migration_013=True)
        verify_applied_migration(url, expected_database=database)
        engine = create_engine(url)
        try:
            with engine.connect() as connection:
                self.assertEqual(tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version"))), V013)
                self.assertIn("stripe_webhook_events", self.tables(connection))
                self.assertEqual(len(self.tables(connection) - {"schema_migrations"}), 45)
                self.assertEqual(len(self.tables(connection)), 46)
                columns = {row[0]: row for row in connection.execute(text("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='stripe_webhook_events'"))}
                self.assertEqual(columns["event_data"][1:], ("jsonb", "NO"))
                self.assertEqual(columns["stripe_created_at"][1:], ("timestamp with time zone", "NO"))
        finally:
            engine.dispose()

    def test_preserves_v012_and_representative_data(self):
        database, url = self.new_v012()
        engine = create_engine(url)
        try:
            with engine.begin() as connection:
                user_id = connection.execute(text("""
                    INSERT INTO users(email,password_hash,role,is_active,email_verified,subscription_status,created_at,launch_offer_applied,billing_onboarding_required,ai_daily_limit,ai_prompt_count,storage_used_bytes)
                    VALUES('m013-preserve@example.test','x','teacher',TRUE,TRUE,'inactive',CURRENT_TIMESTAMP,FALSE,FALSE,0,0,0) RETURNING id
                """)).scalar_one()
                class_id = connection.execute(text("INSERT INTO classes(name,subject,is_archived) VALUES('M013','CAT4',FALSE) RETURNING id")).scalar_one()
                topic_id = connection.execute(text("INSERT INTO topics(class_id,name) VALUES(:class_id,'Topic') RETURNING id"), {"class_id": class_id}).scalar_one()
                connection.execute(text("INSERT INTO notes(class_id,topic_id,filename,stored_path,size_bytes,uploaded_at) VALUES(:class_id,:topic_id,'m013','x',19,CURRENT_TIMESTAMP)"), {"class_id": class_id, "topic_id": topic_id})
            apply_migration(url, expected_database=database, confirm_migration_013=True)
            with engine.connect() as connection:
                self.assertEqual(connection.execute(text("SELECT email FROM users WHERE id=:id"), {"id": user_id}).scalar_one(), "m013-preserve@example.test")
                self.assertEqual(connection.execute(text("SELECT size_bytes FROM notes WHERE filename='m013'" )).scalar_one(), 19)
                self.assertEqual(connection.execute(text("SELECT count(*) FROM information_schema.columns WHERE table_name='cat4_baseline_sets' AND column_name='cohort_key'" )).scalar_one(), 1)
                self.assertEqual(connection.execute(text("SELECT count(*) FROM information_schema.columns WHERE table_name='school_email_domains'" )).scalar_one(), 8)
        finally:
            engine.dispose()

    def test_constraints_unique_hash_json_and_state_matrix(self):
        database, url = self.new_v012()
        apply_migration(url, expected_database=database, confirm_migration_013=True)
        engine = create_engine(url)
        try:
            with engine.begin() as connection:
                event_id = "evt_unique"
                self.insert_event(connection, stripe_event_id=event_id)
                self.assert_event_rejected(connection, stripe_event_id=event_id)
                for bad_hash in ("A" * 64, "a" * 63, "a" * 65, "g" * 64):
                    with self.subTest(hash=bad_hash[:2]):
                        self.assert_event_rejected(connection, payload_sha256=bad_hash)
                for bad_data in ("[]", '"text"', "1", "null"):
                    with self.subTest(data=bad_data):
                        self.assert_event_rejected(connection, event_data=bad_data)
                valid = [
                    {"processing_state": "received"},
                    {"processing_state": "processing", "claimed_at": "2026-09-06T12:01:00+00:00"},
                    {"processing_state": "processed", "processed_at": "2026-09-06T12:01:00+00:00"},
                    {"processing_state": "ignored", "processed_at": "2026-09-06T12:01:00+00:00"},
                    {"processing_state": "failed", "failure_code": "database_unavailable", "failure_detail": "temporary database failure", "last_failure_at": "2026-09-06T12:01:00+00:00", "next_attempt_at": "2026-09-06T12:02:00+00:00"},
                ]
                for state in valid: self.insert_event(connection, **state)
                invalid = [
                    {"processing_state": "received", "processed_at": "2026-09-06T12:01:00+00:00"},
                    {"processing_state": "processing"},
                    {"processing_state": "processed"},
                    {"processing_state": "failed", "last_failure_at": "2026-09-06T12:01:00+00:00"},
                    {"processing_state": "failed", "failure_code": "Bad Code", "last_failure_at": "2026-09-06T12:01:00+00:00"},
                    {"processing_state": "unknown"},
                ]
                for state in invalid:
                    self.assert_event_rejected(connection, **state)
        finally:
            engine.dispose()

    def test_fk_set_null_and_indexes(self):
        database, url = self.new_v012()
        apply_migration(url, expected_database=database, confirm_migration_013=True)
        engine = create_engine(url)
        try:
            with engine.begin() as connection:
                user_id = connection.execute(text("""
                    INSERT INTO users(email,password_hash,role,is_active,email_verified,subscription_status,created_at,launch_offer_applied,billing_onboarding_required,ai_daily_limit,ai_prompt_count,storage_used_bytes)
                    VALUES('m013-fk@example.test','x','teacher',TRUE,TRUE,'inactive',CURRENT_TIMESTAMP,FALSE,FALSE,0,0,0) RETURNING id
                """)).scalar_one()
                event_id = self.insert_event(connection, resolved_user_id=user_id, stripe_subscription_id="sub_test", stripe_customer_id="cus_test", entity_key="sub_test")
                connection.execute(text("DELETE FROM users WHERE id=:id"), {"id": user_id})
                self.assertIsNone(connection.execute(text("SELECT resolved_user_id FROM stripe_webhook_events WHERE id=:id"), {"id": event_id}).scalar_one())
            with engine.connect() as connection:
                indexes = {row[0]: row[1] for row in connection.execute(text("SELECT indexname,indexdef FROM pg_indexes WHERE tablename='stripe_webhook_events'"))}
                self.assertIn("WHERE", indexes["ix_stripe_webhook_events_queue"])
                self.assertIn("received", indexes["ix_stripe_webhook_events_queue"])
                self.assertIn("failed", indexes["ix_stripe_webhook_events_queue"])
                for name in ("ix_stripe_webhook_events_subscription_created", "ix_stripe_webhook_events_customer_created", "ix_stripe_webhook_events_user_received", "ix_stripe_webhook_events_entity_created"):
                    self.assertIn(name, indexes)
        finally:
            engine.dispose()

    def test_refuses_missing_extra_partial_and_duplicate_states(self):
        for kind in ("missing", "extra", "partial", "duplicate"):
            with self.subTest(kind=kind):
                database, url = self.new_v012()
                engine = create_engine(url)
                try:
                    with engine.begin() as connection:
                        if kind == "missing": connection.execute(text("DELETE FROM schema_migrations WHERE version='012'"))
                        elif kind == "extra": connection.execute(text("INSERT INTO schema_migrations(version) VALUES('999')"))
                        elif kind == "partial": connection.execute(text("CREATE TABLE stripe_webhook_events(id INTEGER)"))
                        else:
                            connection.execute(text("INSERT INTO schema_migrations(version) VALUES('013')"))
                    with self.assertRaises(MigrationRefused): apply_migration(url, expected_database=database, confirm_migration_013=True)
                finally:
                    engine.dispose()

    def test_atomic_rollback_and_advisory_lock(self):
        database, url = self.new_v012()
        bad = Path(__file__).with_name("fixture_013_bad.sql")
        bad.write_text("CREATE TABLE stripe_webhook_events (id BIGINT);\nSELECT missing_013_function();", encoding="utf-8")
        try:
            with self.assertRaises(Exception): apply_migration(url, expected_database=database, confirm_migration_013=True, sql_path=bad)
        finally:
            bad.unlink(missing_ok=True)
        engine = create_engine(url)
        try:
            with engine.connect() as connection:
                self.assertNotIn("stripe_webhook_events", self.tables(connection))
                self.assertEqual(tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version"))), V012)
            connection = engine.connect(); transaction = connection.begin()
            try:
                connection.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": MIGRATION_ADVISORY_LOCK_KEY})
                with self.assertRaises(MigrationRefused): apply_migration(url, expected_database=database, confirm_migration_013=True)
            finally:
                transaction.rollback(); connection.close()
        finally:
            engine.dispose()

    def test_verifier_tamper_detection(self):
        for kind in ("index", "constraint", "foreign_key", "column_default"):
            with self.subTest(kind=kind):
                database, url = self.new_v012()
                apply_migration(url, expected_database=database, confirm_migration_013=True)
                engine = create_engine(url)
                try:
                    with engine.begin() as connection:
                        if kind == "index": connection.execute(text("DROP INDEX ix_stripe_webhook_events_queue"))
                        elif kind == "constraint":
                            connection.execute(text("ALTER TABLE stripe_webhook_events DROP CONSTRAINT ck_stripe_webhook_events_payload_sha256"))
                            connection.execute(text("ALTER TABLE stripe_webhook_events ADD CONSTRAINT ck_stripe_webhook_events_payload_sha256 CHECK (payload_sha256 <> '')"))
                        else:
                            if kind == "foreign_key":
                                fk = connection.execute(text("SELECT conname FROM pg_constraint WHERE conrelid='stripe_webhook_events'::regclass AND contype='f'" )).scalar_one()
                                connection.execute(text(f"ALTER TABLE stripe_webhook_events DROP CONSTRAINT {fk}"))
                                connection.execute(text("ALTER TABLE stripe_webhook_events ADD CONSTRAINT fk_wrong FOREIGN KEY(resolved_user_id) REFERENCES users(id) ON DELETE RESTRICT"))
                            else:
                                connection.execute(text("ALTER TABLE stripe_webhook_events ALTER COLUMN processing_state SET DEFAULT 'failed'"))
                    with self.assertRaises(MigrationRefused): verify_applied_migration(url, expected_database=database)
                finally:
                    engine.dispose()

    def test_guarded_down_empty_and_history_guard(self):
        database, url = self.new_v012()
        apply_migration(url, expected_database=database, confirm_migration_013=True)
        apply_down_migration(url, expected_database=database, confirm_migration_013_down=True)
        verify_012(url, expected_database=database)
        engine = create_engine(url)
        try:
            with engine.connect() as connection:
                self.assertNotIn("stripe_webhook_events", self.tables(connection))
                self.assertEqual(tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version"))), V012)
        finally:
            engine.dispose()
        database, url = self.new_v012()
        apply_migration(url, expected_database=database, confirm_migration_013=True)
        engine = create_engine(url)
        try:
            with engine.begin() as connection: self.insert_event(connection)
            with self.assertRaises(Exception): apply_down_migration(url, expected_database=database, confirm_migration_013_down=True)
            with engine.connect() as connection:
                self.assertEqual(connection.execute(text("SELECT count(*) FROM stripe_webhook_events")).scalar_one(), 1)
                self.assertEqual(tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version"))), V013)
        finally:
            engine.dispose()
