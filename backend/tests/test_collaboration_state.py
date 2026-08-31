import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from collab_state import board_event_matches_round, clean_events, decode_events, events_from_snapshot, snapshot_from_events


class CollaborationStateTests(unittest.TestCase):
    def test_clean_teacher_snapshot_never_includes_student_room_events(self):
        teacher_snapshot = {
            "strokes": [{"id": "teacher-stroke", "createdBy": "teacher", "points": []}],
            "objects": [{"id": "prompt", "type": "sticky", "createdBy": "teacher"}],
        }
        student_room_events = [{"type": "stroke", "stroke": {"id": "student-stroke", "createdBy": "student"}}]

        saved_template_events = events_from_snapshot(teacher_snapshot)
        self.assertNotIn(student_room_events[0], saved_template_events)
        self.assertEqual([event["type"] for event in saved_template_events], ["stroke", "object-create"])

    def test_template_events_are_copied_for_each_fresh_session(self):
        persisted = json.dumps(events_from_snapshot({"strokes": [{"id": "s", "points": []}], "objects": []}))
        first_session = decode_events(persisted)
        second_session = decode_events(persisted)
        first_session.append({"type": "stroke", "stroke": {"id": "student-work", "points": []}})

        self.assertEqual(len(second_session), 1)
        self.assertEqual(len(decode_events(persisted)), 1)

    def test_snapshot_replaces_old_round_state(self):
        previous_round = [
            {"type": "stroke", "stroke": {"id": "old-stroke", "points": []}},
            {"type": "object-create", "object": {"id": "old-object"}},
        ]
        next_round = clean_events([])

        self.assertEqual(snapshot_from_events(previous_round)["strokes"][0]["id"], "old-stroke")
        self.assertEqual(snapshot_from_events(next_round), {"strokes": [], "objects": []})

    def test_snapshot_reduces_object_updates_and_deletes(self):
        snapshot = snapshot_from_events([
            {"type": "object-create", "object": {"id": "keep", "text": "first"}},
            {"type": "object-update", "object": {"id": "keep", "text": "updated"}},
            {"type": "object-create", "object": {"id": "remove"}},
            {"type": "object-delete", "id": "remove"},
        ])
        self.assertEqual(snapshot["objects"], [{"id": "keep", "text": "updated"}])

    def test_round_two_template_excludes_round_one_and_student_events(self):
        # Round 1 is authoritative only until New Board advances the session to round 2.
        round_one_student_event = {"type": "stroke", "stroke": {"id": "round-1-student", "createdBy": "student"}}
        round_one_history = [round_one_student_event]
        self.assertEqual(snapshot_from_events(round_one_history)["strokes"][0]["id"], "round-1-student")

        current_round = 2  # POST /new-board clears the old room history and advances this identity.
        self.assertFalse(board_event_matches_round(1, current_round))
        self.assertFalse(board_event_matches_round(None, current_round))

        round_two_teacher_snapshot = {
            "strokes": [{"id": "round-2-teacher", "createdBy": "teacher", "points": []}],
            "objects": [{"id": "round-2-prompt", "type": "sticky", "createdBy": "teacher"}],
        }
        clean_round_two_events = events_from_snapshot(round_two_teacher_snapshot)
        clean_snapshot_json = json.dumps(clean_round_two_events)

        # Student work added after breakout start belongs only to the room history,
        # not to the persisted clean teacher snapshot saved as a template.
        round_two_student_event = {"type": "stroke", "stroke": {"id": "round-2-student", "createdBy": "student"}}
        room_history_after_students = clean_events(clean_round_two_events) + [round_two_student_event]
        self.assertEqual(len(room_history_after_students), 3)

        saved_template_events = decode_events(clean_snapshot_json)
        saved_ids = {
            event.get("stroke", event.get("object", {})).get("id")
            for event in saved_template_events
        }
        self.assertEqual(saved_ids, {"round-2-teacher", "round-2-prompt"})
        self.assertNotIn("round-1-student", saved_ids)
        self.assertNotIn("round-2-student", saved_ids)


if __name__ == "__main__":
    unittest.main()
