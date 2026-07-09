from __future__ import annotations

from app.config import settings
from app.schemas import SaleOut


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


def build_receipt_text(sale: SaleOut) -> str:
    width = max(32, settings.receipt_chars_per_line)
    sep = "-" * width
    created_at = sale.created_at.strftime("%Y-%m-%d %H:%M")
    customer_name = sale.customer_name or "CONSUMIDOR FINAL"
    customer_nit = sale.customer_nit or "CF"

    lines: list[str] = [
        settings.emisor_nombre_comercial,
        f"NIT: {settings.emisor_nit}",
        sep,
        f"TICKET #{sale.id}",
        f"Fecha: {created_at}",
        f"Cliente: {customer_name}",
        f"NIT: {customer_nit}",
        sep,
    ]

    for item in sale.items:
        qty = f"{item.quantity:g}"
        name = _truncate(item.product_name, width - 1)
        total = _money(item.total)
        lines.append(name)
        lines.append(_left_right(f"{qty} x {_money(item.unit_price)}", total, width))

    lines.extend(
        [
            sep,
            _left_right("Subtotal", _money(sale.subtotal), width),
            _left_right("IVA", _money(sale.tax_total), width),
            _left_right("TOTAL", _money(sale.total), width),
        ]
    )
    payment_lines = sale.payments or []
    if payment_lines:
        lines.append(sep)
        for payment in payment_lines:
            label = _payment_method_label(payment.payment_method)
            lines.append(_left_right(label, _money(payment.amount), width))
        if sale.payment_method == "mixto":
            lines.append(_left_right("Pago", "MIXTO", width))
    else:
        lines.append(_left_right("Pago", sale.payment_method.upper(), width))
    if sale.wholesale_savings > 0:
        lines.append(_left_right("Ahorro mayoreo", _money(sale.wholesale_savings), width))

    if sale.fel:
        lines.extend(
            [
                sep,
                f"FEL: {sale.fel.serie}-{sale.fel.numero}",
                f"UUID: {_truncate(sale.fel.uuid, width)}",
            ]
        )

    lines.extend([sep, "Gracias por su compra", "", ""])
    return "\n".join(lines)


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
    if open_drawer:
        payload += b"\x1bp\x00\x19\xfa"
    payload += b"\n\n\x1dV\x00"

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
