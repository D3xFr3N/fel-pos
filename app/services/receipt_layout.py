from __future__ import annotations

from app.config import settings

ALLOWED_SEPARATOR_CHARS = "-=*_."
DEFAULT_TICKET_LABEL = "TICKET #{id}"
DEFAULT_FOOTER_MESSAGE = "Gracias por su compra"


def _bool_setting(value: object, default: bool = True) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def normalize_separator_char(value: str | None) -> str:
    candidate = (value or "-").strip()
    if not candidate:
        return "-"
    char = candidate[0]
    if char in ALLOWED_SEPARATOR_CHARS:
        return char
    return "-"


def format_ticket_label(template: str | None, sale_id: int) -> str:
    tpl = (template or DEFAULT_TICKET_LABEL).strip() or DEFAULT_TICKET_LABEL
    if "{id}" in tpl:
        return tpl.replace("{id}", str(sale_id))
    return f"{tpl} {sale_id}".strip()


def center_text(text: str, width: int) -> str:
    value = (text or "").strip()
    if not value:
        return ""
    if len(value) >= width:
        return value[:width]
    padding = (width - len(value)) // 2
    return (" " * padding) + value


def get_separator(width: int, char: str | None = None) -> str:
    sep_char = normalize_separator_char(char or settings.receipt_separator_char)
    return sep_char * max(1, width)


def get_receipt_layout() -> dict:
    return {
        "header_line_1": (settings.receipt_header_line_1 or "").strip(),
        "header_line_2": (settings.receipt_header_line_2 or "").strip(),
        "header_line_3": (settings.receipt_header_line_3 or "").strip(),
        "show_company_nit": _bool_setting(settings.receipt_show_company_nit, True),
        "show_address": _bool_setting(settings.receipt_show_address, False),
        "center_header": _bool_setting(settings.receipt_center_header, False),
        "footer_message": (settings.receipt_footer_message or DEFAULT_FOOTER_MESSAGE).strip()
        or DEFAULT_FOOTER_MESSAGE,
        "footer_extra": (settings.receipt_footer_extra or "").strip(),
        "ticket_label": (settings.receipt_ticket_label or DEFAULT_TICKET_LABEL).strip()
        or DEFAULT_TICKET_LABEL,
        "separator_char": normalize_separator_char(settings.receipt_separator_char),
        "show_customer": _bool_setting(settings.receipt_show_customer, True),
        "show_date": _bool_setting(settings.receipt_show_date, True),
        "show_subtotal": _bool_setting(settings.receipt_show_subtotal, True),
        "show_tax": _bool_setting(settings.receipt_show_tax, True),
        "show_payments": _bool_setting(settings.receipt_show_payments, True),
        "show_fel": _bool_setting(settings.receipt_show_fel, True),
        "show_wholesale_savings": _bool_setting(settings.receipt_show_wholesale_savings, True),
        "show_item_detail": _bool_setting(settings.receipt_show_item_detail, True),
    }


def resolve_header_lines(width: int, layout: dict | None = None) -> list[str]:
    cfg = layout or get_receipt_layout()
    center = bool(cfg.get("center_header"))
    lines: list[str] = []

    line_1 = cfg.get("header_line_1") or settings.emisor_nombre_comercial or "FEL POS"
    if line_1:
        lines.append(center_text(line_1, width) if center else line_1)

    if cfg.get("show_company_nit"):
        nit_line = cfg.get("header_line_2") or f"NIT: {settings.emisor_nit}"
        if nit_line:
            lines.append(center_text(nit_line, width) if center else nit_line)
    elif cfg.get("header_line_2"):
        line_2 = cfg["header_line_2"]
        lines.append(center_text(line_2, width) if center else line_2)

    address_line = cfg.get("header_line_3")
    if not address_line and cfg.get("show_address"):
        address_line = (settings.emisor_direccion or "").strip()
    if address_line:
        lines.append(center_text(address_line, width) if center else address_line)

    return lines
