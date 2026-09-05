"""Explicit, fail-closed adoption of an existing verified historical-v010 schema."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL, make_url

from schema.bootstrap_v010 import EXPECTED_VERSIONS
from schema.schema_signature import database_signature


FINGERPRINT_PATH = Path(__file__).with_name("v010_fingerprint.json")


class AdoptionRefused(RuntimeError):
    """Raised when a database is not an untracked, verified historical-v010 schema."""


@dataclass(frozen=True)
class CheckResult:
    status: str
    identity: dict[str, Any]
    mismatches: tuple[str, ...]
    ledger_versions: tuple[str, ...] = ()

    @property
    def compatible(self) -> bool:
        return self.status == "compatible" and not self.mismatches


def _fingerprint(path: Path = FINGERPRINT_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _public_base_tables(connection) -> set[str]:
    return {
        row[0]
        for row in connection.execute(
            text(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                """
            )
        )
    }


def _plain(value: Any) -> Any:
    """Normalize tuples from SQLAlchemy inspection to JSON-compatible lists."""
    return json.loads(json.dumps(value))


def _without_defaults(signature: dict[str, Any]) -> dict[str, Any]:
    copy = _plain(signature)
    for table in copy.values():
        table["columns"] = sorted(table["columns"], key=lambda column: column["name"])
        for column in table["columns"]:
            column["server_default"] = None
    return copy


def _without_special_indexes(signature: dict[str, Any], special_index_names: set[str]) -> dict[str, Any]:
    copy = _plain(signature)
    for table in copy.values():
        primary_key = tuple(column["name"] for column in table["columns"] if column["primary_key"])
        table["indexes"] = [
            index
            for index in table["indexes"]
            if index[0] not in special_index_names and tuple(index[1]) != primary_key
        ]
    return copy


def _table_difference_summary(expected: dict[str, Any], actual: dict[str, Any]) -> str:
    differing_parts = [
        key
        for key in ("columns", "foreign_keys", "unique_constraints", "indexes")
        if actual[key] != expected[key]
    ]
    return ", ".join(differing_parts) or "unknown"


def _table_difference_details(expected: dict[str, Any], actual: dict[str, Any]) -> list[str]:
    details: list[str] = []
    expected_columns = {column["name"]: column for column in expected["columns"]}
    actual_columns = {column["name"]: column for column in actual["columns"]}
    missing_columns = sorted(set(expected_columns) - set(actual_columns))
    unexpected_columns = sorted(set(actual_columns) - set(expected_columns))
    if missing_columns:
        details.append("missing columns=" + ",".join(missing_columns))
    if unexpected_columns:
        details.append("unexpected columns=" + ",".join(unexpected_columns))
    changed_columns = []
    for name in sorted(set(expected_columns) & set(actual_columns)):
        changed = [
            key
            for key in ("type", "nullable", "primary_key")
            if expected_columns[name][key] != actual_columns[name][key]
        ]
        if changed:
            changed_columns.append(f"{name}({','.join(changed)})")
    if changed_columns:
        details.append("changed columns=" + ",".join(changed_columns))

    for key in ("foreign_keys", "unique_constraints", "indexes"):
        expected_items = {json.dumps(item, sort_keys=True) for item in expected[key]}
        actual_items = {json.dumps(item, sort_keys=True) for item in actual[key]}
        missing = sorted(expected_items - actual_items)
        unexpected = sorted(actual_items - expected_items)
        if missing:
            details.append(f"missing {key}=" + ",".join(missing))
        if unexpected:
            details.append(f"unexpected {key}=" + ",".join(unexpected))
    return details


def _check_connection(connection, fingerprint: dict[str, Any]) -> CheckResult:
    identity_row = connection.execute(text("SELECT current_database(), current_user")).one()
    actual_tables = _public_base_tables(connection)
    expected_tables = set(fingerprint["tables"])
    identity = {
        "database": identity_row[0],
        "user": identity_row[1],
        "application_table_count": len(actual_tables & expected_tables),
        "public_base_table_count": len(actual_tables),
    }

    if "schema_migrations" in actual_tables:
        versions = tuple(
            row[0]
            for row in connection.execute(text("SELECT version FROM schema_migrations ORDER BY version"))
        )
        return CheckResult("already_tracked", identity, (), versions)

    if not actual_tables:
        return CheckResult(
            "empty",
            identity,
            ("Database is empty; use bootstrap_v010 instead of existing-database adoption.",),
        )

    mismatches: list[str] = []
    missing_tables = sorted(expected_tables - actual_tables)
    unexpected_tables = sorted(actual_tables - expected_tables)
    if missing_tables:
        mismatches.append("Missing application tables: " + ", ".join(missing_tables))
    if unexpected_tables:
        mismatches.append("Unexpected public base tables: " + ", ".join(unexpected_tables))
    if mismatches:
        return CheckResult("incompatible", identity, tuple(mismatches))

    actual = _without_special_indexes(
        _without_defaults(database_signature(connection, expected_tables)),
        set(fingerprint["special_index_names"]) | set(fingerprint["non_fingerprint_index_names"]),
    )
    expected = _without_special_indexes(
        _without_defaults(fingerprint["tables"]),
        set(fingerprint["special_index_names"]),
    )
    for table_name in sorted(expected_tables):
        if actual[table_name] != expected[table_name]:
            mismatches.append(
                f"Schema signature mismatch for table {table_name}: "
                f"{_table_difference_summary(expected[table_name], actual[table_name])}"
            )
            mismatches.extend(
                f"  {table_name}: {detail}"
                for detail in _table_difference_details(expected[table_name], actual[table_name])
            )

    actual_defaults = {
        (table_name, column["name"]): (column["server_default"] or "").lower()
        for table_name, table in database_signature(connection, expected_tables).items()
        for column in table["columns"]
    }
    for table_name, expected_columns in fingerprint["important_defaults"].items():
        for column_name, fragment in expected_columns.items():
            if fragment.lower() not in actual_defaults.get((table_name, column_name), ""):
                mismatches.append(f"Missing/incorrect server default: {table_name}.{column_name}")

    index_definitions = {
        row[0]: row[1].lower()
        for row in connection.execute(
            text("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'")
        )
    }
    for index_name, fragments in fingerprint["extra_index_requirements"].items():
        definition = index_definitions.get(index_name)
        if definition is None:
            mismatches.append(f"Missing required index: {index_name}")
        elif any(fragment.lower() not in definition for fragment in fragments):
            mismatches.append(f"Incorrect required index definition: {index_name}")

    constraints = {
        row[0]: row[1].lower()
        for row in connection.execute(
            text(
                "SELECT conname, pg_get_constraintdef(oid) "
                "FROM pg_constraint WHERE connamespace = 'public'::regnamespace"
            )
        )
    }
    for constraint_name, fragments in fingerprint["extra_constraint_requirements"].items():
        definition = constraints.get(constraint_name)
        if definition is None:
            mismatches.append(f"Missing required constraint: {constraint_name}")
        elif any(fragment.lower() not in definition for fragment in fragments):
            mismatches.append(f"Incorrect required constraint definition: {constraint_name}")

    return CheckResult("compatible" if not mismatches else "incompatible", identity, tuple(mismatches))


def check_database(database_url: str | URL, fingerprint_path: Path = FINGERPRINT_PATH) -> CheckResult:
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            return _check_connection(connection, _fingerprint(fingerprint_path))
    finally:
        engine.dispose()


def apply_adoption(
    database_url: str | URL,
    *,
    expected_database: str,
    confirm_v010_adoption: bool,
    versions: tuple[str, ...] = EXPECTED_VERSIONS,
    fingerprint_path: Path = FINGERPRINT_PATH,
) -> CheckResult:
    """Atomically add only the v001–v010 ledger to a verified existing DB."""
    if not confirm_v010_adoption:
        raise AdoptionRefused("Adoption requires --confirm-v010-adoption.")
    target = make_url(database_url)
    if target.database != expected_database:
        raise AdoptionRefused(
            f"Adoption refused: expected database {expected_database!r}, got {target.database!r}."
        )

    engine = create_engine(database_url)
    try:
        with engine.begin() as connection:
            result = _check_connection(connection, _fingerprint(fingerprint_path))
            if not result.compatible:
                detail = "; ".join(result.mismatches) or result.status
                raise AdoptionRefused(f"Adoption refused: {detail}")
            connection.execute(
                text(
                    "CREATE TABLE schema_migrations ("
                    "version VARCHAR PRIMARY KEY, "
                    "applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)"
                )
            )
            connection.execute(
                text("INSERT INTO schema_migrations (version) VALUES (:version)"),
                [{"version": version} for version in versions],
            )
        return result
    finally:
        engine.dispose()


def _print_result(result: CheckResult) -> None:
    print(
        "Database: {database}; user: {user}; application tables: {application_table_count}; "
        "public base tables: {public_base_table_count}".format(**result.identity)
    )
    print(f"V010 adoption check: {result.status}")
    if result.ledger_versions:
        print("Existing ledger versions: " + ", ".join(result.ledger_versions))
    for mismatch in result.mismatches:
        print("- " + mismatch)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check or explicitly adopt an existing Elume historical-v010 PostgreSQL schema")
    parser.add_argument("--database-url", required=True, help="Target PostgreSQL URL")
    parser.add_argument("--check", action="store_true", help="Read-only compatibility check (the default)")
    parser.add_argument("--apply", action="store_true", help="Atomically create only the v001–v010 migration ledger")
    parser.add_argument("--confirm-v010-adoption", action="store_true", help="Required with --apply")
    parser.add_argument("--expected-database", help="Required exact database name with --apply")
    args = parser.parse_args()

    if args.apply:
        if not args.expected_database:
            parser.error("--apply requires --expected-database")
        result = apply_adoption(
            args.database_url,
            expected_database=args.expected_database,
            confirm_v010_adoption=args.confirm_v010_adoption,
        )
        _print_result(result)
        print("Adopted final-v010 ledger versions 001 through 010.")
        return 0

    result = check_database(args.database_url)
    _print_result(result)
    return 0 if result.compatible else 2


if __name__ == "__main__":
    raise SystemExit(main())
