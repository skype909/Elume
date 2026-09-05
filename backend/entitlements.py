"""Pure account-product entitlement policy; deliberately no I/O or Stripe SDK."""
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

PROMOTIONAL_ANNUAL_OFFER_EXPIRES_AT = datetime(2027, 9, 30, 23, 59, 59)
PRODUCT_ENTITLEMENT_MODES = frozenset({'off', 'report', 'enforce'})

@dataclass(frozen=True)
class EntitlementDecision:
    allowed: bool
    source: str
    code: str
    access_until: Optional[datetime] = None

def product_entitlement_mode(value: str | None) -> str:
    """Normalise a caller-supplied mode without reading process environment."""
    mode=(value or 'off').strip().lower()
    return mode if mode in PRODUCT_ENTITLEMENT_MODES else 'off'

def _naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    if value is None or value.tzinfo is None: return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)

def _current(grant, now):
    start=_naive_utc(getattr(grant,'starts_at',None)) or now; expiry=_naive_utc(getattr(grant,'expires_at',None))
    return getattr(grant,'revoked_at',None) is None and start <= now and (expiry is None or expiry > now)

def decide_entitlement(user, school=None, grants: Iterable=(), *, now: datetime) -> EntitlementDecision:
    """Make a deterministic decision from supplied values only; boundaries are strict."""
    now=_naive_utc(now)
    if not bool(getattr(user,'is_active',False)): return EntitlementDecision(False,'none','account_inactive')
    if not bool(getattr(user,'email_verified',False)): return EntitlementDecision(False,'none','email_unverified')
    if (getattr(user,'role',None) or 'teacher').strip().lower()=='platform_admin': return EntitlementDecision(True,'platform_admin','platform_admin')
    if getattr(user,'school_id',None) is not None and school is not None and getattr(school,'status',None)=='active': return EntitlementDecision(True,'school','active_school')
    for grant in grants:
        if _current(grant,now): return EntitlementDecision(True,'manual_grant',getattr(grant,'grant_type','manual_grant'),_naive_utc(getattr(grant,'expires_at',None)))
    status=(getattr(user,'subscription_status',None) or 'inactive').strip().lower(); trial=_naive_utc(getattr(user,'trial_ends_at',None)); paid=_naive_utc(getattr(user,'subscription_expires_at',None)); recovery=_naive_utc(getattr(user,'payment_recovery_deadline_at',None))
    if status=='trialing' and trial and trial>now: return EntitlementDecision(True,'trial','trial_active',trial)
    if status=='active' and paid and paid>now: return EntitlementDecision(True,'stripe','paid_subscription_active',paid)
    if status=='past_due' and recovery and recovery>now: return EntitlementDecision(True,'payment_recovery','payment_recovery_active',recovery)
    return EntitlementDecision(False,'none',f'subscription_{status}')
