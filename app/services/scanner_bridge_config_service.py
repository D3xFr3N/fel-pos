from __future__ import annotations

import re
import socket

from app.config import settings
from app.data_paths import ENV_FILE_NAME, get_runtime_root
from app.services.scanner_bridge_service import (
    is_scanner_bridge_running,
    restart_scanner_bridge,
    start_scanner_bridge,
    stop_scanner_bridge,
)

SCANNER_BRIDGE_ENV_KEYS = {
    "enabled": "SCANNER_BRIDGE_ENABLED",
    "host": "SCANNER_BRIDGE_HOST",
    "port": "SCANNER_BRIDGE_PORT",
    "api_base": "SCANNER_BRIDGE_API_BASE",
    "username": "SCANNER_BRIDGE_USERNAME",
    "password": "SCANNER_BRIDGE_PASSWORD",
    "com_port": "SCANNER_BRIDGE_COM_PORT",
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


def _detect_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def _apply_runtime(
    *,
    enabled: bool,
    host: str,
    port: int,
    api_base: str,
    username: str,
    password: str,
    com_port: str,
) -> None:
    settings.scanner_bridge_enabled = enabled
    settings.scanner_bridge_host = host
    settings.scanner_bridge_port = port
    settings.scanner_bridge_api_base = api_base
    settings.scanner_bridge_username = username
    settings.scanner_bridge_password = password
    settings.scanner_bridge_com_port = com_port


def get_scanner_bridge_config() -> dict:
    lan_ip = _detect_lan_ip()
    port = int(settings.scanner_bridge_port or 18765)
    running = is_scanner_bridge_running()
    return {
        "enabled": bool(settings.scanner_bridge_enabled),
        "running": running,
        "host": settings.scanner_bridge_host or "0.0.0.0",
        "port": port,
        "api_base": settings.scanner_bridge_api_base or "http://127.0.0.1:8000",
        "username": settings.scanner_bridge_username or "admin",
        "password_configured": bool((settings.scanner_bridge_password or "").strip()),
        "com_port": settings.scanner_bridge_com_port or "",
        "listen_address": f"{lan_ip}:{port}",
        "mobile_url_hint": f"http://{lan_ip}:8000/mobile",
    }


def update_scanner_bridge_config(
    *,
    enabled: bool,
    port: int,
    username: str,
    password: str,
    com_port: str,
) -> dict:
    host = (settings.scanner_bridge_host or "0.0.0.0").strip() or "0.0.0.0"
    api_base = (settings.scanner_bridge_api_base or "http://127.0.0.1:8000").strip() or "http://127.0.0.1:8000"
    user = (username or settings.scanner_bridge_username or "admin").strip() or "admin"
    secret = password.strip()
    if not secret:
        secret = (settings.scanner_bridge_password or "").strip()
    serial_port = (com_port or "").strip().upper()

    _apply_runtime(
        enabled=enabled,
        host=host,
        port=port,
        api_base=api_base,
        username=user,
        password=secret,
        com_port=serial_port,
    )
    _write_env_values(
        {
            SCANNER_BRIDGE_ENV_KEYS["enabled"]: "true" if enabled else "false",
            SCANNER_BRIDGE_ENV_KEYS["host"]: host,
            SCANNER_BRIDGE_ENV_KEYS["port"]: str(port),
            SCANNER_BRIDGE_ENV_KEYS["api_base"]: api_base,
            SCANNER_BRIDGE_ENV_KEYS["username"]: user,
            SCANNER_BRIDGE_ENV_KEYS["password"]: secret,
            SCANNER_BRIDGE_ENV_KEYS["com_port"]: serial_port,
        }
    )

    if enabled:
        restart_scanner_bridge()
    else:
        stop_scanner_bridge()
    return get_scanner_bridge_config()


def toggle_scanner_bridge() -> dict:
    return update_scanner_bridge_config(
        enabled=not bool(settings.scanner_bridge_enabled),
        port=int(settings.scanner_bridge_port or 18765),
        username=settings.scanner_bridge_username or "admin",
        password="",
        com_port=settings.scanner_bridge_com_port or "",
    )
