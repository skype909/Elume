"""Opt-in disposable-local PostgreSQL tests for the CAT4 cohort migration."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from schema.bootstrap_v010 import EXPECTED_VERSIONS, apply_bootstrap  # noqa: E402
from schema.migrate_011_cat4_cohort_schema import (  # noqa: E402
    EXPECTED_POST_MIGRATION_VERSIONS,
    MIGRATION_ADVISORY_LOCK_KEY,
    MigrationRefused,
    apply_down_migration,
    apply_migration,
    check_migration,
)


RUN_INTEGRATION = os.getenv("ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS") == "1"
COHORT_TABLES = (
    "cat4_baseline_sets",
    "cat4_term_result_sets",
    "cat4_workbook_versions",
)


@unittest.skipUnless(RUN_INTEGRATION, "set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1 for local PostgreSQL tests")
class Cat4CohortMigrationTests(unittest.TestCase):
    def setUp(self):
        from db import DATABASE_URL

        source = make_url(DATABASE_URL)
        if source.drivername.split("+")[0] != "postgresql" or source.host not in {"127.0.0.1", "localhost", "::1"}:
            self.skipTest("migration integration tests require loopback PostgreSQL")
        self.source_url = source
        self.admin_url = source.set(database="postgres")
        self.databases: list[str] = []

    def tearDown(self):
        for database_name in reversed(self.databases):
            engine = create_engine(self.admin_url, isolation_level="AUTOCOMMIT")
            try:
                with engine.connect() as connection:
                    connection.execute(
                        text(
                            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                            "WHERE datname = :name AND pid <> pg_backend_pid()"
                        ),
                        {"name": database_name},
                    )
                    connection.execute(text(f'DROP DATABASE IF EXISTS "{database_name}"'))
            finally:
                engine.dispose()

    def _new_database(self, prefix="elume_migration_011"):
        database_name = f"{prefix}_{uuid.uuid4().hex[:12]}"
        engine = create_engine(self.admin_url, isolation_level="AUTOCOMMIT")
        try:
            with engine.connect() as connection:
                connection.execute(text(f'CREATE DATABASE "{database_name}"'))
        finally:
            engine.dispose()
        self.databases.append(database_name)
        target_url = self.source_url.set(database=database_name).render_as_string(hide_password=False)
        apply_bootstrap(target_url)
        return database_name, target_url

    @staticmethod
    def _engine(target_url):
        return create_engine(target_url)

    def _populate_cat4_rows(self, target_url):
        engine = self._engine(target_url)
        try:
            with engine.begin() as connection:
                class_id = connection.execute(
                    text("INSERT INTO classes (name, subject, is_archived) VALUES ('Migration fixture', 'CAT4', FALSE) RETURNING id")
                ).scalar_one()
                connection.execute(
                    text(
                        "INSERT INTO cat4_baseline_sets (class_id, title, is_locked, created_at) "
                        "VALUES (:class_id, 'Baseline', FALSE, CURRENT_TIMESTAMP)"
                    ),
                    {"class_id": class_id},
                )
                connection.execute(
                    text(
                        "INSERT INTO cat4_term_result_sets (class_id, title, created_at) "
                        "VALUES (:class_id, 'Term', CURRENT_TIMESTAMP)"
                    ),
                    {"class_id": class_id},
                )
                connection.execute(
                    text(
                        "INSERT INTO cat4_workbook_versions "
                        "(class_id, version_number, workbook_name, uploaded_by_email, uploaded_at, is_active, "
                        "validation_summary_json, parsed_payload_json) "
                        "VALUES (:class_id, 1, 'Workbook', 'fixture@example.test', CURRENT_TIMESTAMP, TRUE, '{}', '{}')"
                    ),
                    {"class_id": class_id},
                )
        finally:
            engine.dispose()

    def _apply(self, database_name, target_url):
        apply_migration(target_url, expected_database=database_name, confirm_migration_011=True)

    def _columns(self, connection, table_name):
        return {
            row[0]: row
            for row in connection.execute(
                text(
                    "SELECT column_name, data_type, is_nullable, column_default "
                    "FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = :table_name"
                ),
                {"table_name": table_name},
            )
        }

    def test_upgrade_backfills_rows_and_records_011(self):
        database_name, target_url = self._new_database()
        self._populate_cat4_rows(target_url)
        check_migration(target_url, expected_database=database_name)
        self._apply(database_name, target_url)
        engine = self._engine(target_url)
        try:
            with engine.connect() as connection:
                versions = tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version")))
                self.assertEqual(versions, EXPECTED_POST_MIGRATION_VERSIONS)
                tables = {
                    row[0]
                    for row in connection.execute(
                        text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")
                    )
                }
                self.assertEqual(len(tables - {"schema_migrations"}), 42)
                for table_name in COHORT_TABLES:
                    columns = self._columns(connection, table_name)
                    for name in ("cohort_key", "cohort_name"):
                        self.assertEqual(columns[name][1], "character varying")
                        self.assertEqual(columns[name][2], "NO")
                        self.assertIsNone(columns[name][3])
                    self.assertEqual(
                        connection.execute(text(f"SELECT cohort_key, cohort_name FROM {table_name}")).one(),
                        ("default", "Default Cohort"),
                    )
                    index = connection.execute(
                        text(
                            "SELECT pg_get_indexdef(i.indexrelid), i.indisunique, i.indnkeyatts "
                            "FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid "
                            "JOIN pg_namespace n ON n.oid = c.relnamespace "
                            "WHERE n.nspname='public' AND c.relname=:name"
                        ),
                        {"name": f"ix_{table_name}_cohort_key"},
                    ).one()
                    self.assertIn(f"ON public.{table_name} USING btree (cohort_key)", index[0])
                    self.assertFalse(index[1])
                    self.assertEqual(index[2], 1)
                for table_name in ("notes", "tests"):
                    column = self._columns(connection, table_name)["size_bytes"]
                    self.assertEqual(column[1:], ("integer", "NO", "0"))
        finally:
            engine.dispose()

        with self.assertRaisesRegex(MigrationRefused, "expected ledger versions"):
            check_migration(target_url, expected_database=database_name)

    def test_second_apply_and_divergent_states_refuse_without_change(self):
        database_name, target_url = self._new_database()
        self._apply(database_name, target_url)
        with self.assertRaisesRegex(MigrationRefused, "expected ledger versions"):
            self._apply(database_name, target_url)

        other_name, other_url = self._new_database()
        engine = self._engine(other_url)
        try:
            with engine.begin() as connection:
                connection.execute(text("DELETE FROM schema_migrations WHERE version = '010'"))
        finally:
            engine.dispose()
        with self.assertRaisesRegex(MigrationRefused, "expected ledger versions"):
            self._apply(other_name, other_url)

    def test_historical_schema_divergence_refuses(self):
        database_name, target_url = self._new_database()
        engine = self._engine(target_url)
        try:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE cat4_baseline_sets ADD COLUMN unexpected_fixture_column VARCHAR"))
        finally:
            engine.dispose()
        with self.assertRaisesRegex(MigrationRefused, "Schema signature mismatch"):
            self._apply(database_name, target_url)

    def test_missing_or_unexpected_ledger_state_refuses(self):
        database_name, target_url = self._new_database()
        engine = self._engine(target_url)
        try:
            with engine.begin() as connection:
                connection.execute(text("DROP TABLE schema_migrations"))
        finally:
            engine.dispose()
        with self.assertRaisesRegex(MigrationRefused, "schema_migrations is absent"):
            self._apply(database_name, target_url)

        other_name, other_url = self._new_database()
        engine = self._engine(other_url)
        try:
            with engine.begin() as connection:
                connection.execute(text("INSERT INTO schema_migrations (version) VALUES ('999')"))
        finally:
            engine.dispose()
        with self.assertRaisesRegex(MigrationRefused, "expected ledger versions"):
            self._apply(other_name, other_url)

    def test_concurrent_runner_refuses_before_ddl(self):
        database_name, target_url = self._new_database()
        engine = self._engine(target_url)
        connection = engine.connect()
        transaction = connection.begin()
        try:
            connection.execute(text("SELECT pg_advisory_xact_lock(:lock_key)"), {"lock_key": MIGRATION_ADVISORY_LOCK_KEY})
            with self.assertRaisesRegex(MigrationRefused, "another migration-011 transaction is active"):
                self._apply(database_name, target_url)
        finally:
            transaction.rollback()
            connection.close()
            engine.dispose()

        engine = self._engine(target_url)
        try:
            with engine.connect() as connection:
                self.assertNotIn("cohort_key", self._columns(connection, "cat4_baseline_sets"))
                versions = tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version")))
                self.assertEqual(versions, EXPECTED_VERSIONS)
        finally:
            engine.dispose()

    def test_down_restores_historical_cat4_shape_and_ledger(self):
        database_name, target_url = self._new_database()
        self._populate_cat4_rows(target_url)
        self._apply(database_name, target_url)
        apply_down_migration(
            target_url,
            expected_database=database_name,
            confirm_migration_011_down=True,
        )
        engine = self._engine(target_url)
        try:
            with engine.connect() as connection:
                versions = tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version")))
                self.assertEqual(versions, EXPECTED_VERSIONS)
                for table_name in COHORT_TABLES:
                    columns = self._columns(connection, table_name)
                    self.assertNotIn("cohort_key", columns)
                    self.assertNotIn("cohort_name", columns)
                    self.assertEqual(connection.execute(text(f"SELECT COUNT(*) FROM {table_name}")).scalar_one(), 1)
        finally:
            engine.dispose()

    def test_failure_rolls_back_schema_and_ledger(self):
        database_name, target_url = self._new_database()
        with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as handle:
            handle.write("ALTER TABLE cat4_baseline_sets ADD COLUMN cohort_key VARCHAR;\nSELECT 1 / 0;\n")
            failing_sql = Path(handle.name)
        try:
            with self.assertRaises(Exception):
                apply_migration(
                    target_url,
                    expected_database=database_name,
                    confirm_migration_011=True,
                    sql_path=failing_sql,
                )
        finally:
            failing_sql.unlink(missing_ok=True)
        engine = self._engine(target_url)
        try:
            with engine.connect() as connection:
                self.assertNotIn("cohort_key", self._columns(connection, "cat4_baseline_sets"))
                versions = tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version")))
                self.assertEqual(versions, EXPECTED_VERSIONS)
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
