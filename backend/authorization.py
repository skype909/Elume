"""Small, database-backed authorization helpers for application roles."""

from typing import Any

from fastapi import HTTPException


ROLE_TEACHER = "teacher"
ROLE_SCHOOL_ADMIN = "school_admin"
ROLE_PLATFORM_ADMIN = "platform_admin"

_LEGACY_PLATFORM_ADMIN_EMAIL = "admin@elume.ie"


def _user_role(user: Any) -> str:
    return (getattr(user, "role", None) or ROLE_TEACHER).strip().lower()


def is_platform_admin(user: Any) -> bool:
    """Keep the legacy admin address authorized while roles are rolled out."""
    email = (getattr(user, "email", None) or "").strip().lower()
    return email == _LEGACY_PLATFORM_ADMIN_EMAIL or _user_role(user) == ROLE_PLATFORM_ADMIN


def is_school_admin(user: Any) -> bool:
    return _user_role(user) == ROLE_SCHOOL_ADMIN


def require_platform_admin(user: Any) -> None:
    if not is_platform_admin(user):
        raise HTTPException(status_code=403, detail="Platform admin access required.")


def require_school_admin(user: Any) -> None:
    if not is_school_admin(user):
        raise HTTPException(status_code=403, detail="School admin access required.")
