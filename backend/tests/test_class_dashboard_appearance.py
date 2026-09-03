import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
import models
from db import Base


class ClassDashboardAppearanceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.owner = models.UserModel(email="owner@example.test", password_hash="x")
        self.other = models.UserModel(email="other@example.test", password_hash="x")
        self.db.add_all([self.owner, self.other])
        self.db.commit()

        self.first = self.add_class(self.owner.id, "First", dashboard_order=2)
        self.second = self.add_class(self.owner.id, "Second", dashboard_order=0)
        self.third = self.add_class(self.owner.id, "Third", dashboard_order=None)
        self.archived = self.add_class(self.owner.id, "Archived", dashboard_order=1, is_archived=True)
        self.foreign = self.add_class(self.other.id, "Foreign", dashboard_order=0)
        self.db.commit()

        main.app.dependency_overrides[main.get_db] = lambda: self.db
        self.client = TestClient(main.app)

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.db.close()
        self.engine.dispose()

    def add_class(self, owner_id, name, dashboard_order, is_archived=False):
        row = models.ClassModel(
            owner_user_id=owner_id,
            name=name,
            subject="Maths",
            class_code=f"CODE{name}",
            class_pin="1234",
            dashboard_order=dashboard_order,
            is_archived=is_archived,
        )
        self.db.add(row)
        self.db.flush()
        return row

    def auth(self, user):
        token = jwt.encode({"sub": str(user.id)}, main.JWT_SECRET, algorithm=main.JWT_ALG)
        return {"Authorization": f"Bearer {token}"}

    def ordered_active_ids(self):
        rows = self.db.query(models.ClassModel).filter(
            models.ClassModel.owner_user_id == self.owner.id,
            models.ClassModel.is_archived == False,
        ).order_by(models.ClassModel.id).all()
        return [(row.id, row.dashboard_order) for row in rows]

    def test_list_returns_dashboard_order_in_deterministic_active_order(self):
        response = self.client.get("/classes", headers=self.auth(self.owner))
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row["id"] for row in response.json()], [self.second.id, self.first.id, self.third.id])
        self.assertEqual(response.json()[0]["dashboard_order"], 0)
        self.assertNotIn(self.archived.id, [row["id"] for row in response.json()])

    def test_owner_can_replace_complete_active_order(self):
        response = self.client.put(
            "/classes/dashboard-order",
            json={"class_ids": [self.third.id, self.first.id, self.second.id]},
            headers=self.auth(self.owner),
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual([row["id"] for row in response.json()], [self.third.id, self.first.id, self.second.id])
        self.assertEqual(self.ordered_active_ids(), [(self.first.id, 1), (self.second.id, 2), (self.third.id, 0)])
        self.db.refresh(self.archived)
        self.assertEqual(self.archived.dashboard_order, 1)

    def test_reorder_rejects_duplicate_foreign_or_incomplete_ids_without_changes(self):
        before = self.ordered_active_ids()
        duplicate = self.client.put(
            "/classes/dashboard-order",
            json={"class_ids": [self.first.id, self.first.id, self.third.id]},
            headers=self.auth(self.owner),
        )
        foreign = self.client.put(
            "/classes/dashboard-order",
            json={"class_ids": [self.first.id, self.second.id, self.foreign.id]},
            headers=self.auth(self.owner),
        )
        incomplete = self.client.put(
            "/classes/dashboard-order",
            json={"class_ids": [self.first.id, self.second.id]},
            headers=self.auth(self.owner),
        )
        malformed = self.client.put(
            "/classes/dashboard-order",
            json={"class_ids": [str(self.first.id), self.second.id, self.third.id]},
            headers=self.auth(self.owner),
        )
        self.assertEqual(duplicate.status_code, 422)
        self.assertEqual(foreign.status_code, 400)
        self.assertEqual(incomplete.status_code, 400)
        self.assertEqual(malformed.status_code, 422)
        self.assertEqual(self.ordered_active_ids(), before)

    def test_colour_updates_accept_canonical_and_legacy_values_but_reject_arbitrary_css(self):
        canonical = self.client.put(
            f"/classes/{self.first.id}", json={"color": "violet"}, headers=self.auth(self.owner)
        )
        legacy = self.client.put(
            f"/classes/{self.first.id}", json={"color": "bg-amber-400"}, headers=self.auth(self.owner)
        )
        invalid = self.client.put(
            f"/classes/{self.first.id}", json={"color": "bg-[url(javascript:alert(1))]"}, headers=self.auth(self.owner)
        )
        self.assertEqual(canonical.status_code, 200, canonical.text)
        self.assertEqual(canonical.json()["color"], "violet")
        self.assertEqual(legacy.status_code, 200, legacy.text)
        self.assertEqual(legacy.json()["color"], "amber")
        self.assertEqual(invalid.status_code, 422)
        self.db.refresh(self.first)
        self.assertEqual(self.first.color, "amber")

    def test_create_persists_canonical_colour_keys(self):
        canonical = self.client.post(
            "/classes",
            json={"name": "Canonical", "subject": "Maths", "color": "violet"},
            headers=self.auth(self.owner),
        )
        legacy = self.client.post(
            "/classes",
            json={"name": "Legacy", "subject": "Maths", "color": "bg-amber-400"},
            headers=self.auth(self.owner),
        )
        invalid = self.client.post(
            "/classes",
            json={"name": "Invalid", "subject": "Maths", "color": "bg-violet-700"},
            headers=self.auth(self.owner),
        )

        self.assertEqual(canonical.status_code, 200, canonical.text)
        self.assertEqual(canonical.json()["color"], "violet")
        self.assertEqual(legacy.status_code, 200, legacy.text)
        self.assertEqual(legacy.json()["color"], "amber")
        self.assertEqual(invalid.status_code, 422)


if __name__ == "__main__":
    unittest.main()
