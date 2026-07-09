from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import datetime

import httpx


@dataclass
class TestContext:
    base_url: str
    token: str = ""
    stock_count_session_id: int | None = None
    product_id: int | None = None
    department_id: int | None = None
    department_name: str = ""
    product_sku: str = ""
    system_quantity_before: float = 0.0
    apply_target_quantity: float = 0.0


def _step(message: str) -> None:
    print(f"[STEP] {message}")


def _ok(message: str) -> None:
    print(f"[OK]   {message}")


def _fail(message: str) -> None:
    print(f"[FAIL] {message}")


def _almost_equal(left: float, right: float, tolerance: float = 0.02) -> bool:
    return abs(float(left) - float(right)) <= tolerance


def request_json(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    token: str = "",
    payload: dict | None = None,
) -> dict | list | None:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    response = client.request(method, url, headers=headers, json=payload)
    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise RuntimeError(f"{method} {url} => {response.status_code} | {detail}")

    if "application/json" in (response.headers.get("content-type") or ""):
        return response.json()
    return None


def login_admin(client: httpx.Client, ctx: TestContext, username: str, password: str) -> None:
    _step("Login admin")
    result = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/auth/login",
        payload={"username": username, "password": password},
    )
    if not isinstance(result, dict) or not result.get("access_token"):
        raise RuntimeError("No se recibio access_token al hacer login.")
    ctx.token = str(result["access_token"])
    _ok("Token recibido")


def ensure_product(client: httpx.Client, ctx: TestContext) -> None:
    _step("Seleccionar producto y departamento para conteo")
    products = request_json(client, "GET", f"{ctx.base_url}/api/products", token=ctx.token)
    if not isinstance(products, list) or not products:
        raise RuntimeError("No hay productos para ejecutar la prueba de conteo.")

    product = next((item for item in products if item.get("department_id")), None)
    if not product:
        departments = request_json(client, "GET", f"{ctx.base_url}/api/departments", token=ctx.token)
        if not isinstance(departments, list) or not departments:
            raise RuntimeError("No hay departamentos disponibles para crear orden de conteo.")
        first_department = departments[0]
        fallback_product = products[0]
        updated = request_json(
            client,
            "PUT",
            f"{ctx.base_url}/api/products/{int(fallback_product['id'])}",
            token=ctx.token,
            payload={"department_id": int(first_department["id"])},
        )
        if not isinstance(updated, dict):
            raise RuntimeError("No se pudo asignar departamento al producto para la prueba.")
        product = updated

    ctx.product_id = int(product["id"])
    ctx.department_id = int(product["department_id"])
    ctx.department_name = str(product.get("department_name") or "")
    ctx.product_sku = str(product.get("sku") or "").strip()
    ctx.system_quantity_before = float(product.get("stock", 0.0))
    if not ctx.product_sku or not ctx.department_id:
        raise RuntimeError("Producto sin SKU, no se puede probar escaneo.")

    _ok(
        f"Producto #{ctx.product_id} SKU {ctx.product_sku} ({ctx.department_name or 'departamento'}) "
        f"con stock sistema {ctx.system_quantity_before:.2f}"
    )


def create_stock_count_session(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.department_id:
        raise RuntimeError("No hay departamento para crear orden de conteo.")
    _step("Crear sesion de conteo")
    order_code = f"SMK-{ctx.department_id}-{ctx.product_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    created = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/stock-count/sessions",
        token=ctx.token,
        payload={
            "order_code": order_code,
            "department_id": ctx.department_id,
            "notes": "Sesion creada por smoke_test_inventory_count.py",
        },
    )
    if not isinstance(created, dict) or "id" not in created:
        raise RuntimeError("No se pudo crear sesion de conteo.")
    ctx.stock_count_session_id = int(created["id"])
    _ok(f"Sesion de conteo creada #{ctx.stock_count_session_id}")


def _pick_apply_target(system_quantity: float) -> float:
    if system_quantity > 1:
        return round(system_quantity - 1, 2)
    if system_quantity > 0:
        return max(round(system_quantity / 2, 2), 0.01)
    return 1.0


def _extract_line(session_data: dict, product_id: int) -> dict:
    items = session_data.get("items") or []
    for line in items:
        if int(line.get("product_id", 0)) == product_id:
            return line
    raise RuntimeError("No se encontro la linea del producto dentro de la sesion de conteo.")


def scan_and_validate_difference(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.stock_count_session_id or not ctx.product_id or not ctx.product_sku:
        raise RuntimeError("Contexto incompleto para escaneo.")

    ctx.apply_target_quantity = _pick_apply_target(ctx.system_quantity_before)
    _step("Escanear SKU con cantidad fisica para generar diferencia")
    session = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/stock-count/sessions/{ctx.stock_count_session_id}/scan",
        token=ctx.token,
        payload={
            "sku": ctx.product_sku,
            "counted_quantity": ctx.apply_target_quantity,
            "replace_quantity": False,
        },
    )
    if not isinstance(session, dict):
        raise RuntimeError("Respuesta invalida al escanear producto.")

    line = _extract_line(session, ctx.product_id)
    counted_quantity = float(line.get("counted_quantity", 0))
    difference_quantity = float(line.get("difference_quantity", 0))
    expected_difference = round(ctx.apply_target_quantity - ctx.system_quantity_before, 2)

    if not _almost_equal(counted_quantity, ctx.apply_target_quantity):
        raise RuntimeError(
            f"La cantidad contada no coincide. Esperado {ctx.apply_target_quantity}, obtenido {counted_quantity}."
        )
    if not _almost_equal(difference_quantity, expected_difference):
        raise RuntimeError(
            f"Diferencia incorrecta. Esperado {expected_difference}, obtenido {difference_quantity}."
        )
    _ok(
        f"Escaneo correcto. Fisico {counted_quantity:.2f}, sistema {ctx.system_quantity_before:.2f}, "
        f"diferencia {difference_quantity:.2f}"
    )


def edit_quantity_and_validate(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.stock_count_session_id or not ctx.product_id:
        raise RuntimeError("Contexto incompleto para edicion de cantidad.")

    _step("Editar cantidad fisica para probar actualizacion manual")
    updated = request_json(
        client,
        "PUT",
        f"{ctx.base_url}/api/stock-count/sessions/{ctx.stock_count_session_id}/items/{ctx.product_id}",
        token=ctx.token,
        payload={"counted_quantity": ctx.system_quantity_before},
    )
    if not isinstance(updated, dict):
        raise RuntimeError("Respuesta invalida al actualizar cantidad del conteo.")

    line = _extract_line(updated, ctx.product_id)
    difference_quantity = float(line.get("difference_quantity", 0))
    if not _almost_equal(difference_quantity, 0.0):
        raise RuntimeError(f"Se esperaba diferencia 0 al igualar cantidad; obtenido {difference_quantity}.")
    _ok("Actualizacion manual valida (diferencia en 0)")

    _step("Restaurar diferencia para validar aplicacion de ajuste")
    restored = request_json(
        client,
        "PUT",
        f"{ctx.base_url}/api/stock-count/sessions/{ctx.stock_count_session_id}/items/{ctx.product_id}",
        token=ctx.token,
        payload={"counted_quantity": ctx.apply_target_quantity},
    )
    if not isinstance(restored, dict):
        raise RuntimeError("Respuesta invalida al restaurar cantidad del conteo.")
    restored_line = _extract_line(restored, ctx.product_id)
    restored_diff = float(restored_line.get("difference_quantity", 0))
    expected_diff = round(ctx.apply_target_quantity - ctx.system_quantity_before, 2)
    if not _almost_equal(restored_diff, expected_diff):
        raise RuntimeError(
            f"No se restauro la diferencia esperada. Esperado {expected_diff}, obtenido {restored_diff}."
        )
    _ok("Diferencia restaurada para aplicar ajuste")


def apply_and_validate_stock(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.stock_count_session_id or not ctx.product_id:
        raise RuntimeError("Contexto incompleto para aplicar sesion.")

    _step("Aplicar sesion de conteo")
    applied = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/stock-count/sessions/{ctx.stock_count_session_id}/apply",
        token=ctx.token,
    )
    if not isinstance(applied, dict) or applied.get("status") != "applied":
        raise RuntimeError("La sesion no quedo en estado applied.")
    _ok(f"Sesion #{ctx.stock_count_session_id} aplicada")

    _step("Validar que el stock del producto se actualizo")
    products = request_json(client, "GET", f"{ctx.base_url}/api/products", token=ctx.token)
    if not isinstance(products, list):
        raise RuntimeError("No se pudo leer inventario tras aplicar conteo.")
    product = next((p for p in products if int(p.get("id", 0)) == ctx.product_id), None)
    if not product:
        raise RuntimeError("No se encontro el producto evaluado tras aplicar conteo.")
    stock_after = float(product.get("stock", 0))
    if not _almost_equal(stock_after, ctx.apply_target_quantity):
        raise RuntimeError(
            f"Stock no coincide tras aplicar ajuste. Esperado {ctx.apply_target_quantity}, obtenido {stock_after}."
        )
    _ok(f"Stock actualizado correctamente a {stock_after:.2f}")


def run(base_url: str, username: str, password: str) -> int:
    ctx = TestContext(base_url=base_url.rstrip("/"))
    with httpx.Client(timeout=httpx.Timeout(20.0)) as client:
        try:
            login_admin(client, ctx, username, password)
            ensure_product(client, ctx)
            create_stock_count_session(client, ctx)
            scan_and_validate_difference(client, ctx)
            edit_quantity_and_validate(client, ctx)
            apply_and_validate_stock(client, ctx)
            print("\nRESULT: SMOKE TEST INVENTORY COUNT COMPLETADO")
            return 0
        except Exception as exc:
            _fail(str(exc))
            print("\nRESULT: SMOKE TEST INVENTORY COUNT FALLIDO")
            return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test de conteo fisico de inventario")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="URL base del backend")
    parser.add_argument("--username", default="admin", help="Usuario con permisos")
    parser.add_argument("--password", default="admin123", help="Password del usuario")
    args = parser.parse_args()
    return run(args.base_url, args.username, args.password)


if __name__ == "__main__":
    sys.exit(main())
