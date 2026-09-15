"""Pure Collaboration board-state helpers shared by the live lifecycle and tests."""

from __future__ import annotations

import json
from copy import deepcopy


def board_event_matches_round(message_round: object, current_round: int) -> bool:
    """Apply the server's board-round admission rule without database/socket IO."""
    if message_round is None:
        return current_round == 1
    try:
        return int(message_round) == current_round
    except (TypeError, ValueError):
        return False


def events_from_snapshot(snapshot: object) -> list[dict]:
    if not isinstance(snapshot, dict):
        return []

    events: list[dict] = []
    for stroke in snapshot.get("strokes", []):
        if isinstance(stroke, dict):
            events.append({"type": "stroke", "stroke": deepcopy(stroke)})
    for obj in snapshot.get("objects", []):
        if isinstance(obj, dict):
            events.append({"type": "object-create", "object": deepcopy(obj)})
    return events


def clean_events(value: object) -> list[dict]:
    if not isinstance(value, list):
        return []
    return [deepcopy(event) for event in value if isinstance(event, dict)]


def decode_events(value: str | None) -> list[dict]:
    if not value:
        return []
    try:
        return clean_events(json.loads(value))
    except (TypeError, ValueError):
        return []


def snapshot_from_events(events: list[dict]) -> dict:
    objects: dict[str, dict] = {}
    strokes: dict[str, dict] = {}
    anonymous_strokes: list[dict] = []
    for event in events:
        kind = event.get("type")
        if kind == "stroke" and isinstance(event.get("stroke"), dict):
            stroke = event["stroke"]
            stroke_id = stroke.get("id")
            if isinstance(stroke_id, str):
                strokes[stroke_id] = deepcopy(stroke)
            else:
                anonymous_strokes.append(deepcopy(stroke))
        elif kind == "stroke-delete" and isinstance(event.get("id"), str):
            strokes.pop(event["id"], None)
        elif kind in {"object-create", "object-update"} and isinstance(event.get("object"), dict):
            obj = event["object"]
            object_id = obj.get("id")
            if isinstance(object_id, str):
                objects[object_id] = deepcopy(obj)
        elif kind == "object-delete" and isinstance(event.get("id"), str):
            objects.pop(event["id"], None)
    return {"strokes": [*anonymous_strokes, *strokes.values()], "objects": list(objects.values())}


def participant_owns_board_item(events: list[dict], kind: str, item_id: str, participant_id: str) -> bool:
    """Student delete messages may only target the participant's own live work."""
    snapshot = snapshot_from_events(events)
    collection = snapshot["strokes"] if kind == "stroke" else snapshot["objects"]
    return any(
        item.get("id") == item_id and item.get("createdBy") == participant_id
        for item in collection
        if isinstance(item, dict)
    )
