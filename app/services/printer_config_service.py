from __future__ import annotations

import re
import sys

from app.config import settings
from app.data_paths import ENV_FILE_NAME, get_runtime_root

RECEIPT_ENV_KEYS = {
    "receipt_printer_name": "RECEIPT_PRINTER_NAME",
    "receipt_print_on_checkout": "RECEIPT_PRINT_ON_CHECKOUT",
    "receipt_open_drawer_on_checkout": "RECEIPT_OPEN_DRAWER_ON_CHECKOUT",
    "receipt_chars_per_line": "RECEIPT_CHARS_PER_LINE",
    "receipt_encoding": "RECEIPT_ENCODING",
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
        "encoding": (settings.receipt_encoding or "cp850").strip() or "cp850",
        "platform_supported": sys.platform.startswith("win"),
    }


def apply_receipt_printer_runtime(
    *,
    printer_name: str,
    print_on_checkout: bool,
    open_drawer_on_checkout: bool,
    chars_per_line: int,
    encoding: str,
) -> None:
    settings.receipt_printer_name = printer_name.strip()
    settings.receipt_print_on_checkout = print_on_checkout
    settings.receipt_open_drawer_on_checkout = open_drawer_on_checkout
    settings.receipt_chars_per_line = chars_per_line
    settings.receipt_encoding = encoding.strip() or "cp850"


def update_receipt_printer_config(
    *,
    printer_name: str,
    print_on_checkout: bool,
    open_drawer_on_checkout: bool,
    chars_per_line: int,
    encoding: str,
) -> dict:
    normalized_name = printer_name.strip()
    normalized_encoding = encoding.strip() or "cp850"
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
        encoding=normalized_encoding,
    )
    _write_env_values(
        {
            RECEIPT_ENV_KEYS["receipt_printer_name"]: normalized_name,
            RECEIPT_ENV_KEYS["receipt_print_on_checkout"]: _bool_env(print_on_checkout),
            RECEIPT_ENV_KEYS["receipt_open_drawer_on_checkout"]: _bool_env(open_drawer_on_checkout),
            RECEIPT_ENV_KEYS["receipt_chars_per_line"]: str(chars_per_line),
            RECEIPT_ENV_KEYS["receipt_encoding"]: normalized_encoding,
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

    width = max(32, int(settings.receipt_chars_per_line or 48))
    sep = "-" * width
    text = "\n".join(
        [
            settings.emisor_nombre_comercial or "FEL POS",
            sep,
            "PRUEBA DE IMPRESION",
            "Si ves este ticket, la impresora",
            "esta configurada correctamente.",
            sep,
            "",
            "",
        ]
    )
    encoding = settings.receipt_encoding or "cp850"
    payload = b"\x1b@" + text.encode(encoding, errors="replace")
    if open_drawer:
        payload += b"\x1bp\x00\x19\xfa"
    payload += b"\n\n\x1dV\x00"

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
