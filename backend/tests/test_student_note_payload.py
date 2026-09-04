import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
import models
from db import Base


class StudentNotePayloadTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = models.UserModel(email="teacher@example.test", password_hash="x")
        self.other = models.UserModel(email="other@example.test", password_hash="x")
        self.db.add_all([self.owner, self.other])
        self.db.flush()
        self.class_one = models.ClassModel(owner_user_id=self.owner.id, name="One", subject="Science")
        self.class_two = models.ClassModel(owner_user_id=self.other.id, name="Two", subject="Maths")
        self.db.add_all([self.class_one, self.class_two])
        self.db.flush()
        self.token = "student-token"
        self.db.add(models.StudentAccessLink(class_id=self.class_one.id, token=self.token, is_active=True))
        physics = models.Topic(class_id=self.class_one.id, name="Physics")
        self.other_topic = models.Topic(class_id=self.class_two.id, name="Private topic")
        self.db.add_all([physics, self.other_topic])
        self.db.flush()
        now = datetime.utcnow()
        self.db.add_all([
            models.Note(class_id=self.class_one.id, topic_id=physics.id, filename="Older.pdf", stored_path="older", uploaded_at=now - timedelta(days=1)),
            models.Note(class_id=self.class_one.id, topic_id=physics.id, filename="Newest.pdf", stored_path="newest", uploaded_at=now),
            models.Note(class_id=self.class_one.id, topic_id=self.other_topic.id, filename="Cross-class.pdf", stored_path="cross-class", uploaded_at=now - timedelta(days=2)),
            models.Note(class_id=self.class_two.id, topic_id=self.other_topic.id, filename="Private.pdf", stored_path="private", uploaded_at=now + timedelta(days=1)),
        ])
        self.db.commit()
        main.app.dependency_overrides[main.get_db] = lambda: self.db
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def test_student_payload_keeps_topic_metadata_order_and_token_download_paths_scoped_to_its_class(self):
        response = self.client.get(f"/student/{self.token}")
        self.assertEqual(response.status_code, 200, response.text)
        notes = response.json()["notes"]
        self.assertEqual([note["filename"] for note in notes], ["Newest.pdf", "Older.pdf", "Cross-class.pdf"])
        self.assertEqual([note["topic_name"] for note in notes], ["Physics", "Physics", None])
        self.assertTrue(all(note["uploaded_at"] for note in notes))
        self.assertTrue(all(note["file_url"].startswith(f"/student/{self.token}/notes/") for note in notes))
        cross_class = next(note for note in notes if note["filename"] == "Cross-class.pdf")
        self.assertIsNone(cross_class["topic_id"])
        self.assertIsNone(cross_class["topic_name"])
        self.assertEqual(cross_class["file_url"], f"/student/{self.token}/notes/{cross_class['id']}/download")
        self.assertNotIn(self.other_topic.id, [note["topic_id"] for note in notes])
        self.assertNotIn("Private topic", str(notes))
        self.assertNotIn("Private.pdf", str(notes))

    def test_unassigned_or_orphaned_notes_are_not_valid_persisted_states(self):
        # Note.topic_id is a required foreign key. A real database cannot persist an
        # unassigned note, nor an orphan once foreign-key constraints are enforced;
        # intentionally manufacturing either state would not be representative.
        topic_id = models.Note.__table__.c.topic_id
        self.assertFalse(topic_id.nullable)
        self.assertTrue(topic_id.foreign_keys)
