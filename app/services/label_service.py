from __future__ import annotations

from app.config import settings


def _truncate(text: str, max_len: int) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= max_len:
        return cleaned
    if max_len <= 3:
        return cleaned[:max_len]
    return f"{cleaned[: max_len - 3]}..."


def _normalize_barcode(value: str) -> str:
    return (value or "").strip().upper()


def _is_code39_encodable(value: str) -> bool:
    allowed = set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%")
    return bool(value) and all(char in allowed for char in value)


def build_label_payload(
    *,
    product_name: str,
    barcode: str,
    price: float | None = None,
    description: str | None = None,
) -> bytes:
    code = _normalize_barcode(barcode)
    if not code:
        raise ValueError("Codigo de barras vacio.")
    if not _is_code39_encodable(code):
        raise ValueError(
            "Codigo invalido para impresora. Usa letras A-Z, numeros y simbolos (- . espacio $ / + %)."
        )

    encoding = settings.label_encoding or settings.receipt_encoding or "cp850"
    name_line = _truncate(product_name, 28)
    description_line = _truncate(description, 34) if description else ""
    price_line = f"Precio: Q {float(price or 0):.2f}" if price is not None else ""

    payload = bytearray()
    payload.extend(b"\x1b@")  # init
    payload.extend(b"\x1ba\x01")  # center
    payload.extend(name_line.encode(encoding, errors="replace"))
    payload.extend(b"\n")
    if description_line:
        payload.extend(description_line.encode(encoding, errors="replace"))
        payload.extend(b"\n")
    if price_line:
        payload.extend(price_line.encode(encoding, errors="replace"))
        payload.extend(b"\n")
    payload.extend(b"\x1ba\x01")
    payload.extend(b"\x1dH\x02")  # HRI below barcode
    payload.extend(b"\x1dh\x50")  # barcode height
    payload.extend(b"\x1dw\x02")  # barcode width
    payload.extend(b"\x1dk\x04")
    payload.extend(code.encode("ascii", errors="replace"))
    payload.extend(b"\x00")
    payload.extend(b"\n\n")
    payload.extend(b"\x1dV\x00")  # cut
    return bytes(payload)


def print_barcode_labels(
    *,
    product_name: str,
    barcode: str,
    quantity: int = 1,
    price: float | None = None,
    description: str | None = None,
) -> str:
    try:
        import win32print  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "No se encontro pywin32. Instala dependencia para imprimir en Windows."
        ) from exc

    printer_name = (settings.label_printer_name or "").strip()
    if not printer_name:
        printer_name = (settings.receipt_printer_name or "").strip() or win32print.GetDefaultPrinter()
    if not printer_name:
        raise RuntimeError("No hay impresora de etiquetas configurada.")

    labels_qty = max(1, min(300, int(quantity or 1)))
    label_payload = build_label_payload(
        product_name=product_name,
        barcode=barcode,
        price=price,
        description=description,
    )
    full_payload = label_payload * labels_qty

    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, ("FELPOS-LABEL", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, full_payload)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)

    return printer_name
