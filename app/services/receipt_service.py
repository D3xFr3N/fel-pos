from __future__ import annotations

from datetime import datetime, timezone

from app.config import settings
from app.datetime_utils import format_local_datetime
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
    if cfg.get("show_subtotal"):
        lines.append(_left_right("Subtotal", _money(sale.subtotal), width))
    if cfg.get("show_tax"):
        lines.append(_left_right("IVA", _money(sale.tax_total), width))
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
        subtotal=100.0,
        tax_total=12.0,
        total=112.0,
        payment_method="efectivo",
        status="completed",
        wholesale_savings=5.0,
        returned_total=0,
        net_total=112.0,
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
        payments=[SalePaymentOut(payment_method="efectivo", amount=112.0)],
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


def append_receipt_cut(payload: bytes, *, open_drawer: bool = False) -> bytes:
    feed_lines = get_receipt_bottom_feed_lines()
    payload += b"\n" * feed_lines
    feed_dots = min(255, feed_lines * 12)
    payload += b"\x1bJ" + bytes([feed_dots])
    if open_drawer:
        payload += b"\x1bp\x00\x19\xfa"
    payload += b"\x1dV\x00"
    return payload


def print_receipt(sale: SaleOut, open_drawer: bool) -> None:
    try:
        import win32print  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "No se encontro pywin32. Instala dependencia para imprimir en Windows."
        ) from exc

    printer_name = settings.receipt_printer_name.strip() or win32print.GetDefaultPrinter()
    if not printer_name:
        raise RuntimeError("No hay impresora configurada para tickets.")

    text = build_receipt_text(sale)
    encoding = settings.receipt_encoding or "cp850"
    payload = b"\x1b@" + text.encode(encoding, errors="replace")
    payload = append_receipt_cut(payload, open_drawer=open_drawer)

    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, (f"FELPOS-{sale.id}", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, payload)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)
