from sqlalchemy.orm import Session, joinedload

from app.models import InventoryMovement, Product, ProductCostHistory, PurchaseOrder, PurchaseOrderItem
from app.services.audit_service import log_action


def receive_purchase_order(
    db: Session,
    *,
    purchase_order_id: int,
    user_id: int,
    invoice_ref: str | None = None,
) -> PurchaseOrder:
    order = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product))
        .filter(PurchaseOrder.id == purchase_order_id)
        .one_or_none()
    )
    if not order:
        raise ValueError("Orden de compra no encontrada.")
    if order.status == "received":
        raise ValueError("La orden ya fue recibida.")

    for line in order.items:
        product = line.product or db.get(Product, line.product_id)
        if not product:
            continue
        qty = float(line.quantity or 0)
        if qty <= 0:
            continue
        previous_cost = float(product.cost or 0)
        new_cost = float(line.unit_cost or previous_cost)
        if new_cost > 0 and new_cost != previous_cost:
            product.cost = new_cost
            db.add(
                ProductCostHistory(
                    product_id=product.id,
                    created_by_user_id=user_id,
                    previous_cost=previous_cost,
                    new_cost=new_cost,
                    source="purchase_receive",
                    notes=invoice_ref or f"OC #{order.id}",
                )
            )
        if product.tracks_inventory:
            before_stock = float(product.stock or 0)
            product.stock = round(before_stock + qty, 2)
            db.add(
                InventoryMovement(
                    product_id=product.id,
                    created_by_user_id=user_id,
                    movement_type="entry",
                    quantity=qty,
                    before_stock=before_stock,
                    after_stock=product.stock,
                    notes=f"Recepcion OC #{order.id}",
                )
            )

    order.status = "received"
    if invoice_ref:
        order.notes = ((order.notes or "").strip() + f"\nFactura: {invoice_ref}").strip()
    log_action(
        db,
        user_id=user_id,
        action="purchase_receive",
        entity_type="purchase_order",
        entity_id=order.id,
        details=invoice_ref,
    )
    db.commit()
    db.refresh(order)
    return order
