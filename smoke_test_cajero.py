from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass

import httpx


@dataclass
class TestContext:
    base_url: str
    token: str = ""
    product_id: int | None = None
    sale_id: int | None = None
    cash_session_id: int | None = None


def _step(message: str) -> None:
    print(f"[STEP] {message}")


def _ok(message: str) -> None:
    print(f"[OK]   {message}")


def _fail(message: str) -> None:
    print(f"[FAIL] {message}")


def request(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    token: str = "",
    payload: dict | None = None,
) -> httpx.Response:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return client.request(method, url, headers=headers, json=payload)


def request_json(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    token: str = "",
    payload: dict | None = None,
) -> dict | list | None:
    response = request(client, method, url, token=token, payload=payload)
    if response.status_code >= 400:
        try:
            detail = response.json()
        except Exception:
            detail = response.text
        raise RuntimeError(f"{method} {url} => {response.status_code} | {detail}")

    if "application/json" in (response.headers.get("content-type") or ""):
        return response.json()
    return None


def login_cajero(client: httpx.Client, ctx: TestContext, username: str, password: str) -> None:
    _step("Login cajero")
    result = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/auth/login",
        payload={"username": username, "password": password},
    )
    if not isinstance(result, dict):
        raise RuntimeError("Respuesta invalida en login.")
    token = result.get("access_token")
    user = result.get("user") or {}
    if not token:
        raise RuntimeError("No se recibio access_token.")
    if user.get("role") != "user":
        raise RuntimeError(f"Se esperaba rol user, se recibio: {user.get('role')}")
    ctx.token = str(token)
    _ok("Login correcto con rol user")


def assert_product_creation_forbidden(client: httpx.Client, ctx: TestContext) -> None:
    _step("Validar que cajero no puede crear productos")
    response = request(
        client,
        "POST",
        f"{ctx.base_url}/api/products",
        token=ctx.token,
        payload={
            "sku": "CAJERO-NO-DEBE-CREAR",
            "name": "Producto prohibido para cajero",
            "price": 1.0,
            "cost": 0.5,
            "stock": 1.0,
            "tax_rate": 0.12,
        },
    )
    if response.status_code != 403:
        try:
            body = response.json()
        except Exception:
            body = response.text
        raise RuntimeError(f"Se esperaba 403 y se obtuvo {response.status_code} | {body}")
    _ok("Permisos correctos: cajero recibe 403 al crear producto")


def ensure_cash_open(client: httpx.Client, ctx: TestContext) -> None:
    _step("Verificar caja abierta")
    current = request_json(client, "GET", f"{ctx.base_url}/api/cash/sessions/current", token=ctx.token)
    if isinstance(current, dict) and current.get("id"):
        ctx.cash_session_id = int(current["id"])
        _ok(f"Caja disponible #{ctx.cash_session_id}")
        return

    _step("Abrir caja como cajero")
    opened = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/cash/sessions/open",
        token=ctx.token,
        payload={"opening_amount": 75.0, "notes": "Apertura smoke cajero"},
    )
    if not isinstance(opened, dict) or "id" not in opened:
        raise RuntimeError("No se pudo abrir caja.")
    ctx.cash_session_id = int(opened["id"])
    _ok(f"Caja abierta #{ctx.cash_session_id}")


def ensure_product_exists(client: httpx.Client, ctx: TestContext) -> None:
    _step("Obtener productos para venta")
    products = request_json(client, "GET", f"{ctx.base_url}/api/products", token=ctx.token)
    if not isinstance(products, list) or not products:
        raise RuntimeError("No hay productos para vender. Crea uno con admin y vuelve a correr la prueba.")
    ctx.product_id = int(products[0]["id"])
    _ok(f"Producto usable para venta: #{ctx.product_id}")


def create_sale(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.product_id:
        raise RuntimeError("No hay producto para venta.")
    _step("Registrar venta como cajero")
    sale = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/sales",
        token=ctx.token,
        payload={
            "customer_nit": "CF",
            "customer_name": "CONSUMIDOR FINAL",
            "payment_method": "efectivo",
            "items": [{"product_id": ctx.product_id, "quantity": 1}],
        },
    )
    if not isinstance(sale, dict) or "id" not in sale:
        raise RuntimeError("No se pudo registrar venta.")
    ctx.sale_id = int(sale["id"])
    _ok(f"Venta creada #{ctx.sale_id}")


def close_cash(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.cash_session_id:
        raise RuntimeError("No hay caja para cerrar.")
    _step("Cerrar caja")
    current = request_json(client, "GET", f"{ctx.base_url}/api/cash/sessions/current", token=ctx.token)
    if not isinstance(current, dict):
        _ok("Caja ya estaba cerrada.")
        return
    expected = float(current.get("expected_amount", 0.0))
    closed = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/cash/sessions/{ctx.cash_session_id}/close",
        token=ctx.token,
        payload={"counted_amount": expected, "notes": "Cierre smoke cajero"},
    )
    if not isinstance(closed, dict) or closed.get("status") != "closed":
        raise RuntimeError("No se pudo cerrar caja.")
    _ok(f"Caja cerrada con diferencia {closed.get('difference')}")


def run(base_url: str, username: str, password: str) -> int:
    ctx = TestContext(base_url=base_url.rstrip("/"))
    with httpx.Client(timeout=httpx.Timeout(20.0)) as client:
        try:
            login_cajero(client, ctx, username, password)
            assert_product_creation_forbidden(client, ctx)
            ensure_cash_open(client, ctx)
            ensure_product_exists(client, ctx)
            create_sale(client, ctx)
            close_cash(client, ctx)
            print("\nRESULT: SMOKE TEST CAJERO COMPLETADO")
            return 0
        except Exception as exc:
            _fail(str(exc))
            print("\nRESULT: SMOKE TEST CAJERO FALLIDO")
            return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test de permisos y flujo para rol cajero")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="URL base del backend")
    parser.add_argument("--username", default="cajero", help="Usuario cajero")
    parser.add_argument("--password", default="cajero123", help="Password cajero")
    args = parser.parse_args()
    return run(args.base_url, args.username, args.password)


if __name__ == "__main__":
    sys.exit(main())
