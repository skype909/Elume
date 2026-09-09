"""Fail-closed, ledger-gated PostgreSQL durable Stripe webhook inbox migration."""
from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from schema.adopt_existing_v010 import FINGERPRINT_PATH, validate_schema_fingerprint
from schema.migrate_011_cat4_cohort_schema import MigrationRefused, _public_base_tables, _require_versions, v011_fingerprint
from schema.migrate_012_account_entitlements import (
    EXPECTED_POST_MIGRATION_VERSIONS as V012,
    TABLES as V012_TABLES,
    _verify_definition as _verify_v012_definition,
)

MIGRATION_VERSION = "013"
MIGRATION_ADVISORY_LOCK_KEY = 81_102_013
EXPECTED_PRE_MIGRATION_VERSIONS = V012
EXPECTED_POST_MIGRATION_VERSIONS = V012 + (MIGRATION_VERSION,)
TABLE = "stripe_webhook_events"
UP_SQL = Path(__file__).parents[1] / "migrations" / "20260906_013_stripe_webhook_inbox.up.sql"
DOWN_SQL = Path(__file__).parents[1] / "migrations" / "20260906_013_stripe_webhook_inbox.down.sql"


def _db(url: str, expected_database: str) -> None:
    parsed = make_url(url)
    if parsed.database != expected_database:
        raise MigrationRefused("Migration 013 refused: unexpected database.")
    if parsed.drivername.split("+", 1)[0] != "postgresql":
        raise MigrationRefused("Migration 013 refused: PostgreSQL is required.")


def _lock(connection) -> None:
    locked = connection.execute(
        text("SELECT pg_try_advisory_xact_lock(:key)"),
        {"key": MIGRATION_ADVISORY_LOCK_KEY},
    ).scalar_one()
    if not locked:
        raise MigrationRefused("Migration 013 refused: another migration-013 transaction is active.")


def _sql(connection, path: Path) -> None:
    script = path.read_text(encoding="utf-8")
    if re.search(r"(?im)^\s*(BEGIN|COMMIT)\s*;", script):
        raise MigrationRefused("Migration 013 SQL must not manage its own transaction.")
    for statement in _split_sql(script):
        if _has_executable_sql(statement):
            connection.execute(text(statement))


def _has_executable_sql(statement: str) -> bool:
    """Ignore whitespace and line-comment-only fragments without touching SQL strings."""
    quote: str | None = None
    index = 0
    while index < len(statement):
        char = statement[index]
        if quote:
            if char == quote:
                if index + 1 < len(statement) and statement[index + 1] == quote:
                    index += 2; continue
                quote = None
            index += 1; continue
        if char in "'\"": quote = char; index += 1; continue
        if statement.startswith("--", index):
            newline = statement.find("\n", index + 2)
            index = len(statement) if newline < 0 else newline + 1; continue
        if not char.isspace() and char != ";": return True
        index += 1
    return False


def _split_sql(script: str) -> list[str]:
    """Split migration SQL without breaking quoted COMMENT text or DO blocks."""
    statements: list[str] = []
    start = 0
    index = 0
    quote: str | None = None
    dollar_tag: str | None = None
    line_comment = False
    while index < len(script):
        char = script[index]
        if line_comment:
            if char in "\r\n": line_comment = False
            index += 1
            continue
        if dollar_tag:
            if script.startswith(dollar_tag, index):
                index += len(dollar_tag)
                dollar_tag = None
                continue
            index += 1
            continue
        if quote:
            if char == quote:
                if quote == "'" and index + 1 < len(script) and script[index + 1] == "'":
                    index += 2
                    continue
                quote = None
            index += 1
            continue
        if char in {"'", '"'}:
            quote = char
            index += 1
            continue
        if script.startswith("--", index):
            line_comment = True
            index += 2
            continue
        if char == "$":
            match = re.match(r"\$[A-Za-z_0-9]*\$", script[index:])
            if match:
                dollar_tag = match.group(0)
                index += len(dollar_tag)
                continue
        if char == ";":
            statements.append(script[start:index])
            start = index + 1
        index += 1
    if quote or dollar_tag:
        raise MigrationRefused("Migration 013 SQL contains an unterminated quoted literal.")
    if script[start:].strip():
        statements.append(script[start:])
    return statements


def _preflight(connection) -> None:
    _require_versions(connection, EXPECTED_PRE_MIGRATION_VERSIONS)
    mismatches = validate_schema_fingerprint(
        connection,
        v011_fingerprint(FINGERPRINT_PATH),
        allowed_base_tables={"schema_migrations"} | V012_TABLES,
    )
    if mismatches:
        raise MigrationRefused("Migration 013 preflight refused: " + "; ".join(mismatches))
    _verify_v012_definition(connection)
    if TABLE in _public_base_tables(connection):
        raise MigrationRefused("Migration 013 refused: stripe_webhook_events already exists.")


def _normal(value: str | None) -> str:
    return re.sub(r"\s+", "", (value or "").lower()).replace("::charactervarying", "").replace("::text", "")


def _verify_definition(connection) -> None:
    rows = connection.execute(text("""
        SELECT column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :table
        ORDER BY ordinal_position
    """), {"table": TABLE}).mappings().all()
    actual = {row["column_name"]: row for row in rows}
    expected = {
        "id": ("bigint", "int8", "NO", None, "nextval"),
        "stripe_event_id": ("character varying", "varchar", "NO", 255, None),
        "event_type": ("character varying", "varchar", "NO", 128, None),
        "stripe_created_at": ("timestamp with time zone", "timestamptz", "NO", None, None),
        "received_at": ("timestamp with time zone", "timestamptz", "NO", None, "CURRENT_TIMESTAMP"),
        "stripe_api_version": ("character varying", "varchar", "YES", 64, None),
        "livemode": ("boolean", "bool", "NO", None, None),
        "entity_key": ("character varying", "varchar", "YES", 255, None),
        "stripe_customer_id": ("character varying", "varchar", "YES", 255, None),
        "stripe_subscription_id": ("character varying", "varchar", "YES", 255, None),
        "resolved_user_id": ("integer", "int4", "YES", None, None),
        "payload_sha256": ("character", "bpchar", "NO", 64, None),
        "event_data": ("jsonb", "jsonb", "NO", None, None),
        "processing_state": ("character varying", "varchar", "NO", 16, "received"),
        "attempt_count": ("integer", "int4", "NO", None, "0"),
        "claimed_at": ("timestamp with time zone", "timestamptz", "YES", None, None),
        "processed_at": ("timestamp with time zone", "timestamptz", "YES", None, None),
        "next_attempt_at": ("timestamp with time zone", "timestamptz", "YES", None, None),
        "failure_code": ("character varying", "varchar", "YES", 80, None),
        "failure_detail": ("character varying", "varchar", "YES", 500, None),
        "last_failure_at": ("timestamp with time zone", "timestamptz", "YES", None, None),
    }
    bad: list[str] = []
    if set(actual) != set(expected):
        bad.append("unexpected/missing stripe_webhook_events columns")
    for name, (dtype, udt, nullable, max_length, default) in expected.items():
        got = actual.get(name)
        if not got or (got["data_type"], got["udt_name"], got["is_nullable"], got["character_maximum_length"]) != (dtype, udt, nullable, max_length):
            bad.append("column " + name)
            continue
        actual_default = got["column_default"] or ""
        if default == "nextval" and not actual_default.lower().startswith("nextval("):
            bad.append("default " + name)
        elif default == "CURRENT_TIMESTAMP" and _normal(actual_default) not in {"current_timestamp", "now()"}:
            bad.append("default " + name)
        elif default == "received" and "received" not in actual_default.lower():
            bad.append("default " + name)
        elif default == "0" and _normal(actual_default) not in {"0", "(0)"}:
            bad.append("default " + name)
        elif default is None and actual_default:
            bad.append("default " + name)

    constraints = {
        row["conname"]: row
        for row in connection.execute(text("""
            SELECT conname, contype, convalidated, confdeltype, pg_get_constraintdef(oid, true) AS definition
            FROM pg_constraint WHERE conrelid = 'stripe_webhook_events'::regclass
        """)).mappings()
    }
    expected_constraints = {
        "stripe_webhook_events_pkey": "PRIMARY KEY (id)",
        "uq_stripe_webhook_events_stripe_event_id": "UNIQUE (stripe_event_id)",
        "ck_stripe_webhook_events_identifiers": "CHECK",
        "ck_stripe_webhook_events_payload_sha256": "CHECK",
        "ck_stripe_webhook_events_event_data_object": "CHECK",
        "ck_stripe_webhook_events_state": "CHECK",
        "ck_stripe_webhook_events_attempt_count": "CHECK",
        "ck_stripe_webhook_events_state_timestamps": "CHECK",
    }
    for name, needle in expected_constraints.items():
        item = constraints.get(name)
        if not item or not item["convalidated"] or needle not in item["definition"]:
            bad.append("constraint " + name)
    fk = [item for item in constraints.values() if item["contype"] == "f"]
    if not any(
        "FOREIGN KEY (resolved_user_id) REFERENCES users(id) ON DELETE SET NULL" in item["definition"]
        and item["confdeltype"] == "n" and item["convalidated"]
        for item in fk
    ):
        bad.append("foreign key resolved_user_id ON DELETE SET NULL")

    definitions = {name: _normal(item["definition"]).replace("(", "").replace(")", "") for name, item in constraints.items()}
    required_fragments = {
        "ck_stripe_webhook_events_identifiers": ("stripe_event_id<>''", "stripe_event_id=btrimstripe_event_id", "event_type<>''", "entity_keyisnullor", "stripe_customer_idisnullor", "stripe_subscription_idisnullor"),
        "ck_stripe_webhook_events_payload_sha256": ("payload_sha256~'^[0-9a-f]{64}$'",),
        "ck_stripe_webhook_events_event_data_object": ("jsonb_typeofevent_data='object'",),
        "ck_stripe_webhook_events_state": ("processing_state", "received", "processing", "processed", "failed", "ignored"),
        "ck_stripe_webhook_events_attempt_count": ("attempt_count>=0",),
        "ck_stripe_webhook_events_state_timestamps": ("processing_state='received'", "processing_state='processing'", "processed", "ignored", "processing_state='failed'", "failure_code~'^[a-z0-9_:-]+$'"),
    }
    for name, fragments in required_fragments.items():
        definition = definitions.get(name, "")
        if not all(fragment in definition for fragment in fragments):
            bad.append("constraint " + name + " definition")
    state_values = re.findall(r"'([^']+)'", definitions.get("ck_stripe_webhook_events_state", ""))
    if set(state_values) != {"received", "processing", "processed", "failed", "ignored"} or len(state_values) != 5:
        bad.append("constraint ck_stripe_webhook_events_state definition")

    indexes = {
        row["indexname"]: row["indexdef"]
        for row in connection.execute(text("""
            SELECT indexname, indexdef FROM pg_indexes
            WHERE schemaname='public' AND tablename='stripe_webhook_events'
        """)).mappings()
    }
    expected_indexes = {
        "ix_stripe_webhook_events_queue": "(processing_state, next_attempt_at, received_at)",
        "ix_stripe_webhook_events_subscription_created": "(stripe_subscription_id, stripe_created_at DESC)",
        "ix_stripe_webhook_events_customer_created": "(stripe_customer_id, stripe_created_at DESC)",
        "ix_stripe_webhook_events_user_received": "(resolved_user_id, received_at DESC)",
        "ix_stripe_webhook_events_entity_created": "(entity_key, stripe_created_at DESC)",
    }
    for name, required in expected_indexes.items():
        definition = indexes.get(name, "")
        fragments = required if isinstance(required, tuple) else (required,)
        if not definition or not all(fragment in definition for fragment in fragments):
            bad.append("index " + name)
    queue = indexes.get("ix_stripe_webhook_events_queue", "").lower()
    if "where" not in queue or "received" not in queue or "failed" not in queue:
        bad.append("index ix_stripe_webhook_events_queue predicate")
    if bad:
        raise MigrationRefused("Migration 013 verification refused: " + "; ".join(bad))


def check_migration(url: str, *, expected_database: str) -> None:
    _db(url, expected_database)
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            _preflight(connection)
    finally:
        engine.dispose()


def apply_migration(url: str, *, expected_database: str, confirm_migration_013: bool, sql_path: Path = UP_SQL) -> None:
    if not confirm_migration_013:
        raise MigrationRefused("Migration 013 requires --confirm-migration-013.")
    _db(url, expected_database)
    engine = create_engine(url)
    try:
        with engine.begin() as connection:
            _lock(connection)
            _preflight(connection)
            _sql(connection, sql_path)
            connection.execute(text("INSERT INTO schema_migrations(version) VALUES('013')"))
    finally:
        engine.dispose()


def verify_applied_migration(url: str, *, expected_database: str) -> None:
    _db(url, expected_database)
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            _require_versions(connection, EXPECTED_POST_MIGRATION_VERSIONS)
            mismatches = validate_schema_fingerprint(
                connection,
                v011_fingerprint(FINGERPRINT_PATH),
                allowed_base_tables={"schema_migrations"} | V012_TABLES | {TABLE},
            )
            if mismatches:
                raise MigrationRefused("Migration 013 verification refused: " + "; ".join(mismatches))
            _verify_v012_definition(connection)
            _verify_definition(connection)
    finally:
        engine.dispose()


def apply_down_migration(url: str, *, expected_database: str, confirm_migration_013_down: bool) -> None:
    if not confirm_migration_013_down:
        raise MigrationRefused("Migration 013 down requires --confirm-migration-013-down.")
    _db(url, expected_database)
    engine = create_engine(url)
    try:
        with engine.begin() as connection:
            _lock(connection)
            _require_versions(connection, EXPECTED_POST_MIGRATION_VERSIONS)
            _verify_v012_definition(connection)
            _verify_definition(connection)
            _sql(connection, DOWN_SQL)
            connection.execute(text("DELETE FROM schema_migrations WHERE version='013'"))
    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-url-env", required=True)
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--verify-applied", action="store_true")
    parser.add_argument("--down", action="store_true")
    parser.add_argument("--confirm-migration-013", action="store_true")
    parser.add_argument("--confirm-migration-013-down", action="store_true")
    args = parser.parse_args()
    url = os.getenv(args.database_url_env)
    if not url:
        parser.error("database URL environment variable is empty")
    if sum((args.check, args.apply, args.verify_applied, args.down)) != 1:
        parser.error("choose exactly one operation")
    if args.check:
        check_migration(url, expected_database=args.expected_database)
    elif args.apply:
        apply_migration(url, expected_database=args.expected_database, confirm_migration_013=args.confirm_migration_013)
    elif args.verify_applied:
        verify_applied_migration(url, expected_database=args.expected_database)
    else:
        apply_down_migration(url, expected_database=args.expected_database, confirm_migration_013_down=args.confirm_migration_013_down)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
