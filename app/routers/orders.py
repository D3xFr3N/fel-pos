from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models import Order, OrderDispatch, User
from app.schemas import OrderCreate, OrderOut, OrderSendRequest
from app.services.order_notification_service import build_order_message, send_gmail, send_whatsapp

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.get("", response_model=list[OrderOut])
def list_orders(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    orders = (
        db.query(Order)
        .options(joinedload(Order.dispatches))
        .order_by(Order.created_at.desc())
        .limit(100)
        .all()
    )
    return orders


@router.post("", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    order = Order(
        created_by_user_id=user.id,
        customer_name=payload.customer_name.strip(),
        customer_phone=(payload.customer_phone or "").strip() or None,
        customer_email=(payload.customer_email or "").strip() or None,
        total_estimate=payload.total_estimate,
        notes=payload.notes,
        status="draft",
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


@router.post("/{order_id}/send", response_model=OrderOut)
def send_order(
    order_id: int,
    payload: OrderSendRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    order = (
        db.query(Order)
        .options(joinedload(Order.dispatches))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")

    message = build_order_message(order)
    statuses: list[str] = []

    for channel in payload.channels:
        try:
            if channel == "whatsapp":
                recipient = (payload.whatsapp_to or order.customer_phone or "").strip()
                if not recipient:
                    raise HTTPException(status_code=400, detail="Debes indicar numero de WhatsApp.")
                status_result, provider_response = send_whatsapp(recipient, message)
            else:
                recipient = (payload.gmail_to or order.customer_email or "").strip()
                if not recipient:
                    raise HTTPException(status_code=400, detail="Debes indicar correo Gmail.")
                status_result, provider_response = send_gmail(
                    recipient,
                    subject=f"Orden #{order.id}",
                    message=message,
                )
        except HTTPException:
            raise
        except Exception as exc:
            status_result = "error"
            provider_response = str(exc)

        statuses.append(status_result)
        db.add(
            OrderDispatch(
                order_id=order.id,
                channel=channel,
                recipient=recipient,
                status=status_result,
                provider_response=provider_response,
            )
        )

    if statuses and all(status == "sent" for status in statuses):
        order.status = "sent"
    elif statuses and any(status == "error" for status in statuses):
        order.status = "partial_error"
    else:
        order.status = "queued"

    db.commit()
    db.refresh(order)
    return (
        db.query(Order)
        .options(joinedload(Order.dispatches))
        .filter(Order.id == order.id)
        .one()
    )
