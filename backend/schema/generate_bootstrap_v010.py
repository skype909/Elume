"""Generate the reviewed final-v010 SQL from Elume's complete mapped metadata.

This development utility compiles DDL only.  It never opens a database or
calls ``Base.metadata.create_all``.
"""

from __future__ import annotations

from pathlib import Path

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex, CreateTable


EXPECTED_VERSIONS = tuple(f"{version:03d}" for version in range(1, 11))
OUTPUT_PATH = Path(__file__).with_name("bootstrap_v010.sql")

# These are final-state PostgreSQL details introduced by the immutable 001–010
# migrations but not fully expressible in the legacy ORM declarations (notably
# partial/expression indexes and server-side defaults).  Keeping them here
# makes the generated bootstrap a final-v010 schema, not a best-effort
# ``create_all`` approximation.
POST_METADATA_DDL = (
    "ALTER TABLE schools ALTER COLUMN status SET DEFAULT 'active';",
    "ALTER TABLE schools ALTER COLUMN seat_limit SET DEFAULT 0;",
    "ALTER TABLE schools ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;",
    "ALTER TABLE schools ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;",
    "ALTER TABLE schools ADD CONSTRAINT ck_schools_slug_format "
    "CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');",
    "CREATE UNIQUE INDEX uq_schools_slug ON schools (slug) WHERE slug IS NOT NULL;",
    "ALTER TABLE users ALTER COLUMN role SET DEFAULT 'teacher';",
    "ALTER TABLE users ALTER COLUMN is_active SET DEFAULT TRUE;",
    "ALTER TABLE school_invitations ALTER COLUMN intended_role SET DEFAULT 'teacher';",
    "ALTER TABLE school_invitations ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;",
    "CREATE UNIQUE INDEX uq_school_invitations_open_school_email "
    "ON school_invitations (school_id, normalized_email) "
    "WHERE accepted_at IS NULL AND revoked_at IS NULL;",
    "ALTER TABLE school_admin_audit_log ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;",
    "CREATE INDEX ix_school_admin_audit_log_school_created_at "
    "ON school_admin_audit_log (school_id, created_at DESC);",
    "ALTER TABLE ai_usage_events ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE collab_templates ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE collab_templates ALTER COLUMN updated_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE school_departments ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE school_departments ALTER COLUMN updated_at SET DEFAULT (timezone('utc', now()));",
    "CREATE UNIQUE INDEX uq_school_departments_school_name_ci "
    "ON school_departments (school_id, lower(name));",
    "ALTER TABLE school_department_memberships ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE department_collab_template_shares ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE department_saved_quiz_shares ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE ui_translation_overrides ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE ui_translation_overrides ALTER COLUMN updated_at SET DEFAULT (timezone('utc', now()));",
    "ALTER TABLE ui_translation_override_revisions ALTER COLUMN created_at SET DEFAULT (timezone('utc', now()));",
)


def render_bootstrap() -> str:
    # Importing main registers TeacherPlannerStateModel with the same Base as
    # models.py.  c976419 removed the previous import-time create_all call.
    import main  # noqa: F401
    from db import Base

    tables = list(Base.metadata.sorted_tables)
    if len(tables) != 42:
        raise RuntimeError(f"Expected 42 mapped application tables, found {len(tables)}")

    dialect = postgresql.dialect()
    statements = [
        "-- Elume final-v010 empty-database PostgreSQL bootstrap.",
        "-- Generated from the complete SQLAlchemy mapped metadata; review before changing.",
        "-- This file is schema-only and is intentionally not run by application startup.",
        "BEGIN;",
        "",
        "CREATE TABLE schema_migrations (",
        "    version VARCHAR PRIMARY KEY,",
        "    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP",
        ");",
        "",
    ]
    for table in tables:
        ddl = str(CreateTable(table).compile(dialect=dialect)).rstrip()
        ddl = "\n".join(line.rstrip() for line in ddl.splitlines())
        if table.name == "schools":
            # Production uses the reviewed partial slug index below, rather
            # than a redundant full unique constraint/index from the ORM hint.
            ddl = ddl.replace("\tUNIQUE (slug),\n", "")
        statements.extend((ddl + ";", ""))
    for table in tables:
        for index in sorted(table.indexes, key=lambda item: item.name or ""):
            if table.name == "schools" and index.name == "ix_schools_slug":
                continue
            statements.extend((str(CreateIndex(index).compile(dialect=dialect)).rstrip() + ";", ""))
    statements.extend((*POST_METADATA_DDL, ""))
    versions = ", ".join(f"('{version}')" for version in EXPECTED_VERSIONS)
    statements.extend(
        (
            "INSERT INTO schema_migrations (version) VALUES " + versions + ";",
            "COMMIT;",
            "",
        )
    )
    return "\n".join(statements)


def main() -> int:
    OUTPUT_PATH.write_text(render_bootstrap(), encoding="utf-8", newline="\n")
    print(OUTPUT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
