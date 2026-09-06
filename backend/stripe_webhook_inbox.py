"""Pure Stripe-event projection and transaction-owned durable inbox primitives.

This module deliberately has no Stripe SDK, settings, application, or network imports.
Callers own database transactions; `record_failure` is intended for a fresh transaction
after a handler transaction has been rolled back.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any, Mapping

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from models import StripeWebhookEventModel

SUPPORTED_EVENT_TYPES = frozenset({
    "checkout.session.completed", "customer.subscription.created",
    "customer.subscription.updated", "customer.subscription.deleted",
    "invoice.paid", "invoice.payment_failed",
})
TERMINAL_STATES = frozenset({"processed", "ignored"})
SAFE_FAILURE_CODES = frozenset({"database_unavailable", "handler_failed", "invalid_event", "transient_error", "permanent_error"})
SAFE_FAILURE_DETAILS = {
    "database_unavailable": "database unavailable",
    "handler_failed": "handler failed",
    "invalid_event": "invalid event projection",
    "transient_error": "transient processing error",
    "permanent_error": "permanent processing error",
}
EVENT_PRECEDENCE = {
    "customer.subscription.deleted": 1,
    "customer.subscription.updated": 2,
    "customer.subscription.created": 3,
    "invoice.payment_failed": 4,
    "invoice.paid": 5,
    "checkout.session.completed": 6,
}


class InboxError(ValueError):
    pass


@dataclass(frozen=True)
class WebhookEnvelope:
    stripe_event_id: str
    event_type: str
    stripe_created_at: datetime
    stripe_api_version: str | None
    livemode: bool
    entity_key: str
    stripe_customer_id: str | None
    stripe_subscription_id: str | None
    event_data: dict[str, Any]
    payload_sha256: str
    supported: bool


@dataclass(frozen=True)
class ClaimResult:
    outcome: str  # new | retry | duplicate | conflict | in_progress
    event_id: int | None


@dataclass(frozen=True)
class EventOrder:
    stale: bool
    relation: str  # newer | stale | equal


def _mapping(value: Any) -> Mapping[str, Any]:
    if isinstance(value, Mapping):
        return value
    if hasattr(value, "to_dict_recursive"):
        return value.to_dict_recursive()
    if hasattr(value, "to_dict"):
        return value.to_dict()
    raise InboxError("event must be a mapping-like, signature-verified Stripe event")


def _string(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def _id(value: Any) -> str | None:
    if isinstance(value, Mapping):
        return _string(value.get("id"))
    return _string(value)


def _timestamp(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc)
    raise InboxError("event created timestamp is required")


def _iso(value: Any) -> str | None:
    if value is None:
        return None
    try:
        return _timestamp(value).isoformat().replace("+00:00", "Z")
    except (InboxError, OSError, OverflowError, ValueError):
        return None


def _metadata(value: Any) -> dict[str, str]:
    raw = _mapping(value) if isinstance(value, Mapping) or hasattr(value, "to_dict") or hasattr(value, "to_dict_recursive") else {}
    allowed = {}
    for key in ("elume_user_id", "user_id", "elume_email", "email"):
        item = _string(raw.get(key))
        if item:
            allowed[key] = item.lower() if key.endswith("email") or key == "email" else item
    return allowed


def _interval(obj: Mapping[str, Any]) -> str | None:
    items = _mapping(obj.get("items")) if isinstance(obj.get("items"), Mapping) else {}
    data = items.get("data")
    if not isinstance(data, list) or not data or not isinstance(data[0], Mapping):
        return None
    price = _mapping(data[0].get("price")) if isinstance(data[0].get("price"), Mapping) else {}
    recurring = _mapping(price.get("recurring")) if isinstance(price.get("recurring"), Mapping) else {}
    return _string(recurring.get("interval"))


def _customer_email(obj: Mapping[str, Any]) -> str | None:
    details = obj.get("customer_details")
    details = _mapping(details) if isinstance(details, Mapping) else {}
    return (_string(details.get("email")) or _string(obj.get("customer_email")) or _string(obj.get("email")) or "").lower() or None


def _projection(event_type: str, obj: Mapping[str, Any]) -> dict[str, Any]:
    customer = _id(obj.get("customer"))
    subscription = _id(obj.get("subscription"))
    if event_type.startswith("customer.subscription."):
        subscription = _id(obj.get("id"))
    data: dict[str, Any] = {
        "object_id": _id(obj.get("id")), "customer_id": customer,
        "subscription_id": subscription, "metadata": _metadata(obj.get("metadata")),
    }
    if event_type.startswith("customer.subscription."):
        data.update({
            "subscription_status": _string(obj.get("status")),
            "recurring_interval": _interval(obj),
            "trial_start": _iso(obj.get("trial_start")), "trial_end": _iso(obj.get("trial_end")),
            "current_period_end": _iso(obj.get("current_period_end")),
            "cancel_at_period_end": bool(obj.get("cancel_at_period_end")),
            "canceled_at": _iso(obj.get("canceled_at")),
        })
    elif event_type == "checkout.session.completed":
        data.update({"checkout_id": _id(obj.get("id")), "payment_status": _string(obj.get("payment_status")),
                     "mode": _string(obj.get("mode")), "customer_email": _customer_email(obj)})
    elif event_type.startswith("invoice."):
        data.update({"invoice_id": _id(obj.get("id")), "payment_status": _string(obj.get("status")),
                     "paid": bool(obj.get("paid")), "customer_email": _customer_email(obj),
                     "current_period_end": _iso(obj.get("period_end"))})
    return {key: value for key, value in data.items() if value not in (None, {}, "")}


def canonical_hash(event_data: Mapping[str, Any]) -> str:
    encoded = json.dumps(event_data, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return sha256(encoded).hexdigest()


def project_event(event: Any) -> WebhookEnvelope:
    raw = _mapping(event)
    event_id = _string(raw.get("id"))
    event_type = _string(raw.get("type"))
    if not event_id or not event_type:
        raise InboxError("event id and type are required")
    data_container = _mapping(raw.get("data"))
    raw_object = data_container.get("object")
    obj = _mapping(raw_object) if raw_object is not None else {}
    supported = event_type in SUPPORTED_EVENT_TYPES
    data = _projection(event_type, obj) if supported else {"object_id": _id(obj.get("id"))} if obj else {}
    if not supported:
        data = {"object_id": data.get("object_id")} if data.get("object_id") else {}
    customer = _id(obj.get("customer"))
    subscription = _id(obj.get("subscription"))
    if event_type.startswith("customer.subscription."):
        subscription = _id(obj.get("id"))
    object_id = _id(obj.get("id"))
    entity_key = subscription or customer or object_id or event_id
    envelope = {
        "stripe_event_id": event_id, "event_type": event_type,
        "stripe_created_at": _timestamp(raw.get("created")),
        "stripe_api_version": _string(raw.get("api_version")), "livemode": bool(raw.get("livemode")),
        "entity_key": entity_key, "stripe_customer_id": customer,
        "stripe_subscription_id": subscription, "event_data": data, "supported": supported,
    }
    hash_projection = {
        "stripe_event_id": event_id, "event_type": event_type,
        "stripe_created_at": envelope["stripe_created_at"].isoformat().replace("+00:00", "Z"),
        "stripe_api_version": envelope["stripe_api_version"], "livemode": envelope["livemode"],
        "entity_key": entity_key, "stripe_customer_id": customer,
        "stripe_subscription_id": subscription, "event_data": data, "supported": supported,
    }
    return WebhookEnvelope(payload_sha256=canonical_hash(hash_projection), **envelope)


def _now(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def claim_event(session: Session, envelope: WebhookEnvelope, *, resolved_user_id: int | None = None, now: datetime | None = None) -> ClaimResult:
    """Claim inside the caller-owned transaction; this function never commits."""
    claimed = _now(now)
    inserted = session.execute(text("""
        INSERT INTO stripe_webhook_events
        (stripe_event_id,event_type,stripe_created_at,stripe_api_version,livemode,entity_key,
         stripe_customer_id,stripe_subscription_id,resolved_user_id,payload_sha256,event_data,
         processing_state,attempt_count,claimed_at)
        VALUES (:stripe_event_id,:event_type,:stripe_created_at,:stripe_api_version,:livemode,:entity_key,
         :stripe_customer_id,:stripe_subscription_id,:resolved_user_id,:payload_sha256,CAST(:event_data AS jsonb),
         'processing',1,:claimed_at)
        ON CONFLICT (stripe_event_id) DO NOTHING RETURNING id
    """), {**envelope.__dict__, "resolved_user_id": resolved_user_id, "claimed_at": claimed,
             "event_data": json.dumps(envelope.event_data, sort_keys=True, separators=(",", ":"))}).scalar_one_or_none()
    if inserted is not None:
        return ClaimResult("new", inserted)
    row = session.execute(select(StripeWebhookEventModel).where(
        StripeWebhookEventModel.stripe_event_id == envelope.stripe_event_id).with_for_update()).scalar_one()
    if row.payload_sha256 != envelope.payload_sha256:
        return ClaimResult("conflict", row.id)
    if row.processing_state in TERMINAL_STATES:
        return ClaimResult("duplicate", row.id)
    if row.processing_state == "failed":
        row.processing_state = "processing"; row.attempt_count += 1; row.claimed_at = claimed
        row.next_attempt_at = row.failure_code = row.failure_detail = row.last_failure_at = None
        session.flush()
        return ClaimResult("retry", row.id)
    return ClaimResult("in_progress", row.id)


def mark_processed(session: Session, event_id: int, *, now: datetime | None = None) -> None:
    row = session.execute(select(StripeWebhookEventModel).where(StripeWebhookEventModel.id == event_id).with_for_update()).scalar_one()
    if row.processing_state != "processing":
        raise InboxError("only a claimed processing event can be marked processed")
    row.processing_state = "processed"; row.claimed_at = None; row.processed_at = _now(now)
    row.next_attempt_at = row.failure_code = row.failure_detail = row.last_failure_at = None
    session.flush()


def mark_ignored(session: Session, event_id: int, *, now: datetime | None = None) -> None:
    row = session.execute(select(StripeWebhookEventModel).where(StripeWebhookEventModel.id == event_id).with_for_update()).scalar_one()
    if row.processing_state != "processing":
        raise InboxError("only a claimed processing event can be marked ignored")
    row.processing_state = "ignored"; row.claimed_at = None; row.processed_at = _now(now)
    row.next_attempt_at = row.failure_code = row.failure_detail = row.last_failure_at = None
    session.flush()


def record_failure(session: Session, event_id: int, failure_code: str, *, now: datetime | None = None, next_attempt_at: datetime | None = None) -> None:
    """Record a generic safe failure in a separate caller-owned transaction."""
    if failure_code not in SAFE_FAILURE_CODES:
        raise InboxError("failure code is not allowlisted")
    row = session.execute(select(StripeWebhookEventModel).where(StripeWebhookEventModel.id == event_id).with_for_update()).scalar_one()
    if row.processing_state != "processing":
        raise InboxError("only a claimed processing event can be marked failed")
    row.processing_state = "failed"; row.claimed_at = None; row.processed_at = None
    row.failure_code = failure_code; row.failure_detail = SAFE_FAILURE_DETAILS[failure_code]
    row.last_failure_at = _now(now); row.next_attempt_at = next_attempt_at
    session.flush()


def compare_event_order(incoming_type: str, incoming_created: datetime, applied_type: str, applied_created: datetime) -> EventOrder:
    incoming = _now(incoming_created); applied = _now(applied_created)
    if incoming < applied:
        return EventOrder(True, "stale")
    if incoming > applied:
        return EventOrder(False, "newer")
    incoming_priority = EVENT_PRECEDENCE.get(incoming_type, len(EVENT_PRECEDENCE) + 1)
    applied_priority = EVENT_PRECEDENCE.get(applied_type, len(EVENT_PRECEDENCE) + 1)
    if incoming_priority > applied_priority:
        return EventOrder(True, "stale")
    if incoming_priority < applied_priority:
        return EventOrder(False, "newer")
    return EventOrder(False, "equal")
