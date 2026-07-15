import json
import smtplib
from email.message import EmailMessage
from urllib.parse import quote

import httpx

from app.config import settings
from app.models import Order, PurchaseOrder


def build_order_message(order: Order) -> str:
    return (
        f"Orden #{order.id}\n"
        f"Cliente: {order.customer_name}\n"
        f"Total estimado: Q {order.total_estimate:.2f}\n"
        f"Estado: {order.status}\n"
        f"Notas: {order.notes or 'Sin notas'}"
    )


def build_purchase_order_message(purchase_order: PurchaseOrder) -> str:
    total_units_requested = 0.0
    lines = [
        f"Orden de compra #{purchase_order.id}",
        f"Proveedor: {purchase_order.supplier.name}",
        f"Fecha: {purchase_order.created_at.strftime('%Y-%m-%d %H:%M')}",
        "",
        "Detalle de productos solicitados:",
    ]
    for item in purchase_order.items:
        total_units_requested += float(item.quantity or 0)
        lines.append(
            f"- Producto: {item.product.name} | Cantidad solicitada: {item.quantity:g} | "
            f"Costo unitario: Q {item.unit_cost:.2f} | Subtotal: Q {item.line_total:.2f}"
        )
    lines.extend(
        [
            "",
            f"Total de unidades solicitadas: {total_units_requested:g}",
            f"Total estimado: Q {purchase_order.total_estimate:.2f}",
            f"Notas: {purchase_order.notes or 'Sin notas'}",
        ]
    )
    return "\n".join(lines)


def send_whatsapp(recipient: str, message: str) -> tuple[str, str]:
    cleaned_recipient = "".join(ch for ch in recipient if ch.isdigit())
    if not cleaned_recipient:
        return "error", "Numero de WhatsApp invalido."

    if settings.whatsapp_token and settings.whatsapp_phone_id:
        endpoint = f"{settings.whatsapp_api_url.rstrip('/')}/{settings.whatsapp_phone_id}/messages"
        payload = {
            "messaging_product": "whatsapp",
            "to": cleaned_recipient,
            "type": "text",
            "text": {"body": message},
        }
        headers = {
            "Authorization": f"Bearer {settings.whatsapp_token}",
            "Content-Type": "application/json",
        }
        try:
            response = httpx.post(endpoint, headers=headers, json=payload, timeout=12.0)
        except httpx.HTTPError as exc:
            return "error", f"Error de red WhatsApp: {exc}"
        if response.is_success:
            return "sent", response.text
        detail = response.text
        try:
            body = response.json()
            if isinstance(body, dict):
                detail = body.get("error", {}).get("message", detail) if isinstance(body.get("error"), dict) else detail
        except Exception:
            pass
        return "error", detail

    preview_url = f"https://wa.me/{cleaned_recipient}?text={quote(message)}"
    return "queued", json.dumps(
        {
            "mode": "simulado",
            "message": "Configura WHATSAPP_TOKEN y WHATSAPP_PHONE_ID para envio real.",
            "preview_url": preview_url,
        }
    )


def send_gmail(recipient: str, subject: str, message: str) -> tuple[str, str]:
    if not recipient or "@" not in recipient:
        return "error", "Correo invalido."

    if settings.gmail_sender and settings.gmail_app_password:
        email = EmailMessage()
        email["From"] = settings.gmail_sender
        email["To"] = recipient
        email["Subject"] = subject
        email.set_content(message)

        try:
            with smtplib.SMTP(settings.gmail_smtp_host, settings.gmail_smtp_port, timeout=12) as server:
                server.starttls()
                server.login(settings.gmail_sender, settings.gmail_app_password)
                server.send_message(email)
        except smtplib.SMTPException as exc:
            return "error", f"Error SMTP: {exc}"
        except OSError as exc:
            return "error", f"Error de red Gmail: {exc}"
        return "sent", '{"provider":"gmail","status":"sent"}'

    return "queued", json.dumps(
        {
            "mode": "simulado",
            "message": "Configura GMAIL_SENDER y GMAIL_APP_PASSWORD para envio real.",
            "recipient": recipient,
        }
    )
