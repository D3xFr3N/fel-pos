from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models import Product, PurchaseOrder, PurchaseOrderDispatch, PurchaseOrderItem, Supplier, User
from app.schemas import (
    PurchaseOrderCreate,
    PurchaseOrderDispatchOut,
    PurchaseOrderItemOut,
    PurchaseOrderOut,
    PurchaseOrderSendRequest,
    PurchaseReceiveRequest,
)
from app.services.order_notification_service import (
    build_purchase_order_message,
    send_gmail,
    send_whatsapp,
)
from app.services.purchase_receipt_service import receive_purchase_order

router = APIRouter(prefix="/api/purchase-orders", tags=["purchase-orders"])


def purchase_order_to_schema(purchase_order: PurchaseOrder) -> PurchaseOrderOut:
    return PurchaseOrderOut(
        id=purchase_order.id,
        created_at=purchase_order.created_at,
        supplier_id=purchase_order.supplier_id,
        supplier_name=purchase_order.supplier.name,
        total_estimate=purchase_order.total_estimate,
        status=purchase_order.status,
        notes=purchase_order.notes,
        items=[
            PurchaseOrderItemOut(
                product_id=item.product_id,
                product_name=item.product.name,
                quantity=item.quantity,
                unit_cost=item.unit_cost,
                line_total=item.line_total,
            )
            for item in purchase_order.items
        ],
        dispatches=[PurchaseOrderDispatchOut.model_validate(dispatch) for dispatch in purchase_order.dispatches],
    )


def send_purchase_order_channels(
    db: Session,
    purchase_order: PurchaseOrder,
    channels: list[str],
) -> None:
    supplier = purchase_order.supplier
    unique_channels = list(dict.fromkeys(channels))
    message = build_purchase_order_message(purchase_order)
    statuses: list[str] = []

    for channel in unique_channels:
        try:
            if channel == "whatsapp":
                recipient = (supplier.phone or "").strip()
                if not recipient:
                    status_result, provider_response = (
                        "error",
                        "Proveedor sin telefono WhatsApp.",
                    )
                else:
                    status_result, provider_response = send_whatsapp(recipient, message)
            else:
                recipient = (supplier.email or "").strip()
                if not recipient:
                    status_result, provider_response = (
                        "error",
                        "Proveedor sin correo configurado.",
                    )
                else:
                    status_result, provider_response = send_gmail(
                        recipient,
                        subject=f"Orden de compra #{purchase_order.id}",
                        message=message,
                    )
        except Exception as exc:
            recipient = (supplier.email if channel == "gmail" else supplier.phone) or ""
            status_result = "error"
            provider_response = str(exc)

        statuses.append(status_result)
        db.add(
            PurchaseOrderDispatch(
                purchase_order_id=purchase_order.id,
                channel=channel,
                recipient=recipient,
                status=status_result,
                provider_response=provider_response,
            )
        )

    if statuses and all(status == "sent" for status in statuses):
        purchase_order.status = "sent"
    elif statuses and any(status == "error" for status in statuses):
        purchase_order.status = "partial_error"
    else:
        purchase_order.status = "queued"


@router.get("", response_model=list[PurchaseOrderOut])
def list_purchase_orders(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    orders = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
            joinedload(PurchaseOrder.dispatches),
        )
        .order_by(PurchaseOrder.created_at.desc())
        .limit(100)
        .all()
    )
    return [purchase_order_to_schema(order) for order in orders]


@router.post("", response_model=list[PurchaseOrderOut], status_code=201)
def create_purchase_orders(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    combined_quantities: dict[int, float] = defaultdict(float)
    for line in payload.items:
        combined_quantities[line.product_id] += line.quantity

    product_ids = list(combined_quantities.keys())
    products = db.query(Product).filter(Product.id.in_(product_ids), Product.active == 1).all()
    products_by_id = {product.id: product for product in products}
    missing = [product_id for product_id in product_ids if product_id not in products_by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"Productos no validos: {missing}")

    grouped_by_supplier: dict[int, list[tuple[Product, float]]] = defaultdict(list)
    for product_id, quantity in combined_quantities.items():
        product = products_by_id[product_id]
        if not product.supplier_id:
            raise HTTPException(
                status_code=400,
                detail=f"El producto {product.name} no tiene proveedor asignado.",
            )
        grouped_by_supplier[product.supplier_id].append((product, quantity))

    created_order_ids: list[int] = []
    for supplier_id, lines in grouped_by_supplier.items():
        supplier = db.get(Supplier, supplier_id)
        if not supplier or not supplier.active:
            raise HTTPException(status_code=400, detail=f"Proveedor no disponible: {supplier_id}")

        purchase_order = PurchaseOrder(
            created_by_user_id=user.id,
            supplier_id=supplier_id,
            status="created",
            notes=(payload.notes or "").strip() or None,
        )
        db.add(purchase_order)
        db.flush()

        total_estimate = 0.0
        for product, quantity in lines:
            unit_cost = round(product.cost, 2)
            line_total = round(unit_cost * quantity, 2)
            total_estimate += line_total
            db.add(
                PurchaseOrderItem(
                    purchase_order_id=purchase_order.id,
                    product_id=product.id,
                    quantity=quantity,
                    unit_cost=unit_cost,
                    line_total=line_total,
                )
            )

        purchase_order.total_estimate = round(total_estimate, 2)
        db.flush()

        po_with_lines = (
            db.query(PurchaseOrder)
            .options(
                joinedload(PurchaseOrder.supplier),
                joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
                joinedload(PurchaseOrder.dispatches),
            )
            .filter(PurchaseOrder.id == purchase_order.id)
            .one()
        )
        send_purchase_order_channels(db, po_with_lines, payload.channels)

        created_order_ids.append(purchase_order.id)

    db.commit()

    created_orders = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
            joinedload(PurchaseOrder.dispatches),
        )
        .filter(PurchaseOrder.id.in_(created_order_ids))
        .order_by(PurchaseOrder.created_at.desc(), PurchaseOrder.id.desc())
        .all()
    )
    return [purchase_order_to_schema(order) for order in created_orders]


@router.post("/{purchase_order_id}/send", response_model=PurchaseOrderOut)
def resend_purchase_order(
    purchase_order_id: int,
    payload: PurchaseOrderSendRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    purchase_order = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
            joinedload(PurchaseOrder.dispatches),
        )
        .filter(PurchaseOrder.id == purchase_order_id)
        .one_or_none()
    )
    if not purchase_order:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada.")

    send_purchase_order_channels(db, purchase_order, payload.channels)
    db.commit()

    refreshed = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
            joinedload(PurchaseOrder.dispatches),
        )
        .filter(PurchaseOrder.id == purchase_order_id)
        .one()
    )
    return purchase_order_to_schema(refreshed)


@router.post("/{purchase_order_id}/receive", response_model=PurchaseOrderOut)
def receive_purchase_order_endpoint(
    purchase_order_id: int,
    payload: PurchaseReceiveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    try:
        order = receive_purchase_order(
            db,
            purchase_order_id=purchase_order_id,
            user_id=user.id,
            invoice_ref=(payload.invoice_ref or "").strip() or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    refreshed = (
        db.query(PurchaseOrder)
        .options(
            joinedload(PurchaseOrder.supplier),
            joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product),
            joinedload(PurchaseOrder.dispatches),
        )
        .filter(PurchaseOrder.id == order.id)
        .one()
    )
    return purchase_order_to_schema(refreshed)
