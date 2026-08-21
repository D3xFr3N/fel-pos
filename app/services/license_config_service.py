from __future__ import annotations

import re
from pathlib import Path

from app.config import settings
from app.data_paths import ENV_FILE_NAME, get_runtime_root
from app.services.license_service import extract_license_key_from_text, normalize_license_key

LICENSE_ENV_KEYS = {
    "store_license_key": "STORE_LICENSE_KEY",
    "license_registry_url": "LICENSE_REGISTRY_URL",
    "license_required_for_updates": "LICENSE_REQUIRED_FOR_UPDATES",
}

LICENSE_FILE_NAMES = ("license.felpos-lic", "activacion.felpos-lic")


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


def _find_license_file() -> Path | None:
    root = get_runtime_root()
    for name in LICENSE_FILE_NAMES:
        path = root / name
        if path.is_file():
            return path
    return None


def try_import_license_file() -> str:
    """Si no hay clave en .env, toma license.felpos-lic de la carpeta de instalacion."""
    current = normalize_license_key(settings.store_license_key or "")
    if current:
        return current
    path = _find_license_file()
    if not path:
        return ""
    try:
        raw = path.read_text(encoding="utf-8-sig")
    except OSError:
        return ""
    key = extract_license_key_from_text(raw)
    if not key:
        return ""
    settings.store_license_key = key
    _write_env_values({LICENSE_ENV_KEYS["store_license_key"]: key})
    return key


def get_license_config() -> dict:
    from app.services.license_service import get_license_registry_url, license_status_payload

    try_import_license_file()
    status = license_status_payload()
    # No devolver la clave completa al UI: se activa por archivo.
    return {
        "store_license_key": "",
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
    from app.services.license_crypto import verify_signed_license
    from app.services.license_service import get_install_fingerprint

    normalized_key = extract_license_key_from_text(store_license_key)
    if not normalized_key:
        normalized_key = normalize_license_key(settings.store_license_key or "")
        if normalized_key and not normalized_key.upper().startswith("FELPOS-V1."):
            normalized_key = ""
    if not normalized_key:
        raise ValueError(
            "Archivo invalido. Usa el .felpos-lic (no el .txt de instrucciones)."
        )
    verified = verify_signed_license(
        normalized_key,
        machine_fingerprint=get_install_fingerprint(),
    )
    if not verified.valid:
        raise ValueError(verified.message or "Licencia firmada invalida.")
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
    # Guarda copia local para reinstalaciones / soporte.
    try:
        import json

        lic_path = get_runtime_root() / "license.felpos-lic"
        lic_path.write_text(
            json.dumps(
                {"format": "felpos-lic-1", "license_key": normalized_key},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    except OSError:
        pass
    return get_license_config()
