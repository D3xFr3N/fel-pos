from __future__ import annotations

from datetime import datetime, timezone

from app.config import settings
from app.datetime_utils import format_local_datetime
from app.schemas import FelInvoiceOut, SaleItemOut, SaleOut, SalePaymentOut
from app.services.receipt_layout import (
    format_ticket_label,
    get_receipt_layout,
    get_separator,
    resolve_header_lines,
)


def _money(value: float) -> str:
    return f"Q {value:.2f}"


def _payment_method_label(method: str) -> str:
    labels = {
        "efectivo": "Efectivo",
        "tarjeta": "Tarjeta",
        "transferencia": "Transferencia",
        "credito": "Credito",
        "mixto": "Mixto",
    }
    return labels.get((method or "").lower(), (method or "Pago").upper())


def _truncate(text: str, max_len: int) -> str:
    if len(text) <= max_len:
        return text
    if max_len <= 3:
        return text[:max_len]
    return f"{text[: max_len - 3]}..."


def _left_right(left: str, right: str, width: int) -> str:
    if len(left) + len(right) >= width:
        left = _truncate(left, max(6, width - len(right) - 1))
    spaces = " " * max(1, width - len(left) - len(right))
    return f"{left}{spaces}{right}"


def build_receipt_text(sale: SaleOut, layout: dict | None = None) -> str:
    cfg = layout or get_receipt_layout()
    width = max(32, int(settings.receipt_chars_per_line or 48))
    sep = get_separator(width, cfg.get("separator_char"))
    created_at = format_local_datetime(sale.created_at)
    customer_name = sale.customer_name or "CONSUMIDOR FINAL"
    customer_nit = sale.customer_nit or "CF"

    lines: list[str] = []
    lines.extend(resolve_header_lines(width, cfg))
    if lines:
        lines.append(sep)

    lines.append(format_ticket_label(cfg.get("ticket_label"), sale.id))
    if cfg.get("show_date"):
        lines.append(f"Fecha: {created_at}")
    if cfg.get("show_customer"):
        lines.append(f"Cliente: {customer_name}")
        lines.append(f"NIT: {customer_nit}")
    lines.append(sep)

    for item in sale.items:
        name = _truncate(item.product_name, width - 1)
        total = _money(item.total)
        lines.append(name)
        if cfg.get("show_item_detail"):
            qty = f"{item.quantity:g}"
            lines.append(_left_right(f"{qty} x {_money(item.unit_price)}", total, width))
        else:
            lines.append(_left_right(f"{item.quantity:g}", total, width))

    lines.append(sep)
    cart_discount = round(float(getattr(sale, "cart_discount_amount", 0) or 0), 2)
    gross_total = round(float(sale.total or 0) + cart_discount, 2)
    if cfg.get("show_subtotal"):
        lines.append(_left_right("Subtotal", _money(gross_total), width))
    if cart_discount > 0:
        lines.append(_left_right("Descuento", f"-{_money(cart_discount)}", width))
    if cfg.get("show_tax"):
        lines.append(_left_right("IVA (incl.)", _money(sale.tax_total), width))
    lines.append(_left_right("TOTAL", _money(sale.total), width))

    payment_lines = sale.payments or []
    if cfg.get("show_payments"):
        if payment_lines:
            lines.append(sep)
            for payment in payment_lines:
                label = _payment_method_label(payment.payment_method)
                lines.append(_left_right(label, _money(payment.amount), width))
            if sale.payment_method == "mixto":
                lines.append(_left_right("Pago", "MIXTO", width))
        else:
            lines.append(_left_right("Pago", sale.payment_method.upper(), width))

    cash_received = round(float(getattr(sale, "cash_received", 0) or 0), 2)
    change_amount = round(float(getattr(sale, "change_amount", 0) or 0), 2)
    if cash_received > 0:
        if not cfg.get("show_payments") or not payment_lines:
            lines.append(sep)
        lines.append(_left_right("Recibido", _money(cash_received), width))
        lines.append(_left_right("Cambio", _money(change_amount), width))

    if cfg.get("show_wholesale_savings") and sale.wholesale_savings > 0:
        lines.append(_left_right("Ahorro mayoreo", _money(sale.wholesale_savings), width))

    if cfg.get("show_fel") and sale.fel:
        lines.extend(
            [
                sep,
                f"FEL: {sale.fel.serie}-{sale.fel.numero}",
                f"UUID: {_truncate(sale.fel.uuid, width)}",
            ]
        )

    lines.append(sep)
    footer = (cfg.get("footer_message") or "").strip()
    if footer:
        lines.append(footer)
    footer_extra = (cfg.get("footer_extra") or "").strip()
    if footer_extra:
        lines.append(footer_extra)
    lines.append("")
    return "\n".join(lines)


def build_receipt_preview_text() -> str:
    preview_sale = SaleOut(
        id=1234,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        subtotal=91.07,
        tax_total=10.93,
        total=102.0,
        payment_method="efectivo",
        status="completed",
        wholesale_savings=5.0,
        cart_discount_amount=10.0,
        cash_received=120.0,
        change_amount=18.0,
        returned_total=0,
        net_total=102.0,
        customer_nit="CF",
        customer_name="CLIENTE DE PRUEBA",
        items=[
            SaleItemOut(
                sale_item_id=1,
                product_id=1,
                product_name="Producto ejemplo",
                quantity=2,
                base_unit_price=50.0,
                unit_price=50.0,
                discount_amount=0,
                subtotal=100.0,
                tax_rate=0.12,
                tax_amount=12.0,
                total=112.0,
            )
        ],
                payments=[SalePaymentOut(payment_method="efectivo", amount=102.0)],
        fel=FelInvoiceOut(
            uuid="00000000-0000-0000-0000-000000000000",
            serie="DEMO",
            numero="12345",
            document_type="FACT",
            status="certified",
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        ),
    )
    preview_label = format_ticket_label(get_receipt_layout().get("ticket_label"), 1234)
    text = build_receipt_text(preview_sale)
    return text.replace(preview_label, f"{preview_label} (VISTA PREVIA)", 1)


def get_receipt_bottom_feed_lines() -> int:
    value = int(settings.receipt_bottom_feed_lines or 8)
    return max(2, min(value, 20))


def build_drawer_kick_bytes() -> bytes:
    """Pulso ESC/POS para cajon (pin 2 y pin 5; muchas cajas usan uno u otro)."""
    # ESC p m t1 t2  ->  m=0 pin2, m=1 pin5; t1/t2 tiempo on/off
    return b"\x1bp\x00\x40\xf0" + b"\x1bp\x01\x40\xf0"


def append_receipt_cut(payload: bytes, *, open_drawer: bool = False) -> bytes:
    feed_lines = get_receipt_bottom_feed_lines()
    payload += b"\n" * feed_lines
    feed_dots = min(255, feed_lines * 12)
    payload += b"\x1bJ" + bytes([feed_dots])
    # Cortar primero; el pulso del cajon suele responder mejor despues del corte.
    payload += b"\x1dV\x00"
    if open_drawer:
        payload += build_drawer_kick_bytes()
    return payload


def _resolved_receipt_printer_name() -> str:
    try:
        import win32print  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "No se encontro pywin32. Instala dependencia para imprimir en Windows."
        ) from exc

    printer_name = (settings.receipt_printer_name or "").strip() or win32print.GetDefaultPrinter()
    if not printer_name:
        raise RuntimeError("No hay impresora configurada para tickets.")
    return printer_name


def _send_raw_to_printer(printer_name: str, payload: bytes, job_name: str) -> None:
    import win32print  # type: ignore

    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, (job_name, None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, payload)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


def print_raw_text(text: str, *, job_name: str = "FELPOS-KITCHEN") -> str:
    """Imprime texto plano ESC/POS (comanda cocina, etc.)."""
    if not __import__("sys").platform.startswith("win"):
        raise RuntimeError("Impresion RAW solo disponible en Windows.")
    printer_name = _resolved_receipt_printer_name()
    encoding = (settings.receipt_encoding or "cp437").strip() or "cp437"
    body = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    payload = b"\x1b@" + body.encode(encoding, errors="replace") + b"\n\n\x1dV\x00"
    _send_raw_to_printer(printer_name, payload, job_name)
    return printer_name


def open_cash_drawer() -> str:
    """Abre el cajon de dinero sin imprimir ticket."""
    if not __import__("sys").platform.startswith("win"):
        raise RuntimeError("La apertura de cajon solo esta disponible en Windows.")
    printer_name = _resolved_receipt_printer_name()
    payload = b"\x1b@" + build_drawer_kick_bytes()
    _send_raw_to_printer(printer_name, payload, "FELPOS-DRAWER")
    return printer_name


def open_cash_drawer_with_retry(*, attempts: int = 2) -> dict:
    last_error: Exception | None = None
    printer_name = ""
    for attempt in range(1, max(1, attempts) + 1):
        try:
            printer_name = open_cash_drawer()
            return {
                "ok": True,
                "drawer_opened": True,
                "printer_name": printer_name,
                "drawer_error": None,
                "attempts": attempt,
            }
        except Exception as exc:
            last_error = exc
    return {
        "ok": False,
        "drawer_opened": False,
        "printer_name": printer_name or None,
        "drawer_error": str(last_error) if last_error else "No se pudo abrir el cajon.",
        "attempts": max(1, attempts),
    }


def print_receipt(sale: SaleOut, open_drawer: bool) -> None:
    """Compatibilidad: imprime ticket y opcionalmente abre cajon (best-effort)."""
    result = print_receipt_detailed(sale, open_drawer=open_drawer)
    if not result.get("printed"):
        raise RuntimeError(result.get("print_error") or "No se pudo imprimir el ticket.")


def print_receipt_detailed(sale: SaleOut, open_drawer: bool, *, attempts: int = 2) -> dict:
    """Imprime ticket y cajon por separado; no falla la venta si el cajon falla."""
    printer_name = ""
    print_error: str | None = None
    printed = False
    used_attempts = 0
    for attempt in range(1, max(1, attempts) + 1):
        used_attempts = attempt
        try:
            printer_name = _resolved_receipt_printer_name()
            text = build_receipt_text(sale)
            encoding = settings.receipt_encoding or "cp850"
            payload = b"\x1b@" + text.encode(encoding, errors="replace")
            # Cajon se maneja aparte para reportar estados independientes.
            payload = append_receipt_cut(payload, open_drawer=False)
            _send_raw_to_printer(printer_name, payload, f"FELPOS-{sale.id}")
            printed = True
            print_error = None
            break
        except Exception as exc:
            print_error = str(exc)
            printed = False

    drawer_opened = False
    drawer_error: str | None = None
    if open_drawer:
        drawer_result = open_cash_drawer_with_retry(attempts=attempts)
        drawer_opened = bool(drawer_result.get("drawer_opened"))
        drawer_error = drawer_result.get("drawer_error")
        if drawer_result.get("printer_name"):
            printer_name = drawer_result["printer_name"]

    ok = printed and (drawer_opened or not open_drawer)
    parts = []
    if printed:
        parts.append("Ticket impreso")
    elif print_error:
        parts.append(f"Ticket no impreso: {print_error}")
    if open_drawer:
        if drawer_opened:
            parts.append("cajon abierto")
        elif drawer_error:
            parts.append(f"cajon no abierto: {drawer_error}")
    message = ". ".join(parts) + "." if parts else "Sin acciones de impresion."
    return {
        "ok": ok,
        "printed": printed,
        "drawer_opened": drawer_opened,
        "printer_name": printer_name or None,
        "print_error": print_error,
        "drawer_error": drawer_error,
        "attempts": used_attempts,
        "message": message,
    }
