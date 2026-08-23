"""Undo the local-only School Admin test seed without deleting teacher accounts."""

from __future__ import annotations

import argparse
import sys

from school_admin_test_common import ensure_safe_local_database, ensure_school_admin_schema, describe_local_target

from db import SessionLocal
import models


SCHOOL_NAME = "Pres Kilkenny Test School"
PETER_EMAIL = "peter@elume.ie"


def main() -> int:
    parser = argparse.ArgumentParser(description="Reset local School Admin test data.")
    parser.add_argument("--apply", action="store_true", help="Write the reset. Without this flag, only validate safety/schema.")
    args = parser.parse_args()

    try:
        ensure_safe_local_database()
        ensure_school_admin_schema()
    except RuntimeError as error:
        print(f"REFUSED: {error}", file=sys.stderr)
        return 2

    db = SessionLocal()
    try:
        peter = db.query(models.UserModel).filter(models.UserModel.email == PETER_EMAIL).first()
        school = db.query(models.SchoolModel).filter(models.SchoolModel.name == SCHOOL_NAME).first()
        if not peter:
            print(f"REFUSED: required local account {PETER_EMAIL} was not found.", file=sys.stderr)
            return 3

        dependent_count = 0
        if school:
            dependent_count = (
                db.query(models.UserModel).filter(models.UserModel.school_id == school.id).count()
                + db.query(models.SchoolInvitationModel).filter(models.SchoolInvitationModel.school_id == school.id).count()
                + db.query(models.SchoolAdminAuditLogModel).filter(models.SchoolAdminAuditLogModel.school_id == school.id).count()
            )

        print(f"Validated safe target: {describe_local_target()}")
        print(f"Peter will be reset to teacher with school_id=NULL and is_active=true.")
        print(f"Test school: {'found' if school else 'not found'}; dependencies after reset will be checked before deletion.")
        if not args.apply:
            print("Dry run only. Re-run with --apply to write the reset.")
            return 0

        peter.role = "teacher"
        peter.school_id = None
        peter.is_active = True
        db.flush()

        if school:
            remaining_dependencies = (
                db.query(models.UserModel).filter(models.UserModel.school_id == school.id).count()
                + db.query(models.SchoolInvitationModel).filter(models.SchoolInvitationModel.school_id == school.id).count()
                + db.query(models.SchoolAdminAuditLogModel).filter(models.SchoolAdminAuditLogModel.school_id == school.id).count()
            )
            if remaining_dependencies == 0:
                db.delete(school)
                print("Removed the empty test school.")
            else:
                print("Kept the test school because users, invitations, or audit records still depend on it.")

        db.commit()
        print(f"Reset {PETER_EMAIL}. No teacher accounts were deleted; admin@elume.ie was not modified.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
