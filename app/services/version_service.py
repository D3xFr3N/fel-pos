from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app.data_paths import get_data_dir
from app.version import APP_CREATOR, APP_NAME, get_app_version, get_build_date

VERSION_STATE_FILE = "app_version.json"


def _state_path() -> Path:
    return get_data_dir() / VERSION_STATE_FILE


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _load_state() -> dict:
    path = _state_path()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_state(state: dict) -> None:
    path = _state_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")


def sync_installed_version() -> dict:
    current_version = get_app_version()
    build_date = get_build_date()
    now = _utc_now().isoformat(timespec="seconds")
    state = _load_state()
    previous_version = state.get("current_version")
    history: list[dict] = list(state.get("history") or [])

    changed = previous_version != current_version
    if not state:
        state = {
            "current_version": current_version,
            "previous_version": None,
            "installed_at": now,
            "updated_at": now,
            "history": [{"version": current_version, "installed_at": now}],
        }
        _save_state(state)
        return _public_payload(state, build_date, changed=True)

    if changed:
        history.append({"version": current_version, "installed_at": now})
        state["previous_version"] = previous_version
        state["current_version"] = current_version
        state["updated_at"] = now
        state["history"] = history[-20:]
        _save_state(state)
        return _public_payload(state, build_date, changed=True)

    state.setdefault("installed_at", now)
    state.setdefault("history", history)
    _save_state(state)
    return _public_payload(state, build_date, changed=False)


def get_version_info() -> dict:
    state = _load_state()
    if not state:
        return sync_installed_version()
    return _public_payload(state, get_build_date(), changed=False)


def _public_payload(state: dict, build_date: str | None, *, changed: bool) -> dict:
    history = list(state.get("history") or [])
    # Actual + 3 anteriores (la entrada mas reciente del historial es la version actual).
    visible_history = history[-4:]
    return {
        "app_name": APP_NAME,
        "creator": APP_CREATOR,
        "version": get_app_version(),
        "build_date": build_date,
        "previous_version": state.get("previous_version"),
        "installed_at": state.get("installed_at"),
        "updated_at": state.get("updated_at"),
        "history": visible_history,
        "changed_on_startup": changed,
    }
