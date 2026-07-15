from __future__ import annotations



import hashlib

import json

import platform

import sys

import time

from dataclasses import dataclass

from datetime import datetime, timedelta, timezone

from pathlib import Path

from typing import Any



import httpx



from app.config import settings

from app.data_paths import get_runtime_root

from app.services.license_crypto import LICENSE_PREFIX, is_signed_license_key, verify_signed_license



HTTP_TIMEOUT_SECONDS = 20

LICENSE_CACHE_DAYS = 7

LICENSE_CACHE_FILE = "license_cache.json"





@dataclass

class LicenseValidation:

    configured: bool

    required: bool

    valid: bool

    status: str

    store_label: str | None = None

    store_id: str | None = None

    message: str = ""

    registry_url: str | None = None

    fingerprint: str | None = None

    checked_at: str | None = None

    cached: bool = False





def normalize_license_key(value: str) -> str:

    text = (value or "").strip()

    if is_signed_license_key(text):

        return LICENSE_PREFIX + text[len(LICENSE_PREFIX) :]

    return text.upper()


def hash_license_key(value: str) -> str:

    normalized = normalize_license_key(value)

    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()





def get_install_fingerprint() -> str:

    parts = [platform.node().strip().lower(), platform.machine().strip().lower()]

    if sys.platform.startswith("win"):

        try:

            import winreg



            with winreg.OpenKey(

                winreg.HKEY_LOCAL_MACHINE,

                r"SOFTWARE\Microsoft\Cryptography",

            ) as key:

                machine_guid, _ = winreg.QueryValueEx(key, "MachineGuid")

                parts.append(str(machine_guid).strip().lower())

        except OSError:

            pass

    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()

    return digest[:16].upper()





def get_license_registry_url() -> str:

    return (settings.license_registry_url or "").strip()





def is_license_enforcement_enabled() -> bool:

    return bool(settings.license_required_for_updates)





def _cache_path() -> Path:

    return get_runtime_root() / "data" / LICENSE_CACHE_FILE





def _read_cache() -> dict[str, Any] | None:

    path = _cache_path()

    if not path.exists():

        return None

    try:

        payload = json.loads(path.read_text(encoding="utf-8"))

    except (json.JSONDecodeError, OSError):

        return None

    if not isinstance(payload, dict):

        return None

    return payload





def _write_cache(payload: dict[str, Any]) -> None:

    path = _cache_path()

    path.parent.mkdir(parents=True, exist_ok=True)

    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")





def _cache_is_fresh(payload: dict[str, Any], license_key: str) -> bool:

    if payload.get("key_hash") != hash_license_key(license_key):

        return False

    if not payload.get("valid"):

        return False

    expires_raw = payload.get("expires_at")

    if not expires_raw:

        return False

    try:

        expires_at = datetime.fromisoformat(str(expires_raw))

    except ValueError:

        return False

    if expires_at.tzinfo is None:

        expires_at = expires_at.replace(tzinfo=timezone.utc)

    return datetime.now(timezone.utc) < expires_at





def _fetch_registry(url: str) -> dict[str, Any] | None:

    with httpx.Client(timeout=HTTP_TIMEOUT_SECONDS, follow_redirects=True) as client:

        response = client.get(url)

        if response.status_code == 404:

            return None

        response.raise_for_status()

        payload = response.json()

    if not isinstance(payload, dict):

        raise ValueError("El registro de licencias no es JSON valido.")

    return payload





def _find_registry_entry(registry: dict[str, Any], license_key: str) -> dict[str, Any] | None:

    key_hash = hash_license_key(license_key)

    entries = registry.get("entries") or []

    if not isinstance(entries, list):

        return None

    for entry in entries:

        if not isinstance(entry, dict):

            continue

        if str(entry.get("key_hash") or "").strip().lower() == key_hash:

            return entry

    return None





def _validation_from_signed(license_key: str, *, checked_at: str, fingerprint: str) -> LicenseValidation:

    registry_url = get_license_registry_url() or None

    signed = verify_signed_license(license_key, machine_fingerprint=fingerprint)

    if not signed.valid:

        return LicenseValidation(

            configured=True,

            required=True,

            valid=False,

            status=signed.status,

            store_label=signed.store_label,

            store_id=signed.store_id,

            message=signed.message or "Licencia no valida.",

            registry_url=registry_url,

            fingerprint=fingerprint,

            checked_at=checked_at,

        )



    _write_cache(

        {

            "valid": True,

            "status": "active",

            "key_hash": hash_license_key(license_key),

            "store_label": signed.store_label,

            "store_id": signed.store_id,

            "checked_at": checked_at,

            "expires_at": (datetime.now(timezone.utc) + timedelta(days=LICENSE_CACHE_DAYS)).isoformat(),

        }

    )

    label = signed.store_label or "Tienda"

    if signed.store_id:

        label = f"{signed.store_id} - {label}"

    return LicenseValidation(

        configured=True,

        required=True,

        valid=True,

        status="active",

        store_label=signed.store_label,

        store_id=signed.store_id,

        message=f"Licencia activa ({label}). Validacion local (privada).",

        registry_url=registry_url,

        fingerprint=fingerprint,

        checked_at=checked_at,

    )





def _validation_from_registry(

    license_key: str,

    *,

    registry_url: str,

    checked_at: str,

    fingerprint: str,

    use_cache_on_error: bool,

) -> LicenseValidation:

    try:

        registry = _fetch_registry(registry_url)

        if registry is None:

            return LicenseValidation(

                configured=True,

                required=True,

                valid=False,

                status="registry_missing",

                message="Registro remoto no encontrado. Usa una licencia firmada (FELPOS-v1...).",

                registry_url=registry_url,

                fingerprint=fingerprint,

                checked_at=checked_at,

            )

        entry = _find_registry_entry(registry, license_key)

        if not entry:

            return LicenseValidation(

                configured=True,

                required=True,

                valid=False,

                status="unknown",

                message="Licencia no autorizada. Solicita una licencia firmada al proveedor.",

                registry_url=registry_url,

                fingerprint=fingerprint,

                checked_at=checked_at,

            )



        status = str(entry.get("status") or "active").strip().lower()

        store_label = str(entry.get("store_label") or "").strip() or None

        store_id = str(entry.get("store_id") or "").strip() or None

        if status != "active":

            return LicenseValidation(

                configured=True,

                required=True,

                valid=False,

                status=status,

                store_label=store_label,

                store_id=store_id,

                message=f"Licencia {status}. Contacta al proveedor para reactivarla.",

                registry_url=registry_url,

                fingerprint=fingerprint,

                checked_at=checked_at,

            )



        _write_cache(

            {

                "valid": True,

                "status": "active",

                "key_hash": hash_license_key(license_key),

                "store_label": store_label,

                "store_id": store_id,

                "checked_at": checked_at,

                "expires_at": (datetime.now(timezone.utc) + timedelta(days=LICENSE_CACHE_DAYS)).isoformat(),

            }

        )

        label = store_label or "Tienda"

        if store_id:

            label = f"{store_id} - {label}"

        return LicenseValidation(

            configured=True,

            required=True,

            valid=True,

            status="active",

            store_label=store_label,

            store_id=store_id,

            message=f"Licencia activa ({label}).",

            registry_url=registry_url,

            fingerprint=fingerprint,

            checked_at=checked_at,

        )

    except Exception as exc:

        if use_cache_on_error:

            cached = _read_cache()

            if cached and _cache_is_fresh(cached, license_key):

                return LicenseValidation(

                    configured=True,

                    required=True,

                    valid=True,

                    status=str(cached.get("status") or "active"),

                    store_label=(str(cached.get("store_label")).strip() if cached.get("store_label") else None),

                    store_id=(str(cached.get("store_id")).strip() if cached.get("store_id") else None),

                    message="Licencia valida (cache local; sin conexion al registro).",

                    registry_url=registry_url,

                    fingerprint=fingerprint,

                    checked_at=str(cached.get("checked_at") or checked_at),

                    cached=True,

                )

        return LicenseValidation(

            configured=True,

            required=True,

            valid=False,

            status="error",

            message=f"No se pudo validar la licencia: {exc}",

            registry_url=registry_url,

            fingerprint=fingerprint,

            checked_at=checked_at,

        )





def validate_license(*, use_cache_on_error: bool = True) -> LicenseValidation:

    fingerprint = get_install_fingerprint()

    license_key = normalize_license_key(settings.store_license_key)

    registry_url = get_license_registry_url()

    required = is_license_enforcement_enabled()

    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()



    if not required:

        return LicenseValidation(

            configured=bool(license_key),

            required=False,

            valid=True,

            status="optional",

            store_label=None,

            message="Control de licencias no activo en este servidor de actualizaciones.",

            registry_url=registry_url or None,

            fingerprint=fingerprint,

            checked_at=checked_at,

        )



    if not license_key:

        return LicenseValidation(

            configured=False,

            required=True,

            valid=False,

            status="missing",

            message="Debes configurar STORE_LICENSE_KEY para recibir actualizaciones.",

            registry_url=registry_url or None,

            fingerprint=fingerprint,

            checked_at=checked_at,

        )



    if is_signed_license_key(license_key):

        return _validation_from_signed(license_key, checked_at=checked_at, fingerprint=fingerprint)



    if registry_url:

        return _validation_from_registry(

            license_key,

            registry_url=registry_url,

            checked_at=checked_at,

            fingerprint=fingerprint,

            use_cache_on_error=use_cache_on_error,

        )



    return LicenseValidation(

        configured=True,

        required=True,

        valid=False,

        status="legacy",

        message=(

            "Licencia antigua sin registro publico. "

            "Pide al proveedor una licencia firmada nueva (FELPOS-v1...)."

        ),

        registry_url=None,

        fingerprint=fingerprint,

        checked_at=checked_at,

    )





def assert_license_allows_updates() -> LicenseValidation:

    result = validate_license()

    if result.required and not result.valid:

        raise ValueError(result.message or "Licencia no valida para actualizaciones.")

    return result





def license_status_payload() -> dict[str, Any]:

    result = validate_license()

    return {

        "configured": result.configured,

        "required": result.required,

        "valid": result.valid,

        "status": result.status,

        "store_label": result.store_label,

        "store_id": result.store_id,

        "message": result.message,

        "registry_url": result.registry_url,

        "fingerprint": result.fingerprint,

        "checked_at": result.checked_at,

        "cached": result.cached,

        "license_key_configured": bool(normalize_license_key(settings.store_license_key)),

    }


