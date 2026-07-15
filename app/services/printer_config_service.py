from __future__ import annotations

import re
import sys

from app.config import settings
from app.services.receipt_layout import get_receipt_layout, normalize_separator_char
from app.services.receipt_service import append_receipt_cut, build_receipt_preview_text
from app.data_paths import ENV_FILE_NAME, get_runtime_root

RECEIPT_ENV_KEYS = {
    "receipt_printer_name": "RECEIPT_PRINTER_NAME",
    "receipt_print_on_checkout": "RECEIPT_PRINT_ON_CHECKOUT",
    "receipt_open_drawer_on_checkout": "RECEIPT_OPEN_DRAWER_ON_CHECKOUT",
    "receipt_chars_per_line": "RECEIPT_CHARS_PER_LINE",
    "receipt_bottom_feed_lines": "RECEIPT_BOTTOM_FEED_LINES",
    "receipt_encoding": "RECEIPT_ENCODING",
    "receipt_header_line_1": "RECEIPT_HEADER_LINE_1",
    "receipt_header_line_2": "RECEIPT_HEADER_LINE_2",
    "receipt_header_line_3": "RECEIPT_HEADER_LINE_3",
    "receipt_show_company_nit": "RECEIPT_SHOW_COMPANY_NIT",
    "receipt_show_address": "RECEIPT_SHOW_ADDRESS",
    "receipt_center_header": "RECEIPT_CENTER_HEADER",
    "receipt_footer_message": "RECEIPT_FOOTER_MESSAGE",
    "receipt_footer_extra": "RECEIPT_FOOTER_EXTRA",
    "receipt_ticket_label": "RECEIPT_TICKET_LABEL",
    "receipt_separator_char": "RECEIPT_SEPARATOR_CHAR",
    "receipt_show_customer": "RECEIPT_SHOW_CUSTOMER",
    "receipt_show_date": "RECEIPT_SHOW_DATE",
    "receipt_show_subtotal": "RECEIPT_SHOW_SUBTOTAL",
    "receipt_show_tax": "RECEIPT_SHOW_TAX",
    "receipt_show_payments": "RECEIPT_SHOW_PAYMENTS",
    "receipt_show_fel": "RECEIPT_SHOW_FEL",
    "receipt_show_wholesale_savings": "RECEIPT_SHOW_WHOLESALE_SAVINGS",
    "receipt_show_item_detail": "RECEIPT_SHOW_ITEM_DETAIL",
}


def _upsert_env_value(content: str, env_key: str, value: str) -> str:
    line = f"{env_key}={value}"
    pattern = rf"(?m)^{re.escape(env_key)}=.*$"
    if re.search(pattern, content):
        return re.sub(pattern, line, content, count=1)
    if content and not content.endswith("\n"):
        content += "\n"
    return content + line + "\n"


def _read_env_content() -> str:
    env_path = get_runtime_root() / ENV_FILE_NAME
    if env_path.exists():
        return env_path.read_text(encoding="utf-8")
    example_path = get_runtime_root() / f"{ENV_FILE_NAME}.example"
    if example_path.exists():
        return example_path.read_text(encoding="utf-8")
    return ""


def _write_env_values(values: dict[str, str]) -> None:
    content = _read_env_content()
    for env_key, value in values.items():
        content = _upsert_env_value(content, env_key, value)
    env_path = get_runtime_root() / ENV_FILE_NAME
    env_path.write_text(content, encoding="utf-8")


def _bool_env(value: bool) -> str:
    return "true" if value else "false"


def _list_windows_printers() -> tuple[list[str], str]:
    if not sys.platform.startswith("win"):
        return [], ""
    try:
        import win32print  # type: ignore
    except Exception:
        return [], ""

    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    printers = [entry[2] for entry in win32print.EnumPrinters(flags)]
    default_printer = ""
    try:
        default_printer = win32print.GetDefaultPrinter()
    except Exception:
        default_printer = ""
    return printers, default_printer


def _resolved_printer_name() -> str:
    configured = (settings.receipt_printer_name or "").strip()
    if configured:
        return configured
    _, default_printer = _list_windows_printers()
    return default_printer


def _layout_payload() -> dict:
    layout = get_receipt_layout()
    return {
        "header_line_1": layout["header_line_1"],
        "header_line_2": layout["header_line_2"],
        "header_line_3": layout["header_line_3"],
        "show_company_nit": layout["show_company_nit"],
        "show_address": layout["show_address"],
        "center_header": layout["center_header"],
        "footer_message": layout["footer_message"],
        "footer_extra": layout["footer_extra"],
        "ticket_label": layout["ticket_label"],
        "separator_char": layout["separator_char"],
        "show_customer": layout["show_customer"],
        "show_date": layout["show_date"],
        "show_subtotal": layout["show_subtotal"],
        "show_tax": layout["show_tax"],
        "show_payments": layout["show_payments"],
        "show_fel": layout["show_fel"],
        "show_wholesale_savings": layout["show_wholesale_savings"],
        "show_item_detail": layout["show_item_detail"],
        "preview_text": build_receipt_preview_text(),
    }


def get_receipt_printer_config() -> dict:
    printers, default_printer = _list_windows_printers()
    configured = (settings.receipt_printer_name or "").strip()
    active_printer = _resolved_printer_name()
    return {
        "printer_name": configured,
        "default_printer": default_printer,
        "available_printers": printers,
        "active_printer": active_printer,
        "print_on_checkout": bool(settings.receipt_print_on_checkout),
        "open_drawer_on_checkout": bool(settings.receipt_open_drawer_on_checkout),
        "chars_per_line": int(settings.receipt_chars_per_line or 48),
        "bottom_feed_lines": int(settings.receipt_bottom_feed_lines or 8),
        "encoding": (settings.receipt_encoding or "cp850").strip() or "cp850",
        "platform_supported": sys.platform.startswith("win"),
        **_layout_payload(),
    }


def apply_receipt_printer_runtime(
    *,
    printer_name: str,
    print_on_checkout: bool,
    open_drawer_on_checkout: bool,
    chars_per_line: int,
    bottom_feed_lines: int,
    encoding: str,
    header_line_1: str,
    header_line_2: str,
    header_line_3: str,
    show_company_nit: bool,
    show_address: bool,
    center_header: bool,
    footer_message: str,
    footer_extra: str,
    ticket_label: str,
    separator_char: str,
    show_customer: bool,
    show_date: bool,
    show_subtotal: bool,
    show_tax: bool,
    show_payments: bool,
    show_fel: bool,
    show_wholesale_savings: bool,
    show_item_detail: bool,
) -> None:
    settings.receipt_printer_name = printer_name.strip()
    settings.receipt_print_on_checkout = print_on_checkout
    settings.receipt_open_drawer_on_checkout = open_drawer_on_checkout
    settings.receipt_chars_per_line = chars_per_line
    settings.receipt_bottom_feed_lines = bottom_feed_lines
    settings.receipt_encoding = encoding.strip() or "cp850"
    settings.receipt_header_line_1 = header_line_1.strip()
    settings.receipt_header_line_2 = header_line_2.strip()
    settings.receipt_header_line_3 = header_line_3.strip()
    settings.receipt_show_company_nit = show_company_nit
    settings.receipt_show_address = show_address
    settings.receipt_center_header = center_header
    settings.receipt_footer_message = footer_message.strip() or "Gracias por su compra"
    settings.receipt_footer_extra = footer_extra.strip()
    settings.receipt_ticket_label = ticket_label.strip() or "TICKET #{id}"
    settings.receipt_separator_char = normalize_separator_char(separator_char)
    settings.receipt_show_customer = show_customer
    settings.receipt_show_date = show_date
    settings.receipt_show_subtotal = show_subtotal
    settings.receipt_show_tax = show_tax
    settings.receipt_show_payments = show_payments
    settings.receipt_show_fel = show_fel
    settings.receipt_show_wholesale_savings = show_wholesale_savings
    settings.receipt_show_item_detail = show_item_detail


def update_receipt_printer_config(
    *,
    printer_name: str,
    print_on_checkout: bool,
    open_drawer_on_checkout: bool,
    chars_per_line: int,
    bottom_feed_lines: int,
    encoding: str,
    header_line_1: str,
    header_line_2: str,
    header_line_3: str,
    show_company_nit: bool,
    show_address: bool,
    center_header: bool,
    footer_message: str,
    footer_extra: str,
    ticket_label: str,
    separator_char: str,
    show_customer: bool,
    show_date: bool,
    show_subtotal: bool,
    show_tax: bool,
    show_payments: bool,
    show_fel: bool,
    show_wholesale_savings: bool,
    show_item_detail: bool,
) -> dict:
    normalized_name = printer_name.strip()
    normalized_encoding = encoding.strip() or "cp850"
    normalized_bottom_feed = max(2, min(int(bottom_feed_lines or 8), 20))
    if normalized_name:
        printers, _ = _list_windows_printers()
        if printers and normalized_name not in printers:
            raise ValueError(
                f"La impresora '{normalized_name}' no esta instalada en Windows."
            )

    apply_receipt_printer_runtime(
        printer_name=normalized_name,
        print_on_checkout=print_on_checkout,
        open_drawer_on_checkout=open_drawer_on_checkout,
        chars_per_line=chars_per_line,
        bottom_feed_lines=normalized_bottom_feed,
        encoding=normalized_encoding,
        header_line_1=header_line_1,
        header_line_2=header_line_2,
        header_line_3=header_line_3,
        show_company_nit=show_company_nit,
        show_address=show_address,
        center_header=center_header,
        footer_message=footer_message,
        footer_extra=footer_extra,
        ticket_label=ticket_label,
        separator_char=separator_char,
        show_customer=show_customer,
        show_date=show_date,
        show_subtotal=show_subtotal,
        show_tax=show_tax,
        show_payments=show_payments,
        show_fel=show_fel,
        show_wholesale_savings=show_wholesale_savings,
        show_item_detail=show_item_detail,
    )
    _write_env_values(
        {
            RECEIPT_ENV_KEYS["receipt_printer_name"]: normalized_name,
            RECEIPT_ENV_KEYS["receipt_print_on_checkout"]: _bool_env(print_on_checkout),
            RECEIPT_ENV_KEYS["receipt_open_drawer_on_checkout"]: _bool_env(open_drawer_on_checkout),
            RECEIPT_ENV_KEYS["receipt_chars_per_line"]: str(chars_per_line),
            RECEIPT_ENV_KEYS["receipt_bottom_feed_lines"]: str(normalized_bottom_feed),
            RECEIPT_ENV_KEYS["receipt_encoding"]: normalized_encoding,
            RECEIPT_ENV_KEYS["receipt_header_line_1"]: settings.receipt_header_line_1,
            RECEIPT_ENV_KEYS["receipt_header_line_2"]: settings.receipt_header_line_2,
            RECEIPT_ENV_KEYS["receipt_header_line_3"]: settings.receipt_header_line_3,
            RECEIPT_ENV_KEYS["receipt_show_company_nit"]: _bool_env(show_company_nit),
            RECEIPT_ENV_KEYS["receipt_show_address"]: _bool_env(show_address),
            RECEIPT_ENV_KEYS["receipt_center_header"]: _bool_env(center_header),
            RECEIPT_ENV_KEYS["receipt_footer_message"]: settings.receipt_footer_message,
            RECEIPT_ENV_KEYS["receipt_footer_extra"]: settings.receipt_footer_extra,
            RECEIPT_ENV_KEYS["receipt_ticket_label"]: settings.receipt_ticket_label,
            RECEIPT_ENV_KEYS["receipt_separator_char"]: settings.receipt_separator_char,
            RECEIPT_ENV_KEYS["receipt_show_customer"]: _bool_env(show_customer),
            RECEIPT_ENV_KEYS["receipt_show_date"]: _bool_env(show_date),
            RECEIPT_ENV_KEYS["receipt_show_subtotal"]: _bool_env(show_subtotal),
            RECEIPT_ENV_KEYS["receipt_show_tax"]: _bool_env(show_tax),
            RECEIPT_ENV_KEYS["receipt_show_payments"]: _bool_env(show_payments),
            RECEIPT_ENV_KEYS["receipt_show_fel"]: _bool_env(show_fel),
            RECEIPT_ENV_KEYS["receipt_show_wholesale_savings"]: _bool_env(show_wholesale_savings),
            RECEIPT_ENV_KEYS["receipt_show_item_detail"]: _bool_env(show_item_detail),
        }
    )
    return get_receipt_printer_config()


def print_receipt_test_page(open_drawer: bool = False) -> str:
    if not sys.platform.startswith("win"):
        raise RuntimeError("La impresion directa solo esta disponible en Windows.")

    try:
        import win32print  # type: ignore
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "No se encontro pywin32. Instala dependencia para imprimir en Windows."
        ) from exc

    printer_name = _resolved_printer_name()
    if not printer_name:
        raise RuntimeError("No hay impresora configurada para tickets.")

    text = build_receipt_preview_text()
    encoding = settings.receipt_encoding or "cp850"
    payload = b"\x1b@" + text.encode(encoding, errors="replace")
    payload = append_receipt_cut(payload, open_drawer=open_drawer)

    handle = win32print.OpenPrinter(printer_name)
    try:
        win32print.StartDocPrinter(handle, 1, ("FELPOS-TEST", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, payload)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)
    return printer_name
