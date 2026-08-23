"""Initialize an empty disposable localhost PostgreSQL database from current models.

This is for functional local testing only. It intentionally does not execute
the explicit PostgreSQL migration files and must never be used for production.
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import inspect
from sqlalchemy.engine import make_url

from school_admin_test_common import ensure_safe_local_database, describe_local_target

from db import Base, DATABASE_URL, engine
import models  # noqa: F401  # Register every current model with Base.metadata.


REQUIRED_TABLES = {
    "users",
    "classes",
    "schools",
    "school_invitations",
    "school_admin_audit_log",
}
REQUIRED_USER_COLUMNS = {"role", "school_id", "is_active"}


def _verify_schema() -> list[str]:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    missing_tables = REQUIRED_TABLES - tables
    if missing_tables:
        raise RuntimeError(f"Schema is missing required tables: {', '.join(sorted(missing_tables))}.")

    user_columns = {column["name"] for column in inspector.get_columns("users")}
    missing_user_columns = REQUIRED_USER_COLUMNS - user_columns
    if missing_user_columns:
        raise RuntimeError(
            f"Schema is missing users columns: {', '.join(sorted(missing_user_columns))}."
        )
    return sorted(tables)


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize a disposable local Elume PostgreSQL database.")
    parser.add_argument("--apply", action="store_true", help="Create the current SQLAlchemy schema after safety checks.")
    args = parser.parse_args()

    try:
        database_kind = ensure_safe_local_database()
        url = make_url(DATABASE_URL)
        if database_kind != "postgresql" or (url.database or "").strip().lower() != "elume_local":
            raise RuntimeError("Refusing to initialize any database other than localhost PostgreSQL database elume_local.")
    except RuntimeError as error:
        print(f"REFUSED: {error}", file=sys.stderr)
        return 2

    print(f"Validated safe target: {describe_local_target()}")
    if not args.apply:
        print("Dry run only. No database connection or schema change was made.")
        print("Re-run with --apply to inspect the local database and create the current model schema if it is empty.")
        return 0

    try:
        inspector = inspect(engine)
        existing_tables = sorted(inspector.get_table_names())
        expected_tables = set(Base.metadata.tables)
        if existing_tables:
            print(f"Existing tables: {', '.join(existing_tables)}")
            if not set(existing_tables).issuperset(expected_tables):
                missing = sorted(expected_tables - set(existing_tables))
                raise RuntimeError(
                    "Refusing to initialize a partial database. Missing current-model tables: "
                    + ", ".join(missing)
                )
            tables = _verify_schema()
            print(f"Existing local schema is suitable; verified {len(tables)} tables. No tables were dropped or changed.")
            return 0

        Base.metadata.create_all(bind=engine)
        tables = _verify_schema()
        print(f"Created and verified current local schema with {len(tables)} tables.")
        print("No migration SQL files were executed and no test accounts were created.")
        return 0
    except Exception as error:
        print(f"FAILED: {error}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
