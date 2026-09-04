import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import main
import models
import authorization
from db import Base


class UiTranslationOverrideTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.reviewer = models.UserModel(email="peter@elume.ie", password_hash="x")
        self.non_reviewer = models.UserModel(email="teacher@example.test", password_hash="x")
        self.db.add_all([self.reviewer, self.non_reviewer])
        self.db.commit()
        main.app.dependency_overrides[main.get_db] = lambda: self.db
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def auth(self, user):
        token = jwt.encode({"sub": str(user.id)}, main.JWT_SECRET, algorithm=main.JWT_ALG)
        return {"Authorization": f"Bearer {token}"}

    def put(self, user, key="class.resources", value="Acmhainní", base_value="Acmhainní"):
        return self.client.put(
            f"/ui-translations/ga/{key}",
            json={"value": value, "base_value": base_value},
            headers=self.auth(user),
        )

    def test_unauthenticated_write_is_rejected(self):
        response = self.client.put("/ui-translations/ga/class.resources", json={"value": "Acmhainní"})
        self.assertEqual(response.status_code, 401)

    def test_unauthenticated_read_is_rejected(self):
        response = self.client.get("/ui-translations/ga")
        self.assertEqual(response.status_code, 401)

    def test_non_reviewer_write_is_rejected(self):
        self.assertEqual(self.put(self.non_reviewer).status_code, 403)

    def test_reviewer_write_creates_override_and_revision_then_records_updates(self):
        first = self.put(self.reviewer, value="Áiseanna")
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(first.json(), {"translation_key": "class.resources", "value": "Áiseanna"})
        override = self.db.query(models.UiTranslationOverrideModel).one()
        self.assertEqual((override.language_code, override.translation_key, override.value, override.updated_by_user_id), ("ga", "class.resources", "Áiseanna", self.reviewer.id))
        first_revision = self.db.query(models.UiTranslationOverrideRevisionModel).one()
        self.assertEqual((first_revision.previous_value, first_revision.new_value, first_revision.reviewed_by_user_id, first_revision.base_value_at_edit), (None, "Áiseanna", self.reviewer.id, "Acmhainní"))

        second = self.put(self.reviewer, value="Áiseanna ranga")
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(self.db.query(models.UiTranslationOverrideModel).count(), 1)
        revisions = self.db.query(models.UiTranslationOverrideRevisionModel).order_by(models.UiTranslationOverrideRevisionModel.id).all()
        self.assertEqual([(row.previous_value, row.new_value) for row in revisions], [(None, "Áiseanna"), ("Áiseanna", "Áiseanna ranga")])

    def test_concurrent_first_insert_returns_controlled_conflict_and_rolls_back(self):
        reviewer_identity = SimpleNamespace(id=self.reviewer.id, email="peter@elume.ie")
        main.app.dependency_overrides[main.get_current_user] = lambda: reviewer_identity
        original_flush = self.db.flush

        def concurrent_flush(*args, **kwargs):
            if any(isinstance(row, models.UiTranslationOverrideModel) for row in self.db.new):
                raise IntegrityError("insert", {}, Exception("duplicate"))
            return original_flush(*args, **kwargs)

        try:
            with patch.object(self.db, "flush", side_effect=concurrent_flush), patch.object(self.db, "rollback", wraps=self.db.rollback) as rollback:
                response = self.client.put(
                    "/ui-translations/ga/class.resources",
                    json={"value": "Acmhainní", "base_value": "Acmhainní"},
                )
        finally:
            main.app.dependency_overrides.pop(main.get_current_user, None)
        self.assertEqual(response.status_code, 409, response.text)
        self.assertEqual(response.json(), {"detail": "This Gaeilge translation was updated at the same time. Please retry."})
        rollback.assert_called_once()
        self.assertEqual(self.db.query(models.UiTranslationOverrideModel).count(), 0)
        self.assertEqual(self.db.query(models.UiTranslationOverrideRevisionModel).count(), 0)

    def test_unknown_blank_and_oversized_values_are_rejected(self):
        self.assertEqual(self.put(self.reviewer, key="class.not-a-real-key").status_code, 400)
        self.assertEqual(self.put(self.reviewer, value="   ").status_code, 400)
        self.assertEqual(self.put(self.reviewer, value="a" * 501).status_code, 400)
        self.assertEqual(self.put(self.reviewer, base_value="a" * 501).status_code, 400)
        self.assertEqual(self.db.query(models.UiTranslationOverrideModel).count(), 0)

    def test_dashboard_and_class_reviewer_keys_are_allowlisted_without_expanding_reviewer_emails(self):
        expected = {
            "nav.admin", "nav.calendar", "dashboard.timetable", "dashboard.createResources",
            "class.whiteboard", "class.collaboration", "class.liveQuiz", "class.classAdmin",
            "class.notes", "class.tests", "class.quizzes", "class.examPapers", "class.videos",
            "class.links", "class.randomName", "class.seatingPlan", "class.timer", "class.teamGenerator",
        }
        self.assertTrue(expected.issubset(main.GAEILGE_REVIEWABLE_KEYS))
        self.assertEqual(authorization.GAEILGE_REVIEWER_EMAILS, {
            "admin@elume.ie", "peter@elume.ie", "pfitzgerald@preskilkenny.ie",
        })
        self.assertEqual(self.put(self.reviewer, key="dashboard.createResources", value="Cruthaigh acmhainní").status_code, 200)
        self.assertEqual(self.put(self.reviewer, key="not.reviewable", value="Ní hea").status_code, 400)

    def test_get_returns_shared_overrides_and_account_specific_capability(self):
        self.assertEqual(self.put(self.reviewer, value="Áiseanna").status_code, 200)
        reviewer_response = self.client.get("/ui-translations/ga", headers=self.auth(self.reviewer))
        self.assertEqual(reviewer_response.status_code, 200, reviewer_response.text)
        self.assertEqual(reviewer_response.json(), {"overrides": {"class.resources": "Áiseanna"}, "is_gaeilge_reviewer": True})

        teacher_response = self.client.get("/ui-translations/ga", headers=self.auth(self.non_reviewer))
        self.assertEqual(teacher_response.status_code, 200, teacher_response.text)
        self.assertEqual(teacher_response.json(), {"overrides": {"class.resources": "Áiseanna"}, "is_gaeilge_reviewer": False})


if __name__ == "__main__":
    unittest.main()
