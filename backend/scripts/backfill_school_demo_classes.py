"""Dry-run-first Demo Class backfill for an explicitly named school.

This utility deliberately reuses the application canonical seeder. It never creates
teachers or changes memberships, roles, invitations, seats, billing, or real classes.
"""

from __future__ import annotations

import argparse
import contextlib
import importlib
import io
import os
import sys
from pathlib import Path
from typing import Any

from sqlalchemy.orm import configure_mappers


DEFAULT_SCHOOL_NAME = "Presentation Kilkenny"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def normalise_school_name(value: str) -> str:
    return " ".join((value or "").split()).casefold()


def load_application_dependencies() -> tuple[Any, Any, Any]:
    """Import the canonical seeder without allowing import-time schema creation.

    main.py currently calls Base.metadata.create_all at import time for application
    startup. This script only needs its existing canonical Demo Class helper, so it
    temporarily replaces that method in this process before importing main.
    """

    backend_dir = Path(__file__).resolve().parents[1]
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    from db import Base, SessionLocal  # noqa: PLC0415
    import models  # noqa: PLC0415

    original_create_all = Base.metadata.create_all
    Base.metadata.create_all = lambda *args, **kwargs: None  # type: ignore[method-assign]
    try:
        # main.py has an existing diagnostic print at import time. Keep this utility's
        # output limited to its own safety and backfill report.
        with contextlib.redirect_stdout(io.StringIO()):
            main = importlib.import_module("main")
    finally:
        Base.metadata.create_all = original_create_all  # type: ignore[method-assign]

    return SessionLocal, models, main


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill missing Demo Classes for one school.")
    parser.add_argument("--school-name", default=DEFAULT_SCHOOL_NAME, help="Exact school name to target.")
    parser.add_argument("--apply", action="store_true", help="Write missing Demo Classes. Dry run is the default.")
    parser.add_argument(
        "--confirm-school",
        help="Required with --apply; must exactly match --school-name after whitespace normalization.",
    )
    args = parser.parse_args()

    if args.apply and normalise_school_name(args.confirm_school or "") != normalise_school_name(args.school_name):
        parser.error("--apply requires --confirm-school matching --school-name exactly.")

    # Do not let a caller accidentally inherit an unrelated shell target while
    # believing this utility is a local-only helper. Production dry runs remain
    # allowed by design; writes always require the explicit confirmation above.
    if os.getenv("APP_ENV", "").strip().lower() in {"production", "prod"} and args.apply:
        print("Production write requested with explicit school confirmation.")

    SessionLocal, models, app_main = load_application_dependencies()
    configure_mappers()
    db = SessionLocal()

    try:
        requested_name = normalise_school_name(args.school_name)
        schools = db.query(models.SchoolModel).all()
        matches = [school for school in schools if normalise_school_name(school.name) == requested_name]
        if len(matches) != 1:
            print(f"STOP: expected exactly one matching school; found {len(matches)}.")
            return 2

        school = matches[0]
        teachers = (
            db.query(models.UserModel)
            .filter(
                models.UserModel.school_id == school.id,
                models.UserModel.role == "teacher",
                models.UserModel.is_active.is_(True),
            )
            .order_by(models.UserModel.id.asc())
            .all()
        )

        already_seeded = 0
        missing = []
        for teacher in teachers:
            if app_main._find_existing_demo_class_for_user(db, teacher):
                already_seeded += 1
            else:
                missing.append(teacher)

        print(f"School: {school.name}")
        print(f"Active teachers: {len(teachers)}")
        print(f"Already had Demo Class: {already_seeded}")
        print(f"Missing Demo Class: {len(missing)}")
        print(f"Would seed: {len(missing)}")

        if not args.apply:
            print("Mode: DRY RUN (no database changes made)")
            return 0

        seeded = 0
        failures = 0
        for teacher in missing:
            try:
                app_main._seed_demo_class(db, teacher)
                seeded += 1
            except Exception:
                db.rollback()
                failures += 1

        print(f"Seeded: {seeded}")
        print(f"Failures: {failures}")
        return 1 if failures else 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
