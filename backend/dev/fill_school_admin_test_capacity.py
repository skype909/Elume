"""Fill the local School Admin test school to its configured teacher-seat limit.

This development-only helper creates marker-tagged dummy accounts solely for
local seat-capacity testing. It never sends email and never receives a usable
password: a random value is hashed then discarded for each new account.
"""

from __future__ import annotations

import argparse
import secrets
import sys

from passlib.context import CryptContext
from sqlalchemy import func
from sqlalchemy.engine import make_url

from school_admin_test_common import (
    describe_local_target,
    ensure_safe_local_database,
    ensure_school_admin_schema,
)

from db import DATABASE_URL, SessionLocal
import models


SCHOOL_NAME = "Pres Kilkenny Test School"
EMAIL_PREFIX = "capacity-test-"
EMAIL_DOMAIN = "@example.test"
MAX_DUMMY_ACCOUNTS = 999
PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _require_elume_local_postgres() -> None:
    database_kind = ensure_safe_local_database()
    url = make_url(DATABASE_URL)
    if database_kind != "postgresql" or (url.database or "").strip().lower() != "elume_local":
        raise RuntimeError("Refusing to operate on any database other than localhost PostgreSQL database elume_local.")


def _active_teacher_count(db, school_id: int) -> int:
    return int(
        db.query(func.count(models.UserModel.id))
        .filter(
            models.UserModel.school_id == school_id,
            models.UserModel.role == "teacher",
            models.UserModel.is_active.is_(True),
        )
        .scalar()
        or 0
    )


def _dummy_email(number: int) -> str:
    return f"{EMAIL_PREFIX}{number:02d}{EMAIL_DOMAIN}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Fill the local School Admin test school to its teacher-seat limit.")
    parser.add_argument("--apply", action="store_true", help="Create only the missing local dummy teachers.")
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
        seat_limit = int(school.seat_limit or 0)
        active_count = _active_teacher_count(db, school.id)
        if active_count > seat_limit:
            print(
                f"REFUSED: test school already exceeds capacity ({active_count}/{seat_limit}); no accounts were changed.",
                file=sys.stderr,
            )
            return 4

        needed = seat_limit - active_count
        print(f"Validated safe target: {describe_local_target()}")
        print(f"School: {school.name}; active teacher seats: {active_count}/{seat_limit}; additional dummy accounts needed: {needed}.")
        if not args.apply:
            print("Dry run only. Re-run with --apply to create only the required local capacity-test accounts.")
            return 0

        created: list[str] = []
        for number in range(1, MAX_DUMMY_ACCOUNTS + 1):
            if len(created) == needed:
                break
            email = _dummy_email(number)
            if db.query(models.UserModel.id).filter(models.UserModel.email == email).first():
                continue
            db.add(
                models.UserModel(
                    email=email,
                    first_name="Capacity",
                    last_name=f"Test {number:02d}",
                    school_name="Local Capacity Test",
                    password_hash=PWD_CONTEXT.hash(secrets.token_urlsafe(32)),
                    role="teacher",
                    school_id=school.id,
                    is_active=True,
                    email_verified=True,
                    billing_onboarding_required=False,
                )
            )
            created.append(email)

        if len(created) != needed:
            db.rollback()
            print("REFUSED: unable to allocate unique local capacity-test email addresses; no accounts were changed.", file=sys.stderr)
            return 5

        db.commit()
        final_count = _active_teacher_count(db, school.id)
        print(f"Created {len(created)} dummy account(s): {', '.join(created) if created else 'none'}")
        print(f"Seat state: limit={seat_limit}, active_teacher_count={final_count}, available_seats={max(seat_limit - final_count, 0)}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
