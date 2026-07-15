from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.config import settings

DEFAULT_TIMEZONE = "America/Guatemala"
GUATEMALA_FALLBACK_TZ = timezone(timedelta(hours=-6))


def get_app_timezone():
    name = (getattr(settings, "app_timezone", None) or DEFAULT_TIMEZONE).strip()
    try:
        return ZoneInfo(name)
    except Exception:
        if name in {DEFAULT_TIMEZONE, "America/Guatemala"}:
            return GUATEMALA_FALLBACK_TZ
        return GUATEMALA_FALLBACK_TZ


def assume_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def to_local_datetime(value: datetime) -> datetime:
    return assume_utc(value).astimezone(get_app_timezone())


def format_local_datetime(value: datetime, fmt: str = "%Y-%m-%d %H:%M") -> str:
    return to_local_datetime(value).strftime(fmt)
