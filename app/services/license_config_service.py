from __future__ import annotations

import re

from app.config import settings
from app.data_paths import ENV_FILE_NAME, get_runtime_root
from app.services.license_service import normalize_license_key

LICENSE_ENV_KEYS = {
    "store_license_key": "STORE_LICENSE_KEY",
    "license_registry_url": "LICENSE_REGISTRY_URL",
    "license_required_for_updates": "LICENSE_REQUIRED_FOR_UPDATES",
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


def get_license_config() -> dict:
    from app.services.license_service import get_license_registry_url, license_status_payload

    status = license_status_payload()
    return {
        "store_license_key": settings.store_license_key or "",
        "license_registry_url": settings.license_registry_url or "",
        "license_required_for_updates": bool(settings.license_required_for_updates),
        "resolved_registry_url": get_license_registry_url() or None,
        **status,
    }


def update_license_config(
    *,
    store_license_key: str,
    license_registry_url: str = "",
    license_required_for_updates: bool = True,
) -> dict:
    normalized_key = normalize_license_key(store_license_key)
    registry_url = (license_registry_url or "").strip()
    settings.store_license_key = normalized_key
    settings.license_registry_url = registry_url
    settings.license_required_for_updates = license_required_for_updates
    _write_env_values(
        {
            LICENSE_ENV_KEYS["store_license_key"]: normalized_key,
            LICENSE_ENV_KEYS["license_registry_url"]: registry_url,
            LICENSE_ENV_KEYS["license_required_for_updates"]: _bool_env(license_required_for_updates),
        }
    )
    return get_license_config()
