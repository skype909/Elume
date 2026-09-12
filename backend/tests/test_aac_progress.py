"""Fictional persistent check-ins and server-side identity/history boundaries."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import test_aac_document_endpoints as fixtures
import main, models


class AacProgressTests(fixtures.AacDocumentEndpointTests):
    # Reuse fixture methods, not the inherited test suite.
    def setUp(self):
        super().setUp()
        self.revision = self.add_approvable_draft(stage_id="research", stage_name="Research")
        self.students = [models.StudentModel(class_id=self.cls.id, first_name=name, active=True) for name in ("Fictional Alice", "Fictional Bob")]
        self.outsider = models.StudentModel(class_id=self.other_cls.id, first_name="Other class", active=True)
        self.db.add_all([*self.students, self.outsider]); self.db.commit()
        self.base = f"/classes/{self.cls.id}/aac"
        self.identity = self.grid()["tracker_id"]

    def grid(self, suffix=""):
        response = self.client.get(self.base + "/students" + suffix)
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def payload(self, **changes):
        return {"tracker_id": self.identity, "expected_version": 0, "stages": {"research": {"status": "ready_for_review", "target": "2027-03-12"}}, "note": "Review evidence", "follow_up": "2027-03-10", **changes}

    def put(self, **changes):
        return self.client.put(self.base + f"/students/{self.students[0].id}", json=self.payload(**changes))

    def plan(self, stages, **extra):
        return self.client.put(self.base + "/revision", json={"tracker_id": self.identity, "plan": {"stages": stages}, **extra})

    def test_progress_owner_database_reload_and_individual_dates(self):
        before = self.revision.plan_json.copy()
        response = self.put(); self.assertEqual(response.status_code, 200, response.text)
        self.db.expire_all()
        saved = self.grid()["students"]
        self.assertEqual(saved[0]["check_in"]["stages"]["research"]["target"], "2027-03-12")
        self.assertEqual(saved[0]["check_in"]["note"], "Review evidence")
        self.assertEqual(saved[0]["check_in"]["follow_up"], "2027-03-10")
        self.assertEqual(saved[1]["check_in"]["version"], 0)
        self.assertEqual(self.revision.plan_json, before)
        self.assertEqual(self.db.query(models.AacStudentProgressModel).count(), 1)
        # Clearing override falls back to class date, not a copy that can go stale.
        self.assertEqual(self.put(expected_version=1, stages={"research": {"status": "in_progress", "target": None}}).status_code, 200)
        self.assertIsNone(self.grid()["students"][0]["check_in"]["stages"]["research"]["target"])

    def test_progress_access_membership_and_no_student_or_qr_route(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: SimpleNamespace(id=self.owner.id, email=self.owner.email, role="student")
        self.assertEqual(self.client.get(self.base + "/students").status_code, 403)
        self.assertEqual(self.put().status_code, 403)
        main.app.dependency_overrides[main.get_current_user] = lambda: self.owner
        self.assertEqual(self.client.put(self.base + f"/students/{self.outsider.id}", json=self.payload()).status_code, 404)
        self.assertEqual(self.client.get(f"/classes/{self.other_cls.id}/aac/students").status_code, 404)
        main.app.dependency_overrides[main.get_current_user] = lambda: self.other
        self.assertEqual(self.client.get(self.base + "/students").status_code, 403)
        self.assertEqual(self.put().status_code, 403)
        self.other.email = "dcampion@preskilkenny.ie"; self.db.commit()
        self.assertEqual(self.client.get(self.base + "/students").status_code, 404)
        self.assertEqual(self.put().status_code, 404)
        main.app.dependency_overrides.pop(main.get_current_user)
        self.assertEqual(self.client.get(self.base + "/students").status_code, 401)
        self.assertEqual(self.put().status_code, 401)
        self.assertEqual(self.client.get("/student/fictional/aac/students").status_code, 404)

    def test_progress_retains_identity_on_rename_reorder_dates_and_normal_save(self):
        self.assertEqual(self.put().status_code, 200)
        stages = [{"id": "write", "name": "Writing", "completion_date": "2027-03-02"}, {"id": "research", "name": "Evidence gathering", "completion_date": "2027-02-20"}]
        response = self.plan(stages); self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["revision"]["tracker_id"], self.identity)
        self.assertEqual(self.plan(list(reversed(stages))).status_code, 200)
        self.db.expire_all(); grid = self.grid()
        self.assertEqual(grid["students"][0]["check_in"]["stages"]["research"]["status"], "ready_for_review")
        self.assertEqual(grid["students"][0]["check_in"]["stages"]["research"]["target"], "2027-03-12")
        self.assertNotIn("write", grid["students"][0]["check_in"]["stages"])

    def test_progress_new_tracker_is_separate_and_history_readable(self):
        self.put(); self.client.post(self.base + "/new-draft")
        current = self.grid(); self.assertNotEqual(current["tracker_id"], self.identity)
        self.assertEqual(current["students"][0]["check_in"]["version"], 0)
        old = self.grid("?tracker_id=" + self.identity)
        self.assertTrue(old["read_only"]); self.assertEqual(old["students"][0]["check_in"]["note"], "Review evidence")
        self.assertEqual(self.put(expected_version=1).status_code, 409)
        self.assertEqual(self.plan([]).status_code, 409)
        self.assertEqual(self.client.get(self.base + "/students?tracker_id=foreign").status_code, 404)

    def test_progress_stage_removal_needs_review_and_retains_record(self):
        self.put()
        response = self.plan([]); self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json()["detail"]["removed_stages"][0]["id"], "research")
        response = self.plan([], reviewed_removed_stage_ids=["research"]); self.assertEqual(response.status_code, 200, response.text)
        grid = self.grid(); self.assertEqual(grid["retired_stages"][0]["name"], "Research")
        self.assertEqual(grid["students"][0]["check_in"]["stages"]["research"]["status"], "ready_for_review")
        self.assertEqual(self.plan([{"id":"research", "name":"New unrelated work"}]).status_code, 422)

    def test_progress_archived_student_history_survives_delete_attempt(self):
        self.put(); student = self.students[0]
        response = self.client.delete(f"/students/{student.id}"); self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(self.client.put(f"/students/{student.id}", json={"active": False}).status_code, 200)
        archived = next(s for s in self.grid()["students"] if s["id"] == student.id)
        self.assertFalse(archived["active"]); self.assertEqual(archived["check_in"]["note"], "Review evidence")
        self.assertEqual(self.put(expected_version=1).status_code, 409)
        self.assertEqual(self.db.query(models.AacStudentProgressModel).count(), 1)

    def test_progress_failure_rollback_and_stale_write_protection(self):
        with patch.object(self.db, "commit", side_effect=RuntimeError("fictional failure")):
            self.assertEqual(self.put().status_code, 503)
        self.assertEqual(self.grid()["students"][0]["check_in"]["version"], 0)
        self.assertEqual(self.put().status_code, 200)
        self.assertEqual(self.put(note="stale overwrite").status_code, 409)
        self.assertEqual(self.grid()["students"][0]["check_in"]["note"], "Review evidence")
        for changes in ({"note":"x"*501}, {"follow_up":"bad-date"}, {"stages":{"research":{"status":"complete"}}}):
            self.assertEqual(self.put(**changes).status_code, 422)

    def test_progress_dan_can_save_only_his_roster(self):
        self.other.email = "dcampion@preskilkenny.ie"
        self.db.add(models.AacPlanRevisionModel(project_id=self.other_project.id, version=1, state="draft", plan_json={"stages":[{"id":"dan-stage", "name":"Drafting"}]})); self.db.commit()
        main.app.dependency_overrides[main.get_current_user] = lambda: self.other
        base = f"/classes/{self.other_cls.id}/aac/students"
        grid = self.client.get(base); self.assertEqual(grid.status_code, 200, grid.text)
        response = self.client.put(base + f"/{self.outsider.id}", json={"tracker_id":grid.json()["tracker_id"],"expected_version":0,"stages":{"dan-stage":{"status":"teacher_reviewed"}},"note":"Fictional Dan note"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get(base).json()["students"][0]["check_in"]["note"], "Fictional Dan note")
        main.app.dependency_overrides[main.get_current_user] = lambda: self.owner
        self.assertEqual(self.client.get(base).status_code, 404)
        self.assertEqual(self.grid()["students"][0]["check_in"]["version"], 0)

    def test_progress_legacy_payload_and_moved_student_never_leak_or_destroy(self):
        row = models.AacStudentProgressModel(project_id=self.project.id, student_id=self.students[0].id, checkpoints_json=[{"legacy":"retained-not-imported"}], updated_by_user_id=self.owner.id)
        self.db.add(row); self.db.commit(); self.put()
        self.db.expire_all(); self.assertEqual(row.checkpoints_json[0], {"legacy":"retained-not-imported"})
        self.students[0].class_id = self.other_cls.id; self.db.commit()
        self.assertNotIn(self.students[0].id, [s["id"] for s in self.grid()["students"]])
        self.assertEqual(self.put(expected_version=1).status_code, 404)
        self.assertEqual(self.db.query(models.AacStudentProgressModel).count(), 1)


# unittest inherits methods; suppress the unchanged 38-case parent suite here.
for name in dir(fixtures.AacDocumentEndpointTests):
    if name.startswith("test_") and name not in AacProgressTests.__dict__:
        setattr(AacProgressTests, name, None)

if __name__ == "__main__": unittest.main()
