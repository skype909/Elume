"""Pure AAC planning safeguards; no AI, database or calendar work at import time."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any, Callable
import hashlib
import json
import re

MIN_COMPLETION_BUFFER_DAYS = 14
DEFAULT_WEEKLY_MINUTES = 30
MAX_SOURCE_BYTES = 15 * 1024 * 1024
ALLOWED_SOURCE_PURPOSES = {"specification", "fifth_year_calendar", "sixth_year_calendar"}


class AacSourceError(ValueError): pass
class AacProposalError(ValueError): pass


def safe_source_filename(name: str | None) -> str:
    value = Path(name or "source").name.strip()
    if not value or len(value) > 255: raise AacSourceError("Choose a document filename up to 255 characters.")
    return value


def extract_source_document(filename: str, content: bytes) -> dict[str, Any]:
    """Extract bounded text with genuine page/paragraph references; never OCR or execute source text."""
    name = safe_source_filename(filename); suffix = Path(name).suffix.lower()
    if suffix not in {".pdf", ".docx"}: raise AacSourceError("AAC sources must be PDF or DOCX files.")
    if not content or len(content) > MAX_SOURCE_BYTES: raise AacSourceError("AAC source files must be between 1 byte and 15 MB.")
    sections: list[dict[str, str]] = []
    try:
        if suffix == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(BytesIO(content))
            if reader.is_encrypted: raise AacSourceError("This PDF is encrypted. Upload an unlocked copy.")
            for number, page in enumerate(reader.pages, 1):
                value = (page.extract_text() or "").strip()
                if value: sections.append({"reference": f"page {number}", "text": value})
            if not sections: raise AacSourceError("No readable text was found. This may be a scanned PDF; use OCR or enter the relevant information manually.")
        else:
            from docx import Document
            doc = Document(BytesIO(content))
            for number, paragraph in enumerate(doc.paragraphs, 1):
                value = (paragraph.text or "").strip()
                if value: sections.append({"reference": f"paragraph {number}", "text": value})
            if not sections: raise AacSourceError("No readable text was found in this DOCX. Enter the relevant information manually.")
    except AacSourceError: raise
    except Exception as exc: raise AacSourceError("This document could not be read safely. Upload another copy or enter information manually.") from exc
    return {"display_filename": name, "sha256": hashlib.sha256(content).hexdigest(), "sections": sections}


def proposal_input(documents: list[dict[str, Any]], planning_inputs: dict[str, Any]) -> dict[str, Any]:
    """Allowlisted proposal context: no students, progress, CAT4, accounts, or raw upload metadata."""
    return {"documents": [{"id": item["id"], "purpose": item["purpose"], "sections": item["sections"]} for item in documents], "planning_inputs": planning_inputs}


def validate_proposal(raw: Any, documents: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(raw, dict): raise AacProposalError("The AI response was not a structured proposal.")
    allowed_ids = {item["id"] for item in documents}; refs = {(item["id"], part["reference"]) for item in documents for part in item["sections"]}
    required_fields = ("requirements", "candidate_deadlines", "stages", "interruptions", "missing_information", "conflicts", "assumptions")
    if any(key not in raw for key in required_fields):
        raise AacProposalError("The AI proposal is missing required fields.")
    proposal = {key: raw[key] for key in required_fields}
    if not all(isinstance(proposal[key], list) for key in proposal): raise AacProposalError("The AI proposal has invalid list fields.")
    if len(proposal["stages"]) > 20 or len(proposal["requirements"]) > 100: raise AacProposalError("The AI proposal exceeds AAC safety limits.")
    for requirement in proposal["requirements"] + proposal["candidate_deadlines"]:
        if not isinstance(requirement, dict): raise AacProposalError("The AI proposal contains an invalid source item.")
        source_id, reference = requirement.get("source_document_id"), requirement.get("source_reference")
        if source_id not in allowed_ids or (source_id, reference) not in refs: raise AacProposalError("The AI proposal cited a source reference that is not available.")
    for candidate in proposal["candidate_deadlines"]:
        excerpt = str(candidate.get("supporting_excerpt") or "").strip()
        meaning = str(candidate.get("meaning") or "").lower()
        try: date.fromisoformat(str(candidate.get("date")))
        except ValueError: raise AacProposalError("A candidate deadline needs an unambiguous full date.")
        matching = next((part["text"] for item in documents if item["id"] == candidate["source_document_id"] for part in item["sections"] if part["reference"] == candidate["source_reference"]), "")
        if not excerpt or excerpt not in matching or not any(word in meaning for word in ("student", "completion", "hand-in", "hand in")):
            raise AacProposalError("A candidate deadline must be a source-backed student completion or hand-in date.")
    for stage in proposal["stages"]:
        if not isinstance(stage, dict) or not isinstance(stage.get("name"), str) or not stage["name"].strip(): raise AacProposalError("The AI proposal contains an invalid stage.")
    return proposal


def make_proposal(documents: list[dict[str, Any]], planning_inputs: dict[str, Any], provider: Callable[[dict[str, Any]], Any]) -> dict[str, Any]:
    return validate_proposal(provider(proposal_input(documents, planning_inputs)), documents)


def official_deadline_candidates(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Conservative local extraction: dates must occur with student hand-in/completion language."""
    results: list[dict[str, Any]] = []
    pattern = re.compile(r"\b(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*)?(\d{1,2})(?:\s*(?:st|nd|rd|th))?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b", re.I)
    for document in documents:
        for section in document.get("sections") or []:
            text = str(section.get("text") or "")
            lower = text.lower()
            student_deadline_language = (
                ("student" in lower and ("completion" in lower or "hand in" in lower or "hand-in" in lower or "submit" in lower))
                or ("coursework" in lower and "submitted to the class teacher" in lower)
            )
            if not student_deadline_language:
                continue
            for match in pattern.finditer(text):
                try: parsed = datetime.strptime(f"{match.group(1)} {match.group(2)} {match.group(3)}", "%d %B %Y").date().isoformat()
                except ValueError: continue
                start, end = max(0, match.start() - 90), min(len(text), match.end() + 90)
                results.append({"source_document_id": document["id"], "source_reference": section["reference"], "date": parsed, "meaning": "student completion / hand-in deadline", "supporting_excerpt": text[start:end].strip()})
    return results


def document_stage_structure(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Extract only explicit numbered investigative stages, never report/submission lists."""
    result: list[dict[str, Any]] = []
    pattern = re.compile(r"\bStage\s+(\d+)\s*:\s*([^\n]+)", re.I)
    for document in documents:
        if document.get("purpose") != "specification":
            continue
        for section in document.get("sections") or []:
            text = str(section.get("text") or "")
            lower = text.lower()
            # Labels plus nearby investigation/process language generalise across
            # briefs; submission and report-structure lists use numbered items,
            # not explicit ``Stage n:`` labels, and are excluded here.
            if not ("stage" in lower and ("following" in lower or "process" in lower or "investigation" in lower)):
                continue
            for match in pattern.finditer(text):
                name = re.sub(r"\s+", " ", match.group(2)).strip(" .")
                if name:
                    result.append({"source_document_id": document["id"], "source_reference": section["reference"], "number": int(match.group(1)), "name": name})
    result.sort(key=lambda item: (item["source_document_id"], item["source_reference"], item["number"]))
    return result


def validate_weekly_minutes(value: int) -> int:
    if not 5 <= int(value) <= 600:
        raise ValueError("Weekly AAC time must be between 5 and 600 minutes.")
    return int(value)


def plan_warnings(plan: dict[str, Any]) -> list[str]:
    """Deterministic checks around teacher/AI proposals; never silently reschedule."""
    warnings: list[str] = []
    deadline = plan.get("controlling_deadline")
    # internal_completion_target is retained as the historical name for a final
    # classroom deadline; never reinterpret an already-saved draft silently.
    final_deadline = plan.get("final_classroom_deadline") or plan.get("internal_completion_target")
    normal_finish = plan.get("normal_finish_target") or final_deadline
    planned_start = plan.get("planned_start")
    if not deadline:
        warnings.append("Confirm a controlling completion deadline before approval.")
    elif plan.get("official_deadline_confirmed") is not True:
        warnings.append("Confirm the SEC completion / hand-in deadline before approval.")
    if deadline and not final_deadline:
        warnings.append("Set an internal completion target at least 14 calendar days before the deadline.")
    if deadline and final_deadline:
        try:
            if date.fromisoformat(deadline) - date.fromisoformat(final_deadline) < timedelta(days=MIN_COMPLETION_BUFFER_DAYS):
                warnings.append("The internal completion target does not preserve the 14-calendar-day buffer.")
        except ValueError:
            warnings.append("Use ISO dates for the controlling deadline and completion target.")
    try:
        start = date.fromisoformat(planned_start) if planned_start else None
        normal = date.fromisoformat(normal_finish) if normal_finish else None
        final = date.fromisoformat(final_deadline) if final_deadline else None
        sec = date.fromisoformat(deadline) if deadline else None
        if start and normal and start > normal: warnings.append("Your planned start must be before the normal finish date.")
        if normal and final and normal > final: warnings.append("Your normal finish date must be on or before the final classroom deadline.")
        if final and sec and final >= sec: warnings.append("Your final classroom deadline must be before the SEC completion / hand-in deadline.")
    except ValueError:
        warnings.append("Use valid calendar dates for the AAC key dates.")
    if plan.get("sixth_year_calendar_provisional"):
        warnings.append("Sixth Year availability is provisional until the school calendar is confirmed.")
    for year in ("fifth_year", "sixth_year"):
        allocation = plan.get(f"{year}_aac_minutes")
        lessons, minutes = plan.get(f"{year}_lessons_per_week"), plan.get(f"{year}_minutes_per_lesson")
        if allocation not in (None, ""):
            try:
                if int(allocation) < 5 or int(allocation) > 600: warnings.append(f"{year.replace('_', ' ').title()} AAC time must be between 5 and 600 minutes each week.")
                if lessons not in (None, "") and minutes not in (None, "") and int(allocation) > int(lessons) * int(minutes): warnings.append(f"{year.replace('_', ' ').title()} AAC time cannot exceed the class teaching time you entered.")
            except (TypeError, ValueError): warnings.append(f"Check the {year.replace('_', ' ')} teaching-time numbers.")
    if plan.get("capacity_minutes") is not None and plan.get("estimated_minutes") is not None and plan["estimated_minutes"] > plan["capacity_minutes"]:
        warnings.append("Estimated AAC work exceeds the available teaching time; review the plan rather than compressing it automatically.")
    return warnings


def build_schedule(plan: dict[str, Any]) -> dict[str, Any]:
    """Calculate transparent AAC capacity without changing teacher decisions.

    Dates and closures are supplied/confirmed by the teacher.  In the absence
    of timetable data each non-excluded calendar week contributes the editable
    weekly allocation once; the result is explicitly an estimate.
    """
    inputs = plan.get("planning_inputs") or plan
    warnings = plan_warnings({**plan, **inputs, "sixth_year_calendar_provisional": inputs.get("sixth_year_calendar_status") == "provisional"})
    try:
        weekly = validate_weekly_minutes(inputs.get("sixth_year_aac_minutes") or inputs.get("weekly_minutes", DEFAULT_WEEKLY_MINUTES))
    except (TypeError, ValueError):
        return {"warnings": warnings + ["Set a valid weekly AAC allocation before approval."], "capacity_minutes": 0, "estimated": True, "stages": []}
    try:
        deadline = date.fromisoformat(inputs["controlling_deadline"])
        target = date.fromisoformat(inputs.get("normal_finish_target") or inputs.get("final_classroom_deadline") or inputs["internal_completion_target"])
    except (KeyError, TypeError, ValueError):
        return {"warnings": warnings, "capacity_minutes": 0, "estimated": True, "stages": []}
    if deadline - target < timedelta(days=MIN_COMPLETION_BUFFER_DAYS):
        return {"warnings": warnings, "capacity_minutes": 0, "estimated": True, "stages": []}
    try:
        fifth_end = date.fromisoformat(inputs["fifth_year_end"])
        sixth_restart = date.fromisoformat(inputs["sixth_year_restart"])
    except (KeyError, TypeError, ValueError):
        warnings.append("Confirm Fifth Year end and Sixth Year restart dates before approval.")
        return {"warnings": warnings, "capacity_minutes": 0, "estimated": True, "stages": []}
    if fifth_end >= sixth_restart:
        warnings.append("Sixth Year restart must be after Fifth Year teaching ends.")
    closures = set()
    for value in inputs.get("reviewed_closures", []):
        try: closures.add(date.fromisoformat(str(value)))
        except ValueError: warnings.append("A reviewed closure has an invalid date.")
    # Teaching capacity begins at the first supplied boundary and excludes the
    # whole summer interval; partial weeks count once, a stated estimate.
    try: start = date.fromisoformat(inputs.get("planned_start")) if inputs.get("planned_start") else min(fifth_end, sixth_restart) - timedelta(days=365)
    except ValueError: start = min(fifth_end, sixth_restart) - timedelta(days=365)
    fifth_weekly = validate_weekly_minutes(inputs.get("fifth_year_aac_minutes") or inputs.get("weekly_minutes", DEFAULT_WEEKLY_MINUTES))
    sixth_weekly = validate_weekly_minutes(inputs.get("sixth_year_aac_minutes") or inputs.get("weekly_minutes", DEFAULT_WEEKLY_MINUTES))
    fifth_weeks = {day - timedelta(days=day.weekday()) for day in _date_range(start, min(fifth_end, target)) if day not in closures}
    sixth_weeks = {day - timedelta(days=day.weekday()) for day in _date_range(max(sixth_restart, start), target) if day not in closures}
    capacity = len(fifth_weeks) * fifth_weekly + len(sixth_weeks) * sixth_weekly
    stages = plan.get("stages") or []
    total = 0
    previous = None
    validated = []
    for index, stage in enumerate(stages, 1):
        identifier = stage.get("id")
        name = str(stage.get("name") or "").strip()
        minutes = stage.get("estimated_minutes")
        target_date = stage.get("completion_date")
        if not identifier or not name or not isinstance(minutes, int) or minutes <= 0:
            warnings.append(f"Stage {index} needs a stable ID, name and positive estimate.")
            continue
        try: when = date.fromisoformat(target_date) if target_date else None
        except ValueError:
            warnings.append(f"Stage {index} has an invalid completion date."); continue
        if when and (when > target or (fifth_end < when < sixth_restart) or when in closures):
            warnings.append(f"Stage {index} falls outside available AAC teaching time.")
        if when and previous and when < previous: warnings.append("Stage dates must remain in order.")
        if when: previous = when
        total += minutes; validated.append({"id": identifier, "name": name, "completion_date": when.isoformat() if when else None, "estimated_minutes": minutes})
    # Fill only undated stages, backwards from the editable internal target.
    # This is a proposal, never a mutation of the teacher's stored plan.
    cursor = target
    for stage in reversed(validated):
        if stage["completion_date"]: cursor = date.fromisoformat(stage["completion_date"]); continue
        weeks_needed = max(1, (stage["estimated_minutes"] + weekly - 1) // weekly)
        found = 0
        while cursor >= sixth_restart - timedelta(days=365):
            if (cursor <= fifth_end or cursor >= sixth_restart) and cursor not in closures:
                found += 1
                if found >= weeks_needed and cursor.weekday() == 0: break
            cursor -= timedelta(days=1)
        if cursor < sixth_restart - timedelta(days=365):
            warnings.append("There is not enough available teaching time to suggest all stage dates.")
            break
        stage["proposed_completion_date"] = cursor.isoformat()
        cursor -= timedelta(days=1)
    if total > capacity: warnings.append("Estimated AAC work exceeds available teaching capacity; adjust it explicitly rather than compressing the plan.")
    return {"warnings": list(dict.fromkeys(warnings)), "capacity_minutes": capacity, "estimated_minutes": total, "estimated": True, "stages": validated, "completion_target": target.isoformat()}


def _date_range(start: date, end: date):
    while start <= end:
        yield start
        start += timedelta(days=1)


def physics_starter_template() -> list[dict[str, Any]]:
    return [{"name": name, "estimated_minutes": None, "completion_date": None, "checkpoints": []} for name in (
        "Initial response", "Background research", "Designing and planning", "Conducting the experiment",
        "Data analysis and conclusions", "Finalising the report",
    )]
