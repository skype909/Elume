"""Rotate one pending local invitation token and print its localhost acceptance URL.

The raw token is printed only to the invoking local terminal. It is never
persisted, logged, or exposed by any production API path.
"""

from __future__ import annotations

import argparse
import hashlib
import secrets
import sys
from datetime import datetime, timedelta

from sqlalchemy.engine import make_url

from school_admin_test_common import ensure_safe_local_database, ensure_school_admin_schema, describe_local_target

from db import DATABASE_URL, SessionLocal
import models


INVITATION_EXPIRY_DAYS = 7  # Matches SCHOOL_INVITATION_EXPIRY_DAYS in backend/main.py.
DEFAULT_EMAIL = "pfitzgerald@preskilkenny.ie"
LOCAL_INVITE_BASE_URL = "http://localhost:3000/#/school-invite"


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Get a browser link for one pending local School Admin invitation.")
    parser.add_argument("--email", default=DEFAULT_EMAIL, help="Pending invitation email (default: pfitzgerald@preskilkenny.ie).")
    parser.add_argument("--apply", action="store_true", help="Rotate the pending token and print its one-time local URL.")
    args = parser.parse_args()
    email = (args.email or "").strip().lower()

    try:
        database_kind = ensure_safe_local_database()
        url = make_url(DATABASE_URL)
        if database_kind != "postgresql" or (url.database or "").strip().lower() != "elume_local":
            raise RuntimeError("Refusing to operate on any database other than localhost PostgreSQL database elume_local.")
        if not email or "@" not in email:
            raise RuntimeError("A valid invitation email is required.")
    except RuntimeError as error:
        print(f"REFUSED: {error}", file=sys.stderr)
        return 2

    print(f"Validated safe target: {describe_local_target()}")
    if not args.apply:
        print(f"Dry run only. No database connection or token rotation was performed for {email}.")
        print("Re-run with --apply to rotate one existing pending invitation and print its local link.")
        return 0

    try:
        ensure_school_admin_schema()
    except RuntimeError as error:
        print(f"REFUSED: {error}", file=sys.stderr)
        return 3

    db = SessionLocal()
    try:
        now = datetime.utcnow()
        invitations = (
            db.query(models.SchoolInvitationModel)
            .filter(
                models.SchoolInvitationModel.normalized_email == email,
                models.SchoolInvitationModel.accepted_at.is_(None),
                models.SchoolInvitationModel.revoked_at.is_(None),
                models.SchoolInvitationModel.expires_at > now,
            )
            .with_for_update()
            .all()
        )
        if not invitations:
            print("No unexpired pending invitation was found for that email.", file=sys.stderr)
            return 4
        if len(invitations) != 1:
            print("REFUSED: more than one pending invitation matched; resolve the local test data first.", file=sys.stderr)
            return 5

        invitation = invitations[0]
        raw_token = secrets.token_urlsafe(32)
        invitation.token_hash = _hash_token(raw_token)
        invitation.expires_at = now + timedelta(days=INVITATION_EXPIRY_DAYS)
        db.add(
            models.SchoolAdminAuditLogModel(
                school_id=invitation.school_id,
                actor_user_id=invitation.invited_by_user_id,
                invitation_id=invitation.id,
                action="invitation_resent",
            )
        )
        db.commit()

        print("Previous invitation token is now invalid.")
        print("Local invitation URL (do not share outside local development):")
        print(f"{LOCAL_INVITE_BASE_URL}/{raw_token}")
        print(f"Expires (UTC): {invitation.expires_at.isoformat()}Z")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
