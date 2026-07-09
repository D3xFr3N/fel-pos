from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.config import settings
from app.services.nit_service import normalize_nit


@dataclass
class CustomerLookupResult:
    nit: str
    name: str
    email: str | None = None
    address: str | None = None


def _extract_name(payload: dict) -> str | None:
    for key in ("name", "nombre", "razon_social", "business_name"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _extract_email(payload: dict) -> str | None:
    for key in ("email", "correo", "correo_electronico"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _extract_address(payload: dict) -> str | None:
    for key in ("address", "direccion", "domicilio"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def lookup_customer_by_nit(nit: str) -> CustomerLookupResult | None:
    cleaned_nit = normalize_nit(nit)
    if not cleaned_nit or cleaned_nit == "CF":
        return None
    if not settings.nit_lookup_url:
        return None

    base_url = settings.nit_lookup_url.rstrip("/")
    url = f"{base_url}/{cleaned_nit}"
    headers: dict[str, str] = {}
    if settings.nit_lookup_token:
        headers["Authorization"] = f"Bearer {settings.nit_lookup_token}"

    response = httpx.get(url, headers=headers, timeout=float(settings.nit_lookup_timeout_seconds))
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        return None

    # Support providers that return wrapped records.
    if isinstance(payload.get("data"), dict):
        payload = payload["data"]
    elif isinstance(payload.get("result"), dict):
        payload = payload["result"]

    name = _extract_name(payload)
    if not name:
        return None

    result_nit = payload.get("nit")
    if not isinstance(result_nit, str) or not result_nit.strip():
        result_nit = cleaned_nit

    return CustomerLookupResult(
        nit=normalize_nit(result_nit),
        name=name,
        email=_extract_email(payload),
        address=_extract_address(payload),
    )
