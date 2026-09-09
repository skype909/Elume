"""Fail-closed, ledger-gated AAC Planner migration; never imported by application startup."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError

from schema.adopt_existing_v010 import FINGERPRINT_PATH, validate_schema_fingerprint
from schema.migrate_011_cat4_cohort_schema import MigrationRefused, _public_base_tables, _require_versions, v011_fingerprint
from schema.migrate_012_account_entitlements import TABLES as V012_TABLES, _verify_definition as _verify_v012
from schema.migrate_013_stripe_webhook_inbox import (
    EXPECTED_POST_MIGRATION_VERSIONS as V013,
    _sql,
    _verify_definition as _verify_v013_definition,
)

MIGRATION_VERSION = "014"
MIGRATION_ADVISORY_LOCK_KEY = 81_102_014
EXPECTED_PRE_MIGRATION_VERSIONS = V013
EXPECTED_POST_MIGRATION_VERSIONS = V013 + (MIGRATION_VERSION,)
TABLES = {"aac_projects", "aac_plan_revisions", "aac_student_progress", "aac_practical_sessions", "aac_source_documents"}
UP_SQL = Path(__file__).parents[1] / "migrations" / "20260908_014_aac_planner.up.sql"
DOWN_SQL = Path(__file__).parents[1] / "migrations" / "20260908_014_aac_planner.down.sql"


def _db(url: str, expected_database: str) -> None:
    parsed = make_url(url)
    if parsed.database != expected_database or parsed.drivername.split("+", 1)[0] != "postgresql":
        raise MigrationRefused("Migration 014 refused: unexpected database or non-PostgreSQL URL.")


def _lock(connection) -> None:
    if not connection.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": MIGRATION_ADVISORY_LOCK_KEY}).scalar_one():
        raise MigrationRefused("Migration 014 refused: another migration-014 transaction is active.")


def _verify_v013(connection) -> None:
    _require_versions(connection, V013)
    mismatches = validate_schema_fingerprint(connection, v011_fingerprint(FINGERPRINT_PATH), allowed_base_tables={"schema_migrations"} | V012_TABLES | {"stripe_webhook_events"})
    if mismatches:
        raise MigrationRefused("Migration 014 predecessor refused: " + "; ".join(mismatches))
    _verify_v012(connection)
    _verify_v013_definition(connection)


def _preflight(connection) -> None:
    _verify_v013(connection)
    actual = _public_base_tables(connection)
    if actual & TABLES:
        raise MigrationRefused("Migration 014 refused: AAC tables already exist.")
    class_column = connection.execute(text("""SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='classes' AND column_name='aac_planner_enabled'""")).first()
    if class_column:
        raise MigrationRefused("Migration 014 refused: AAC class setting already exists.")


def _columns(connection, table: str) -> dict[str, dict]:
    return {row["column_name"]: dict(row) for row in connection.execute(text("""
        SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns WHERE table_schema='public' AND table_name=:table
    """), {"table": table}).mappings()}


def _verify_definition(connection) -> None:
    errors: list[str] = []
    expected_tables = set(v011_fingerprint(FINGERPRINT_PATH)["tables"]) | V012_TABLES | {"schema_migrations", "stripe_webhook_events"} | TABLES
    actual_tables = _public_base_tables(connection)
    if actual_tables != expected_tables:
        errors.append("unexpected/missing public base tables")
    enabled = _columns(connection, "classes").get("aac_planner_enabled")
    if not enabled or (enabled["data_type"], enabled["is_nullable"]) != ("boolean", "NO") or "false" not in (enabled["column_default"] or "").lower():
        errors.append("classes.aac_planner_enabled")
    expected = {
        "aac_projects": {"id", "class_id", "owner_user_id", "title", "subject", "examination_year", "current_year_stage", "weekly_minutes", "status", "approved_revision_id", "archived_at", "created_at", "updated_at"},
        "aac_plan_revisions": {"id", "project_id", "version", "state", "source_requirements_json", "plan_json", "assumptions_json", "source_document_ids_json", "planning_inputs_json", "approved_by_user_id", "approved_at", "created_at", "updated_at"},
        "aac_student_progress": {"id", "project_id", "student_id", "current_stage", "checkpoints_json", "observation", "next_action", "next_check_in_at", "last_checked_in_at", "updated_by_user_id", "updated_at"},
        "aac_practical_sessions": {"id", "project_id", "session_date", "stage_name", "logistics_notes", "allocations_json", "created_by_user_id", "created_at"},
        "aac_source_documents": {"id", "project_id", "owner_user_id", "purpose", "academic_year", "display_filename", "storage_key", "content_type", "size_bytes", "sha256", "extraction_state", "extraction_error", "extracted_sections_json", "created_at"},
    }
    for table, names in expected.items():
        cols = _columns(connection, table)
        if set(cols) != names: errors.append(table + " columns")
        for name, row in cols.items():
            if name.endswith("_json") and (row["data_type"], row["is_nullable"]) != ("jsonb", "NO"): errors.append(table + "." + name)
            if name in {"created_at", "updated_at", "approved_at", "archived_at", "next_check_in_at", "last_checked_in_at", "session_date"} and row["data_type"] != "timestamp with time zone": errors.append(table + "." + name)
    constraints = {r["conname"]: r for r in connection.execute(text("""SELECT conname, contype, convalidated, pg_get_constraintdef(oid, true) definition FROM pg_constraint WHERE connamespace='public'::regnamespace""")).mappings()}
    required = {"uq_aac_projects_class", "ck_aac_projects_weekly_minutes", "ck_aac_projects_year_stage", "ck_aac_projects_status", "fk_aac_projects_approved_revision", "uq_aac_plan_revisions_version", "ck_aac_plan_revisions_version", "ck_aac_plan_revisions_state", "ck_aac_plan_revisions_approval", "uq_aac_student_progress", "ck_aac_source_documents_purpose", "ck_aac_source_documents_size", "ck_aac_source_documents_extraction_state"}
    for name in required:
        if name not in constraints or not constraints[name]["convalidated"]: errors.append("constraint " + name)
    indexes = {r["indexname"] for r in connection.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).mappings()}
    for name in {"ix_aac_projects_owner_class", "ix_aac_student_progress_project", "ix_aac_practical_sessions_project_date", "ix_aac_source_documents_project_purpose"}:
        if name not in indexes: errors.append("index " + name)
    if errors: raise MigrationRefused("Migration 014 verification refused: " + "; ".join(errors))


def check_migration(url: str, *, expected_database: str) -> None:
    _db(url, expected_database); engine = create_engine(url)
    try:
        with engine.connect() as connection: _preflight(connection)
    finally: engine.dispose()


def apply_migration(url: str, *, expected_database: str, confirm_migration_014: bool, sql_path: Path = UP_SQL) -> None:
    if not confirm_migration_014: raise MigrationRefused("Migration 014 requires --confirm-migration-014.")
    _db(url, expected_database); engine = create_engine(url)
    try:
        with engine.begin() as connection:
            _lock(connection); _preflight(connection); _sql(connection, sql_path)
            connection.execute(text("INSERT INTO schema_migrations(version) VALUES('014')"))
    finally: engine.dispose()


def verify_applied_migration(url: str, *, expected_database: str) -> None:
    _db(url, expected_database); engine = create_engine(url)
    try:
        with engine.connect() as connection:
            _require_versions(connection, EXPECTED_POST_MIGRATION_VERSIONS)
            # The v011 fingerprint is intentionally used only for pre-014 state:
            # classes.aac_planner_enabled is the reviewed, expected v014 delta.
            _verify_v012(connection)
            _verify_v013_definition(connection)
            _verify_definition(connection)
    finally: engine.dispose()


def apply_down_migration(url: str, *, expected_database: str, confirm_migration_014_down: bool) -> None:
    if not confirm_migration_014_down: raise MigrationRefused("Migration 014 down requires --confirm-migration-014-down.")
    _db(url, expected_database); engine = create_engine(url)
    try:
        with engine.begin() as connection:
            _lock(connection); _require_versions(connection, EXPECTED_POST_MIGRATION_VERSIONS); _verify_v012(connection); _verify_v013_definition(connection); _verify_definition(connection)
            try:
                _sql(connection, DOWN_SQL)
            except DBAPIError as exc:
                if "Cannot roll back migration 014:" in str(exc):
                    raise MigrationRefused("Migration 014 down refused: AAC records, links, or enablement exist.") from exc
                raise
            connection.execute(text("DELETE FROM schema_migrations WHERE version='014'"))
    finally: engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--database-url-env", required=True); parser.add_argument("--expected-database", required=True)
    parser.add_argument("--check", action="store_true"); parser.add_argument("--apply", action="store_true"); parser.add_argument("--verify-applied", action="store_true"); parser.add_argument("--down", action="store_true")
    parser.add_argument("--confirm-migration-014", action="store_true"); parser.add_argument("--confirm-migration-014-down", action="store_true")
    args = parser.parse_args(); url = os.getenv(args.database_url_env)
    if not url: parser.error("database URL environment variable is empty")
    if sum((args.check, args.apply, args.verify_applied, args.down)) != 1: parser.error("choose exactly one operation")
    if args.check: check_migration(url, expected_database=args.expected_database)
    elif args.apply: apply_migration(url, expected_database=args.expected_database, confirm_migration_014=args.confirm_migration_014)
    elif args.verify_applied: verify_applied_migration(url, expected_database=args.expected_database)
    else: apply_down_migration(url, expected_database=args.expected_database, confirm_migration_014_down=args.confirm_migration_014_down)
    return 0


if __name__ == "__main__": raise SystemExit(main())
