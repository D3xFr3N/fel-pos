from __future__ import annotations

import argparse
import sys
import uuid
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
    _step("Login")
    data = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/auth/login",
        payload={"username": username, "password": password},
    )
    if not isinstance(data, dict) or "access_token" not in data:
        raise RuntimeError("No access_token")
    ctx.token = str(data["access_token"])
    _ok("Login OK")


def ensure_cash_and_product(client: httpx.Client, ctx: TestContext) -> None:
    current = request_json(client, "GET", f"{ctx.base_url}/api/cash/sessions/current", token=ctx.token)
    if isinstance(current, dict) and current.get("id"):
        ctx.cash_session_id = int(current["id"])
    else:
        created = request_json(
            client,
            "POST",
            f"{ctx.base_url}/api/cash/sessions/open",
            token=ctx.token,
            payload={"opening_amount": 50.0, "notes": "smoke medium"},
        )
        ctx.cash_session_id = int(created["id"])
    products = request_json(client, "GET", f"{ctx.base_url}/api/products", token=ctx.token)
    if not isinstance(products, list) or not products:
        raise RuntimeError("Se necesita al menos un producto para el smoke medium.")
    ctx.product_id = int(products[0]["id"])
    _ok(f"Caja #{ctx.cash_session_id} producto #{ctx.product_id}")


def test_idempotent_sale(client: httpx.Client, ctx: TestContext) -> None:
    _step("Venta idempotente con client_request_id")
    request_id = str(uuid.uuid4())
    payload = {
        "customer_nit": "CF",
        "customer_name": "CONSUMIDOR FINAL",
        "payment_method": "efectivo",
        "cash_received": 1000,
        "client_request_id": request_id,
        "items": [{"product_id": ctx.product_id, "quantity": 1}],
    }
    first = request_json(client, "POST", f"{ctx.base_url}/api/sales", token=ctx.token, payload=payload)
    second = request_json(client, "POST", f"{ctx.base_url}/api/sales", token=ctx.token, payload=payload)
    if not isinstance(first, dict) or not isinstance(second, dict):
        raise RuntimeError("Respuesta de venta invalida")
    if int(first["id"]) != int(second["id"]):
        raise RuntimeError(
            f"Idempotencia fallida: {first['id']} != {second['id']} con mismo client_request_id"
        )
    ctx.sale_id = int(first["id"])
    _ok(f"Misma venta #{ctx.sale_id} en doble POST")


def test_my_day_and_print_shape(client: httpx.Client, ctx: TestContext) -> None:
    _step("Dashboard my-day")
    day = request_json(client, "GET", f"{ctx.base_url}/api/reports/my-day", token=ctx.token)
    if not isinstance(day, dict) or "sales_summary" not in day:
        raise RuntimeError("my-day sin sales_summary")
    if "date" not in day:
        raise RuntimeError("my-day sin date")
    _ok(f"my-day fecha={day.get('date')} ventas={day['sales_summary'].get('sales_count')}")

    _step("Forma de respuesta print-receipt")
    printed = request_json(
        client,
        "POST",
        f"{ctx.base_url}/api/sales/{ctx.sale_id}/print-receipt?force=true",
        token=ctx.token,
    )
    if not isinstance(printed, dict):
        raise RuntimeError("print-receipt sin JSON")
    for key in ("ok", "message", "printed", "drawer_opened", "attempts"):
        if key not in printed:
            raise RuntimeError(f"print-receipt falta campo {key}: {printed}")
    _ok(f"print-receipt ok={printed.get('ok')} printed={printed.get('printed')}")

    _step("Listar FEL pendientes (rol autenticado)")
    pending = request_json(client, "GET", f"{ctx.base_url}/api/fel/pending", token=ctx.token)
    if not isinstance(pending, list):
        raise RuntimeError("fel/pending debe devolver lista")
    _ok(f"pendientes={len(pending)}")


def test_accounting_and_orders(client: httpx.Client, ctx: TestContext) -> None:
    from datetime import date

    today = date.today().isoformat()
    _step("Export libro ventas CSV")
    headers = {"Authorization": f"Bearer {ctx.token}"}
    sales_resp = client.get(
        f"{ctx.base_url}/api/reports/accounting/sales.csv",
        params={"date_from": today, "date_to": today},
        headers=headers,
    )
    if sales_resp.status_code >= 400:
        raise RuntimeError(f"sales.csv => {sales_resp.status_code} | {sales_resp.text}")
    if "fecha" not in sales_resp.text.lower():
        raise RuntimeError("sales.csv sin encabezado fecha")
    _ok(f"sales.csv bytes={len(sales_resp.content)}")

    _step("Export libro compras CSV")
    purchases_resp = client.get(
        f"{ctx.base_url}/api/reports/accounting/purchases.csv",
        params={"date_from": today, "date_to": today},
        headers=headers,
    )
    if purchases_resp.status_code >= 400:
        raise RuntimeError(f"purchases.csv => {purchases_resp.status_code} | {purchases_resp.text}")
    _ok(f"purchases.csv bytes={len(purchases_resp.content)}")

    _step("Listar apartados/ordenes")
    orders = request_json(client, "GET", f"{ctx.base_url}/api/orders", token=ctx.token)
    if not isinstance(orders, list):
        raise RuntimeError("orders debe devolver lista")
    _ok(f"orders={len(orders)}")

    if ctx.sale_id:
        _step("Descarga FEL PDF (si hay factura)")
        pdf_resp = client.get(f"{ctx.base_url}/api/sales/{ctx.sale_id}/fel-pdf", headers=headers)
        if pdf_resp.status_code == 200:
            if not (pdf_resp.content[:4] == b"%PDF" or b"PDF" in pdf_resp.content[:20]):
                raise RuntimeError("fel-pdf no parece PDF")
            _ok(f"fel-pdf ok size={len(pdf_resp.content)}")
        else:
            _ok(f"fel-pdf omitido status={pdf_resp.status_code}")


def run(base_url: str, username: str, password: str) -> int:
    ctx = TestContext(base_url=base_url.rstrip("/"))
    with httpx.Client(timeout=httpx.Timeout(30.0)) as client:
        try:
            login(client, ctx, username, password)
            ensure_cash_and_product(client, ctx)
            test_idempotent_sale(client, ctx)
            test_my_day_and_print_shape(client, ctx)
            test_accounting_and_orders(client, ctx)
            print("\nRESULT: SMOKE MEDIUM COMPLETADO")
            return 0
        except Exception as exc:
            _fail(str(exc))
            print("\nRESULT: SMOKE MEDIUM FALLIDO")
            return 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test mejoras medias/bajas FEL POS")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--username", default="admin")
    parser.add_argument("--password", default="admin123")
    args = parser.parse_args()
    return run(args.base_url, args.username, args.password)


if __name__ == "__main__":
    sys.exit(main())
