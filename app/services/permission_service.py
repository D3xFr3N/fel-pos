from __future__ import annotations

import json
from typing import Any

from app.models import User

# Permisos asignables a cajeros (admin tiene todos implicitamente).
CASHIER_PERMISSION_CATALOG: list[dict[str, str]] = [
    {"key": "sales.returns", "label": "Hacer devoluciones", "group": "Ventas"},
    {"key": "sales.view_all", "label": "Ver ventas de todos los cajeros", "group": "Ventas"},
    {"key": "products.view", "label": "Ver catalogo de productos", "group": "Productos"},
    {"key": "products.edit", "label": "Crear y editar productos", "group": "Productos"},
    {"key": "products.view_cost", "label": "Ver costo de productos", "group": "Productos"},
    {"key": "stock.entry", "label": "Entrada de inventario", "group": "Inventario"},
    {"key": "inventory.view", "label": "Ver panel de inventario", "group": "Inventario"},
    {"key": "stock.count", "label": "Conteo de inventario", "group": "Inventario"},
    {"key": "customers.manage", "label": "Gestionar clientes", "group": "Catalogo"},
    {"key": "suppliers.manage", "label": "Gestionar proveedores", "group": "Catalogo"},
    {"key": "departments.manage", "label": "Gestionar departamentos", "group": "Catalogo"},
    {"key": "purchases.manage", "label": "Compras / ordenes de compra", "group": "Catalogo"},
    {"key": "promotions.manage", "label": "Gestionar promociones", "group": "Catalogo"},
    {"key": "orders.manage", "label": "Gestionar ordenes", "group": "Catalogo"},
    {"key": "reports.view", "label": "Ver reportes", "group": "Reportes"},
    {"key": "cash.view_others", "label": "Ver fondos de otros cajeros", "group": "Caja"},
]

ALL_PERMISSION_KEYS: frozenset[str] = frozenset(item["key"] for item in CASHIER_PERMISSION_CATALOG)

# Comportamiento anterior al sistema de permisos: cajero podia devolver.
DEFAULT_CASHIER_PERMISSIONS: list[str] = ["sales.returns"]

# Pestaña UI desbloqueada por permiso (OR si hay varios)
TAB_PERMISSION_MAP: dict[str, str | tuple[str, ...]] = {
    "products": "products.view",
    "departments": "departments.manage",
    "suppliers": "suppliers.manage",
    "purchases": "purchases.manage",
    "inventory": ("inventory.view", "stock.entry"),
    "stock-count": "stock.count",
    "reports": "reports.view",
    "customers": "customers.manage",
    "promotions": "promotions.manage",
    "orders": "orders.manage",
}


def parse_permissions(raw: Any) -> list[str]:
    if raw is None:
        return list(DEFAULT_CASHIER_PERMISSIONS)
    if isinstance(raw, list):
        values = raw
    elif isinstance(raw, str):
        text = raw.strip()
        if not text:
            return list(DEFAULT_CASHIER_PERMISSIONS)
        try:
            values = json.loads(text)
        except json.JSONDecodeError:
            return list(DEFAULT_CASHIER_PERMISSIONS)
    else:
        return []

    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in values:
        key = str(item or "").strip()
        if key in ALL_PERMISSION_KEYS and key not in seen:
            cleaned.append(key)
            seen.add(key)
    return cleaned


def serialize_permissions(permissions: list[str] | None) -> str:
    return json.dumps(parse_permissions(permissions or []), ensure_ascii=False)


def user_permissions(user: User | None) -> list[str]:
    if user is None:
        return []
    if user.role == "admin":
        return sorted(ALL_PERMISSION_KEYS)
    return parse_permissions(getattr(user, "permissions", None))


def user_has_permission(user: User | None, permission: str) -> bool:
    if user is None:
        return False
    if user.role == "admin":
        return True
    return permission in parse_permissions(getattr(user, "permissions", None))


def user_has_any_permission(user: User | None, *permissions: str) -> bool:
    return any(user_has_permission(user, key) for key in permissions)
