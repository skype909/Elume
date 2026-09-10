"""Non-applying contract checks for migration 014. PostgreSQL DDL tests remain opt-in."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from schema.migrate_011_cat4_cohort_schema import MigrationRefused
from schema.migrate_014_aac_planner import (
    DOWN_SQL,
    EXPECTED_POST_MIGRATION_VERSIONS,
    EXPECTED_PRE_MIGRATION_VERSIONS,
    MIGRATION_ADVISORY_LOCK_KEY,
    MIGRATION_VERSION,
    TABLES,
    UP_SQL,
    _db,
)
from schema.migrate_013_stripe_webhook_inbox import _has_executable_sql, _split_sql


class Migration014ContractTests(unittest.TestCase):
    def test_shared_sql_helper_distinguishes_comments_empty_and_quoted_text(self):
        self.assertFalse(_has_executable_sql("-- runner comment only"))
        self.assertFalse(_has_executable_sql(" \n ; \n -- another comment\n"))
        self.assertTrue(_has_executable_sql("-- explanation\nALTER TABLE classes ADD COLUMN x INTEGER"))
        self.assertTrue(_has_executable_sql("COMMENT ON TABLE classes IS 'contains -- comment text'"))

    def test_splitter_keeps_semicolon_in_line_comment_with_following_alter(self):
        statements = _split_sql("-- Applied only by the guarded migration-014 runner; no independent transaction.\nALTER TABLE classes ADD COLUMN aac_planner_enabled BOOLEAN;")
        self.assertEqual(statements, ["-- Applied only by the guarded migration-014 runner; no independent transaction.\nALTER TABLE classes ADD COLUMN aac_planner_enabled BOOLEAN"])
        self.assertEqual(_split_sql("SELECT '--; text'; -- comment;\nSELECT 2;"), ["SELECT '--; text'", " -- comment;\nSELECT 2"])
    def test_ledger_and_lock_are_distinct_and_sequential(self):
        self.assertEqual(MIGRATION_VERSION, "014")
        self.assertEqual(EXPECTED_PRE_MIGRATION_VERSIONS[-1], "013")
        self.assertEqual(EXPECTED_POST_MIGRATION_VERSIONS[-1], "014")
        self.assertNotEqual(MIGRATION_ADVISORY_LOCK_KEY, 81_102_013)

    def test_sql_is_explicit_and_does_not_own_a_transaction(self):
        up, down = UP_SQL.read_text(encoding="utf-8"), DOWN_SQL.read_text(encoding="utf-8")
        self.assertFalse(any(line.strip().upper() in {"BEGIN;", "COMMIT;"} for line in up.splitlines()))
        self.assertEqual(TABLES, {"aac_projects", "aac_plan_revisions", "aac_student_progress", "aac_practical_sessions", "aac_source_documents"})
        for table in TABLES: self.assertIn("CREATE TABLE " + table, up)
        self.assertIn("aac_planner_enabled BOOLEAN NOT NULL DEFAULT FALSE", up)
        self.assertIn("Cannot roll back migration 014", down)
        self.assertIn("calendar_events", down)

    def test_runner_rejects_wrong_database_or_non_postgresql_without_connecting(self):
        with self.assertRaises(MigrationRefused): _db("sqlite:///aac.db", "aac")
        with self.assertRaises(MigrationRefused): _db("postgresql://localhost/not_aac", "aac")


if __name__ == "__main__": unittest.main()
