from __future__ import annotations

import re

from app.config import settings
from app.data_paths import ENV_FILE_NAME, get_runtime_root

SYSTEM_ENV_KEYS = {
    "cash_shared_session": "CASH_SHARED_SESSION",
}


def _upsert_env_value(content: str, env_key: str, value: str) -> str:
    line = f"{env_key}={value}"
    pattern = rf"(?m)^{re.escape(env_key)}=.*$"
    if re.search(pattern, content):
        return re.sub(pattern, line, content, count=1)
    if content and not content.endswith("\n"):
        content += "\n"
    return content + line + "\n"


def _read_env_content() -> str:
    env_path = get_runtime_root() / ENV_FILE_NAME
    if env_path.exists():
        return env_path.read_text(encoding="utf-8")
    example_path = get_runtime_root() / f"{ENV_FILE_NAME}.example"
    if example_path.exists():
        return example_path.read_text(encoding="utf-8")
    return ""


def _write_env_values(values: dict[str, str]) -> None:
    content = _read_env_content()
    for env_key, value in values.items():
        content = _upsert_env_value(content, env_key, value)
    env_path = get_runtime_root() / ENV_FILE_NAME
    env_path.write_text(content, encoding="utf-8")


def _bool_env(value: bool) -> str:
    return "true" if value else "false"


def get_system_config() -> dict:
    return {
        "cash_shared_session": bool(settings.cash_shared_session),
        "nit_lookup_configured": bool((settings.nit_lookup_url or "").strip()),
    }


def update_system_config(*, cash_shared_session: bool) -> dict:
    settings.cash_shared_session = cash_shared_session
    _write_env_values({SYSTEM_ENV_KEYS["cash_shared_session"]: _bool_env(cash_shared_session)})
    return get_system_config()
