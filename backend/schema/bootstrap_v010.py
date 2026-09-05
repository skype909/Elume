"""Fail-closed runner for the empty-database final-v010 bootstrap.

This is intentionally separate from application startup.  Existing databases
must be adopted explicitly; this runner never infers their schema version.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from sqlalchemy import create_engine, text


EXPECTED_VERSIONS = tuple(f"{version:03d}" for version in range(1, 11))
BOOTSTRAP_SQL = Path(__file__).with_name("bootstrap_v010.sql")


class BootstrapRefused(RuntimeError):
    """Raised when the target database is not a blank, untracked database."""


def _public_tables(connection) -> set[str]:
    rows = connection.execute(
        text(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
            """
        )
    )
    return {row[0] for row in rows}


def apply_bootstrap(database_url: str, sql_path: Path = BOOTSTRAP_SQL) -> None:
    """Apply v010 only to an empty PostgreSQL database.

    The preflight runs before reading/executing the bootstrap, so a non-empty
    untracked database is left unchanged.  The SQL itself is transactional.
    """
    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            tables = _public_tables(connection)
        if "schema_migrations" in tables:
            raise BootstrapRefused(
                "Bootstrap refused: schema_migrations already exists; "
                "this database is already initialized."
            )
        if tables:
            raise BootstrapRefused(
                "Bootstrap refused: database has application tables but no "
                "schema_migrations ledger; explicit existing-database adoption is required."
            )

        script = sql_path.read_text(encoding="utf-8")
        raw_connection = engine.raw_connection()
        try:
            cursor = raw_connection.cursor()
            try:
                cursor.execute(script)
            finally:
                cursor.close()
            raw_connection.commit()
        except Exception:
            raw_connection.rollback()
            raise
        finally:
            raw_connection.close()
    finally:
        engine.dispose()


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply the empty-database Elume final-v010 bootstrap")
    parser.add_argument("--database-url", required=True, help="Target PostgreSQL URL")
    args = parser.parse_args()
    apply_bootstrap(args.database_url)
    print("Applied final-v010 bootstrap and recorded versions 001 through 010.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
