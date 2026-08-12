from __future__ import annotations

import re

from app.config import settings
from app.data_paths import ENV_FILE_NAME, get_runtime_root

DEFAULT_PRIMARY_COLOR = "#00a884"
UI_THEME_ENV_KEY = "UI_PRIMARY_COLOR"
DEFAULT_BACKGROUND_THEME = "oscuro"
UI_BACKGROUND_ENV_KEY = "UI_BACKGROUND_THEME"

COLOR_PRESETS = [
    {"id": "verde", "label": "Verde", "color": "#00a884"},
    {"id": "azul", "label": "Azul", "color": "#3b82f6"},
    {"id": "rojo", "label": "Rojo", "color": "#e5534b"},
    {"id": "naranja", "label": "Naranja", "color": "#f59e0b"},
    {"id": "morado", "label": "Morado", "color": "#8b5cf6"},
    {"id": "rosa", "label": "Rosa", "color": "#ec4899"},
    {"id": "cian", "label": "Cian", "color": "#06b6d4"},
    {"id": "lima", "label": "Lima", "color": "#84cc16"},
]

BACKGROUND_PRESETS = [
    {"id": "oscuro", "label": "Oscuro", "color": "#0f1419"},
    {"id": "claro", "label": "Claro", "color": "#e8edf3"},
    {"id": "azul", "label": "Azul", "color": "#101c2c"},
    {"id": "gris", "label": "Gris", "color": "#25282d"},
    {"id": "crema", "label": "Crema", "color": "#ebe1cf"},
]
BACKGROUND_THEME_IDS = {item["id"] for item in BACKGROUND_PRESETS}


def _upsert_env_value(content: str, env_key: str, value: str) -> str:
    line = f"{env_key}={value}"
    pattern = rf"(?m)^{re.escape(env_key)}=.*$"
    if re.search(pattern, content):
        return re.sub(pattern, line, content, count=1)
    if content and not content.endswith("\n"):
        content += "\n"
    return content + line + "\n"


def normalize_hex_color(value: str | None) -> str:
    raw = (value or "").strip()
    if not raw:
        return DEFAULT_PRIMARY_COLOR
    if not raw.startswith("#"):
        raw = f"#{raw}"
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", raw):
        raise ValueError("Color invalido. Usa formato #RRGGBB (ejemplo: #00a884).")
    return raw.lower()


def hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    color = normalize_hex_color(hex_color)
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def darken_hex(hex_color: str, factor: float = 0.82) -> str:
    r, g, b = hex_to_rgb(hex_color)
    return f"#{max(0, min(255, int(r * factor))):02x}{max(0, min(255, int(g * factor))):02x}{max(0, min(255, int(b * factor))):02x}"


def normalize_background_theme(value: str | None) -> str:
    theme = (value or DEFAULT_BACKGROUND_THEME).strip().lower()
    return theme if theme in BACKGROUND_THEME_IDS else DEFAULT_BACKGROUND_THEME


def get_ui_theme_config() -> dict:
    try:
        primary = normalize_hex_color(getattr(settings, "ui_primary_color", DEFAULT_PRIMARY_COLOR))
    except ValueError:
        primary = DEFAULT_PRIMARY_COLOR
    background_theme = normalize_background_theme(
        getattr(settings, "ui_background_theme", DEFAULT_BACKGROUND_THEME)
    )
    r, g, b = hex_to_rgb(primary)
    return {
        "primary_color": primary,
        "primary_dark": darken_hex(primary),
        "primary_rgb": f"{r}, {g}, {b}",
        "background_theme": background_theme,
        "presets": COLOR_PRESETS,
        "background_presets": BACKGROUND_PRESETS,
    }


def update_ui_theme_config(*, primary_color: str, background_theme: str = DEFAULT_BACKGROUND_THEME) -> dict:
    primary = normalize_hex_color(primary_color)
    background = normalize_background_theme(background_theme)
    settings.ui_primary_color = primary
    settings.ui_background_theme = background

    env_path = get_runtime_root() / ENV_FILE_NAME
    content = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
    content = _upsert_env_value(content, UI_THEME_ENV_KEY, primary)
    content = _upsert_env_value(content, UI_BACKGROUND_ENV_KEY, background)
    env_path.write_text(content, encoding="utf-8")

    return get_ui_theme_config()
