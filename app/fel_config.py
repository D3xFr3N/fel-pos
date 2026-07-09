from __future__ import annotations

from app.config import settings

FEL_MODES: tuple[str, ...] = ("disabled", "demo", "production")
DEFAULT_FEL_MODE = "demo"

FEL_MODE_LABELS: dict[str, str] = {
    "disabled": "Sin factura contable",
    "demo": "FEL demo (pruebas)",
    "production": "FEL produccion",
}


def normalize_fel_mode(value: str | None) -> str:
    mode = (value or DEFAULT_FEL_MODE).strip().lower()
    if mode in FEL_MODES:
        return mode
    return DEFAULT_FEL_MODE


def is_fel_enabled(mode: str | None = None) -> bool:
    return normalize_fel_mode(mode or settings.fel_mode) != "disabled"


def fel_mode_label(mode: str | None) -> str:
    return FEL_MODE_LABELS.get(normalize_fel_mode(mode), FEL_MODE_LABELS[DEFAULT_FEL_MODE])
