from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass

import httpx


@dataclass
class TestContext:
    base_url: str
    token: str = ""
    supplier_id: int | None = None
    product_id: int | None = None
    sale_id: int | None = None
    order_id: int | None = None
    cash_session_id: int | None = None


def _print_step(message: str) -> None:
    print(f"[STEP] {message}")


def _print_ok(message: str) -> None:
    print(f"[OK]   {message}")


def _print_fail(message: str) -> None:
    print(f"[FAIL] {message}")


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
            body = response.json()
        except Exception:
            body = response.text
        raise RuntimeError(f"{method} {url} => {response.status_code} | {body}")

    if "application/json" in (response.headers.get("content-type") or ""):
        return response.json()
    return None


def login(client: httpx.Client, ctx: TestContext, username: str, password: str) -> None:
    _print_step("Login admin")
    data = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/auth/login",
        payload={"username": username, "password": password},
    )
    if not isinstance(data, dict) or "access_token" not in data:
        raise RuntimeError("No se recibio access_token en login.")
    ctx.token = str(data["access_token"])
    _print_ok("Token recibido")


def ensure_cash_open(client: httpx.Client, ctx: TestContext) -> None:
    _print_step("Verificar caja actual")
    data = request_json(client, "GET", f"{ctx.base_url}/api/cash/sessions/current", token=ctx.token)
    if isinstance(data, dict) and data.get("id"):
        ctx.cash_session_id = int(data["id"])
        _print_ok(f"Caja ya abierta #{ctx.cash_session_id}")
        return

    _print_step("Abrir caja")
    created = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/cash/sessions/open",
        token=ctx.token,
        payload={"opening_amount": 100.0, "notes": "Smoke test API"},
    )
    if not isinstance(created, dict) or "id" not in created:
        raise RuntimeError("No se pudo abrir caja.")
    ctx.cash_session_id = int(created["id"])
    _print_ok(f"Caja abierta #{ctx.cash_session_id}")


def ensure_product(client: httpx.Client, ctx: TestContext) -> None:
    _print_step("Obtener productos")
    data = request_json(client, "GET", f"{ctx.base_url}/api/products", token=ctx.token)
    if isinstance(data, list) and data:
        ctx.product_id = int(data[0]["id"])
        _print_ok(f"Producto existente #{ctx.product_id}")
        return

    _print_step("Crear producto demo para prueba")
    if not ctx.supplier_id:
        suppliers = request_json(client, "GET", f"{ctx.base_url}/api/suppliers", token=ctx.token)
        if isinstance(suppliers, list) and suppliers:
            ctx.supplier_id = int(suppliers[0]["id"])
        else:
            supplier = request_json(
                client,
                "POST",
                f"{ctx.base_url}/api/suppliers",
                token=ctx.token,
                payload={
                    "name": "Proveedor Smoke",
                    "email": "proveedor.smoke@example.com",
                    "phone": "50255550999",
                },
            )
            if not isinstance(supplier, dict) or "id" not in supplier:
                raise RuntimeError("No se pudo crear proveedor para prueba.")
            ctx.supplier_id = int(supplier["id"])

    product = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/products",
        token=ctx.token,
        payload={
            "sku": "SMOKE-001",
            "name": "Producto Smoke",
            "supplier_id": ctx.supplier_id,
            "price": 10.0,
            "cost": 5.0,
            "stock": 20.0,
            "tax_rate": 0.12,
        },
    )
    if not isinstance(product, dict) or "id" not in product:
        raise RuntimeError("No se pudo crear producto de prueba.")
    ctx.product_id = int(product["id"])
    _print_ok(f"Producto creado #{ctx.product_id}")


def create_sale(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.product_id:
        raise RuntimeError("No hay producto para vender.")

    _print_step("Registrar venta")
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
        raise RuntimeError("No se pudo crear venta.")
    ctx.sale_id = int(sale["id"])
    fel = sale.get("fel") or {}
    _print_ok(f"Venta #{ctx.sale_id} registrada, FEL: {fel.get('serie', '-')}-{fel.get('numero', '-')}")


def check_fel_xml(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.sale_id:
        raise RuntimeError("No hay venta para validar XML FEL.")

    _print_step("Validar descarga de XML FEL")
    headers = {"Authorization": f"Bearer {ctx.token}"}
    response = client.get(f"{ctx.base_url}/api/sales/{ctx.sale_id}/fel-xml", headers=headers)
    if response.status_code >= 400:
        raise RuntimeError(f"No se pudo descargar XML FEL: {response.status_code} {response.text}")
    xml = response.text
    if "GTDocumento" not in xml:
        raise RuntimeError("El XML FEL no contiene GTDocumento.")
    _print_ok("XML FEL valido")


def create_and_send_order(client: httpx.Client, ctx: TestContext) -> None:
    _print_step("Crear orden")
    order = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/orders",
        token=ctx.token,
        payload={
            "customer_name": "Cliente Smoke",
            "customer_phone": "50255550101",
            "customer_email": "cliente.smoke@example.com",
            "total_estimate": 25.0,
            "notes": "Orden creada por smoke test",
        },
    )
    if not isinstance(order, dict) or "id" not in order:
        raise RuntimeError("No se pudo crear orden.")
    ctx.order_id = int(order["id"])
    _print_ok(f"Orden #{ctx.order_id} creada")

    _print_step("Enviar orden por WhatsApp y Gmail")
    sent = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/orders/{ctx.order_id}/send",
        token=ctx.token,
        payload={
            "channels": ["whatsapp", "gmail"],
            "whatsapp_to": "50255550101",
            "gmail_to": "cliente.smoke@example.com",
        },
    )
    if not isinstance(sent, dict):
        raise RuntimeError("Respuesta invalida al enviar orden.")

    dispatches = sent.get("dispatches") or []
    if not dispatches:
        raise RuntimeError("No se registraron dispatches de la orden.")
    statuses = [d.get("status", "-") for d in dispatches]
    _print_ok(f"Envio de orden registrado con estados: {json.dumps(statuses)}")


def close_cash(client: httpx.Client, ctx: TestContext) -> None:
    if not ctx.cash_session_id:
        raise RuntimeError("No existe caja abierta para cerrar.")

    _print_step("Obtener caja actual para cuadre")
    current = request_json(client, "GET", f"{ctx.base_url}/api/cash/sessions/current", token=ctx.token)
    if not isinstance(current, dict):
        _print_ok("No hay caja abierta al final (ya estaba cerrada).")
        return

    expected = float(current.get("expected_amount", 0.0))
    _print_step("Cerrar caja y cuadrar")
    closed = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/cash/sessions/{ctx.cash_session_id}/close",
        token=ctx.token,
        payload={"counted_amount": expected, "notes": "Cierre smoke test"},
    )
    if not isinstance(closed, dict) or closed.get("status") != "closed":
        raise RuntimeError("No se pudo cerrar caja.")
    _print_ok(f"Caja cerrada. Diferencia: {closed.get('difference')}")


def run(base_url: str, username: str, password: str) -> int:
    ctx = TestContext(base_url=base_url.rstrip("/"))
    timeout = httpx.Timeout(20.0)
    with httpx.Client(timeout=timeout) as client:
        try:
            login(client, ctx, username, password)
            ensure_cash_open(client, ctx)
            ensure_product(client, ctx)
            create_sale(client, ctx)
            check_fel_xml(client, ctx)
            create_and_send_order(client, ctx)
            close_cash(client, ctx)
            print("\nRESULT: SMOKE TEST COMPLETADO")
            return 0
        except Exception as exc:
            _print_fail(str(exc))
            print("\nRESULT: SMOKE TEST FALLIDO")
            return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test API para FEL POS")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="URL base del servidor")
    parser.add_argument("--username", default="admin", help="Usuario admin")
    parser.add_argument("--password", default="admin123", help="Password admin")
    args = parser.parse_args()
    return run(args.base_url, args.username, args.password)


if __name__ == "__main__":
    sys.exit(main())
