#!/usr/bin/env python3
"""Utilidad ligera para validar licencias durante la instalacion (Inno Setup)."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from pathlib import Path

LICENSE_PREFIX = "FELPOS-v1."


def _project_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


if not getattr(sys, "frozen", False):
    sys.path.insert(0, str(_project_root()))

from app.services.license_crypto import verify_signed_license  # noqa: E402


def normalize_license_key(value: str) -> str:
    text = (value or "").strip()
    if text.upper().startswith(LICENSE_PREFIX.upper()):
        return LICENSE_PREFIX + text[len(LICENSE_PREFIX) :]
    return text.upper()


def extract_license_key_from_text(value: str) -> str:
    text = (value or "").strip().lstrip("\ufeff")
    if not text:
        return ""

    if text.startswith("{"):
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            data = None
        if isinstance(data, dict):
            for key_name in ("license_key", "key", "store_license_key"):
                candidate = str(data.get(key_name) or "").strip()
                if candidate.upper().startswith(LICENSE_PREFIX.upper()):
                    return normalize_license_key(candidate)

    if text.upper().startswith(LICENSE_PREFIX.upper()):
        return normalize_license_key(text)

    for line in text.splitlines():
        candidate = line.strip().strip('"').strip("'")
        upper = candidate.upper()
        if upper.startswith(LICENSE_PREFIX.upper()):
            return normalize_license_key(candidate)
        if "FELPOS-V1." in upper:
            start = upper.find("FELPOS-V1.")
            chunk = candidate[start:].split()[0].strip(",;")
            if chunk.upper().startswith(LICENSE_PREFIX.upper()):
                return normalize_license_key(chunk)

    return ""


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


def main() -> int:
    parser = argparse.ArgumentParser(description="Validacion de licencia para instalador FEL POS")
    parser.add_argument("--write-fingerprint", metavar="PATH", help="Escribe el ID de equipo en un archivo")
    parser.add_argument("--validate-file", metavar="PATH", help="Valida la licencia leida desde un archivo")
    parser.add_argument(
        "--write-extracted",
        metavar="PATH",
        help="Si la validacion es OK, escribe la clave FELPOS-v1 normalizada aqui",
    )
    args = parser.parse_args()

    if args.write_fingerprint:
        Path(args.write_fingerprint).write_text(get_install_fingerprint(), encoding="utf-8")
        return 0

    if args.validate_file:
        path = Path(args.validate_file)
        if not path.exists():
            print("No se encontro el archivo de licencia.", file=sys.stderr)
            return 1
        license_key = extract_license_key_from_text(path.read_text(encoding="utf-8-sig"))
        if not license_key:
            print("No se encontro una llave firmada en el archivo.", file=sys.stderr)
            return 1
        result = verify_signed_license(license_key, machine_fingerprint=get_install_fingerprint())
        if not result.valid:
            print(result.message or "Licencia invalida.", file=sys.stderr)
            return 1
        if args.write_extracted:
            Path(args.write_extracted).write_text(license_key, encoding="utf-8")
        return 0

    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
