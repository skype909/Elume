from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


try:
    DUBLIN_TZ = ZoneInfo("Europe/Dublin")
except ZoneInfoNotFoundError:
    # Some Windows development Python installations omit IANA timezone data.
    # Production Ubuntu provides it through the operating system tzdata package.
    DUBLIN_TZ = None

AI_FEATURES: dict[str, dict[str, Any]] = {
    "quiz": {"period": "weekly", "limit": 20, "warning_at": 15, "max_tokens": 3500, "label": "AI quiz generations"},
    "calendar": {"period": "daily", "limit": 30, "warning_at": 23, "max_tokens": 500, "label": "AI calendar requests"},
    "three_ideas": {"period": "daily", "limit": 10, "warning_at": 8, "max_tokens": 1500, "label": "3 Ideas generations"},
    "lesson_plan": {"period": "daily", "limit": 3, "warning_at": 2, "max_tokens": 4000, "label": "Lesson Plan generations"},
    "worksheet": {"period": "daily", "limit": 3, "warning_at": 2, "max_tokens": 4000, "label": "Worksheet generations"},
    "report_comment": {"period": "monthly", "limit": 250, "warning_at": 188, "max_tokens": 600, "label": "student report comments"},
    "scheme_of_work": {"period": "weekly", "limit": 3, "warning_at": 2, "max_tokens": 7000, "label": "Scheme of Work generations"},
    "department_plan": {"period": "weekly", "limit": 3, "warning_at": 2, "max_tokens": 9000, "label": "Department Plan generations"},
    "cat4_interpretation": {"period": "daily", "limit": 100, "warning_at": 75, "max_tokens": 1200, "label": "CAT4 student interpretations"},
}


REPORT_HEAVY_MONTHS = {1, 5, 6, 12}


def _as_dublin_time(now: datetime | None = None) -> datetime:
    if DUBLIN_TZ is None:
        raise RuntimeError("Europe/Dublin timezone data is unavailable in this Python environment")
    instant = now or datetime.now(timezone.utc)
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=timezone.utc)
    return instant.astimezone(DUBLIN_TZ)


def feature_policy(feature: str, now: datetime | None = None) -> dict[str, Any]:
    """Return the active feature policy, including seasonally adjusted report limits."""
    policy = AI_FEATURES.get(feature)
    if not policy:
        raise KeyError(feature)
    resolved = dict(policy)
    if feature == "report_comment" and _as_dublin_time(now).month in REPORT_HEAVY_MONTHS:
        resolved.update(limit=300, warning_at=225)
    return resolved


def current_allowance_period(period: str, now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return UTC-naive timestamps matching PostgreSQL TIMESTAMP storage."""
    local_now = _as_dublin_time(now)
    start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "weekly":
        start_local -= timedelta(days=start_local.weekday())
        end_local = start_local + timedelta(days=7)
    elif period == "daily":
        end_local = start_local + timedelta(days=1)
    elif period == "monthly":
        start_local = start_local.replace(day=1)
        if start_local.month == 12:
            end_local = start_local.replace(year=start_local.year + 1, month=1)
        else:
            end_local = start_local.replace(month=start_local.month + 1)
    else:
        raise ValueError(f"Unsupported AI allowance period: {period}")
    return (
        start_local.astimezone(timezone.utc).replace(tzinfo=None),
        end_local.astimezone(timezone.utc).replace(tzinfo=None),
    )


def resource_feature(kind: str | None) -> str:
    normalized = (kind or "").strip().lower()
    return {
        "ideas": "three_ideas",
        "three_ideas": "three_ideas",
        "lesson_plan": "lesson_plan",
        "worksheet": "worksheet",
        "scheme": "scheme_of_work",
        "scheme_of_work": "scheme_of_work",
        "dept_plan": "department_plan",
        "department_plan": "department_plan",
    }.get(normalized, "lesson_plan")


def allowance_available(feature: str, used: int, now: datetime | None = None) -> bool:
    return used < int(feature_policy(feature, now)["limit"])


def allowance_warning(feature: str, used: int, now: datetime | None = None) -> str | None:
    policy = feature_policy(feature, now)
    remaining = max(0, int(policy["limit"]) - used)
    if used < int(policy["warning_at"]) or remaining <= 0:
        return None
    period_label = {"weekly": "this week", "monthly": "this month"}.get(policy["period"], "today")
    unit = str(policy["label"]).removesuffix("s") if remaining == 1 else str(policy["label"])
    return f"{remaining} {unit} remaining {period_label}"


def allowance_message(feature: str, used: int, now: datetime | None = None) -> str:
    policy = feature_policy(feature, now)
    limit = int(policy["limit"])
    if feature == "quiz":
        return f"You've used your {limit} AI quiz generations for this week. Your allowance resets on Monday. Your existing quizzes are still available to use and edit."
    if feature == "department_plan":
        return "You've used this week's Department Plan generation. Department Plans are larger AI-generated resources, so they are limited to one per week. Your allowance resets on Monday."
    if feature == "scheme_of_work":
        return "You've used this week's Scheme of Work generation. Your allowance resets on Monday."
    if policy["period"] == "weekly":
        return f"You've used your {limit} {policy['label']} for this week. Your allowance resets on Monday."
    if policy["period"] == "monthly":
        _, reset_at = current_allowance_period("monthly", now)
        reset_local = reset_at.replace(tzinfo=timezone.utc).astimezone(DUBLIN_TZ)
        return f"You've used your {limit} AI report comments for this month. Your allowance resets on {reset_local.day} {reset_local.strftime('%B')}."
    return "You've used today's AI allowance for this feature. Your allowance resets tomorrow."
