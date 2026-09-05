"""Integration tests for the final-v010 bootstrap on an opt-in local database."""

from __future__ import annotations

import os
import subprocess
import sys
import unittest
import uuid
from copy import deepcopy
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from schema.bootstrap_v010 import (  # noqa: E402
    EXPECTED_VERSIONS,
    BootstrapRefused,
    apply_bootstrap,
)
from schema.schema_signature import database_signature, metadata_signature  # noqa: E402


RUN_INTEGRATION = os.getenv("ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS") == "1"


@unittest.skipUnless(RUN_INTEGRATION, "set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1 for local PostgreSQL tests")
class FinalV010BootstrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from db import DATABASE_URL

        url = make_url(DATABASE_URL)
        if url.drivername.split("+")[0] != "postgresql" or url.host not in {"127.0.0.1", "localhost", "::1"}:
            raise unittest.SkipTest("bootstrap integration tests require a loopback PostgreSQL DATABASE_URL")

        cls.admin_url = url.set(database="postgres")
        cls.test_name = f"elume_bootstrap_v010_{uuid.uuid4().hex[:12]}"
        cls.untracked_name = f"elume_bootstrap_untracked_{uuid.uuid4().hex[:12]}"
        cls._create_database(cls.test_name)
        cls._create_database(cls.untracked_name)

    @classmethod
    def tearDownClass(cls):
        for database_name in (cls.test_name, cls.untracked_name):
            cls._drop_database(database_name)

    @classmethod
    def _admin_engine(cls):
        return create_engine(cls.admin_url, isolation_level="AUTOCOMMIT")

    @classmethod
    def _create_database(cls, database_name):
        engine = cls._admin_engine()
        try:
            with engine.connect() as connection:
                connection.execute(text(f'CREATE DATABASE "{database_name}"'))
        finally:
            engine.dispose()

    @classmethod
    def _drop_database(cls, database_name):
        engine = cls._admin_engine()
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

    def _test_url(self, database_name):
        from db import DATABASE_URL

        return make_url(DATABASE_URL).set(database=database_name).render_as_string(hide_password=False)

    def _connect(self, database_name):
        return create_engine(self._test_url(database_name))

    def test_01_empty_database_bootstraps_complete_final_v010_schema(self):
        import main
        from db import Base

        target_url = self._test_url(self.test_name)
        apply_bootstrap(target_url)

        engine = self._connect(self.test_name)
        try:
            with engine.connect() as connection:
                table_rows = connection.execute(
                    text(
                        "SELECT table_name FROM information_schema.tables "
                        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
                    )
                )
                tables = {row[0] for row in table_rows}
                self.assertEqual(tables - {"schema_migrations"}, set(Base.metadata.tables))
                self.assertEqual(len(tables - {"schema_migrations"}), 42)
                self.assertIn("teacher_planner_state", tables)

                versions = tuple(
                    row[0]
                    for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version"))
                )
                self.assertEqual(versions, EXPECTED_VERSIONS)

                for table_name in sorted(tables - {"schema_migrations"}):
                    self.assertEqual(
                        connection.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar_one(),
                        0,
                        table_name,
                    )

                expected = metadata_signature(Base.metadata)
                actual = database_signature(connection, set(Base.metadata.tables))
                # The final schema intentionally replaces the ORM's broad
                # schools.slug unique/index hint with a reviewed partial index.
                expected = deepcopy(expected)
                expected["schools"]["unique_constraints"] = [
                    constraint
                    for constraint in expected["schools"]["unique_constraints"]
                    if constraint != ("slug",)
                ]
                expected["schools"]["indexes"] = [
                    index for index in expected["schools"]["indexes"] if index[0] != "ix_schools_slug"
                ]
                for table_name in expected:
                    actual_columns = [
                        {**column, "server_default": None}
                        for column in actual[table_name]["columns"]
                    ]
                    expected_columns = [
                        {**column, "server_default": None}
                        for column in expected[table_name]["columns"]
                    ]
                    self.assertEqual(actual_columns, expected_columns, table_name)
                    self.assertEqual(actual[table_name]["foreign_keys"], expected[table_name]["foreign_keys"], table_name)
                    self.assertEqual(
                        actual[table_name]["unique_constraints"], expected[table_name]["unique_constraints"], table_name
                    )
                    expected_indexes = expected[table_name]["indexes"]
                    actual_indexes = [
                        index
                        for index in actual[table_name]["indexes"]
                        if index[0]
                        not in {
                            "uq_schools_slug",
                            "uq_school_invitations_open_school_email",
                            "ix_school_admin_audit_log_school_created_at",
                            "uq_school_departments_school_name_ci",
                        }
                    ]
                    self.assertEqual(actual_indexes, expected_indexes, table_name)

                class_columns = {column["name"] for column in actual["classes"]["columns"]}
                self.assertTrue({"class_code", "class_pin"}.issubset(class_columns))
                indexes = {index[0] for index in actual["classes"]["indexes"]}
                self.assertIn("ix_classes_class_code", indexes)
                self.assertIn("ix_classes_owner_active_dashboard_order", indexes)

                defaults = {
                    (table_name, column["name"]): column["server_default"]
                    for table_name, table in actual.items()
                    for column in table["columns"]
                }
                for table_name, column_name, expected_fragment in (
                    ("schools", "status", "active"),
                    ("schools", "created_at", "CURRENT_TIMESTAMP"),
                    ("users", "role", "teacher"),
                    ("school_invitations", "intended_role", "teacher"),
                    ("ai_usage_events", "created_at", "timezone"),
                    ("ui_translation_overrides", "updated_at", "timezone"),
                ):
                    self.assertIn(expected_fragment, defaults[(table_name, column_name)])

                # Immutable 001–010 features not completely represented by ORM
                # metadata must also be present in the final snapshot.
                definitions = {
                    row[0]: row[1]
                    for row in connection.execute(
                        text(
                            "SELECT indexname, indexdef FROM pg_indexes "
                            "WHERE schemaname = 'public'"
                        )
                    )
                }
                self.assertIn("WHERE ((accepted_at IS NULL) AND (revoked_at IS NULL))", definitions["uq_school_invitations_open_school_email"])
                self.assertIn("lower(", definitions["uq_school_departments_school_name_ci"])
                self.assertIn("WHERE (slug IS NOT NULL)", definitions["uq_schools_slug"])
        finally:
            engine.dispose()

    def test_02_application_startup_does_not_need_schema_repair(self):
        target_url = self._test_url(self.test_name)
        environment = os.environ.copy()
        environment["DATABASE_URL"] = target_url
        environment["PYTHONIOENCODING"] = "utf-8"
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import logging; logging.basicConfig(level=logging.INFO); import main; main.on_startup()",
            ],
            cwd=BACKEND_DIR,
            env=environment,
            text=True,
            capture_output=True,
            timeout=30,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        for phase in (
            "Elume startup: create_all complete",
            "Elume startup: seed_classes complete",
            "Elume startup: class access backfill complete",
            "Elume startup: complete",
        ):
            self.assertIn(phase, result.stderr + result.stdout)
        self.__class__.startup_timing_lines = tuple(
            line
            for line in (result.stderr + result.stdout).splitlines()
            if "Elume startup:" in line
        )
        print("\n".join(self.__class__.startup_timing_lines))

        engine = self._connect(self.test_name)
        try:
            with engine.connect() as connection:
                tables = {
                    row[0]
                    for row in connection.execute(
                        text(
                            "SELECT table_name FROM information_schema.tables "
                            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
                        )
                    )
                }
                self.assertEqual(len(tables - {"schema_migrations"}), 42)
                # Current legacy behavior seeds four classes on an empty DB;
                # they are not part of the bootstrap SQL itself.
                self.assertEqual(connection.execute(text("SELECT COUNT(*) FROM classes")).scalar_one(), 4)
        finally:
            engine.dispose()

    def test_03_second_bootstrap_attempt_refuses_initialized_database(self):
        with self.assertRaisesRegex(BootstrapRefused, "already initialized"):
            apply_bootstrap(self._test_url(self.test_name))

    def test_04_nonempty_untracked_database_refuses_without_creating_ledger(self):
        engine = self._connect(self.untracked_name)
        try:
            with engine.begin() as connection:
                connection.execute(text("CREATE TABLE sentinel (id INTEGER PRIMARY KEY)"))
        finally:
            engine.dispose()

        with self.assertRaisesRegex(BootstrapRefused, "explicit existing-database adoption"):
            apply_bootstrap(self._test_url(self.untracked_name))

        engine = self._connect(self.untracked_name)
        try:
            with engine.connect() as connection:
                tables = {
                    row[0]
                    for row in connection.execute(
                        text(
                            "SELECT table_name FROM information_schema.tables "
                            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
                        )
                    )
                }
                self.assertEqual(tables, {"sentinel"})
        finally:
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
