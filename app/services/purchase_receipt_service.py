from sqlalchemy.orm import Session, joinedload

from app.models import Product, ProductCostHistory, PurchaseOrder, PurchaseOrderItem
from app.services.audit_service import log_action
from app.services.inventory_branch_service import adjust_branch_stock, resolve_branch_id


def receive_purchase_order(
    db: Session,
    *,
    purchase_order_id: int,
    user_id: int,
    invoice_ref: str | None = None,
    branch_id: int | None = None,
) -> PurchaseOrder:
    order = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items).joinedload(PurchaseOrderItem.product))
        .filter(PurchaseOrder.id == purchase_order_id)
        .with_for_update()
        .one_or_none()
    )
    if not order:
        raise ValueError("Orden de compra no encontrada.")
    if order.status == "received":
        raise ValueError("La orden ya fue recibida.")

    target_branch_id = resolve_branch_id(db, branch_id)

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
            adjust_branch_stock(
                db,
                product,
                qty,
                branch_id=target_branch_id,
                user_id=user_id,
                movement_type="entry",
                notes=f"Recepcion OC #{order.id}",
            )
            if int(getattr(product, "track_expiry", 0) or 0) == 1:
                from app.services.lot_service import adjust_lots_quantity

                adjust_lots_quantity(
                    db,
                    product=product,
                    quantity_delta=qty,
                    branch_id=target_branch_id,
                    lot_code=f"OC-{order.id}",
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
