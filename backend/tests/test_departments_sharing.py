import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import models
from db import Base
import main


class DepartmentSharingModelTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        event.listen(self.engine, "connect", lambda conn, _: conn.execute("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.school_one = models.SchoolModel(name="One")
        self.school_two = models.SchoolModel(name="Two")
        self.db.add_all([self.school_one, self.school_two]); self.db.flush()
        self.owner = models.UserModel(email="owner@example.test", password_hash="x", school_id=self.school_one.id, role="teacher")
        self.member = models.UserModel(email="member@example.test", password_hash="x", school_id=self.school_one.id, role="teacher")
        self.other_school_teacher = models.UserModel(email="other@example.test", password_hash="x", school_id=self.school_two.id, role="teacher")
        self.db.add_all([self.owner, self.member, self.other_school_teacher]); self.db.flush()
        self.non_member = models.UserModel(email="nonmember@example.test", password_hash="x", school_id=self.school_one.id, role="teacher")
        self.school_admin = models.UserModel(email="admin@example.test", password_hash="x", school_id=self.school_one.id, role="school_admin")
        self.inactive_teacher = models.UserModel(email="inactive@example.test", password_hash="x", school_id=self.school_one.id, role="teacher", is_active=False)
        self.platform_admin = models.UserModel(email="platform@example.test", password_hash="x", school_id=self.school_one.id, role="platform_admin")
        self.db.add_all([self.non_member, self.school_admin, self.inactive_teacher, self.platform_admin]); self.db.flush()
        main.app.dependency_overrides[main.get_db] = lambda: self.db
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.db.close(); self.engine.dispose()

    def auth(self, user):
        token = jwt.encode({"sub": str(user.id)}, main.JWT_SECRET, algorithm=main.JWT_ALG)
        return {"Authorization": f"Bearer {token}"}

    def department_with_members(self):
        department = models.SchoolDepartmentModel(school_id=self.school_one.id, name="Science")
        self.db.add(department); self.db.flush()
        self.db.add_all([
            models.SchoolDepartmentMembershipModel(department_id=department.id, school_id=self.school_one.id, user_id=self.owner.id),
            models.SchoolDepartmentMembershipModel(department_id=department.id, school_id=self.school_one.id, user_id=self.member.id),
        ])
        self.db.commit()
        return department

    def test_teacher_can_belong_to_multiple_departments_without_duplicates(self):
        first = models.SchoolDepartmentModel(school_id=self.school_one.id, name="Maths")
        second = models.SchoolDepartmentModel(school_id=self.school_one.id, name="Science")
        self.db.add_all([first, second]); self.db.flush()
        self.db.add_all([
            models.SchoolDepartmentMembershipModel(department_id=first.id, school_id=self.school_one.id, user_id=self.member.id),
            models.SchoolDepartmentMembershipModel(department_id=second.id, school_id=self.school_one.id, user_id=self.member.id),
        ]); self.db.commit()
        self.assertEqual(self.db.query(models.SchoolDepartmentMembershipModel).filter_by(user_id=self.member.id).count(), 2)

    def test_cross_school_membership_is_rejected_by_composite_foreign_key(self):
        department = models.SchoolDepartmentModel(school_id=self.school_one.id, name="Maths")
        self.db.add(department); self.db.flush()
        self.db.add(models.SchoolDepartmentMembershipModel(department_id=department.id, school_id=self.school_one.id, user_id=self.other_school_teacher.id))
        with self.assertRaises(Exception): self.db.commit()
        self.db.rollback()

    def test_department_members_allow_active_teachers_and_school_admins_only(self):
        department = models.SchoolDepartmentModel(school_id=self.school_one.id, name="Maths")
        self.db.add(department); self.db.commit()

        response = self.client.put(
            f"/school-admin/departments/{department.id}/members",
            json={"user_ids": [self.member.id, self.school_admin.id]},
            headers=self.auth(self.school_admin),
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.db.get(models.UserModel, self.school_admin.id).role, "school_admin")
        self.assertEqual(
            {row.user_id for row in self.db.query(models.SchoolDepartmentMembershipModel).filter_by(department_id=department.id)},
            {self.member.id, self.school_admin.id},
        )
        for invalid_user in (self.other_school_teacher, self.inactive_teacher, self.platform_admin):
            response = self.client.put(
                f"/school-admin/departments/{department.id}/members",
                json={"user_ids": [invalid_user.id]},
                headers=self.auth(self.school_admin),
            )
            self.assertEqual(response.status_code, 400, response.text)

    def test_department_delete_cascades_permissions_not_original_template(self):
        department = models.SchoolDepartmentModel(school_id=self.school_one.id, name="Maths")
        classroom = models.ClassModel(owner_user_id=self.owner.id, name="1A", subject="Maths")
        self.db.add_all([department, classroom]); self.db.flush()
        template = models.CollabTemplateModel(owner_user_id=self.owner.id, source_class_id=classroom.id, title="Starter", board_state_json="[]")
        self.db.add(template); self.db.flush()
        self.db.add(models.DepartmentCollabTemplateShareModel(department_id=department.id, template_id=template.id, shared_by_user_id=self.owner.id)); self.db.commit()
        self.db.delete(department); self.db.commit()
        self.assertIsNotNone(self.db.get(models.CollabTemplateModel, template.id))
        self.assertEqual(self.db.query(models.DepartmentCollabTemplateShareModel).count(), 0)

    def test_shared_quiz_copy_endpoint_enforces_membership_and_copies_only_definition(self):
        department = self.department_with_members()
        owner_class = models.ClassModel(owner_user_id=self.owner.id, name="Owner class", subject="Science")
        recipient_class = models.ClassModel(owner_user_id=self.member.id, name="Recipient class", subject="Science")
        self.db.add_all([owner_class, recipient_class]); self.db.flush()
        quiz = models.SavedQuizModel(class_id=owner_class.id, owner_user_id=self.owner.id, title="Energy", category="Physics", description="Revision")
        self.db.add(quiz); self.db.flush()
        original_questions = [
            models.SavedQuizQuestionModel(quiz_id=quiz.id, prompt="First", choice_a="A", choice_b="B", choice_c="C", choice_d="D", correct_index=0, position=0),
            models.SavedQuizQuestionModel(quiz_id=quiz.id, prompt="Second", choice_a="E", choice_b="F", choice_c="G", choice_d="H", correct_index=2, explanation="Because", position=1),
        ]
        self.db.add_all(original_questions)
        self.db.add(models.DepartmentSavedQuizShareModel(department_id=department.id, saved_quiz_id=quiz.id, shared_by_user_id=self.owner.id))
        self.db.commit()

        response = self.client.post(f"/quizzes/{quiz.id}/copy-shared", json={"destination_class_id": recipient_class.id}, headers=self.auth(self.member))
        self.assertEqual(response.status_code, 200, response.text)
        copied = self.db.get(models.SavedQuizModel, response.json()["id"])
        self.assertNotEqual(copied.id, quiz.id)
        self.assertEqual((copied.owner_user_id, copied.class_id, copied.title, copied.category, copied.description), (self.member.id, recipient_class.id, "Energy", "Physics", "Revision"))
        copied_questions = self.db.query(models.SavedQuizQuestionModel).filter_by(quiz_id=copied.id).order_by(models.SavedQuizQuestionModel.position).all()
        self.assertEqual([(q.prompt, q.position, q.correct_index) for q in copied_questions], [("First", 0, 0), ("Second", 1, 2)])
        self.assertNotEqual(copied_questions[0].id, original_questions[0].id)
        self.assertEqual(self.db.query(models.LiveQuizSessionModel).count(), 0)
        self.assertEqual(self.db.get(models.SavedQuizModel, quiz.id).owner_user_id, self.owner.id)
        self.assertEqual(self.db.query(models.SavedQuizQuestionModel).filter_by(quiz_id=quiz.id).count(), 2)
        self.assertEqual(self.client.post(f"/quizzes/{quiz.id}/copy-shared", json={"destination_class_id": recipient_class.id}, headers=self.auth(self.non_member)).status_code, 404)
        self.assertEqual(self.client.post(f"/quizzes/{quiz.id}/copy-shared", json={"destination_class_id": recipient_class.id}, headers=self.auth(self.other_school_teacher)).status_code, 404)
        self.assertEqual(self.client.post(f"/quizzes/{quiz.id}/copy-shared", json={"destination_class_id": owner_class.id}, headers=self.auth(self.member)).status_code, 404)

    def test_shared_template_use_endpoint_enforces_membership_and_creates_clean_session(self):
        department = self.department_with_members()
        owner_class = models.ClassModel(owner_user_id=self.owner.id, name="Owner class", subject="Science")
        recipient_class = models.ClassModel(owner_user_id=self.member.id, name="Recipient class", subject="Science")
        self.db.add_all([owner_class, recipient_class]); self.db.flush()
        clean_state = '[{"type":"stroke","stroke":{"id":"teacher-only","points":[]}}]'
        template = models.CollabTemplateModel(owner_user_id=self.owner.id, source_class_id=owner_class.id, title="Starter", board_state_json=clean_state, room_count=3, timer_minutes=10)
        self.db.add(template); self.db.flush()
        self.db.add(models.DepartmentCollabTemplateShareModel(department_id=department.id, template_id=template.id, shared_by_user_id=self.owner.id))
        self.db.commit()

        response = self.client.post(f"/collab/templates/{template.id}/use-shared", json={"class_id": recipient_class.id}, headers=self.auth(self.member))
        self.assertEqual(response.status_code, 200, response.text)
        created = self.db.query(models.CollabSessionModel).filter_by(session_code=response.json()["session_code"]).one()
        self.assertEqual((created.class_id, created.title, created.board_round, created.room_count), (recipient_class.id, "Starter", 1, 3))
        self.assertEqual(self.db.query(models.CollabParticipantModel).filter_by(session_id=created.id).count(), 0)
        self.assertEqual(main._get_collab_history(created.session_code, "teacher-main"), [{"type": "stroke", "stroke": {"id": "teacher-only", "points": []}}])
        self.assertEqual(self.db.get(models.CollabTemplateModel, template.id).board_state_json, clean_state)
        self.assertEqual(self.client.post(f"/collab/templates/{template.id}/use-shared", json={"class_id": recipient_class.id}, headers=self.auth(self.non_member)).status_code, 404)
        self.assertEqual(self.client.post(f"/collab/templates/{template.id}/use-shared", json={"class_id": recipient_class.id}, headers=self.auth(self.other_school_teacher)).status_code, 404)
        self.assertEqual(self.client.post(f"/collab/templates/{template.id}/use", json={"class_id": recipient_class.id}, headers=self.auth(self.member)).status_code, 404)

    def test_school_admin_department_member_can_use_shared_resources(self):
        department = models.SchoolDepartmentModel(school_id=self.school_one.id, name="Science")
        owner_class = models.ClassModel(owner_user_id=self.owner.id, name="Owner class", subject="Science")
        admin_class = models.ClassModel(owner_user_id=self.school_admin.id, name="Admin class", subject="Science")
        self.db.add_all([department, owner_class, admin_class]); self.db.flush()
        self.db.add_all([
            models.SchoolDepartmentMembershipModel(department_id=department.id, school_id=self.school_one.id, user_id=self.owner.id),
            models.SchoolDepartmentMembershipModel(department_id=department.id, school_id=self.school_one.id, user_id=self.school_admin.id),
        ])
        quiz = models.SavedQuizModel(class_id=owner_class.id, owner_user_id=self.owner.id, title="Energy", category="Physics")
        template = models.CollabTemplateModel(owner_user_id=self.owner.id, source_class_id=owner_class.id, title="Starter", board_state_json="[]")
        self.db.add_all([quiz, template]); self.db.flush()
        self.db.add(models.SavedQuizQuestionModel(quiz_id=quiz.id, prompt="Question", choice_a="A", choice_b="B", choice_c="C", choice_d="D", correct_index=0, position=0))
        self.db.add_all([
            models.DepartmentSavedQuizShareModel(department_id=department.id, saved_quiz_id=quiz.id, shared_by_user_id=self.owner.id),
            models.DepartmentCollabTemplateShareModel(department_id=department.id, template_id=template.id, shared_by_user_id=self.owner.id),
        ])
        self.db.commit()

        copied = self.client.post(f"/quizzes/{quiz.id}/copy-shared", json={"destination_class_id": admin_class.id}, headers=self.auth(self.school_admin))
        self.assertEqual(copied.status_code, 200, copied.text)
        self.assertEqual(self.db.get(models.SavedQuizModel, copied.json()["id"]).owner_user_id, self.school_admin.id)
        used = self.client.post(f"/collab/templates/{template.id}/use-shared", json={"class_id": admin_class.id}, headers=self.auth(self.school_admin))
        self.assertEqual(used.status_code, 200, used.text)
        self.assertEqual(self.db.query(models.CollabParticipantModel).count(), 0)
        self.assertEqual(self.client.post(f"/collab/templates/{template.id}/use", json={"class_id": admin_class.id}, headers=self.auth(self.school_admin)).status_code, 404)

    def test_cat4_transition_aliases_are_authorized(self):
        for email in ("peter@elume.ie", "pfitzgerald@preskilkenny.ie", "lisa@elume.ie", "lcarey@preskilkenny.ie"):
            self.assertTrue(main.user_has_cat4_access(models.UserModel(email=email, password_hash="x")))


if __name__ == "__main__":
    unittest.main()
