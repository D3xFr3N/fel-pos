from __future__ import annotations

import re

from app.config import settings
from app.data_paths import ENV_FILE_NAME, get_runtime_root

NOTIFICATION_ENV_KEYS = {
    "gmail_sender": "GMAIL_SENDER",
    "gmail_app_password": "GMAIL_APP_PASSWORD",
    "gmail_smtp_host": "GMAIL_SMTP_HOST",
    "gmail_smtp_port": "GMAIL_SMTP_PORT",
    "whatsapp_phone_id": "WHATSAPP_PHONE_ID",
    "whatsapp_token": "WHATSAPP_TOKEN",
    "whatsapp_api_url": "WHATSAPP_API_URL",
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


def _apply_runtime(
    *,
    gmail_sender: str,
    gmail_app_password: str,
    gmail_smtp_host: str,
    gmail_smtp_port: int,
    whatsapp_phone_id: str,
    whatsapp_token: str,
    whatsapp_api_url: str,
) -> None:
    settings.gmail_sender = gmail_sender
    settings.gmail_app_password = gmail_app_password
    settings.gmail_smtp_host = gmail_smtp_host
    settings.gmail_smtp_port = gmail_smtp_port
    settings.whatsapp_phone_id = whatsapp_phone_id
    settings.whatsapp_token = whatsapp_token
    settings.whatsapp_api_url = whatsapp_api_url


def get_notification_config() -> dict:
    gmail_ready = bool((settings.gmail_sender or "").strip() and (settings.gmail_app_password or "").strip())
    whatsapp_ready = bool((settings.whatsapp_phone_id or "").strip() and (settings.whatsapp_token or "").strip())
    return {
        "gmail_sender": settings.gmail_sender or "",
        "gmail_app_password_configured": bool((settings.gmail_app_password or "").strip()),
        "gmail_smtp_host": settings.gmail_smtp_host or "smtp.gmail.com",
        "gmail_smtp_port": int(settings.gmail_smtp_port or 587),
        "whatsapp_phone_id": settings.whatsapp_phone_id or "",
        "whatsapp_token_configured": bool((settings.whatsapp_token or "").strip()),
        "whatsapp_api_url": settings.whatsapp_api_url or "https://graph.facebook.com/v20.0",
        "gmail_ready": gmail_ready,
        "whatsapp_ready": whatsapp_ready,
    }


def update_notification_config(
    *,
    gmail_sender: str,
    gmail_app_password: str,
    gmail_smtp_host: str,
    gmail_smtp_port: int,
    whatsapp_phone_id: str,
    whatsapp_token: str,
    whatsapp_api_url: str,
) -> dict:
    sender = gmail_sender.strip()
    password = gmail_app_password.strip()
    if not password:
        password = (settings.gmail_app_password or "").strip()

    phone_id = whatsapp_phone_id.strip()
    token = whatsapp_token.strip()
    if not token:
        token = (settings.whatsapp_token or "").strip()

    smtp_host = (gmail_smtp_host or "smtp.gmail.com").strip() or "smtp.gmail.com"
    api_url = (whatsapp_api_url or "https://graph.facebook.com/v20.0").strip() or "https://graph.facebook.com/v20.0"

    _apply_runtime(
        gmail_sender=sender,
        gmail_app_password=password,
        gmail_smtp_host=smtp_host,
        gmail_smtp_port=gmail_smtp_port,
        whatsapp_phone_id=phone_id,
        whatsapp_token=token,
        whatsapp_api_url=api_url,
    )
    _write_env_values(
        {
            NOTIFICATION_ENV_KEYS["gmail_sender"]: sender,
            NOTIFICATION_ENV_KEYS["gmail_app_password"]: password,
            NOTIFICATION_ENV_KEYS["gmail_smtp_host"]: smtp_host,
            NOTIFICATION_ENV_KEYS["gmail_smtp_port"]: str(gmail_smtp_port),
            NOTIFICATION_ENV_KEYS["whatsapp_phone_id"]: phone_id,
            NOTIFICATION_ENV_KEYS["whatsapp_token"]: token,
            NOTIFICATION_ENV_KEYS["whatsapp_api_url"]: api_url,
        }
    )
    return get_notification_config()
