"""Generate the historical-v010 adoption fingerprint without contacting a database."""

from __future__ import annotations

import json
from pathlib import Path

from schema.schema_signature import metadata_signature


OUTPUT_PATH = Path(__file__).with_name("v010_fingerprint.json")

# Migration-era PostgreSQL objects which are deliberately more specific than
# the legacy ORM declarations (partial/expression indexes and server defaults).
SPECIAL_INDEX_NAMES = (
    "uq_schools_slug",
    "uq_school_invitations_open_school_email",
    "ix_school_admin_audit_log_school_created_at",
    "uq_school_departments_school_name_ci",
    "ix_collab_templates_owner_updated",
    "ix_collab_templates_source_class",
    "ix_department_collab_template_shares_template",
    "ix_department_saved_quiz_shares_quiz",
    "ix_school_department_memberships_school_user",
    "ix_ui_translation_override_revisions_override_created_at",
    "ix_ui_translation_override_revisions_reviewer_user_id",
)
# These are redundant ORM index hints or superseded by reviewed composite
# migration indexes. They are not required to establish v010 compatibility.
NON_FINGERPRINT_INDEX_NAMES = {
    "ix_ai_usage_events_user_id",
    "ix_collab_templates_owner_user_id",
    "ix_collab_templates_source_class_id",
    "ix_department_collab_template_shares_department_id",
    "ix_department_collab_template_shares_shared_by_user_id",
    "ix_department_collab_template_shares_template_id",
    "ix_department_saved_quiz_shares_department_id",
    "ix_department_saved_quiz_shares_saved_quiz_id",
    "ix_department_saved_quiz_shares_shared_by_user_id",
    "ix_school_department_memberships_department_id",
    "ix_school_department_memberships_school_id",
    "ix_school_department_memberships_user_id",
    "ix_ui_translation_override_revisions_language_code",
    "ix_ui_translation_override_revisions_override_id",
    "ix_ui_translation_override_revisions_reviewed_by_user_id",
}
IMPORTANT_DEFAULTS = {
    "schools": {"status": "active", "seat_limit": "0", "created_at": "current_timestamp", "updated_at": "current_timestamp"},
    "users": {"role": "teacher", "is_active": "true"},
    "school_invitations": {"intended_role": "teacher", "created_at": "current_timestamp"},
    "school_admin_audit_log": {"created_at": "current_timestamp"},
    "ai_usage_events": {"created_at": "timezone"},
    "collab_templates": {"created_at": "timezone", "updated_at": "timezone"},
    "school_departments": {"created_at": "timezone", "updated_at": "timezone"},
    "school_department_memberships": {"created_at": "timezone"},
    "department_collab_template_shares": {"created_at": "timezone"},
    "department_saved_quiz_shares": {"created_at": "timezone"},
    "ui_translation_overrides": {"created_at": "timezone", "updated_at": "timezone"},
    "ui_translation_override_revisions": {"created_at": "timezone"},
}
EXTRA_INDEX_REQUIREMENTS = {
    "uq_schools_slug": ("slug", "where", "is not null"),
    "uq_school_invitations_open_school_email": ("school_id", "normalized_email", "accepted_at is null", "revoked_at is null"),
    "ix_school_admin_audit_log_school_created_at": ("school_id", "created_at desc"),
    "uq_school_departments_school_name_ci": ("school_id", "lower("),
    "ix_collab_templates_owner_updated": ("owner_user_id", "updated_at desc"),
    "ix_collab_templates_source_class": ("source_class_id",),
    "ix_department_collab_template_shares_template": ("template_id",),
    "ix_department_saved_quiz_shares_quiz": ("saved_quiz_id",),
    "ix_school_department_memberships_school_user": ("school_id", "user_id"),
    "ix_ui_translation_override_revisions_override_created_at": ("override_id", "created_at desc"),
    "ix_ui_translation_override_revisions_reviewer_user_id": ("reviewed_by_user_id",),
}
EXTRA_CONSTRAINT_REQUIREMENTS = {
    "ck_schools_slug_format": ("slug", "~"),
}


def render_fingerprint() -> dict:
    # c976419 removed import-time create_all. This import only registers the
    # full mapped metadata, including TeacherPlannerStateModel in main.py.
    import main  # noqa: F401
    from db import Base

    signature = metadata_signature(Base.metadata)
    if len(signature) != 42 or "teacher_planner_state" not in signature:
        raise RuntimeError("Expected the authoritative 42-table application metadata")

    # The ORM is intentionally ahead of historical v010: the CAT4 cohort
    # fields were an unversioned SQLite-era change and will be reconciled by
    # future migration 011.  Adoption must validate the historical production
    # schema, not force it to match the current ORM prematurely.
    for table_name in (
        "cat4_baseline_sets",
        "cat4_term_result_sets",
        "cat4_workbook_versions",
    ):
        table = signature[table_name]
        table["columns"] = [
            column
            for column in table["columns"]
            if column["name"] not in {"cohort_key", "cohort_name"}
        ]
        table["indexes"] = [
            index
            for index in table["indexes"]
            if index[0] != f"ix_{table_name}_cohort_key"
        ]

    # Production's historical v010 schema retains these legacy compatibility
    # columns even though modern ORM/resource code no longer declares them.
    for table_name in ("notes", "tests"):
        columns = signature[table_name]["columns"]
        position = next(index for index, column in enumerate(columns) if column["name"] == "stored_path")
        columns.insert(
            position + 1,
            {
                "name": "size_bytes",
                "type": "INTEGER",
                "nullable": False,
                "primary_key": False,
                "server_default": "0",
            },
        )

    # The final schema has a reviewed partial slug index instead of the broad
    # ORM-generated schools slug index. Extra final-v010 indexes are checked
    # separately by exact name/definition fragments.
    signature["schools"]["indexes"] = [
        index for index in signature["schools"]["indexes"] if index[0] != "ix_schools_slug"
    ]
    for table_name, table in signature.items():
        primary_key = tuple(column["name"] for column in table["columns"] if column["primary_key"])
        table["indexes"] = [
            index
            for index in table["indexes"]
            if index[0] not in NON_FINGERPRINT_INDEX_NAMES
            and tuple(index[1]) != primary_key
        ]
        for column in table["columns"]:
            # Client-side ORM defaults are not PostgreSQL server defaults.
            # Important server defaults are captured separately above.
            column["server_default"] = None

    return {
        "version": "historical-010",
        "application_table_count": len(signature),
        "tables": signature,
        "special_index_names": SPECIAL_INDEX_NAMES,
        "non_fingerprint_index_names": sorted(NON_FINGERPRINT_INDEX_NAMES),
        "important_defaults": {
            **IMPORTANT_DEFAULTS,
            "notes": {"size_bytes": "0"},
            "tests": {"size_bytes": "0"},
        },
        "extra_index_requirements": EXTRA_INDEX_REQUIREMENTS,
        "extra_constraint_requirements": EXTRA_CONSTRAINT_REQUIREMENTS,
    }


def main() -> int:
    OUTPUT_PATH.write_text(
        json.dumps(render_fingerprint(), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(OUTPUT_PATH)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
