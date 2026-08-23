"""Create or reset the isolated local platform-admin test account.

This helper is intentionally unavailable outside the disposable localhost
PostgreSQL development database. It uses the same bcrypt hashing convention as
the application, but never receives or copies production credentials.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from passlib.context import CryptContext
from sqlalchemy.engine import make_url

from school_admin_test_common import (
    describe_local_target,
    ensure_safe_local_database,
    ensure_school_admin_schema,
)

from db import DATABASE_URL, SessionLocal
import models


ADMIN_EMAIL = "admin@elume.ie"
PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _require_elume_local_postgres() -> None:
    database_kind = ensure_safe_local_database()
    url = make_url(DATABASE_URL)
    if database_kind != "postgresql" or (url.database or "").strip().lower() != "elume_local":
        raise RuntimeError("Refusing to operate on any database other than localhost PostgreSQL database elume_local.")


def _password_error(password: str) -> str | None:
    # Matches the application's current password policy.
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not any(char.isupper() for char in password):
        return "Password must include an uppercase letter."
    if not any(char.islower() for char in password):
        return "Password must include a lowercase letter."
    if not any(char.isdigit() for char in password):
        return "Password must include a number."
    return None


def _prompt_password() -> str:
    while True:
        password = getpass.getpass(f"Choose a local development password for {ADMIN_EMAIL}: ")
        confirmation = getpass.getpass("Confirm password: ")
        if password != confirmation:
            print("Passwords do not match. Try again.", file=sys.stderr)
            continue
        error = _password_error(password)
        if error:
            print(error, file=sys.stderr)
            continue
        return password


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or reset the local Elume platform-admin account.")
    parser.add_argument("--apply", action="store_true", help="Prompt for a local password and create/reset the account.")
    args = parser.parse_args()

    try:
        _require_elume_local_postgres()
        ensure_school_admin_schema()
    except RuntimeError as error:
        print(f"REFUSED: {error}", file=sys.stderr)
        return 2

    db = SessionLocal()
    try:
        admin = db.query(models.UserModel).filter(models.UserModel.email == ADMIN_EMAIL).first()
        print(f"Validated safe target: {describe_local_target()}")
        print(f"Local account {ADMIN_EMAIL}: {'found; password and platform-admin state will be reset' if admin else 'missing; will be created'}.")
        if not args.apply:
            print("Dry run only. Re-run with --apply to enter a local development password and write the account.")
            return 0

        password = _prompt_password()
        if admin is None:
            admin = models.UserModel(
                email=ADMIN_EMAIL,
                first_name="Elume",
                last_name="Platform Admin",
                school_name="Local Development",
                password_hash=PWD_CONTEXT.hash(password),
                role="platform_admin",
                school_id=None,
                is_active=True,
                email_verified=True,
                billing_onboarding_required=False,
            )
            db.add(admin)
        else:
            # Preserve all unrelated local fields, including any local-only
            # classes or billing test data, while restoring safe admin access.
            admin.password_hash = PWD_CONTEXT.hash(password)
            admin.role = "platform_admin"
            admin.school_id = None
            admin.is_active = True
            admin.email_verified = True

        db.commit()
        print(f"Local platform-admin account is ready: email={ADMIN_EMAIL}, role=platform_admin, school_id=NULL, is_active=true.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
