#!/usr/bin/env python3
"""Genera y firma licencias FEL POS (Ed25519). Solo el desarrollador usa la clave privada."""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parent.parent
PRIVATE_KEY_PATH = ROOT / "licenses" / "license_signing_private.pem"
PUBLIC_KEY_PATH = ROOT / "app" / "license_public.pem"
LICENSE_PREFIX = "FELPOS-v1."


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _load_private_key() -> Ed25519PrivateKey:
    if not PRIVATE_KEY_PATH.exists():
        raise FileNotFoundError(
            f"No existe la clave privada en {PRIVATE_KEY_PATH}. "
            "Ejecuta: python scripts/license_signing.py ensure-keypair"
        )
    pem = PRIVATE_KEY_PATH.read_bytes()
    return serialization.load_pem_private_key(pem, password=None)


def ensure_keypair() -> None:
    PRIVATE_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_KEY_PATH.parent.mkdir(parents=True, exist_ok=True)

    if PRIVATE_KEY_PATH.exists() and PUBLIC_KEY_PATH.exists():
        print(f"Claves existentes: {PUBLIC_KEY_PATH}")
        return

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    PRIVATE_KEY_PATH.write_bytes(
        private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    PUBLIC_KEY_PATH.write_bytes(
        public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    print(f"Clave privada: {PRIVATE_KEY_PATH}")
    print(f"Clave publica: {PUBLIC_KEY_PATH}")


def sign_license(
    *,
    store_id: str,
    store_label: str,
    issued_at: str,
    status: str = "active",
) -> str:
    payload = {
        "i": store_id.strip().upper(),
        "n": store_label.strip(),
        "d": issued_at.strip(),
        "s": status.strip().lower() or "active",
    }
    payload_bytes = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    signature = _load_private_key().sign(payload_bytes)
    return f"{LICENSE_PREFIX}{_b64url_encode(payload_bytes)}.{_b64url_encode(signature)}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Firma licencias FEL POS")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("ensure-keypair", help="Crea el par de claves si no existe")

    sign_parser = sub.add_parser("sign", help="Firma una licencia para una tienda")
    sign_parser.add_argument("--store-id", required=True)
    sign_parser.add_argument("--store-label", required=True)
    sign_parser.add_argument("--issued-at", required=True)
    sign_parser.add_argument("--status", default="active")

    args = parser.parse_args()

    try:
        if args.command == "ensure-keypair":
            ensure_keypair()
            return 0
        if args.command == "sign":
            print(
                sign_license(
                    store_id=args.store_id,
                    store_label=args.store_label,
                    issued_at=args.issued_at,
                    status=args.status,
                )
            )
            return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
