"""Local-only unit coverage for platform access-grant administration."""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import models
from db import Base
from entitlement_admin import EntitlementAdminError, create_grant, entitlement_report, revoke_grant
from entitlements import PROMOTIONAL_ANNUAL_OFFER_EXPIRES_AT


class EntitlementAdminTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        for table in (models.SchoolModel.__table__, models.UserModel.__table__, models.UserAccessGrantModel.__table__):
            table.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.school = models.SchoolModel(name="Active", slug="active", status="active", seat_limit=10)
        self.admin = models.UserModel(email="admin@example.test", password_hash="x", role="platform_admin")
        self.user = models.UserModel(email="teacher@example.test", password_hash="x", role="teacher")
        self.db.add_all([self.school, self.admin, self.user]); self.db.commit()

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def test_create_duplicate_conflict_and_promotion(self):
        start = datetime(2026, 9, 6)
        grant, changed = create_grant(self.db, actor_id=self.admin.id, user_id=self.user.id, grant_type="pilot", reason="Pilot", starts_at=start, expires_at=start + timedelta(days=1))
        self.assertTrue(changed); self.assertEqual(grant.granted_by_user_id, self.admin.id)
        duplicate, changed = create_grant(self.db, actor_id=self.admin.id, user_id=self.user.id, grant_type="pilot", reason="Pilot", starts_at=start, expires_at=start + timedelta(days=1))
        self.assertFalse(changed); self.assertEqual(duplicate.id, grant.id)
        with self.assertRaisesRegex(EntitlementAdminError, "overlapping_grant_requires_resolution"):
            create_grant(self.db, actor_id=self.admin.id, user_id=self.user.id, grant_type="pilot", reason="Different", starts_at=start, expires_at=start + timedelta(days=2))
        promotion, changed = create_grant(self.db, actor_id=self.admin.id, user_id=self.user.id, grant_type="promotional_annual", reason="June offer", starts_at=start, expires_at=None)
        self.assertTrue(changed); self.assertEqual(promotion.expires_at, PROMOTIONAL_ANNUAL_OFFER_EXPIRES_AT)
        with self.assertRaisesRegex(EntitlementAdminError, "promotional_expiry"):
            create_grant(self.db, actor_id=self.admin.id, user_id=self.user.id, grant_type="promotional_annual", reason="June offer", starts_at=start, expires_at=start + timedelta(days=1))

    def test_validation_revoke_and_report_are_local(self):
        with self.assertRaisesRegex(EntitlementAdminError, "invalid_grant_type"):
            create_grant(self.db, actor_id=self.admin.id, user_id=self.user.id, grant_type="bad", reason="x", starts_at=None, expires_at=None)
        with self.assertRaisesRegex(EntitlementAdminError, "grant_reason_required"):
            create_grant(self.db, actor_id=self.admin.id, user_id=self.user.id, grant_type="pilot", reason=" ", starts_at=None, expires_at=datetime(2027, 1, 1))
        grant, _ = create_grant(self.db, actor_id=self.admin.id, user_id=self.user.id, grant_type="reviewer", reason="Review", starts_at=datetime(2026, 1, 1), expires_at=datetime(2027, 1, 1))
        self.db.commit()
        revoked, changed = revoke_grant(self.db, actor_id=self.admin.id, grant_id=grant.id, reason="Finished")
        self.assertTrue(changed); self.assertEqual(revoked.revocation_reason, "Finished")
        again, changed = revoke_grant(self.db, actor_id=self.admin.id, grant_id=grant.id, reason="Finished")
        self.assertFalse(changed); self.assertEqual(again.id, grant.id)
        with self.assertRaisesRegex(EntitlementAdminError, "grant_already_revoked"):
            revoke_grant(self.db, actor_id=self.admin.id, grant_id=grant.id, reason="Other")
        report = entitlement_report(self.db, access_filter="all", page=1, page_size=10)
        self.assertEqual(report["total"], 2); self.assertIn("users", report)
