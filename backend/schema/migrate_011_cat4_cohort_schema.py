"""Explicit, fail-closed runner for CAT4 cohort migration 011.

Never imported by normal application startup.  It accepts only a complete,
tracked historical-v010 database and records version 011 in the same database
transaction as the reviewed schema changes.
"""

from __future__ import annotations

import argparse
import copy
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url

from schema.adopt_existing_v010 import FINGERPRINT_PATH, _fingerprint, validate_schema_fingerprint
from schema.bootstrap_v010 import EXPECTED_VERSIONS


MIGRATION_VERSION = "011"
MIGRATION_ADVISORY_LOCK_KEY = 81_102_011
EXPECTED_PRE_MIGRATION_VERSIONS = EXPECTED_VERSIONS
EXPECTED_POST_MIGRATION_VERSIONS = EXPECTED_VERSIONS + (MIGRATION_VERSION,)
UP_SQL = Path(__file__).parents[1] / "migrations" / "20260905_011_cat4_cohort_schema.up.sql"
DOWN_SQL = Path(__file__).parents[1] / "migrations" / "20260905_011_cat4_cohort_schema.down.sql"
COHORT_TABLES = (
    "cat4_baseline_sets",
    "cat4_term_result_sets",
    "cat4_workbook_versions",
)


class MigrationRefused(RuntimeError):
    """Raised when migration 011 cannot safely run on the target database."""


def _public_base_tables(connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
            )
        )
    }


def _ledger_versions(connection) -> tuple[str, ...]:
    if "schema_migrations" not in _public_base_tables(connection):
        raise MigrationRefused("Migration 011 refused: schema_migrations is absent.")
    return tuple(row[0] for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version")))


def _require_versions(connection, expected: tuple[str, ...]) -> None:
    actual = _ledger_versions(connection)
    if actual != expected:
        raise MigrationRefused(
            "Migration 011 refused: expected ledger versions "
            f"{', '.join(expected)}, found {', '.join(actual) or '(empty)'}"
        )


def _require_migration_lock(connection) -> None:
    """Refuse a concurrent runner before it can wait on migration DDL locks."""
    acquired = connection.execute(
        text("SELECT pg_try_advisory_xact_lock(:lock_key)"),
        {"lock_key": MIGRATION_ADVISORY_LOCK_KEY},
    ).scalar_one()
    if not acquired:
        raise MigrationRefused("Migration 011 refused: another migration-011 transaction is active.")


def v011_fingerprint(path: Path = FINGERPRINT_PATH) -> dict[str, Any]:
    """Return historical v010's schema signature plus exactly 011's objects."""
    fingerprint = copy.deepcopy(_fingerprint(path))
    for table_name in COHORT_TABLES:
        table = fingerprint["tables"][table_name]
        table["columns"].extend(
            (
                {
                    "name": "cohort_key",
                    "type": "VARCHAR",
                    "nullable": False,
                    "primary_key": False,
                    "server_default": None,
                },
                {
                    "name": "cohort_name",
                    "type": "VARCHAR",
                    "nullable": False,
                    "primary_key": False,
                    "server_default": None,
                },
            )
        )
        table["indexes"].append((f"ix_{table_name}_cohort_key", ("cohort_key",), False))
    return fingerprint


def _require_schema(connection, fingerprint: dict[str, Any], phase: str) -> None:
    mismatches = validate_schema_fingerprint(
        connection, fingerprint, allowed_base_tables={"schema_migrations"}
    )
    if mismatches:
        raise MigrationRefused(f"Migration 011 {phase} refused: " + "; ".join(mismatches))


def _execute_script(connection, sql_path: Path) -> None:
    """Execute simple reviewed DDL/DML statements inside the caller transaction."""
    script = "\n".join(
        line for line in sql_path.read_text(encoding="utf-8").splitlines() if not line.lstrip().startswith("--")
    )
    statements = [statement.strip() for statement in script.split(";")]
    for statement in statements:
        if statement:
            connection.execute(text(statement))


def _check_database_name(database_url: str | URL, expected_database: str) -> None:
    actual_database = make_url(database_url).database
    if actual_database != expected_database:
        raise MigrationRefused(
            f"Migration 011 refused: expected database {expected_database!r}, got {actual_database!r}."
        )


def apply_migration(
    database_url: str | URL,
    *,
    expected_database: str,
    confirm_migration_011: bool,
    sql_path: Path = UP_SQL,
    fingerprint_path: Path = FINGERPRINT_PATH,
) -> None:
    """Apply 011 atomically to exactly-ledgered historical v010."""
    if not confirm_migration_011:
        raise MigrationRefused("Migration 011 requires --confirm-migration-011.")
    _check_database_name(database_url, expected_database)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            _require_migration_lock(connection)
            _require_versions(connection, EXPECTED_PRE_MIGRATION_VERSIONS)
            _require_schema(connection, _fingerprint(fingerprint_path), "apply")
            _execute_script(connection, sql_path)
            connection.execute(text("INSERT INTO schema_migrations (version) VALUES (:version)"), {"version": MIGRATION_VERSION})
    finally:
        engine.dispose()


def check_migration(
    database_url: str | URL,
    *,
    expected_database: str,
    fingerprint_path: Path = FINGERPRINT_PATH,
) -> None:
    """Read-only eligibility check for a future migration-011 apply."""
    _check_database_name(database_url, expected_database)
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            _require_versions(connection, EXPECTED_PRE_MIGRATION_VERSIONS)
            _require_schema(connection, _fingerprint(fingerprint_path), "preflight")
    finally:
        engine.dispose()


def apply_down_migration(
    database_url: str | URL,
    *,
    expected_database: str,
    confirm_migration_011_down: bool,
    sql_path: Path = DOWN_SQL,
    fingerprint_path: Path = FINGERPRINT_PATH,
) -> None:
    """Reverse only 011's indexes, columns, and ledger version atomically."""
    if not confirm_migration_011_down:
        raise MigrationRefused("Migration 011 down requires --confirm-migration-011-down.")
    _check_database_name(database_url, expected_database)
    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            _require_migration_lock(connection)
            _require_versions(connection, EXPECTED_POST_MIGRATION_VERSIONS)
            _require_schema(connection, v011_fingerprint(fingerprint_path), "down")
            _execute_script(connection, sql_path)
            connection.execute(text("DELETE FROM schema_migrations WHERE version = :version"), {"version": MIGRATION_VERSION})
    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply or reverse ledger-gated CAT4 cohort migration 011")
    parser.add_argument("--database-url", required=True)
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--down", action="store_true")
    parser.add_argument("--confirm-migration-011", action="store_true")
    parser.add_argument("--confirm-migration-011-down", action="store_true")
    args = parser.parse_args()
    if sum((args.check, args.apply, args.down)) != 1:
        parser.error("choose exactly one of --check, --apply, or --down")
    if args.check:
        check_migration(args.database_url, expected_database=args.expected_database)
        print("Migration 011 preflight passed: exact historical-v010 ledger and schema are present.")
    elif args.apply:
        apply_migration(
            args.database_url,
            expected_database=args.expected_database,
            confirm_migration_011=args.confirm_migration_011,
        )
    else:
        apply_down_migration(
            args.database_url,
            expected_database=args.expected_database,
            confirm_migration_011_down=args.confirm_migration_011_down,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
