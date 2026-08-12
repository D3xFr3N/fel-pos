from __future__ import annotations

from typing import Any, Literal

BUSINESS_PROFILES: tuple[str, ...] = (
    "abarrotes",
    "farmacia",
    "libreria",
    "ferreteria",
    "restaurante",
    "boutique",
)
DEFAULT_BUSINESS_PROFILE = "abarrotes"

BusinessProfile = Literal[
    "abarrotes",
    "farmacia",
    "libreria",
    "ferreteria",
    "restaurante",
    "boutique",
]

PROFILE_LABELS: dict[str, str] = {
    "abarrotes": "Abarrotes",
    "farmacia": "Farmacia",
    "libreria": "Libreria escolar",
    "ferreteria": "Ferreteria",
    "restaurante": "Restaurante",
    "boutique": "Boutique",
}

# Capacidades por rubro: la UI se habilita segun el perfil elegido.
PROFILE_CAPABILITIES: dict[str, dict[str, Any]] = {
    "abarrotes": {
        "sale_by_weight": True,
        "lots": True,
        "school_packages": False,
        "dining": False,
        "product_extra_fields": False,
        "default_tracks_inventory": True,
        "default_track_expiry": False,
        "show_orders_tab": True,
        "orders_as_apartados": False,
        "qty_unit_label": "kg",
        "weight_prompt": "Cantidad en kg",
    },
    "farmacia": {
        "sale_by_weight": False,
        "lots": True,
        "school_packages": False,
        "dining": False,
        "product_extra_fields": False,
        "pharmacy": True,
        "default_tracks_inventory": True,
        "default_track_expiry": True,
        "force_track_expiry": True,
        "block_expired_lots": True,
        "expiry_alert_days": 60,
        "show_orders_tab": True,
        "orders_as_apartados": False,
        "qty_unit_label": "ud",
        "weight_prompt": "Cantidad",
        "default_cashier_permissions": [
            "sales.returns",
            "products.view",
            "inventory.view",
            "stock.entry",
        ],
    },
    "libreria": {
        "sale_by_weight": False,
        "lots": False,
        "school_packages": True,
        "dining": False,
        "product_extra_fields": True,
        "default_tracks_inventory": True,
        "default_track_expiry": False,
        "show_orders_tab": True,
        "orders_as_apartados": True,
        "qty_unit_label": "ud",
        "weight_prompt": "Cantidad",
    },
    "ferreteria": {
        "sale_by_weight": True,
        "lots": False,
        "school_packages": False,
        "dining": False,
        "product_extra_fields": False,
        "default_tracks_inventory": True,
        "default_track_expiry": False,
        "show_orders_tab": True,
        "orders_as_apartados": False,
        "qty_unit_label": "kg/m",
        "weight_prompt": "Cantidad (kg, m o unidad)",
    },
    "restaurante": {
        "sale_by_weight": False,
        "lots": False,
        "school_packages": False,
        "dining": True,
        "product_extra_fields": False,
        "default_tracks_inventory": False,
        "default_track_expiry": False,
        "show_orders_tab": False,
        "orders_as_apartados": False,
        "qty_unit_label": "ud",
        "weight_prompt": "Cantidad",
    },
    "boutique": {
        "sale_by_weight": False,
        "lots": False,
        "school_packages": False,
        "dining": False,
        "product_extra_fields": True,
        "default_tracks_inventory": True,
        "default_track_expiry": False,
        "show_orders_tab": True,
        "orders_as_apartados": True,
        "qty_unit_label": "ud",
        "weight_prompt": "Cantidad",
    },
}


def normalize_business_profile(value: str | None) -> str:
    profile = (value or DEFAULT_BUSINESS_PROFILE).strip().lower()
    if profile in BUSINESS_PROFILES:
        return profile
    return DEFAULT_BUSINESS_PROFILE


def business_profile_label(profile: str) -> str:
    return PROFILE_LABELS.get(normalize_business_profile(profile), PROFILE_LABELS[DEFAULT_BUSINESS_PROFILE])


def profile_capabilities(profile: str | None = None) -> dict[str, Any]:
    key = normalize_business_profile(profile)
    caps = PROFILE_CAPABILITIES.get(key) or PROFILE_CAPABILITIES[DEFAULT_BUSINESS_PROFILE]
    return dict(caps)


def profile_default_cashier_permissions(profile: str | None = None) -> list[str]:
    caps = profile_capabilities(profile)
    defaults = caps.get("default_cashier_permissions")
    if isinstance(defaults, list) and defaults:
        return [str(item) for item in defaults]
    return ["sales.returns"]
