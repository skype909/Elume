"""Remove only marker-tagged dummy accounts created for local seat-capacity tests."""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import inspect, text
from sqlalchemy.engine import make_url

from school_admin_test_common import (
    describe_local_target,
    ensure_safe_local_database,
    ensure_school_admin_schema,
)

from db import DATABASE_URL, SessionLocal, engine
import models


SCHOOL_NAME = "Pres Kilkenny Test School"
EMAIL_PATTERN = r"^capacity-test-[0-9]{2,}@example\.test$"
MARKER_SCHOOL_NAME = "Local Capacity Test"


def _require_elume_local_postgres() -> None:
    database_kind = ensure_safe_local_database()
    url = make_url(DATABASE_URL)
    if database_kind != "postgresql" or (url.database or "").strip().lower() != "elume_local":
        raise RuntimeError("Refusing to operate on any database other than localhost PostgreSQL database elume_local.")


def _quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def _has_references(db, user_id: int) -> bool:
    """Refuse deletion if any current-schema foreign key still references the dummy user."""
    inspector = inspect(engine)
    for table_name in inspector.get_table_names():
        for foreign_key in inspector.get_foreign_keys(table_name):
            if foreign_key.get("referred_table") != "users":
                continue
            constrained_columns = foreign_key.get("constrained_columns") or []
            if len(constrained_columns) != 1:
                continue
            statement = text(
                f"SELECT 1 FROM {_quote_identifier(table_name)} "
                f"WHERE {_quote_identifier(constrained_columns[0])} = :user_id LIMIT 1"
            )
            if db.execute(statement, {"user_id": user_id}).first():
                return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Remove local capacity-test dummy teachers without touching real test accounts.")
    parser.add_argument("--apply", action="store_true", help="Delete only safe, unreferenced local capacity-test accounts.")
    args = parser.parse_args()

    try:
        _require_elume_local_postgres()
        ensure_school_admin_schema()
    except RuntimeError as error:
        print(f"REFUSED: {error}", file=sys.stderr)
        return 2

    db = SessionLocal()
    try:
        schools = db.query(models.SchoolModel).filter(models.SchoolModel.name == SCHOOL_NAME).all()
        if len(schools) != 1:
            print(f"REFUSED: expected exactly one local test school named {SCHOOL_NAME!r}.", file=sys.stderr)
            return 3
        school = schools[0]
        candidates = (
            db.query(models.UserModel)
            .filter(
                models.UserModel.school_id == school.id,
                models.UserModel.role == "teacher",
                models.UserModel.email.op("~")(EMAIL_PATTERN),
                models.UserModel.school_name == MARKER_SCHOOL_NAME,
            )
            .order_by(models.UserModel.email)
            .all()
        )

        print(f"Validated safe target: {describe_local_target()}")
        print(f"Matched {len(candidates)} marker-tagged local capacity-test account(s).")
        if not args.apply:
            print("Dry run only. Re-run with --apply to delete only these unreferenced dummy accounts.")
            return 0

        referenced = [user.email for user in candidates if _has_references(db, user.id)]
        if referenced:
            db.rollback()
            print(
                "REFUSED: these capacity-test accounts have dependent data and will not be deleted: " + ", ".join(referenced),
                file=sys.stderr,
            )
            return 4

        for user in candidates:
            db.delete(user)
        db.commit()
        print(f"Deleted {len(candidates)} local capacity-test account(s): {', '.join(user.email for user in candidates) or 'none'}")
        print("Peter, the invitation test teacher, and all non-marker accounts were not modified.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
