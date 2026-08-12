from datetime import datetime, timedelta

from sqlalchemy.orm import Session, joinedload

from app.models import Product, ProductLot, Sale, SaleItem


def _expiry_alert_days(db: Session) -> int:
    try:
        from app.business_profiles import normalize_business_profile, profile_capabilities
        from app.services.store_settings_service import get_or_create_store_settings

        profile = normalize_business_profile(get_or_create_store_settings(db).business_profile)
        days = int(profile_capabilities(profile).get("expiry_alert_days") or 30)
        return max(7, min(days, 180))
    except Exception:
        return 30


def build_system_alerts(db: Session) -> list[dict]:
    alerts: list[dict] = []
    low_stock = (
        db.query(Product)
        .filter(
            Product.active == 1,
            Product.tracks_inventory == 1,
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
                "message": (
                    f"Stock total bajo: {product.name} "
                    f"({product.stock:g} / min {product.min_stock:g})"
                ),
                "product_id": product.id,
            }
        )

    # Alertas por sucursal (stock local bajo el minimo del producto).
    try:
        from app.models import BranchStock

        branch_rows = (
            db.query(BranchStock, Product)
            .join(Product, Product.id == BranchStock.product_id)
            .filter(
                Product.active == 1,
                Product.tracks_inventory == 1,
                BranchStock.stock <= Product.min_stock,
            )
            .order_by(BranchStock.stock.asc())
            .limit(10)
            .all()
        )
        for row, product in branch_rows:
            alerts.append(
                {
                    "level": "warning",
                    "code": "low_stock_branch",
                    "message": (
                        f"Stock bajo en sucursal #{row.branch_id}: {product.name} "
                        f"({float(row.stock or 0):g} / min {float(product.min_stock or 0):g})"
                    ),
                    "product_id": product.id,
                    "branch_id": row.branch_id,
                }
            )
    except Exception:
        pass

    now = datetime.utcnow()
    alert_days = _expiry_alert_days(db)
    soon = now + timedelta(days=alert_days)
    expiring = (
        db.query(ProductLot)
        .options(joinedload(ProductLot.product))
        .filter(ProductLot.active == 1, ProductLot.quantity > 0, ProductLot.expires_at.isnot(None))
        .filter(ProductLot.expires_at <= soon)
        .order_by(ProductLot.expires_at.asc())
        .limit(15)
        .all()
    )
    for lot in expiring:
        product_name = lot.product.name if lot.product else f"Producto #{lot.product_id}"
        expires_at = lot.expires_at
        days_left = (expires_at.date() - now.date()).days if expires_at else 0
        if days_left < 0:
            level = "danger"
            prefix = "Vencido"
            code = "expired_lot"
        elif days_left <= 7:
            level = "danger"
            prefix = f"Vence en {days_left}d"
            code = "expiring_lot"
        elif days_left <= 30:
            level = "warning"
            prefix = f"Vence en {days_left}d"
            code = "expiring_lot"
        else:
            level = "info"
            prefix = f"Vence en {days_left}d"
            code = "expiring_lot"
        alerts.append(
            {
                "level": level,
                "code": code,
                "message": f"{prefix}: {product_name} lote {lot.lot_code} ({float(lot.quantity or 0):g} uds)",
                "product_id": lot.product_id,
                "lot_id": lot.id,
                "days_left": days_left,
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
