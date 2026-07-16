from datetime import datetime, timedelta

from sqlalchemy.orm import Session, joinedload

from app.models import Product, ProductLot, Sale, SaleItem


def build_system_alerts(db: Session) -> list[dict]:
    alerts: list[dict] = []
    low_stock = (
        db.query(Product)
        .filter(
            Product.active == 1,
            Product.tracks_inventory == 1,
            Product.min_stock > 0,
            Product.stock <= Product.min_stock,
        )
        .order_by(Product.stock.asc())
        .limit(10)
        .all()
    )
    for product in low_stock:
        alerts.append(
            {
                "level": "warning",
                "code": "low_stock",
                "message": f"Stock bajo: {product.name} ({product.stock} / min {product.min_stock})",
                "product_id": product.id,
            }
        )

    soon = datetime.utcnow() + timedelta(days=30)
    expiring = (
        db.query(ProductLot)
        .options(joinedload(ProductLot.product))
        .filter(ProductLot.active == 1, ProductLot.quantity > 0, ProductLot.expires_at.isnot(None))
        .filter(ProductLot.expires_at <= soon)
        .order_by(ProductLot.expires_at.asc())
        .limit(10)
        .all()
    )
    for lot in expiring:
        product_name = lot.product.name if lot.product else f"Producto #{lot.product_id}"
        alerts.append(
            {
                "level": "danger",
                "code": "expiring_lot",
                "message": f"Por vencer: {product_name} lote {lot.lot_code}",
                "product_id": lot.product_id,
            }
        )

    cutoff = datetime.utcnow() - timedelta(days=60)
    sold_recent = {
        row[0]
        for row in db.query(SaleItem.product_id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.created_at >= cutoff)
        .distinct()
        .all()
    }
    stale = (
        db.query(Product)
        .filter(Product.active == 1, Product.tracks_inventory == 1, Product.stock > 0)
        .order_by(Product.name.asc())
        .limit(200)
        .all()
    )
    no_movement_count = 0
    for product in stale:
        if product.id in sold_recent:
            continue
        alerts.append(
            {
                "level": "info",
                "code": "no_movement",
                "message": f"Sin ventas 60d: {product.name}",
                "product_id": product.id,
            }
        )
        no_movement_count += 1
        if no_movement_count >= 5:
            break

    return alerts[:25]
