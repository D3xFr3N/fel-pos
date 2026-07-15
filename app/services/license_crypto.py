from __future__ import annotations

import base64
import json
import sys
from dataclasses import dataclass
from pathlib import Path

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

LICENSE_PREFIX = "FELPOS-v1."


@dataclass
class SignedLicenseInfo:
    valid: bool
    store_id: str | None = None
    store_label: str | None = None
    issued_at: str | None = None
    status: str = "unknown"
    message: str = ""


def is_signed_license_key(value: str) -> bool:
    return (value or "").strip().upper().startswith(LICENSE_PREFIX.upper())


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _public_key_path() -> Path:
    candidates: list[Path] = []
    module_root = Path(__file__).resolve().parent.parent
    candidates.append(module_root / "license_public.pem")
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "app" / "license_public.pem")
        candidates.append(Path(meipass) / "license_public.pem")
    for path in candidates:
        if path.exists():
            return path
    return candidates[0]


def _load_public_key() -> Ed25519PublicKey:
    path = _public_key_path()
    if not path.exists():
        raise FileNotFoundError(f"No se encontro la clave publica de licencias: {path}")
    pem = path.read_bytes()
    key = serialization.load_pem_public_key(pem)
    if not isinstance(key, Ed25519PublicKey):
        raise TypeError("La clave publica de licencias no es Ed25519.")
    return key


def verify_signed_license(license_key: str) -> SignedLicenseInfo:
    text = (license_key or "").strip()
    if not is_signed_license_key(text):
        return SignedLicenseInfo(valid=False, message="Formato de licencia firmada invalido.")

    body = text[len(LICENSE_PREFIX) :]
    parts = body.split(".")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return SignedLicenseInfo(valid=False, message="Licencia firmada incompleta.")

    try:
        payload_bytes = _b64url_decode(parts[0])
        signature = _b64url_decode(parts[1])
        payload = json.loads(payload_bytes.decode("utf-8"))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return SignedLicenseInfo(valid=False, message="Licencia firmada corrupta.")

    if not isinstance(payload, dict):
        return SignedLicenseInfo(valid=False, message="Contenido de licencia invalido.")

    try:
        _load_public_key().verify(signature, payload_bytes)
    except InvalidSignature:
        return SignedLicenseInfo(valid=False, message="Firma de licencia invalida.")
    except OSError as exc:
        return SignedLicenseInfo(valid=False, message=f"No se pudo cargar clave publica: {exc}")

    store_id = str(payload.get("i") or "").strip().upper() or None
    store_label = str(payload.get("n") or "").strip() or None
    issued_at = str(payload.get("d") or "").strip() or None
    status = str(payload.get("s") or "active").strip().lower() or "active"

    if not store_id:
        return SignedLicenseInfo(valid=False, message="Licencia sin ID de tienda.")

    if status != "active":
        return SignedLicenseInfo(
            valid=False,
            store_id=store_id,
            store_label=store_label,
            issued_at=issued_at,
            status=status,
            message=f"Licencia {status}.",
        )

    return SignedLicenseInfo(
        valid=True,
        store_id=store_id,
        store_label=store_label,
        issued_at=issued_at,
        status=status,
        message="Licencia firmada valida.",
    )
