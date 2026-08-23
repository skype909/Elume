"""Shared safety checks for local School Admin test data scripts."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
LOCAL_DB_PATH = (BACKEND_DIR / "classroom.db").resolve()
_LOCAL_POSTGRES_HOSTS = {"localhost", "127.0.0.1", "::1"}

for candidate in (str(BACKEND_DIR), str(PROJECT_ROOT)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

from db import DATABASE_URL, engine  # noqa: E402


REQUIRED_COLUMNS = {
    "users": {"role", "school_id", "is_active"},
    "schools": {"id", "name", "status", "seat_limit", "created_at", "updated_at"},
    "school_invitations": {"id", "school_id", "normalized_email", "token_hash", "expires_at"},
    "school_admin_audit_log": {"id", "school_id", "actor_user_id", "action", "created_at"},
}


def ensure_safe_local_database() -> str:
    """Allow only explicit development localhost PostgreSQL or workspace SQLite."""
    app_env = (os.getenv("APP_ENV") or os.getenv("ENV") or "").strip().lower()
    if app_env in {"production", "prod"}:
        raise RuntimeError("Refusing to run while APP_ENV/ENV indicates production.")

    url = make_url(DATABASE_URL)
    if url.drivername == "sqlite":
        if not url.database or url.database == ":memory:":
            raise RuntimeError("Refusing to run against an in-memory SQLite database.")
        database_path = Path(url.database).resolve()
        if database_path != LOCAL_DB_PATH:
            raise RuntimeError("Refusing to run against a SQLite database outside backend/classroom.db.")
        if not database_path.exists():
            raise RuntimeError("Local SQLite database backend/classroom.db does not exist; schema setup is required first.")
        return "sqlite"

    host = (url.host or "").strip().lower()
    if ".rds.amazonaws.com" in host:
        raise RuntimeError("Refusing to run against an AWS RDS hostname.")
    if url.drivername.startswith("postgresql") and app_env in {"development", "dev", "local"} and host in _LOCAL_POSTGRES_HOSTS:
        return "postgresql"
    raise RuntimeError("Refusing to run unless DATABASE_URL is workspace SQLite or explicitly development localhost PostgreSQL.")


def ensure_school_admin_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    missing_tables = set(REQUIRED_COLUMNS) - tables
    if missing_tables:
        raise RuntimeError(f"Local schema is missing required tables: {', '.join(sorted(missing_tables))}.")

    for table_name, required_columns in REQUIRED_COLUMNS.items():
        actual_columns = {column["name"] for column in inspector.get_columns(table_name)}
        missing_columns = required_columns - actual_columns
        if missing_columns:
            raise RuntimeError(
                f"Local schema is missing {table_name} columns: {', '.join(sorted(missing_columns))}."
            )


def describe_local_target() -> str:
    url = make_url(DATABASE_URL)
    if url.drivername == "sqlite":
        return f"sqlite database={LOCAL_DB_PATH.name} path={LOCAL_DB_PATH}"
    return f"postgresql host={url.host} database={url.database}"
