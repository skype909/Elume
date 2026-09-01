"""Small, feature-specific safeguards for data sent to AI providers."""

from __future__ import annotations

import re
from typing import Any, Mapping


# These fields are present in the structured CAT4 payload used by the teacher UI,
# but are not needed for an AI explanation of the educational measures.
_CAT4_DIRECT_IDENTIFIER_FIELDS = frozenset(
    {
        "student_name",
        "student_id",
        "raw_name",
        "name",
        "email",
        "email_address",
        "date_of_birth",
        "address",
        "phone",
        "phone_number",
        "class_id",
        "baseline_id",
        "term_set_id",
        "result_set_id",
        "owner_user_id",
        "user_id",
    }
)


def cat4_facts_for_ai(facts: Mapping[str, Any]) -> dict[str, Any]:
    """Return only the non-identifying CAT4 facts needed for an advisory draft."""
    return {
        key: value
        for key, value in facts.items()
        if key not in _CAT4_DIRECT_IDENTIFIER_FIELDS
    }


def report_comment_ai_input(
    *,
    average: Any,
    latest_score: Any,
    assessments_completed: int,
    assessments_missed: int,
    indicators: list[str],
    length_instruction: str,
) -> str:
    """Build the report-comment facts without passing teacher or student identifiers."""
    return (
        f"Average score: {average if average is not None else 'N/A'}\n"
        f"Latest score: {latest_score if latest_score is not None else 'N/A'}\n"
        f"Assessments completed: {assessments_completed}\n"
        f"Assessments missed: {assessments_missed}\n"
        f"Indicators: {', '.join(indicators) if indicators else 'None'}\n"
        f"Length instruction: {length_instruction}\n"
        "\n"
        "Write the final student report comment now."
    )


def restore_report_comment_student_name(comment: str, first_name: str) -> str:
    """Replace the neutral opening locally after the AI draft has been generated."""
    name = (first_name or "").strip()
    if not name:
        return comment
    return re.sub(r"^the student\b", name, comment, count=1, flags=re.IGNORECASE)


def append_report_comment_sign_off(comment: str, sign_off: str) -> str:
    """Keep a teacher's optional closing line local to Elume."""
    closing = (sign_off or "").strip()
    if not closing:
        return comment
    return f"{comment.rstrip()} {closing}".strip()
