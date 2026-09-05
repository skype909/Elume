"""Opt-in disposable-local PostgreSQL tests for existing-v010 adoption."""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from schema.adopt_existing_v010 import (  # noqa: E402
    EXPECTED_VERSIONS,
    AdoptionRefused,
    apply_adoption,
    check_database,
)
from schema.bootstrap_v010 import apply_bootstrap  # noqa: E402


RUN_INTEGRATION = os.getenv("ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS") == "1"


@unittest.skipUnless(RUN_INTEGRATION, "set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1 for local PostgreSQL tests")
class ExistingV010AdoptionTests(unittest.TestCase):
    def setUp(self):
        from db import DATABASE_URL

        source = make_url(DATABASE_URL)
        if source.drivername.split("+")[0] != "postgresql" or source.host not in {"127.0.0.1", "localhost", "::1"}:
            self.skipTest("adoption integration tests require loopback PostgreSQL")
        self.source_url = source
        self.admin_url = source.set(database="postgres")
        self.databases: list[str] = []

    def tearDown(self):
        for database_name in reversed(self.databases):
            self._drop_database(database_name)

    def _new_database(self, prefix="elume_adopt_v010"):
        database_name = f"{prefix}_{uuid.uuid4().hex[:12]}"
        engine = create_engine(self.admin_url, isolation_level="AUTOCOMMIT")
        try:
            with engine.connect() as connection:
                connection.execute(text(f'CREATE DATABASE "{database_name}"'))
        finally:
            engine.dispose()
        self.databases.append(database_name)
        return database_name

    def _drop_database(self, database_name):
        engine = create_engine(self.admin_url, isolation_level="AUTOCOMMIT")
        try:
            with engine.connect() as connection:
                connection.execute(
                    text(
                        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                        "WHERE datname = :database_name AND pid <> pg_backend_pid()"
                    ),
                    {"database_name": database_name},
                )
                connection.execute(text(f'DROP DATABASE IF EXISTS "{database_name}"'))
        finally:
            engine.dispose()

    def _url(self, database_name):
        return self.source_url.set(database=database_name).render_as_string(hide_password=False)

    def _existing_v010_without_ledger(self):
        database_name = self._new_database()
        target_url = self._url(database_name)
        apply_bootstrap(target_url)
        engine = create_engine(target_url)
        try:
            with engine.begin() as connection:
                connection.execute(text("DROP TABLE schema_migrations"))
        finally:
            engine.dispose()
        return database_name, target_url

    def _execute(self, target_url, sql):
        engine = create_engine(target_url)
        try:
            with engine.begin() as connection:
                connection.execute(text(sql))
        finally:
            engine.dispose()

    def test_exact_existing_v010_checks_and_adopts(self):
        database_name, target_url = self._existing_v010_without_ledger()
        result = check_database(target_url)
        self.assertTrue(result.compatible, result.mismatches)
        self.assertEqual(result.identity["application_table_count"], 42)

        apply_adoption(target_url, expected_database=database_name, confirm_v010_adoption=True)
        engine = create_engine(target_url)
        try:
            with engine.connect() as connection:
                versions = tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version")))
                self.assertEqual(versions, EXPECTED_VERSIONS)
        finally:
            engine.dispose()

    def test_already_ledgered_database_refuses(self):
        database_name = self._new_database()
        target_url = self._url(database_name)
        apply_bootstrap(target_url)
        self.assertEqual(check_database(target_url).status, "already_tracked")
        with self.assertRaisesRegex(AdoptionRefused, "already_tracked"):
            apply_adoption(target_url, expected_database=database_name, confirm_v010_adoption=True)

    def test_empty_database_refuses_and_directs_bootstrap(self):
        database_name = self._new_database("elume_adopt_empty")
        result = check_database(self._url(database_name))
        self.assertEqual(result.status, "empty")
        self.assertIn("bootstrap_v010", result.mismatches[0])

    def test_missing_table_refuses(self):
        _, target_url = self._existing_v010_without_ledger()
        self._execute(target_url, "DROP TABLE teacher_planner_state")
        result = check_database(target_url)
        self.assertEqual(result.status, "incompatible")
        self.assertIn("teacher_planner_state", "\n".join(result.mismatches))

    def test_missing_column_refuses(self):
        _, target_url = self._existing_v010_without_ledger()
        self._execute(target_url, "ALTER TABLE classes DROP COLUMN class_pin")
        result = check_database(target_url)
        self.assertEqual(result.status, "incompatible")
        self.assertIn("classes", "\n".join(result.mismatches))

    def test_type_and_nullability_mismatch_refuses(self):
        _, target_url = self._existing_v010_without_ledger()
        self._execute(target_url, "ALTER TABLE classes ALTER COLUMN class_code TYPE INTEGER USING NULL")
        self._execute(target_url, "ALTER TABLE classes ALTER COLUMN class_code SET NOT NULL")
        result = check_database(target_url)
        self.assertEqual(result.status, "incompatible")
        self.assertIn("classes", "\n".join(result.mismatches))

    def test_missing_historical_indexes_refuse(self):
        required_indexes = (
            "ix_collab_templates_owner_updated",
            "ix_collab_templates_source_class",
            "ix_school_department_memberships_school_user",
            "ix_department_collab_template_shares_template",
            "ix_department_saved_quiz_shares_quiz",
            "ix_ui_translation_override_revisions_override_created_at",
            "ix_ui_translation_override_revisions_reviewer_user_id",
        )
        for index_name in required_indexes:
            with self.subTest(index_name=index_name):
                _, target_url = self._existing_v010_without_ledger()
                self._execute(target_url, f"DROP INDEX {index_name}")
                result = check_database(target_url)
                self.assertEqual(result.status, "incompatible")
                self.assertIn(index_name, "\n".join(result.mismatches))

    def test_missing_legacy_size_columns_refuse(self):
        for table_name in ("notes", "tests"):
            with self.subTest(table_name=table_name):
                _, target_url = self._existing_v010_without_ledger()
                self._execute(target_url, f"ALTER TABLE {table_name} DROP COLUMN size_bytes")
                result = check_database(target_url)
                self.assertEqual(result.status, "incompatible")
                self.assertIn(f"{table_name}", "\n".join(result.mismatches))

    def test_cat4_cohort_schema_ahead_of_v010_refuses(self):
        _, target_url = self._existing_v010_without_ledger()
        self._execute(target_url, "ALTER TABLE cat4_baseline_sets ADD COLUMN cohort_key VARCHAR NOT NULL DEFAULT 'default'")
        self._execute(target_url, "ALTER TABLE cat4_baseline_sets ADD COLUMN cohort_name VARCHAR NOT NULL DEFAULT 'Default Cohort'")
        self._execute(target_url, "CREATE INDEX ix_cat4_baseline_sets_cohort_key ON cat4_baseline_sets (cohort_key)")
        result = check_database(target_url)
        self.assertEqual(result.status, "incompatible")
        self.assertIn("cat4_baseline_sets", "\n".join(result.mismatches))

    def test_nonapplication_view_is_harmless_but_public_base_table_is_not(self):
        _, target_url = self._existing_v010_without_ledger()
        self._execute(target_url, "CREATE VIEW harmless_v010_diagnostic AS SELECT 1 AS value")
        self.assertTrue(check_database(target_url).compatible)
        self._execute(target_url, "CREATE TABLE unexpected_public_table (id INTEGER PRIMARY KEY)")
        result = check_database(target_url)
        self.assertEqual(result.status, "incompatible")
        self.assertIn("unexpected_public_table", "\n".join(result.mismatches))

    def test_failed_ledger_insert_rolls_back_everything(self):
        database_name, target_url = self._existing_v010_without_ledger()
        with self.assertRaises(Exception):
            apply_adoption(
                target_url,
                expected_database=database_name,
                confirm_v010_adoption=True,
                versions=("001", "001"),
            )
        engine = create_engine(target_url)
        try:
            with engine.connect() as connection:
                exists = connection.execute(
                    text(
                        "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
                        "WHERE table_schema = 'public' AND table_name = 'schema_migrations')"
                    )
                ).scalar_one()
                self.assertFalse(exists)
        finally:
            engine.dispose()

    def test_second_apply_refuses_cleanly(self):
        database_name, target_url = self._existing_v010_without_ledger()
        apply_adoption(target_url, expected_database=database_name, confirm_v010_adoption=True)
        with self.assertRaisesRegex(AdoptionRefused, "already_tracked"):
            apply_adoption(target_url, expected_database=database_name, confirm_v010_adoption=True)


if __name__ == "__main__":
    unittest.main()
