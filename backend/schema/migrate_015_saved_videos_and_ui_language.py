"""Fail-closed PostgreSQL migration 015; never imported by application startup."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError

from schema.migrate_011_cat4_cohort_schema import MigrationRefused, _require_versions
from schema.migrate_014_aac_planner import EXPECTED_POST_MIGRATION_VERSIONS as V014
from schema.migrate_013_stripe_webhook_inbox import _sql

MIGRATION_VERSION = "015"
MIGRATION_ADVISORY_LOCK_KEY = 81_102_015
UP_SQL = Path(__file__).parents[1] / "migrations" / "20260917_015_saved_videos_and_ui_language.up.sql"
DOWN_SQL = Path(__file__).parents[1] / "migrations" / "20260917_015_saved_videos_and_ui_language.down.sql"
EXPECTED_PRE_MIGRATION_VERSIONS = V014
EXPECTED_POST_MIGRATION_VERSIONS = V014 + (MIGRATION_VERSION,)


def _db(url: str, expected_database: str) -> None:
    parsed = make_url(url)
    if parsed.database != expected_database or parsed.drivername.split("+", 1)[0] != "postgresql":
        raise MigrationRefused("Migration 015 refused: unexpected database or non-PostgreSQL URL.")


def _lock(connection) -> None:
    if not connection.execute(text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": MIGRATION_ADVISORY_LOCK_KEY}).scalar_one():
        raise MigrationRefused("Migration 015 refused: another migration transaction is active.")


def _preflight(connection) -> None:
    _require_versions(connection, V014)
    inspector = inspect(connection)
    if "saved_videos" in inspector.get_table_names():
        raise MigrationRefused("Migration 015 refused: saved_videos already exists.")
    names = {column["name"] for column in inspector.get_columns("users")}
    if {"ui_language", "ui_language_updated_at"} & names:
        raise MigrationRefused("Migration 015 refused: UI language columns already exist.")


def _verify(connection) -> None:
    _require_versions(connection, EXPECTED_POST_MIGRATION_VERSIONS)
    inspector = inspect(connection)
    columns = {column["name"]: column for column in inspector.get_columns("users")}
    missing = {"ui_language", "ui_language_updated_at"} - set(columns)
    if missing or columns["ui_language"]["nullable"]:
        raise MigrationRefused("Migration 015 verification refused: users UI language columns.")
    video_columns = {column["name"] for column in inspector.get_columns("saved_videos")}
    required = {"id", "class_id", "youtube_id", "url", "title", "category", "added_at", "updated_at"}
    if video_columns != required:
        raise MigrationRefused("Migration 015 verification refused: saved_videos columns.")
    indexes = {index["name"] for index in inspector.get_indexes("saved_videos")}
    if "ix_saved_videos_class_added" not in indexes:
        raise MigrationRefused("Migration 015 verification refused: saved_videos index.")


def check_migration(url: str, *, expected_database: str) -> None:
    _db(url, expected_database); engine = create_engine(url)
    try:
        with engine.connect() as c: _preflight(c)
    finally: engine.dispose()


def apply_migration(url: str, *, expected_database: str, confirm_migration_015: bool) -> None:
    if not confirm_migration_015: raise MigrationRefused("Migration 015 requires --confirm-migration-015.")
    _db(url, expected_database); engine = create_engine(url)
    try:
        with engine.begin() as c:
            _lock(c); _preflight(c); _sql(c, UP_SQL); c.execute(text("INSERT INTO schema_migrations(version) VALUES('015')"))
    finally: engine.dispose()


def verify_applied_migration(url: str, *, expected_database: str) -> None:
    _db(url, expected_database); engine = create_engine(url)
    try:
        with engine.connect() as c: _verify(c)
    finally: engine.dispose()


def apply_down_migration(url: str, *, expected_database: str, confirm_migration_015_down: bool) -> None:
    if not confirm_migration_015_down: raise MigrationRefused("Migration 015 down requires --confirm-migration-015-down.")
    _db(url, expected_database); engine = create_engine(url)
    try:
        with engine.begin() as c:
            _lock(c); _verify(c)
            try: _sql(c, DOWN_SQL)
            except DBAPIError as exc: raise MigrationRefused("Migration 015 down refused; retain additive schema and revert application code.") from exc
            c.execute(text("DELETE FROM schema_migrations WHERE version='015'"))
    finally: engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(); parser.add_argument("--database-url-env", required=True); parser.add_argument("--expected-database", required=True)
    parser.add_argument("--check", action="store_true"); parser.add_argument("--apply", action="store_true"); parser.add_argument("--verify-applied", action="store_true"); parser.add_argument("--down", action="store_true"); parser.add_argument("--confirm-migration-015", action="store_true"); parser.add_argument("--confirm-migration-015-down", action="store_true")
    args = parser.parse_args(); url = os.getenv(args.database_url_env)
    if not url: parser.error("database URL environment variable is empty")
    if sum((args.check, args.apply, args.verify_applied, args.down)) != 1: parser.error("choose exactly one operation")
    if args.check: check_migration(url, expected_database=args.expected_database)
    elif args.apply: apply_migration(url, expected_database=args.expected_database, confirm_migration_015=True)
    elif args.verify_applied: verify_applied_migration(url, expected_database=args.expected_database)
    else: apply_down_migration(url, expected_database=args.expected_database, confirm_migration_015_down=True)
    return 0


if __name__ == "__main__": raise SystemExit(main())
