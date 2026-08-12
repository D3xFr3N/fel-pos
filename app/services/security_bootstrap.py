from __future__ import annotations

import os
import secrets
from pathlib import Path

from app.config import settings
from app.data_paths import get_runtime_root

DEFAULT_INSECURE_SECRET = "change-this-secret"


def _write_env_value(key: str, value: str) -> None:
    env_path = get_runtime_root() / ".env"
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()
    found = False
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#") or "=" not in line:
            out.append(line)
            continue
        current_key = line.split("=", 1)[0].strip()
        if current_key == key:
            out.append(f"{key}={value}")
            found = True
        else:
            out.append(line)
    if not found:
        out.append(f"{key}={value}")
    env_path.write_text("\n".join(out).rstrip() + "\n", encoding="utf-8")


def ensure_security_secret() -> bool:
    """Si el secret sigue siendo el default, genera uno fuerte y lo persiste en .env."""
    current = (os.getenv("SECURITY_SECRET") or settings.security_secret or "").strip()
    if current and current != DEFAULT_INSECURE_SECRET:
        return False
    new_secret = secrets.token_urlsafe(48)
    _write_env_value("SECURITY_SECRET", new_secret)
    os.environ["SECURITY_SECRET"] = new_secret
    try:
        settings.security_secret = new_secret
    except Exception:
        pass
    return True
