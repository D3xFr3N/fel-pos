from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_permission
from app.models import Order, OrderDispatch, OrderItem, Product, User
from app.schemas import (
    OrderCreate,
    OrderDepositRequest,
    OrderItemInput,
    OrderOut,
    OrderSendRequest,
    SaleCreate,
    SaleItemInput,
)
from app.services.audit_service import log_action
from app.services.cash_service import add_cash_movement, can_use_cash_session, get_open_cash_session
from app.services.inventory_branch_service import adjust_branch_stock, resolve_branch_id
from app.services.order_notification_service import build_order_message, send_gmail, send_whatsapp
from app.services.sale_service import create_sale

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _recalc_totals(order: Order) -> None:
    total = round(sum(float(i.line_total or 0) for i in (order.items or [])), 2)
    if total <= 0:
        total = round(float(order.total_estimate or 0), 2)
    else:
        order.total_estimate = total
    deposit = round(float(order.deposit_paid or 0), 2)
    order.balance_due = round(max(total - deposit, 0.0), 2)


def _sync_status(order: Order) -> None:
    if order.status in {"delivered", "cancelled"}:
        return
    if order.sale_id:
        order.status = "delivered"
        return
    deposit = float(order.deposit_paid or 0)
    total = float(order.total_estimate or 0)
    if deposit <= 0:
        order.status = "reserved" if (order.items or total > 0) else "draft"
    elif deposit + 0.001 < total:
        order.status = "partial"
    else:
        order.status = "ready"


def _require_own_cash(db: Session, user: User):
    session = get_open_cash_session(db, user_id=user.id)
    if not session or not can_use_cash_session(user, session):
        raise HTTPException(status_code=400, detail="Necesitas caja activa propia para este movimiento.")
    return session


def _order_query(db: Session):
    return db.query(Order).options(
        joinedload(Order.dispatches),
        joinedload(Order.items).joinedload(OrderItem.product),
    )


def _to_out(order: Order) -> OrderOut:
    return OrderOut.model_validate(order)


def _reserve_items(db: Session, order: Order, user: User) -> None:
    if order.stock_reserved:
        return
    branch_id = resolve_branch_id(db, order.branch_id)
    for item in order.items or []:
        product = db.get(Product, item.product_id)
        if not product or int(product.tracks_inventory or 0) != 1:
            item.reserved = 0
            continue
        adjust_branch_stock(
            db,
            product,
            -float(item.quantity),
            branch_id=branch_id,
            user_id=user.id,
            movement_type="apartado_reserva",
            notes=f"Apartado #{order.id}",
        )
        item.reserved = 1
    order.stock_reserved = 1
    order.branch_id = branch_id


def _release_reservation(db: Session, order: Order, user: User) -> None:
    if not order.stock_reserved:
        return
    branch_id = resolve_branch_id(db, order.branch_id)
    for item in order.items or []:
        if not item.reserved:
            continue
        product = db.get(Product, item.product_id)
        if not product or int(product.tracks_inventory or 0) != 1:
            item.reserved = 0
            continue
        adjust_branch_stock(
            db,
            product,
            float(item.quantity),
            branch_id=branch_id,
            user_id=user.id,
            movement_type="apartado_liberacion",
            notes=f"Liberar apartado #{order.id}",
        )
        item.reserved = 0
    order.stock_reserved = 0


def _add_item_row(db: Session, order: Order, line: OrderItemInput) -> OrderItem:
    product = db.get(Product, line.product_id)
    if not product or not product.active:
        raise HTTPException(status_code=400, detail=f"Producto invalido: {line.product_id}")
    qty = float(line.quantity)
    unit = float(line.unit_price) if line.unit_price is not None else float(product.price or 0)
    row = OrderItem(
        order_id=order.id,
        product_id=product.id,
        quantity=qty,
        unit_price=unit,
        line_total=round(qty * unit, 2),
        reserved=0,
    )
    db.add(row)
    return row


@router.get("", response_model=list[OrderOut])
def list_orders(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    return [_to_out(o) for o in _order_query(db).order_by(Order.created_at.desc()).limit(100).all()]


@router.post("", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    deposit = round(float(payload.deposit_paid or 0), 2)
    if deposit > 0:
        _require_own_cash(db, user)

    order = Order(
        created_by_user_id=user.id,
        customer_id=payload.customer_id,
        customer_name=payload.customer_name.strip(),
        customer_phone=(payload.customer_phone or "").strip() or None,
        customer_email=(payload.customer_email or "").strip() or None,
        customer_nit=(payload.customer_nit or "").strip() or None,
        branch_id=payload.branch_id,
        total_estimate=round(float(payload.total_estimate or 0), 2),
        deposit_paid=deposit,
        pickup_at=payload.pickup_at,
        notes=payload.notes,
        status="draft",
        stock_reserved=0,
    )
    db.add(order)
    db.flush()

    for line in payload.items or []:
        _add_item_row(db, order, line)
    db.flush()
    db.refresh(order)
    order = _order_query(db).filter(Order.id == order.id).one()
    _recalc_totals(order)
    if order.items:
        try:
            _reserve_items(db, order, user)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    if deposit > float(order.total_estimate or 0) + 0.001:
        raise HTTPException(status_code=400, detail="El anticipo no puede superar el total.")
    _sync_status(order)

    if deposit > 0:
        add_cash_movement(
            db,
            user_id=user.id,
            movement_type="income",
            amount=deposit,
            description=f"Anticipo apartado #{order.id}: {order.customer_name}",
            commit=False,
        )

    db.commit()
    return _to_out(_order_query(db).filter(Order.id == order.id).one())


@router.post("/{order_id}/items", response_model=OrderOut)
def add_order_item(
    order_id: int,
    payload: OrderItemInput,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = _order_query(db).filter(Order.id == order_id).with_for_update().one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Apartado/orden no encontrado.")
    if order.status in {"delivered", "cancelled"}:
        raise HTTPException(status_code=400, detail="Este apartado ya esta cerrado.")
    # Liberar para re-reservar con el nuevo item incluido.
    _release_reservation(db, order, user)
    _add_item_row(db, order, payload)
    db.flush()
    order = _order_query(db).filter(Order.id == order.id).one()
    _recalc_totals(order)
    try:
        _reserve_items(db, order, user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    _sync_status(order)
    db.commit()
    return _to_out(_order_query(db).filter(Order.id == order.id).one())


@router.post("/{order_id}/deposit", response_model=OrderOut)
def add_order_deposit(
    order_id: int,
    payload: OrderDepositRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = _order_query(db).filter(Order.id == order_id).with_for_update().one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Apartado/orden no encontrado.")
    if order.status in {"delivered", "cancelled"}:
        raise HTTPException(status_code=400, detail="Este apartado ya esta cerrado.")

    amount = round(float(payload.amount or 0), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Monto de abono invalido.")
    remaining = round(max(float(order.total_estimate or 0) - float(order.deposit_paid or 0), 0), 2)
    if amount > remaining + 0.001:
        raise HTTPException(status_code=400, detail=f"El abono supera el saldo (Q{remaining:.2f}).")

    _require_own_cash(db, user)
    order.deposit_paid = round(float(order.deposit_paid or 0) + amount, 2)
    _recalc_totals(order)
    _sync_status(order)
    add_cash_movement(
        db,
        user_id=user.id,
        movement_type="income",
        amount=amount,
        description=payload.notes or f"Abono apartado #{order.id}: {order.customer_name}",
        commit=False,
    )
    log_action(
        db,
        user_id=user.id,
        action="order_deposit",
        entity_type="order",
        entity_id=order.id,
        details=f"{amount:.2f}",
    )
    db.commit()
    return _to_out(_order_query(db).filter(Order.id == order.id).one())


@router.post("/{order_id}/mark-ready", response_model=OrderOut)
def mark_order_ready(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = _order_query(db).filter(Order.id == order_id).one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Apartado/orden no encontrado.")
    if order.status in {"delivered", "cancelled"}:
        raise HTTPException(status_code=400, detail="Este apartado ya esta cerrado.")
    order.status = "ready"
    db.commit()
    return _to_out(_order_query(db).filter(Order.id == order.id).one())


@router.post("/{order_id}/deliver", response_model=OrderOut)
def deliver_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = _order_query(db).filter(Order.id == order_id).with_for_update().one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Apartado/orden no encontrado.")
    if order.status in {"delivered", "cancelled"}:
        raise HTTPException(status_code=400, detail="Este apartado ya esta cerrado.")
    if not order.items:
        raise HTTPException(status_code=400, detail="El apartado no tiene productos para entregar.")

    balance = round(max(float(order.total_estimate or 0) - float(order.deposit_paid or 0), 0), 2)
    _require_own_cash(db, user)

    # Stock ya reservado: la venta no vuelve a descontar.
    sale_payload = SaleCreate(
        customer_id=order.customer_id,
        customer_nit=order.customer_nit or "CF",
        customer_name=order.customer_name,
        payment_method="efectivo",
        cash_received=float(order.total_estimate or 0),
        cart_discount_amount=0,
        branch_id=order.branch_id,
        items=[
            SaleItemInput(product_id=i.product_id, quantity=i.quantity, unit_price=i.unit_price)
            for i in order.items
        ],
    )
    try:
        sale = create_sale(
            db,
            sale_payload,
            user_id=user.id,
            commit=False,
            adjust_inventory=not bool(order.stock_reserved),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Si habia reserva, marcar items como consumidos (ya no liberar).
    for item in order.items:
        item.reserved = 0
    order.stock_reserved = 0

    if balance > 0:
        add_cash_movement(
            db,
            user_id=user.id,
            movement_type="income",
            amount=balance,
            description=f"Saldo entrega apartado #{order.id}: {order.customer_name}",
            sale_id=sale.id,
            commit=False,
        )
    # El anticipo ya entro a caja; la venta completa tambien puede registrar ingreso —
    # para no duplicar el total, solo movemos el saldo pendiente.

    order.deposit_paid = round(float(order.total_estimate or 0), 2)
    order.sale_id = sale.id
    order.status = "delivered"
    _recalc_totals(order)
    log_action(
        db,
        user_id=user.id,
        action="order_deliver",
        entity_type="order",
        entity_id=order.id,
        details=f"sale=#{sale.id}",
    )
    db.commit()
    return _to_out(_order_query(db).filter(Order.id == order.id).one())


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order(
    order_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = _order_query(db).filter(Order.id == order_id).with_for_update().one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Apartado/orden no encontrado.")
    if order.status == "delivered":
        raise HTTPException(status_code=400, detail="No se puede cancelar un apartado ya entregado.")
    _release_reservation(db, order, user)
    order.status = "cancelled"
    db.commit()
    return _to_out(_order_query(db).filter(Order.id == order.id).one())


@router.post("/{order_id}/send", response_model=OrderOut)
def send_order(
    order_id: int,
    payload: OrderSendRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("orders.manage")),
):
    order = _order_query(db).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")

    message = build_order_message(order)
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
                    f"Apartado/Orden #{order.id} - FEL POS",
                    message,
                )
            db.add(
                OrderDispatch(
                    order_id=order.id,
                    channel=channel,
                    recipient=recipient,
                    status=status_result,
                    provider_response=provider_response,
                )
            )
        except HTTPException:
            raise
        except Exception as exc:
            db.add(
                OrderDispatch(
                    order_id=order.id,
                    channel=channel,
                    recipient="",
                    status="error",
                    provider_response=str(exc),
                )
            )

    if order.status == "draft":
        order.status = "reserved"
    db.commit()
    return _to_out(_order_query(db).filter(Order.id == order.id).one())
