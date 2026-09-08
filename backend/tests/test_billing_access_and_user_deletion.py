"""Focused local tests for billing access decisions and hard account removal."""
from __future__ import annotations

from datetime import datetime, timedelta
import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
import uuid
from unittest import mock

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import main
import models
from schema.bootstrap_v010 import apply_bootstrap
from schema.migrate_011_cat4_cohort_schema import apply_migration as apply_011
from schema.migrate_012_account_entitlements import apply_migration as apply_012
from schema.migrate_013_stripe_webhook_inbox import apply_migration as apply_013


RUN = os.getenv("ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS") == "1"


class _Query:
    def __init__(self, values=None):
        self.values = values or []

    def filter(self, *_):
        return self

    def first(self):
        return self.values[0] if self.values else None

    def all(self):
        return list(self.values)


class _BillingDB:
    def __init__(self, grants=()):
        self.grants = list(grants)
        self.commits = 0

    def query(self, entity):
        if entity is models.UserAccessGrantModel:
            return _Query(self.grants)
        return _Query()

    def commit(self):
        self.commits += 1


def _user(**overrides):
    now = datetime.utcnow()
    values = dict(
        id=70,
        email="teacher@example.test",
        is_active=True,
        email_verified=True,
        role="teacher",
        school_id=None,
        school=None,
        subscription_status="inactive",
        subscription_expires_at=None,
        trial_started_at=None,
        trial_ends_at=None,
        payment_failed_at=None,
        payment_recovery_deadline_at=None,
        billing_interval=None,
        current_period_end=None,
        stripe_customer_id=None,
        billing_onboarding_required=True,
        ai_prompt_count=0,
        ai_daily_limit=0,
        ai_prompt_count_date=now,
    )
    values.update(overrides)
    return SimpleNamespace(**values)


class BillingAccessPayloadTests(unittest.TestCase):
    def _payload(self, account, grants=()):
        db = _BillingDB(grants)
        with mock.patch.object(main, "_reset_ai_prompt_counter_if_needed"), \
             mock.patch.object(main, "_maybe_send_payment_failed_final_notice"), \
             mock.patch.object(main, "_maybe_send_subscription_30_day_notice"):
            payload = main.billing_me(db, account)
        self.assertEqual(db.commits, 1)
        return payload

    def test_local_entitlement_result_is_authoritative_and_does_not_call_stripe(self):
        now = datetime.utcnow()
        active_pilot = SimpleNamespace(
            grant_type="pilot", starts_at=now - timedelta(minutes=1),
            expires_at=now + timedelta(days=1), revoked_at=None,
        )
        active_complimentary = SimpleNamespace(
            grant_type="complimentary", starts_at=now - timedelta(minutes=1),
            expires_at=now + timedelta(days=1), revoked_at=None,
        )
        active_promotional = SimpleNamespace(
            grant_type="promotional_annual", starts_at=now - timedelta(minutes=1),
            expires_at=now + timedelta(days=1), revoked_at=None,
        )
        denied = self._payload(_user())
        pilot = self._payload(_user(), [active_pilot])
        complimentary = self._payload(_user(), [active_complimentary])
        promotional = self._payload(_user(), [active_promotional])
        school = self._payload(_user(school_id=4, school=SimpleNamespace(status="active")))
        admin = self._payload(_user(role="platform_admin"))
        trial = self._payload(_user(subscription_status="trialing", trial_ends_at=now + timedelta(days=1)))
        paid = self._payload(_user(subscription_status="active", subscription_expires_at=now + timedelta(days=1)))
        self.assertEqual((denied["access_allowed"], denied["access_reason"]), (False, "subscription_inactive"))
        self.assertEqual((pilot["access_allowed"], pilot["access_reason"]), (True, "pilot"))
        self.assertEqual((complimentary["access_allowed"], complimentary["access_reason"]), (True, "complimentary"))
        self.assertEqual((promotional["access_allowed"], promotional["access_reason"]), (True, "promotional_annual"))
        self.assertEqual((school["access_allowed"], school["access_reason"]), (True, "active_school"))
        self.assertEqual((admin["access_allowed"], admin["access_reason"]), (True, "platform_admin"))
        self.assertEqual((trial["access_allowed"], trial["access_reason"]), (True, "trial_active"))
        self.assertEqual((paid["access_allowed"], paid["access_reason"]), (True, "paid_subscription_active"))

    def test_expired_or_revoked_grants_remain_denied(self):
        now = datetime.utcnow()
        for grant in (
            SimpleNamespace(grant_type="complimentary", starts_at=now - timedelta(days=2), expires_at=now - timedelta(seconds=1), revoked_at=None),
            SimpleNamespace(grant_type="promotional_annual", starts_at=now - timedelta(days=1), expires_at=now + timedelta(days=1), revoked_at=now),
        ):
            payload = self._payload(_user(), [grant])
            self.assertFalse(payload["access_allowed"])


@unittest.skipUnless(RUN, "set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1 for local PostgreSQL tests")
class HardDeleteGrantTests(unittest.TestCase):
    def setUp(self):
        from db import DATABASE_URL

        source = make_url(DATABASE_URL)
        if source.drivername.split("+", 1)[0] != "postgresql" or source.host not in {"127.0.0.1", "localhost", "::1"}:
            self.skipTest("requires loopback PostgreSQL")
        self.admin_url = source.set(database="postgres")
        self.databases = []

    def tearDown(self):
        from sqlalchemy import text
        for name in self.databases:
            engine = create_engine(self.admin_url, isolation_level="AUTOCOMMIT")
            try:
                with engine.connect() as connection:
                    connection.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:name AND pid <> pg_backend_pid()"), {"name": name})
                    connection.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
            finally:
                engine.dispose()

    def _session(self):
        from sqlalchemy import text
        name = "elume_delete_" + uuid.uuid4().hex[:10]
        engine = create_engine(self.admin_url, isolation_level="AUTOCOMMIT")
        with engine.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        engine.dispose()
        self.databases.append(name)
        url = self.admin_url.set(database=name).render_as_string(hide_password=False)
        apply_bootstrap(url)
        apply_011(url, expected_database=name, confirm_migration_011=True)
        apply_012(url, expected_database=name, confirm_migration_012=True)
        apply_013(url, expected_database=name, confirm_migration_013=True)
        return sessionmaker(bind=create_engine(url), future=True)()

    @staticmethod
    def _account(email, role="teacher"):
        return models.UserModel(email=email, password_hash="x", role=role, is_active=True, email_verified=True)

    def test_hard_delete_removes_only_target_grant_and_keeps_inbox_history(self):
        db = self._session()
        try:
            admin = self._account("admin@example.test", "platform_admin")
            target = self._account("delete@example.test")
            other = self._account("other@example.test")
            db.add_all([admin, target, other]); db.flush()
            db.add(models.ClassModel(name="Owned", subject="Maths", owner_user_id=target.id, is_archived=False))
            db.add(models.UserAccessGrantModel(user_id=target.id, grant_type="pilot", reason="test grant", starts_at=datetime.utcnow(), granted_by_user_id=admin.id))
            db.add(models.UserAccessGrantModel(user_id=other.id, grant_type="pilot", reason="other grant", starts_at=datetime.utcnow(), granted_by_user_id=admin.id))
            event = models.StripeWebhookEventModel(
                stripe_event_id="evt_delete_" + uuid.uuid4().hex, event_type="invoice.paid", stripe_created_at=datetime.now().astimezone(),
                livemode=True, payload_sha256="a" * 64, event_data={"object_id": "in_delete"}, resolved_user_id=target.id,
                processing_state="processed", attempt_count=1, claimed_at=datetime.now().astimezone(), processed_at=datetime.now().astimezone(),
            )
            db.add(event); db.commit(); event_id = event.id; target_id = target.id; other_id = other.id
            result = main.admin_delete_user(main.AdminDeleteUser(email=target.email, hard_delete=True), db, admin)
            self.assertTrue(result["hard_deleted"])
            self.assertIsNone(db.get(models.UserModel, target_id))
            self.assertEqual(db.query(models.ClassModel).filter(models.ClassModel.owner_user_id == target_id).count(), 0)
            self.assertEqual(db.query(models.UserAccessGrantModel).filter(models.UserAccessGrantModel.user_id == target_id).count(), 0)
            self.assertEqual(db.query(models.UserAccessGrantModel).filter(models.UserAccessGrantModel.user_id == other_id).count(), 1)
            self.assertIsNone(db.get(models.StripeWebhookEventModel, event_id).resolved_user_id)
        finally:
            db.close()

    def test_retained_grant_creator_is_refused(self):
        db = self._session()
        try:
            admin = self._account("admin2@example.test", "platform_admin")
            creator = self._account("creator@example.test")
            beneficiary = self._account("beneficiary@example.test")
            db.add_all([admin, creator, beneficiary]); db.flush()
            db.add(models.UserAccessGrantModel(user_id=beneficiary.id, grant_type="pilot", reason="retained", starts_at=datetime.utcnow(), granted_by_user_id=creator.id)); db.commit()
            with self.assertRaises(main.HTTPException) as error:
                main.admin_delete_user(main.AdminDeleteUser(email=creator.email, hard_delete=True), db, admin)
            self.assertEqual(error.exception.status_code, 409)
            self.assertEqual(error.exception.detail["code"], "USER_RETAINED_HISTORY")
            self.assertIsNotNone(db.get(models.UserModel, creator.id))
        finally:
            db.close()

    def test_hard_delete_failure_rolls_back_target_grant_and_user(self):
        db = self._session()
        try:
            admin = self._account("admin3@example.test", "platform_admin")
            target = self._account("rollback@example.test")
            db.add_all([admin, target]); db.flush()
            db.add(models.ClassModel(name="Rollback class", subject="Maths", owner_user_id=target.id, is_archived=False))
            db.add(models.UserAccessGrantModel(user_id=target.id, grant_type="pilot", reason="rollback", starts_at=datetime.utcnow(), granted_by_user_id=admin.id)); db.commit()
            target_id = target.id
            with mock.patch.object(main, "_delete_class_dependencies", side_effect=RuntimeError("injected failure")), \
                 mock.patch.object(main.logger, "exception"):
                with self.assertRaises(main.HTTPException) as error:
                    main.admin_delete_user(main.AdminDeleteUser(email=target.email, hard_delete=True), db, admin)
            self.assertEqual(error.exception.status_code, 500)
            self.assertIsNotNone(db.get(models.UserModel, target_id))
            self.assertEqual(db.query(models.UserAccessGrantModel).filter(models.UserAccessGrantModel.user_id == target_id).count(), 1)
            self.assertEqual(db.query(models.ClassModel).filter(models.ClassModel.owner_user_id == target_id).count(), 1)
        finally:
            db.close()
