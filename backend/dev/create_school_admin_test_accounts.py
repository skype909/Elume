"""Create minimal, isolated local accounts required by the School Admin seed.

Passwords are requested interactively and are never written to source, logs, or
command-line arguments. Existing accounts are never modified by this helper.
"""

from __future__ import annotations

import argparse
import getpass
import sys

from passlib.context import CryptContext

from school_admin_test_common import ensure_safe_local_database, ensure_school_admin_schema, describe_local_target

from db import SessionLocal
import models


PWD_CONTEXT = CryptContext(schemes=["bcrypt"], deprecated="auto")
ACCOUNTS = (
    ("peter@elume.ie", "Peter", "Local Test"),
    ("pfitzgerald@preskilkenny.ie", "Invitation", "Test"),
)


def _password_error(password: str) -> str | None:
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not any(char.isupper() for char in password):
        return "Password must include an uppercase letter."
    if not any(char.islower() for char in password):
        return "Password must include a lowercase letter."
    if not any(char.isdigit() for char in password):
        return "Password must include a number."
    return None


def _prompt_password(email: str) -> str:
    while True:
        password = getpass.getpass(f"Choose a local development password for {email}: ")
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
    parser = argparse.ArgumentParser(description="Create minimal local School Admin test accounts.")
    parser.add_argument("--apply", action="store_true", help="Create missing accounts after interactive password entry.")
    args = parser.parse_args()

    try:
        ensure_safe_local_database()
        ensure_school_admin_schema()
    except RuntimeError as error:
        print(f"REFUSED: {error}", file=sys.stderr)
        return 2

    db = SessionLocal()
    try:
        missing = []
        for email, _, _ in ACCOUNTS:
            if not db.query(models.UserModel).filter(models.UserModel.email == email).first():
                missing.append(email)

        print(f"Validated safe target: {describe_local_target()}")
        if not missing:
            print("Both local test accounts already exist; nothing was changed.")
            return 0
        print(f"Missing local test accounts: {', '.join(missing)}")
        if not args.apply:
            print("Dry run only. Re-run with --apply to create missing accounts interactively.")
            return 0

        passwords = {email: _prompt_password(email) for email in missing}
        for email, first_name, last_name in ACCOUNTS:
            if email not in passwords:
                continue
            db.add(
                models.UserModel(
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                    school_name="Local Development",
                    password_hash=PWD_CONTEXT.hash(passwords[email]),
                    role="teacher",
                    school_id=None,
                    is_active=True,
                    email_verified=True,
                    billing_onboarding_required=False,
                )
            )
        db.commit()
        print("Created missing local test accounts with development-only passwords.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
