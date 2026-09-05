"""Local, auditable platform-administration helpers for product entitlements."""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

import models
from entitlements import PROMOTIONAL_ANNUAL_OFFER_EXPIRES_AT, decide_entitlement

GRANT_TYPES = frozenset({"pilot", "reviewer", "internal", "complimentary", "promotional_annual"})


class EntitlementAdminError(ValueError):
    def __init__(self, status_code: int, code: str):
        super().__init__(code)
        self.status_code = status_code
        self.code = code


def utc_now() -> datetime:
    """Persist the project's naive-UTC DateTime representation from an aware UTC clock."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def normalize_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def grant_summary(grant):
    return {
        "id": grant.id,
        "grant_type": grant.grant_type,
        "reason": grant.reason,
        "starts_at": grant.starts_at,
        "expires_at": grant.expires_at,
        "granted_by_user_id": grant.granted_by_user_id,
        "revoked_at": grant.revoked_at,
        "revoked_by_user_id": grant.revoked_by_user_id,
        "revocation_reason": grant.revocation_reason,
        "created_at": grant.created_at,
    }


def create_grant(db, *, actor_id: int, user_id: int, grant_type: str, reason: str,
                 starts_at: datetime | None, expires_at: datetime | None):
    grant_type = (grant_type or "").strip().lower()
    reason = (reason or "").strip()
    if grant_type not in GRANT_TYPES:
        raise EntitlementAdminError(422, "invalid_grant_type")
    if not reason:
        raise EntitlementAdminError(422, "grant_reason_required")
    now = utc_now()
    starts_at = normalize_utc(starts_at) or now
    expires_at = normalize_utc(expires_at)
    promotional_expiry = PROMOTIONAL_ANNUAL_OFFER_EXPIRES_AT
    if grant_type == "promotional_annual":
        if expires_at is not None and expires_at != promotional_expiry:
            raise EntitlementAdminError(422, "promotional_expiry_must_be_2027_09_30")
        expires_at = promotional_expiry
    elif expires_at is None:
        raise EntitlementAdminError(422, "grant_expiry_required")
    if expires_at <= starts_at:
        raise EntitlementAdminError(422, "grant_window_invalid")
    target = db.query(models.UserModel).filter(models.UserModel.id == user_id).with_for_update().first()
    if target is None:
        raise EntitlementAdminError(404, "user_not_found")
    grants = (db.query(models.UserAccessGrantModel)
              .filter(models.UserAccessGrantModel.user_id == user_id)
              .with_for_update().all())
    for grant in grants:
        if grant.revoked_at is not None or grant.grant_type != grant_type:
            continue
        same = grant.reason == reason and grant.starts_at == starts_at and grant.expires_at == expires_at
        if same:
            return grant, False
        existing_end = grant.expires_at
        if grant.starts_at < expires_at and (existing_end is None or starts_at < existing_end):
            raise EntitlementAdminError(409, "overlapping_grant_requires_resolution")
    grant = models.UserAccessGrantModel(
        user_id=user_id, grant_type=grant_type, reason=reason, starts_at=starts_at,
        expires_at=expires_at, granted_by_user_id=actor_id,
    )
    db.add(grant)
    db.flush()
    return grant, True


def revoke_grant(db, *, actor_id: int, grant_id: int, reason: str):
    reason = (reason or "").strip()
    if not reason:
        raise EntitlementAdminError(422, "revocation_reason_required")
    grant = (db.query(models.UserAccessGrantModel)
             .filter(models.UserAccessGrantModel.id == grant_id).with_for_update().first())
    if grant is None:
        raise EntitlementAdminError(404, "grant_not_found")
    if grant.revoked_at is not None:
        if grant.revoked_by_user_id == actor_id and grant.revocation_reason == reason:
            return grant, False
        raise EntitlementAdminError(409, "grant_already_revoked")
    grant.revoked_at = utc_now()
    grant.revoked_by_user_id = actor_id
    grant.revocation_reason = reason
    db.flush()
    return grant, True


def entitlement_report(db, *, access_filter: str, page: int, page_size: int):
    if access_filter not in {"all", "allowed", "denied"}:
        raise EntitlementAdminError(422, "invalid_access_filter")
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    now = utc_now()
    users = db.query(models.UserModel).order_by(models.UserModel.id).all()
    schools = {school.id: school for school in db.query(models.SchoolModel).all()}
    grants_by_user = {}
    for grant in db.query(models.UserAccessGrantModel).order_by(models.UserAccessGrantModel.user_id, models.UserAccessGrantModel.id):
        grants_by_user.setdefault(grant.user_id, []).append(grant)
    rows = []
    reasons = Counter()
    for user in users:
        school = schools.get(user.school_id)
        grants = grants_by_user.get(user.id, [])
        decision = decide_entitlement(user, school, grants, now=now)
        reasons[decision.code] += 1
        if access_filter != "all" and (decision.allowed != (access_filter == "allowed")):
            continue
        rows.append({
            "user_id": user.id, "email": user.email, "role": user.role, "is_active": user.is_active,
            "email_verified": user.email_verified, "school_id": user.school_id,
            "school_name": getattr(school, "name", None), "school_active": getattr(school, "status", None) == "active",
            "subscription_status": user.subscription_status, "trial_ends_at": user.trial_ends_at,
            "paid_through_at": user.subscription_expires_at, "payment_recovery_deadline_at": user.payment_recovery_deadline_at,
            "active_grants": [grant_summary(g) for g in grants if g.revoked_at is None and g.starts_at <= now and (g.expires_at is None or g.expires_at > now)],
            "allowed": decision.allowed, "reason": decision.code, "access_until": decision.access_until,
        })
    total = len(users)
    matched = len(rows)
    start = (page - 1) * page_size
    return {"evaluated_at": now, "total": total, "matched": matched, "reason_counts": dict(sorted(reasons.items())),
            "page": page, "page_size": page_size, "users": rows[start:start + page_size]}
