"""Small validated document contracts for Create Resources 2.0."""

from __future__ import annotations

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


def normalise_create_resources_result(kind: str, data: dict[str, Any], fallback_title: str) -> dict[str, Any]:
    if (kind or "").strip().lower() != "lesson_plan":
        title = str(data.get("title") or fallback_title).strip()
        content = str(data.get("content") or "").strip()
        if not content:
            raise ValueError("AI returned empty content")
        return {"title": title, "content": content}
    raw_document = data.get("document")
    if not isinstance(raw_document, dict):
        raise ValueError("Lesson Plan document is missing")
    content = _model_validate(LessonPlanContent, raw_document)
    document = build_lesson_plan_document(content)
    return {"title": content.title, "content": lesson_plan_to_legacy_text(content), "document": _model_dump(document)}


__all__ = ["LessonPlanContent", "StructuredLessonPlanDocument", "ValidationError", "normalise_create_resources_result"]
