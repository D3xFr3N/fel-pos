#!/usr/bin/env python3
"""Reemite licencias firmadas para todas las tiendas activas del registro privado."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGISTRY_PATH = ROOT / "licenses" / "private-registry.json"
ACTIVATIONS_DIR = ROOT / "licenses" / "activaciones"
MANIFEST_URL = "https://D3xFr3N.github.io/fel-pos/latest.json"

import sys

sys.path.insert(0, str(ROOT))
from scripts.license_signing import sign_license  # noqa: E402


def build_letter(entry: dict) -> str:
    contact_block = ""
    if entry.get("contact"):
        contact_block = f"\nContacto registrado: {entry['contact']}"
    return f"""FEL POS - Activacion de tienda
==============================
ID tienda: {entry['store_id']}
Nombre: {entry['store_label']}
Fecha: {entry['issued_at']}{contact_block}

Clave de licencia (solo para esta tienda):
{entry['license_key']}

Pasos en la tienda:
1. Abrir FEL POS como administrador
2. Ir a Configuracion -> Licencia de tienda
3. Pegar la clave y pulsar Guardar licencia
4. En Actualizaciones automaticas, pulsar Buscar actualizaciones

Tambien puedes agregar en el archivo .env de la carpeta de instalacion:
STORE_LICENSE_KEY={entry['license_key']}
UPDATE_MANIFEST_URL={MANIFEST_URL}
LICENSE_REQUIRED_FOR_UPDATES=true

La licencia se valida localmente (firmada). No se publica ningun registro en GitHub.
No compartas esta clave con otras tiendas.
Si cambias de PC, solicita reactivacion con el mismo ID de tienda.
"""


def main() -> int:
    if not REGISTRY_PATH.exists():
        print(f"No existe {REGISTRY_PATH}", file=sys.stderr)
        return 1

    registry = json.loads(REGISTRY_PATH.read_text(encoding="utf-8-sig"))
    entries = registry.get("entries") or []
    auto_id = 1
    today = date.today().isoformat()
    ACTIVATIONS_DIR.mkdir(parents=True, exist_ok=True)
    reissued = 0

    for entry in entries:
        if str(entry.get("status") or "active").lower() == "revoked":
            continue

        store_id = str(entry.get("store_id") or "").strip()
        if not store_id:
            store_id = f"T{auto_id:03d}"
            auto_id += 1
            entry["store_id"] = store_id

        store_label = str(entry.get("store_label") or store_id).strip()
        entry["license_key"] = sign_license(
            store_id=store_id,
            store_label=store_label,
            issued_at=today,
            status="active",
        )
        entry["issued_at"] = today
        entry["reissued_at"] = today
        entry["notes"] = "Migracion licencias firmadas v0.3.25"

        letter_path = ACTIVATIONS_DIR / f"{store_id}_{today.replace('-', '')}_activacion.txt"
        letter_path.write_text(build_letter(entry), encoding="utf-8")
        print(f"OK {store_id} | {store_label} | {letter_path.name}")
        reissued += 1

    registry["version"] = 3
    REGISTRY_PATH.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nReemitidas: {reissued}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
