"""Validated structured annual plans for Create Resources Scheme of Work output."""
from __future__ import annotations

from datetime import date
import re
from typing import Any, Literal
from pydantic import BaseModel, Field, ValidationError, constr

Short = constr(strip_whitespace=True, min_length=1, max_length=280)
Body = constr(strip_whitespace=True, min_length=1, max_length=1800)

def dump(value: BaseModel) -> dict[str, Any]:
    return value.model_dump() if hasattr(value, "model_dump") else value.dict()

def validate(model: type[BaseModel], value: dict[str, Any]) -> BaseModel:
    return model.model_validate(value) if hasattr(model, "model_validate") else model.parse_obj(value)

class AnnualCourseMapRow(BaseModel):
    dates: Short
    start_date: date
    end_date: date
    topic: Short
    learning_focus: Body
    practical_or_assessment: constr(strip_whitespace=True, max_length=1000) | None = None
    # These are deliberately explicit rather than inferred from prose.  They
    # let us reject a plan that allocates more teaching than the teacher's
    # confirmed calendar and timetable can provide.
    lessons: int = Field(..., ge=1, le=80)
    minutes: int = Field(..., ge=1, le=9600)
    class Config: extra = "forbid"

class AnnualPlanContent(BaseModel):
    title: Short
    subject: constr(strip_whitespace=True, max_length=120) | None = None
    level: constr(strip_whitespace=True, max_length=120) | None = None
    class_context: constr(strip_whitespace=True, max_length=180) | None = None
    academic_year: Short
    planning_basis: list[Short] = Field(..., min_items=2, max_items=12)
    calendar_constraints: list[Short] = Field(default_factory=list, max_items=16)
    course_map: list[AnnualCourseMapRow] = Field(..., min_items=1, max_items=80)
    teaching_assessment_rhythm: list[Short] = Field(default_factory=list, max_items=12)
    practical_project_programme: list[Short] = Field(default_factory=list, max_items=12)
    checkpoints_and_buffers: list[Short] = Field(default_factory=list, max_items=12)
    planning_sources: list[Short] = Field(default_factory=list, max_items=16)
    assumptions_and_adjustment_rules: list[Short] = Field(default_factory=list, max_items=12)
    first_lesson: Body | None = None
    class Config: extra = "forbid"

class StructuredAnnualPlanDocument(BaseModel):
    schema_version: Literal[1] = 1
    resource_type: Literal["annual_plan"] = "annual_plan"
    title: Short
    subject: str | None = None
    level: str | None = None
    class_context: str | None = None
    academic_year: Short
    planning_basis: list[str]
    calendar_constraints: list[str]
    course_map: list[AnnualCourseMapRow]
    teaching_assessment_rhythm: list[str]
    practical_project_programme: list[str]
    checkpoints_and_buffers: list[str]
    planning_sources: list[str]
    assumptions_and_adjustment_rules: list[str]
    first_lesson: str | None = None
    class Config: extra = "forbid"

def build(content: AnnualPlanContent) -> StructuredAnnualPlanDocument:
    return StructuredAnnualPlanDocument(**dump(content), resource_type="annual_plan")

def _topic_key(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w ]+", " ", value.casefold())).strip()


def _validate_planning_commitments(document: StructuredAnnualPlanDocument, planning_input: dict[str, Any] | None) -> None:
    """Keep an annual plan honest about teacher-confirmed scope and capacity."""
    if not planning_input:
        return
    start = planning_input.get("start_date")
    end = planning_input.get("end_date")
    if not isinstance(start, str) or not isinstance(end, str):
        raise ValueError("Confirm academic-year start and end dates before generating a full-year plan.")
    try:
        start_date, end_date = date.fromisoformat(start), date.fromisoformat(end)
    except ValueError as exc:
        raise ValueError("Academic-year dates must be valid ISO dates.") from exc
    if end_date < start_date:
        raise ValueError("Academic-year end date must be after the start date.")

    selected_topics = [_topic_key(str(topic)) for topic in planning_input.get("topics") or [] if _topic_key(str(topic))]
    if not selected_topics:
        raise ValueError("Add at least one confirmed topic before generating a full-year plan.")
    mapped_topics = [_topic_key(row.topic) for row in document.course_map]
    missing = [topic for topic in selected_topics if not any(topic in mapped or mapped in topic for mapped in mapped_topics)]
    if missing:
        raise ValueError("The annual plan omitted confirmed topic(s): " + ", ".join(missing[:5]))

    capacity = planning_input.get("capacity") if isinstance(planning_input.get("capacity"), dict) else {}
    confirmed_lessons = int(capacity.get("lessons") or 0)
    confirmed_minutes = int(capacity.get("minutes") or 0)
    allocated_lessons = sum(row.lessons for row in document.course_map)
    allocated_minutes = sum(row.minutes for row in document.course_map)
    if confirmed_lessons <= 0 or confirmed_minutes <= 0:
        raise ValueError("Confirm weekly classes and calendar capacity before generating a full-year plan.")
    if allocated_lessons > confirmed_lessons or allocated_minutes > confirmed_minutes:
        raise ValueError("The annual plan exceeds the confirmed teaching capacity; adjust topics, dates or weekly classes.")
    for row in document.course_map:
        if row.start_date > row.end_date or row.start_date < start_date or row.end_date > end_date:
            raise ValueError("The annual plan includes course-map dates outside the confirmed academic year.")


def normalise(raw: dict[str, Any], fallback_title: str, planning_input: dict[str, Any] | None = None) -> dict[str, Any]:
    value = raw.get("document") if isinstance(raw.get("document"), dict) else raw
    if not isinstance(value, dict): raise ValueError("Annual plan document is missing")
    aliases = {"year": "academic_year", "course_map_rows": "course_map", "calendar": "calendar_constraints", "sources": "planning_sources"}
    value = dict(value)
    for old, new in aliases.items():
        if old in value and new not in value: value[new] = value.pop(old)
    value.setdefault("title", fallback_title)
    plan = validate(AnnualPlanContent, value)
    document = build(plan)
    _validate_planning_commitments(document, planning_input)
    lines = [f"# {document.title}", "", f"Academic year: {document.academic_year}", "", "## Course map"]
    lines.extend(f"- {row.dates}: {row.topic} - {row.learning_focus}" for row in document.course_map)
    return {"title": document.title, "content": "\n".join(lines), "document": dump(document)}

def validate_document(raw: dict[str, Any]) -> StructuredAnnualPlanDocument:
    return validate(StructuredAnnualPlanDocument, raw)

__all__ = ["ValidationError", "StructuredAnnualPlanDocument", "normalise", "validate_document"]
