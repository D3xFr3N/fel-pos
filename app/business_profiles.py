from __future__ import annotations

from typing import Literal

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


def normalize_business_profile(value: str | None) -> str:
    profile = (value or DEFAULT_BUSINESS_PROFILE).strip().lower()
    if profile in BUSINESS_PROFILES:
        return profile
    return DEFAULT_BUSINESS_PROFILE


def business_profile_label(profile: str) -> str:
    return PROFILE_LABELS.get(normalize_business_profile(profile), PROFILE_LABELS[DEFAULT_BUSINESS_PROFILE])
