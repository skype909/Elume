"""Disposable PostgreSQL tests for the migration-013 ORM inbox primitives."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import sys
import threading
import unittest
import uuid

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from db import Base
import models
from schema.bootstrap_v010 import apply_bootstrap
from schema.migrate_011_cat4_cohort_schema import apply_migration as apply_011
from schema.migrate_012_account_entitlements import apply_migration as apply_012
from schema.migrate_013_stripe_webhook_inbox import apply_migration as apply_013
from stripe_webhook_inbox import (
    EVENT_PRECEDENCE, InboxError, canonical_hash, claim_event, compare_event_order,
    mark_ignored, mark_processed, project_event, record_failure,
)

RUN = os.getenv("ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS") == "1"
NOW = datetime(2026, 9, 6, 12, tzinfo=timezone.utc)


def event(event_type="customer.subscription.updated", **overrides):
    obj = {
        "id": "sub_123", "customer": "cus_123", "status": "active",
        "trial_start": 1_788_696_000, "trial_end": 1_788_955_200,
        "current_period_end": 1_789_214_400, "cancel_at_period_end": False,
        "metadata": {"elume_user_id": "42", "ignore": "private"},
        "items": {"data": [{"price": {"recurring": {"interval": "annual"}}}]},
        "billing_details": {"address": {"line1": "DO NOT PERSIST"}},
        "payment_method": {"card": {"last4": "4242"}},
    }
    if event_type == "checkout.session.completed":
        obj = {"id": "cs_123", "customer": "cus_123", "subscription": "sub_123", "payment_status": "paid",
               "mode": "subscription", "customer_details": {"email": "Teacher@School.Example", "name": "Private"},
               "metadata": {"user_id": "42", "other": "private"}}
    elif event_type.startswith("invoice."):
        obj = {"id": "in_123", "customer": "cus_123", "subscription": "sub_123", "status": "paid",
               "paid": True, "period_end": 1_789_214_400, "customer_email": "teacher@school.example",
               "metadata": {"elume_email": "teacher@school.example", "secret": "private"}}
    raw = {"id": "evt_" + uuid.uuid4().hex, "type": event_type, "created": int(NOW.timestamp()),
           "livemode": True, "api_version": "2026-08-01", "data": {"object": obj},
           "request": {"id": "raw_request", "idempotency_key": "do-not-store"}}
    raw.update(overrides)
    return raw


@unittest.skipUnless(RUN, "set ELUME_RUN_POSTGRES_BOOTSTRAP_TESTS=1 for local PostgreSQL tests")
class StripeWebhookInboxTests(unittest.TestCase):
    def setUp(self):
        from db import DATABASE_URL
        source = make_url(DATABASE_URL)
        if source.drivername.split("+", 1)[0] != "postgresql" or source.host not in {"127.0.0.1", "localhost", "::1"}:
            self.skipTest("requires a loopback PostgreSQL database")
        self.admin = source.set(database="postgres")
        self.databases = []

    def tearDown(self):
        for database in self.databases:
            engine = create_engine(self.admin, isolation_level="AUTOCOMMIT")
            try:
                with engine.connect() as connection:
                    connection.execute(text("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=:db AND pid<>pg_backend_pid()"), {"db": database})
                    connection.execute(text(f'DROP DATABASE IF EXISTS "{database}"'))
            finally:
                engine.dispose()

    def database(self):
        name = "elume_inbox_" + uuid.uuid4().hex[:10]
        engine = create_engine(self.admin, isolation_level="AUTOCOMMIT")
        with engine.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        engine.dispose(); self.databases.append(name)
        from db import DATABASE_URL
        url = make_url(DATABASE_URL).set(database=name).render_as_string(hide_password=False)
        apply_bootstrap(url); apply_011(url, expected_database=name, confirm_migration_011=True)
        apply_012(url, expected_database=name, confirm_migration_012=True)
        apply_013(url, expected_database=name, confirm_migration_013=True)
        return url

    def session(self, url):
        return sessionmaker(bind=create_engine(url), future=True)

    def test_orm_columns_constraints_indexes_and_sqlite_metadata(self):
        from sqlalchemy import create_engine as sqlite_engine
        sqlite = sqlite_engine("sqlite:///:memory:")
        models.StripeWebhookEventModel.__table__.create(sqlite)
        models.StripeWebhookEventModel.__table__.drop(sqlite)
        sqlite.dispose()
        table = models.StripeWebhookEventModel.__table__
        self.assertEqual(table.name, "stripe_webhook_events")
        self.assertEqual(set(table.c.keys()), {"id", "stripe_event_id", "event_type", "stripe_created_at", "received_at", "stripe_api_version", "livemode", "entity_key", "stripe_customer_id", "stripe_subscription_id", "resolved_user_id", "payload_sha256", "event_data", "processing_state", "attempt_count", "claimed_at", "processed_at", "next_attempt_at", "failure_code", "failure_detail", "last_failure_at"})
        self.assertEqual({index.name for index in table.indexes}, {"ix_stripe_webhook_events_queue", "ix_stripe_webhook_events_subscription_created", "ix_stripe_webhook_events_customer_created", "ix_stripe_webhook_events_user_received", "ix_stripe_webhook_events_entity_created"})
        url = self.database(); engine = create_engine(url)
        try:
            inspector = inspect(engine)
            fk = inspector.get_foreign_keys("stripe_webhook_events")
            self.assertTrue(any(row["constrained_columns"] == ["resolved_user_id"] and row["options"].get("ondelete") == "SET NULL" for row in fk))
            columns = {row["name"]: row for row in inspector.get_columns("stripe_webhook_events")}
            self.assertEqual(str(columns["id"]["type"]), "BIGINT")
            self.assertEqual(str(columns["payload_sha256"]["type"]), "CHAR(64)")
        finally: engine.dispose()

    def test_projection_hash_entity_and_sensitive_field_minimization(self):
        for type_ in ("checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed"):
            envelope = project_event(event(type_))
            with self.subTest(type=type_):
                self.assertTrue(envelope.supported); self.assertEqual(len(envelope.payload_sha256), 64)
                self.assertNotIn("billing_details", repr(envelope.event_data)); self.assertNotIn("4242", repr(envelope.event_data)); self.assertNotIn("private", repr(envelope.event_data))
        checkout = project_event(event("checkout.session.completed"))
        self.assertEqual(checkout.entity_key, "sub_123"); self.assertEqual(checkout.event_data["customer_email"], "teacher@school.example")
        unsupported = project_event(event("charge.succeeded"))
        self.assertFalse(unsupported.supported); self.assertEqual(set(unsupported.event_data), {"object_id"})
        a = {"a": 1, "b": {"x": 2}}; b = {"b": {"x": 2}, "a": 1}
        self.assertEqual(canonical_hash(a), canonical_hash(b)); self.assertNotEqual(canonical_hash(a), canonical_hash({"a": 2, "b": {"x": 2}}))
        changed = event("invoice.paid"); same_id = event("invoice.paid"); same_id["id"] = changed["id"]
        same_id["livemode"] = False
        self.assertNotEqual(project_event(changed).payload_sha256, project_event(same_id).payload_sha256)
        no_sub = event("invoice.paid"); no_sub["data"]["object"].pop("subscription")
        self.assertEqual(project_event(no_sub).entity_key, "cus_123")

    def test_claim_retry_duplicates_conflicts_and_transitions(self):
        url = self.database(); maker = self.session(url); envelope = project_event(event())
        with maker.begin() as db:
            first = claim_event(db, envelope, now=NOW); self.assertEqual(first.outcome, "new")
            persisted = db.get(models.StripeWebhookEventModel, first.event_id).event_data
            self.assertNotIn("4242", repr(persisted)); self.assertNotIn("DO NOT PERSIST", repr(persisted)); self.assertNotIn("raw_request", repr(persisted))
            mark_processed(db, first.event_id, now=NOW)
        with maker.begin() as db:
            self.assertEqual(claim_event(db, envelope, now=NOW).outcome, "duplicate")
            changed = event(); changed["id"] = envelope.stripe_event_id; changed["data"]["object"]["status"] = "canceled"
            self.assertEqual(claim_event(db, project_event(changed), now=NOW).outcome, "conflict")
        retry = project_event(event());
        with maker.begin() as db:
            result = claim_event(db, retry, now=NOW); record_failure(db, result.event_id, "handler_failed", now=NOW, next_attempt_at=NOW + timedelta(minutes=1))
        with maker.begin() as db:
            retry_result = claim_event(db, retry, now=NOW + timedelta(minutes=2)); self.assertEqual(retry_result.outcome, "retry")
            row = db.get(models.StripeWebhookEventModel, retry_result.event_id); self.assertEqual(row.attempt_count, 2); mark_ignored(db, row.id, now=NOW)
        with maker.begin() as db:
            row = db.get(models.StripeWebhookEventModel, retry_result.event_id); self.assertEqual(row.processing_state, "ignored")
            self.assertEqual(row.failure_code, None)
        with self.assertRaises(InboxError):
            with maker.begin() as db: record_failure(db, first.event_id, "raw exception text")

    def test_concurrent_claim_and_user_delete(self):
        url = self.database(); maker = self.session(url); envelope = project_event(event())
        barrier = threading.Barrier(2)
        def claim():
            with maker.begin() as db:
                barrier.wait(timeout=10)
                return claim_event(db, envelope, now=NOW).outcome
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = [future.result(timeout=15) for future in (pool.submit(claim), pool.submit(claim))]
        self.assertEqual(results.count("new"), 1); self.assertEqual(results.count("in_progress"), 1)
        with maker.begin() as db:
            user = models.UserModel(email="inbox-user@example.test", password_hash="x")
            db.add(user); db.flush(); event_id = claim_event(db, project_event(event()), resolved_user_id=user.id, now=NOW).event_id
            db.execute(text("DELETE FROM users WHERE id=:id"), {"id": user.id})
            self.assertIsNone(db.get(models.StripeWebhookEventModel, event_id).resolved_user_id)

    def test_state_constraints_and_event_order(self):
        url = self.database(); engine = create_engine(url)
        try:
            with engine.begin() as db:
                with self.assertRaises(Exception):
                    db.execute(text("INSERT INTO stripe_webhook_events (stripe_event_id,event_type,stripe_created_at,livemode,payload_sha256,event_data,processing_state,attempt_count) VALUES ('evt_bad','invoice.paid',CURRENT_TIMESTAMP,true,:hash,'[]'::jsonb,'received',0)"), {"hash": "a" * 64})
        finally: engine.dispose()
        precedence = list(EVENT_PRECEDENCE)
        for higher, lower in zip(precedence, precedence[1:]):
            self.assertTrue(compare_event_order(lower, NOW, higher, NOW).stale)
        self.assertTrue(compare_event_order("invoice.paid", NOW, "invoice.paid", NOW + timedelta(seconds=1)).stale)
        self.assertFalse(compare_event_order("invoice.paid", NOW + timedelta(seconds=1), "invoice.paid", NOW).stale)
