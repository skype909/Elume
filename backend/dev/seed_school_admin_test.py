"""Create idempotent local-only School Admin test data.

Run with --apply only after the local School Admin schema has been prepared.
This script refuses all network, production, and non-workspace database targets.
"""

from __future__ import annotations

import argparse
import sys

from school_admin_test_common import ensure_safe_local_database, ensure_school_admin_schema, describe_local_target

from db import SessionLocal
import models


SCHOOL_NAME = "Pres Kilkenny Test School"
PETER_EMAIL = "peter@elume.ie"
INVITATION_TEST_EMAIL = "pfitzgerald@preskilkenny.ie"


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed local School Admin test data.")
    parser.add_argument("--apply", action="store_true", help="Write the local test data. Without this flag, only validate safety/schema.")
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
        if not peter:
            print(f"REFUSED: required local account {PETER_EMAIL} was not found.", file=sys.stderr)
            return 3

        schools = db.query(models.SchoolModel).filter(models.SchoolModel.name == SCHOOL_NAME).all()
        if len(schools) > 1:
            print("REFUSED: more than one test school has the same name; resolve duplicates manually.", file=sys.stderr)
            return 4
        school = schools[0] if schools else None
        invitation_teacher = db.query(models.UserModel).filter(models.UserModel.email == INVITATION_TEST_EMAIL).first()

        print(f"Validated safe target: {describe_local_target()}")
        print(f"Peter account: found; test school: {'found' if school else 'will be created'}")
        print(
            f"Invitation test account {INVITATION_TEST_EMAIL}: "
            f"{'found; role/school will be normalised only' if invitation_teacher else 'not found; no account will be created'}"
        )
        if not args.apply:
            print("Dry run only. Re-run with --apply to write local test data.")
            return 0

        if school is None:
            school = models.SchoolModel(name=SCHOOL_NAME, status="active", seat_limit=10)
            db.add(school)
            db.flush()
        else:
            school.status = "active"
            school.seat_limit = 10

        peter.role = "school_admin"
        peter.school_id = school.id
        peter.is_active = True

        if invitation_teacher:
            invitation_teacher.role = "teacher"
            invitation_teacher.school_id = None

        db.commit()
        print(f"Seeded school id={school.id}; {PETER_EMAIL} is school_admin and active.")
        if invitation_teacher:
            print(f"Normalised {INVITATION_TEST_EMAIL} to teacher with school_id=NULL; other fields were untouched.")
        else:
            print(f"{INVITATION_TEST_EMAIL} was not found and was not created.")
        print("admin@elume.ie was not modified.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
