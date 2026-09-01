"""Small validated document contracts for Create Resources 2.0."""

from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError, constr, validator


ShortText = constr(strip_whitespace=True, min_length=1, max_length=280)
BodyText = constr(strip_whitespace=True, min_length=1, max_length=2200)


def _model_dump(value: BaseModel) -> dict[str, Any]:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value.dict()


def _model_validate(model: type[BaseModel], value: dict[str, Any]) -> BaseModel:
    if hasattr(model, "model_validate"):
        return model.model_validate(value)
    return model.parse_obj(value)


class Definition(BaseModel):
    term: ShortText
    definition: BodyText

    class Config:
        extra = "forbid"


class LessonFlowItem(BaseModel):
    minutes: constr(strip_whitespace=True, min_length=1, max_length=40)
    phase: ShortText
    teacher_action: BodyText
    student_action: BodyText
    check_for_understanding: constr(strip_whitespace=True, max_length=500) | None = None

    class Config:
        extra = "forbid"


class LessonPlanContent(BaseModel):
    title: ShortText
    subject: constr(strip_whitespace=True, max_length=120) | None = None
    level: constr(strip_whitespace=True, max_length=120) | None = None
    class_context: constr(strip_whitespace=True, max_length=180) | None = None
    duration: constr(strip_whitespace=True, max_length=80) | None = None
    primary_outcome: BodyText
    learning_intentions: list[ShortText] = Field(..., min_items=1, max_items=6)
    success_criteria: list[ShortText] = Field(..., min_items=1, max_items=6)
    definitions: list[Definition] = Field(default_factory=list, max_items=8)
    resources: list[ShortText] = Field(default_factory=list, max_items=12)
    prior_knowledge: list[ShortText] = Field(default_factory=list, max_items=5)
    lesson_flow: list[LessonFlowItem] = Field(..., min_items=2, max_items=8)
    differentiation: list[ShortText] = Field(default_factory=list, max_items=6)
    misconceptions: list[ShortText] = Field(default_factory=list, max_items=6)
    assessment: list[ShortText] = Field(default_factory=list, max_items=6)
    teacher_note: constr(strip_whitespace=True, max_length=1600) | None = None
    homework: constr(strip_whitespace=True, max_length=1000) | None = None
    stopping_point: constr(strip_whitespace=True, max_length=1000) | None = None

    class Config:
        extra = "forbid"


class StructuredLessonPlanDocument(BaseModel):
    schema_version: Literal[1] = 1
    resource_type: Literal["lesson_plan"] = "lesson_plan"
    title: ShortText
    subject: str | None = None
    level: str | None = None
    class_context: str | None = None
    duration: str | None = None
    primary_outcome: BodyText
    blocks: list[dict[str, Any]] = Field(..., min_items=4, max_items=30)

    @validator("blocks")
    def valid_blocks(cls, blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
        allowed = {"heading", "bullet_list", "info_panel", "timeline", "teacher_note", "student_task", "assessment_checkpoint", "callout", "homework", "paragraph"}
        for block in blocks:
            if not isinstance(block, dict) or block.get("type") not in allowed:
                raise ValueError("document contains an unsupported block")
        return blocks

    class Config:
        extra = "forbid"


def _require_text(value: Any, *, field: str, maximum: int = 2200, required: bool = True) -> str | None:
    if value is None and not required:
        return None
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise ValueError(f"invalid {field}")
    return value.strip()


def _require_text_list(value: Any, *, field: str, maximum: int) -> list[str]:
    if not isinstance(value, list) or len(value) > maximum:
        raise ValueError(f"invalid {field}")
    return [_require_text(item, field=field, maximum=280) for item in value]


def validate_structured_lesson_plan_document(raw_document: dict[str, Any]) -> StructuredLessonPlanDocument:
    """Validate the renderer-facing document sent back by the browser for export."""
    document = _model_validate(StructuredLessonPlanDocument, raw_document)
    _require_text(document.title, field="document title", maximum=280)
    for value, field, maximum in ((document.subject, "subject", 120), (document.level, "level", 120), (document.class_context, "class context", 180), (document.duration, "duration", 80)):
        _require_text(value, field=field, maximum=maximum, required=False)
    for block in document.blocks:
        block_type = block["type"]
        allowed_fields = {
            "heading": {"type", "text"},
            "paragraph": {"type", "text"},
            "bullet_list": {"type", "title", "items"},
            "info_panel": {"type", "label", "text", "definitions"},
            "timeline": {"type", "title", "items"},
            "teacher_note": {"type", "title", "text"},
            "student_task": {"type", "title", "items"},
            "assessment_checkpoint": {"type", "title", "items"},
            "callout": {"type", "tone", "title", "text", "items"},
            "homework": {"type", "title", "text"},
        }[block_type]
        if set(block) - allowed_fields:
            raise ValueError("document block contains unsupported fields")
        if block_type in {"heading", "paragraph"}:
            _require_text(block.get("text"), field="block text")
        elif block_type in {"bullet_list", "student_task", "assessment_checkpoint"}:
            _require_text(block.get("title"), field="block title", maximum=280)
            _require_text_list(block.get("items"), field="block items", maximum=12)
        elif block_type == "info_panel":
            _require_text(block.get("label"), field="panel label", maximum=280)
            if "text" not in block and "definitions" not in block:
                raise ValueError("panel needs text or definitions")
            if "text" in block:
                _require_text(block.get("text"), field="panel text", required=False)
            if "definitions" in block:
                definitions = block["definitions"]
                if not isinstance(definitions, list) or len(definitions) > 8:
                    raise ValueError("invalid definitions")
                for definition in definitions:
                    if not isinstance(definition, dict) or set(definition) != {"term", "definition"}:
                        raise ValueError("invalid definition")
                    _require_text(definition["term"], field="definition term", maximum=280)
                    _require_text(definition["definition"], field="definition text")
        elif block_type == "timeline":
            _require_text(block.get("title"), field="timeline title", maximum=280)
            items = block.get("items")
            if not isinstance(items, list) or not 2 <= len(items) <= 8:
                raise ValueError("invalid lesson flow")
            for item in items:
                if not isinstance(item, dict) or set(item) - {"minutes", "phase", "teacher_action", "student_action", "check_for_understanding"}:
                    raise ValueError("invalid lesson flow item")
                for field, maximum in (("minutes", 40), ("phase", 280), ("teacher_action", 2200), ("student_action", 2200)):
                    _require_text(item.get(field), field=field, maximum=maximum)
                if "check_for_understanding" in item:
                    _require_text(item.get("check_for_understanding"), field="check for understanding", maximum=500, required=False)
        elif block_type in {"teacher_note", "homework"}:
            _require_text(block.get("title"), field="block title", maximum=280)
            _require_text(block.get("text"), field="block text")
        elif block_type == "callout":
            _require_text(block.get("title"), field="callout title", maximum=280)
            if block.get("tone") not in {"warning", "info", None}:
                raise ValueError("invalid callout tone")
            if "text" in block:
                _require_text(block.get("text"), field="callout text", required=False)
            if "items" in block:
                _require_text_list(block.get("items"), field="callout items", maximum=12)
    return document


def build_lesson_plan_document(content: LessonPlanContent) -> StructuredLessonPlanDocument:
    blocks: list[dict[str, Any]] = [
        {"type": "info_panel", "label": "Primary learning outcome", "text": content.primary_outcome},
        {"type": "bullet_list", "title": "Learning intentions", "items": content.learning_intentions},
        {"type": "bullet_list", "title": "Success criteria", "items": content.success_criteria},
    ]
    if content.definitions:
        blocks.append({"type": "info_panel", "label": "Key definitions", "definitions": [_model_dump(item) for item in content.definitions]})
    if content.prior_knowledge:
        blocks.append({"type": "bullet_list", "title": "Prior knowledge", "items": content.prior_knowledge})
    blocks.append({"type": "timeline", "title": "Lesson flow", "items": [_model_dump(item) for item in content.lesson_flow]})
    if content.resources:
        blocks.append({"type": "bullet_list", "title": "Resources", "items": content.resources})
    if content.differentiation:
        blocks.append({"type": "student_task", "title": "Differentiation and support", "items": content.differentiation})
    if content.misconceptions:
        blocks.append({"type": "callout", "tone": "warning", "title": "Misconceptions to address", "items": content.misconceptions})
    if content.assessment:
        blocks.append({"type": "assessment_checkpoint", "title": "Assessment and checks for understanding", "items": content.assessment})
    if content.teacher_note:
        blocks.append({"type": "teacher_note", "title": "Teacher reference", "text": content.teacher_note})
    if content.homework:
        blocks.append({"type": "homework", "title": "Suggested homework", "text": content.homework})
    if content.stopping_point:
        blocks.append({"type": "callout", "tone": "info", "title": "Stopping point / next lesson", "text": content.stopping_point})
    return StructuredLessonPlanDocument(
        title=content.title,
        subject=content.subject,
        level=content.level,
        class_context=content.class_context,
        duration=content.duration,
        primary_outcome=content.primary_outcome,
        blocks=blocks,
    )


def lesson_plan_to_legacy_text(content: LessonPlanContent) -> str:
    lines = [f"# Lesson Plan: {content.title}"]
    meta = " | ".join(part for part in [content.subject, content.level, content.duration] if part)
    if meta:
        lines.extend(["", meta])
    lines.extend(["", "## Learning Overview", content.primary_outcome, "", "## Learning Intentions"])
    lines.extend(f"- {item}" for item in content.learning_intentions)
    lines.extend(["", "## Success Criteria"])
    lines.extend(f"- I can {item}" if not item.lower().startswith("i can") else f"- {item}" for item in content.success_criteria)
    if content.definitions:
        lines.extend(["", "## Key Definitions"])
        lines.extend(f"- {item.term}: {item.definition}" for item in content.definitions)
    if content.prior_knowledge:
        lines.extend(["", "## Prior Knowledge"])
        lines.extend(f"- {item}" for item in content.prior_knowledge)
    lines.extend(["", "## Lesson Flow"])
    for item in content.lesson_flow:
        lines.extend([f"### {item.phase} ({item.minutes})", f"- Teacher: {item.teacher_action}", f"- Students: {item.student_action}"])
        if item.check_for_understanding:
            lines.append(f"- Check for understanding: {item.check_for_understanding}")
    for heading, items in (("Resources", content.resources), ("Differentiation", content.differentiation), ("Misconceptions", content.misconceptions), ("Assessment", content.assessment)):
        if items:
            lines.extend(["", f"## {heading}"])
            lines.extend(f"- {item}" for item in items)
    if content.teacher_note:
        lines.extend(["", "## Teacher Reference", content.teacher_note])
    if content.homework:
        lines.extend(["", "## Suggested Homework", content.homework])
    if content.stopping_point:
        lines.extend(["", "## Stopping Point / Next Lesson", content.stopping_point])
    return "\n".join(lines).strip()


_LESSON_PLAN_ROOT_ALIASES = {
    "learning_objectives": "learning_intentions",
    "key_definitions": "definitions",
    "lesson_timeline": "lesson_flow",
    "lesson_steps": "lesson_flow",
    "teacher_notes": "teacher_note",
    "next_step": "stopping_point",
}
_LESSON_PLAN_LIST_FIELDS = (
    "learning_intentions",
    "success_criteria",
    "resources",
    "prior_knowledge",
    "differentiation",
    "misconceptions",
    "assessment",
)
_LESSON_FLOW_ALIASES = {
    "time": "minutes",
    "time_minutes": "minutes",
    "duration": "minutes",
    "teacher_activity": "teacher_action",
    "teacher_actions": "teacher_action",
    "student_activity": "student_action",
    "student_actions": "student_action",
    "check": "check_for_understanding",
    "assessment_check": "check_for_understanding",
}
_WHOLE_MINUTES = re.compile(r"\s*([1-9][0-9]*)\s*(?:minutes?|mins?)?\s*", re.IGNORECASE)


def _move_aliases(value: dict[str, Any], aliases: dict[str, str]) -> dict[str, Any]:
    normalised = dict(value)
    for alias, canonical in aliases.items():
        if alias in normalised:
            normalised.setdefault(canonical, normalised[alias])
            del normalised[alias]
    return normalised


def _normalise_lesson_flow_minutes(value: Any) -> str:
    """Normalise simple AI minute values without changing established text values."""
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return str(value)
    if isinstance(value, str):
        match = _WHOLE_MINUTES.fullmatch(value)
        if match:
            return match.group(1)
        return value
    raise ValueError("invalid lesson flow minutes")


def _normalise_lesson_plan_ai_document(data: dict[str, Any]) -> dict[str, Any]:
    """Accept narrow, known AI variations before validating the canonical contract."""
    raw_document = data.get("document")
    if raw_document is None:
        raw_document = data
    if not isinstance(raw_document, dict):
        raise ValueError("Lesson Plan document is missing")

    document = _move_aliases(raw_document, _LESSON_PLAN_ROOT_ALIASES)
    for field in _LESSON_PLAN_LIST_FIELDS:
        if field in document:
            if document[field] is None:
                document[field] = []
            elif isinstance(document[field], str):
                document[field] = [document[field]]

    if "definitions" in document:
        definitions = document["definitions"]
        if definitions is None:
            document["definitions"] = []
        elif isinstance(definitions, dict):
            document["definitions"] = [definitions]
        elif isinstance(definitions, list):
            document["definitions"] = [
                _move_aliases(item, {"name": "term", "meaning": "definition", "description": "definition"})
                if isinstance(item, dict)
                else item
                for item in definitions
            ]

    if "lesson_flow" in document and isinstance(document["lesson_flow"], dict):
        document["lesson_flow"] = [document["lesson_flow"]]
    if isinstance(document.get("lesson_flow"), list):
        normalised_flow = []
        for item in document["lesson_flow"]:
            normalised_item = _move_aliases(item, _LESSON_FLOW_ALIASES) if isinstance(item, dict) else item
            if isinstance(normalised_item, dict) and "minutes" in normalised_item:
                normalised_item["minutes"] = _normalise_lesson_flow_minutes(normalised_item["minutes"])
            normalised_flow.append(normalised_item)
        document["lesson_flow"] = normalised_flow

    if isinstance(document.get("duration"), (int, float)) and not isinstance(document["duration"], bool):
        document["duration"] = f"{document['duration']} minutes"
    return document


def structured_lesson_plan_validation_summary(exc: Exception) -> str:
    """Produce a log-safe validation summary without recording generated content."""
    if isinstance(exc, ValidationError):
        fields = []
        for error in exc.errors()[:6]:
            location = error.get("loc") or ()
            fields.append(".".join(str(part) for part in location))
        return "validation_fields=" + (", ".join(fields) or "unknown")
    if isinstance(exc, ValueError) and str(exc) == "invalid lesson flow minutes":
        return "validation_fields=lesson_flow.minutes"
    if isinstance(exc, ValueError) and str(exc) == "lesson plan duration mismatch":
        return "validation_fields=duration"
    if isinstance(exc, ValueError) and str(exc) in {"invalid lesson flow minutes for requested duration", "lesson flow duration total mismatch"}:
        return "validation_fields=lesson_flow.minutes"
    if isinstance(exc, ValueError) and str(exc) == "invalid requested lesson duration":
        return "validation_fields=lesson_duration_minutes"
    return "validation_reason=" + type(exc).__name__


def _validate_requested_lesson_duration(content: LessonPlanContent, expected_duration_minutes: int | None) -> None:
    """Enforce an explicit live-generation duration without changing legacy documents."""
    if expected_duration_minutes is None:
        return
    if isinstance(expected_duration_minutes, bool) or not isinstance(expected_duration_minutes, int) or expected_duration_minutes <= 0:
        raise ValueError("invalid requested lesson duration")

    duration_match = _WHOLE_MINUTES.fullmatch(content.duration or "")
    if not duration_match or int(duration_match.group(1)) != expected_duration_minutes:
        raise ValueError("lesson plan duration mismatch")

    minute_values = []
    for item in content.lesson_flow:
        if not re.fullmatch(r"[1-9][0-9]*", item.minutes):
            raise ValueError("invalid lesson flow minutes for requested duration")
        minute_values.append(int(item.minutes))
    if sum(minute_values) != expected_duration_minutes:
        raise ValueError("lesson flow duration total mismatch")

    content.duration = f"{expected_duration_minutes} minutes"


def normalise_create_resources_result(
    kind: str,
    data: dict[str, Any],
    fallback_title: str,
    *,
    expected_duration_minutes: int | None = None,
) -> dict[str, Any]:
    if (kind or "").strip().lower() != "lesson_plan":
        title = str(data.get("title") or fallback_title).strip()
        content = str(data.get("content") or "").strip()
        if not content:
            raise ValueError("AI returned empty content")
        return {"title": title, "content": content}
    content = _model_validate(LessonPlanContent, _normalise_lesson_plan_ai_document(data))
    _validate_requested_lesson_duration(content, expected_duration_minutes)
    document = build_lesson_plan_document(content)
    return {"title": content.title, "content": lesson_plan_to_legacy_text(content), "document": _model_dump(document)}


__all__ = ["LessonPlanContent", "StructuredLessonPlanDocument", "ValidationError", "normalise_create_resources_result", "structured_lesson_plan_validation_summary", "validate_structured_lesson_plan_document"]
