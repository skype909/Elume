"""Teacher-only check-ins in the existing migration-014 JSON array.

One progress row per project/student; independent versioned buckets per deliberate
tracker. Revision IDs are a stable fallback for existing drafts, never stage names.
No DDL, startup work, providers or implicit date-driven completion.
"""
from copy import deepcopy
from datetime import datetime
from fastapi import HTTPException
import models


def tracker_id(revision):
    return (revision.plan_json or {}).get("tracker_id") or f"revision-{revision.id}"


def bucket(row, identity):
    for item in (row.checkpoints_json or []) if row else []:
        if isinstance(item, dict) and item.get("tracker_id") == identity:
            return deepcopy(item)
    return {"tracker_id": identity, "version": 0, "stages": {}, "note": "", "follow_up": None}


def prepare_plan(db, project, previous, payload):
    """Preserve identity/history even when a client sends only editable plan fields."""
    plan = deepcopy(payload.plan)
    old = (previous.plan_json or {}) if previous else {}
    if previous and payload.tracker_id is not None and payload.tracker_id != tracker_id(previous):
        raise HTTPException(409, "The active tracker changed. Reload before saving this plan.")
    identity = tracker_id(previous) if previous else None
    if identity:
        plan["tracker_id"] = identity
    for key in ("tracker_setup_pending", "tracker_metadata", "retired_stages"):
        if key in old: plan[key] = deepcopy(old[key])
        else: plan.pop(key, None)
    stages = plan.get("stages") or []
    if not isinstance(stages, list) or len(stages) > 100:
        raise HTTPException(422, "Use at most 100 tracker stages.")
    plan["stages"] = stages
    ids = [s.get("id") if isinstance(s, dict) else None for s in stages]
    if any(not isinstance(s, str) or not s or len(s) > 100 for s in ids) or len(set(ids)) != len(ids):
        raise HTTPException(422, "Each stage needs a unique stable ID.")
    retired = deepcopy(old.get("retired_stages") or [])
    if set(ids) & {s["id"] for s in retired}:
        raise HTTPException(422, "A retained historical stage ID cannot be reused. Add a new stage instead.")
    removed = [s for s in old.get("stages", []) if s.get("id") not in ids]
    if removed and identity:
        rows = db.query(models.AacStudentProgressModel).filter_by(project_id=project.id).all()
        recorded = {sid for row in rows for sid in bucket(row, identity)["stages"]}
        protected = [s for s in removed if s.get("id") in recorded]
        if any(s["id"] not in payload.reviewed_removed_stage_ids for s in protected):
            raise HTTPException(409, {"message": "Review removal of stages with recorded student progress. Their history will be retained.", "removed_stages": [{"id": s["id"], "name": s.get("name", "Stage")} for s in protected]})
        retired.extend({**s, "retired_at": datetime.utcnow().isoformat()} for s in protected)
    if retired: plan["retired_stages"] = retired
    return plan


def workspace(db, project, requested=None):
    revisions = db.query(models.AacPlanRevisionModel).filter_by(project_id=project.id).order_by(models.AacPlanRevisionModel.version.desc()).all()
    if not revisions: raise HTTPException(409, "Save a tracker with stages first.")
    current = revisions[0]
    selected = next((r for r in revisions if tracker_id(r) == requested), None) if requested else current
    if not selected: raise HTTPException(404, "Tracker not found in this class.")
    identity = tracker_id(selected)
    seen = set(); history = []
    for r in revisions:
        key = tracker_id(r)
        if key not in seen:
            seen.add(key)
            history.append({"id": key, "title": (r.plan_json or {}).get("tracker_metadata", {}).get("title", project.title), "current": key == tracker_id(current)})
    # Joining current membership prevents disclosure of progress for a moved student.
    students = db.query(models.StudentModel).filter_by(class_id=project.class_id).order_by(models.StudentModel.first_name, models.StudentModel.id).all()
    rows = {r.student_id: r for r in db.query(models.AacStudentProgressModel).join(models.StudentModel, models.StudentModel.id == models.AacStudentProgressModel.student_id).filter(models.AacStudentProgressModel.project_id == project.id, models.StudentModel.class_id == project.class_id).all()}
    plan = selected.plan_json or {}
    return {"project_id": project.id, "tracker_id": identity, "read_only": selected != current,
            "trackers": history, "stages": plan.get("stages", []), "retired_stages": plan.get("retired_stages", []),
            "students": [{"id": s.id, "first_name": s.first_name, "active": s.active is not False, "check_in": bucket(rows.get(s.id), identity)} for s in students if s.active is not False or bucket(rows.get(s.id), identity)["version"] > 0]}


def save_check_in(db, project, student_id, payload, user_id):
    # Same project lock as plan/fresh-start writers, then membership lock.
    project = db.query(models.AacProjectModel).filter_by(id=project.id, owner_user_id=user_id).with_for_update().one()
    student = db.query(models.StudentModel).filter_by(id=student_id, class_id=project.class_id).with_for_update().first()
    if not student: raise HTTPException(404, "Student not found in this class.")
    if student.active is False: raise HTTPException(409, "This student is archived. Their history is read-only.")
    revision = db.query(models.AacPlanRevisionModel).filter_by(project_id=project.id).order_by(models.AacPlanRevisionModel.version.desc()).first()
    if not revision or payload.tracker_id != tracker_id(revision):
        raise HTTPException(409, "The active tracker changed. Reload the grid; your input has not been saved.")
    stages = {s["id"]: s for s in (revision.plan_json or {}).get("stages", [])}
    if not stages or (revision.plan_json or {}).get("tracker_setup_pending"):
        raise HTTPException(409, "Finish and save the class tracker first.")
    if not set(payload.stages) <= set(stages):
        raise HTTPException(409, "These stages changed or were removed. Reload the grid before retrying.")
    row = db.query(models.AacStudentProgressModel).filter_by(project_id=project.id, student_id=student_id).first()
    current = bucket(row, payload.tracker_id)
    if current["version"] != payload.expected_version:
        raise HTTPException(409, "This check-in changed in another session. Keep your input and reload the saved version before retrying.")
    if not row:
        row = models.AacStudentProgressModel(project_id=project.id, student_id=student_id, updated_by_user_id=user_id, checkpoints_json=[])
        db.add(row)
    # Merge submitted active stages. Retired entries and all other trackers survive.
    for sid, value in payload.stages.items():
        current["stages"][sid] = {**value.model_dump(mode="json"), "name": stages[sid].get("name", "Stage"), "class_target_at_save": stages[sid].get("completion_date")}
    current.update(note=payload.note, follow_up=payload.follow_up.isoformat() if payload.follow_up else None, version=current["version"] + 1, saved_at=datetime.utcnow().isoformat())
    row.checkpoints_json = [item for item in row.checkpoints_json or [] if not isinstance(item, dict) or item.get("tracker_id") != payload.tracker_id] + [current]
    row.updated_by_user_id = user_id; row.updated_at = row.last_checked_in_at = datetime.utcnow()
    try: db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(503, "Check-in was not saved. Your input can be retried.") from exc
    return {"student_id": student_id, "saved": True, "check_in": current}
