from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Product, ProductLot, SaleItemLot
from app.services.inventory_branch_service import resolve_branch_id


def _lots_query(db: Session, product_id: int, branch_id: int):
    return (
        db.query(ProductLot)
        .filter(
            ProductLot.product_id == product_id,
            ProductLot.active == 1,
            ProductLot.quantity > 0,
            ProductLot.branch_id == branch_id,
        )
        .order_by(ProductLot.expires_at.asc().nullslast(), ProductLot.created_at.asc())
    )


def _lot_is_expired(lot: ProductLot, *, now: datetime | None = None) -> bool:
    if lot.expires_at is None:
        return False
    reference = now or datetime.utcnow()
    return lot.expires_at <= reference


def deduct_lots_fefo(
    db: Session,
    *,
    product: Product,
    quantity: float,
    sale_item_id: int,
    branch_id: int | None = None,
    block_expired: bool = True,
) -> list[SaleItemLot]:
    """Descuenta lotes por vencimiento mas cercano (FEFO) en la sucursal de la venta."""
    remaining = round(float(quantity), 2)
    if remaining <= 0:
        return []
    if int(getattr(product, "track_expiry", 0) or 0) != 1:
        return []

    bid = resolve_branch_id(db, branch_id)
    now = datetime.utcnow()
    all_lots = _lots_query(db, product.id, bid).all()
    if block_expired:
        expired_qty = round(
            sum(float(lot.quantity or 0) for lot in all_lots if _lot_is_expired(lot, now=now)),
            2,
        )
        lots = [lot for lot in all_lots if not _lot_is_expired(lot, now=now)]
    else:
        expired_qty = 0.0
        lots = all_lots

    total_lot = round(sum(float(lot.quantity or 0) for lot in lots), 2)
    if total_lot + 0.0001 < remaining:
        extra = ""
        if block_expired and expired_qty > 0:
            extra = f" Hay {expired_qty:g} uds en lotes vencidos (no vendibles)."
        raise ValueError(
            f"Stock por lote insuficiente para {product.name} en esta sucursal. "
            f"En lotes vigentes: {total_lot:g}, solicitado: {remaining:g}.{extra} "
            f"Registra un lote con entrada de inventario."
        )

    allocated: list[SaleItemLot] = []
    for lot in lots:
        if remaining <= 0:
            break
        take = min(float(lot.quantity or 0), remaining)
        if take <= 0:
            continue
        lot.quantity = round(float(lot.quantity or 0) - take, 2)
        if lot.quantity <= 0:
            lot.quantity = 0
            lot.active = 0
        link = SaleItemLot(sale_item_id=sale_item_id, product_lot_id=lot.id, quantity=take)
        db.add(link)
        allocated.append(link)
        remaining = round(remaining - take, 2)
    if remaining > 0.0001:
        raise ValueError(f"No se pudo asignar lotes FEFO para {product.name}.")
    return allocated


def restock_lots_from_sale_item(
    db: Session,
    *,
    product: Product,
    sale_item_id: int,
    quantity: float,
    branch_id: int | None = None,
) -> None:
    """Devuelve cantidad a los lotes originales (proporcional) o al lote mas reciente."""
    to_return = round(float(quantity), 2)
    if to_return <= 0:
        return
    if int(getattr(product, "track_expiry", 0) or 0) != 1:
        return

    bid = resolve_branch_id(db, branch_id)
    links = (
        db.query(SaleItemLot)
        .filter(SaleItemLot.sale_item_id == sale_item_id)
        .order_by(SaleItemLot.id.asc())
        .all()
    )
    remaining = to_return
    if links:
        total_linked = sum(float(link.quantity or 0) for link in links) or 1.0
        allocated = 0.0
        for index, link in enumerate(links):
            if index == len(links) - 1:
                share = round(max(to_return - allocated, 0.0), 2)
            else:
                share = round(to_return * (float(link.quantity or 0) / total_linked), 2)
            if share <= 0:
                continue
            lot = db.get(ProductLot, link.product_lot_id)
            if not lot:
                continue
            lot.quantity = round(float(lot.quantity or 0) + share, 2)
            lot.active = 1
            if lot.branch_id is None:
                lot.branch_id = bid
            allocated = round(allocated + share, 2)
        remaining = round(max(to_return - allocated, 0.0), 2)

    if remaining > 0.0001:
        lot = ProductLot(
            product_id=product.id,
            branch_id=bid,
            lot_code="DEV",
            expires_at=None,
            quantity=remaining,
            active=1,
        )
        db.add(lot)


def adjust_lots_quantity(
    db: Session,
    *,
    product: Product,
    quantity_delta: float,
    branch_id: int | None = None,
    lot_code: str | None = None,
) -> None:
    """Ajusta lotes FEFO en paralelo a un cambio de BranchStock (conteo, compra, edicion)."""
    if int(getattr(product, "track_expiry", 0) or 0) != 1:
        return
    delta = round(float(quantity_delta), 2)
    if abs(delta) < 0.0001:
        return
    bid = resolve_branch_id(db, branch_id)
    if delta > 0:
        code = ((lot_code or "AJUSTE").strip() or "AJUSTE")[:80]
        lot = (
            db.query(ProductLot)
            .filter(
                ProductLot.product_id == product.id,
                ProductLot.branch_id == bid,
                ProductLot.lot_code == code,
                ProductLot.active == 1,
            )
            .order_by(ProductLot.id.desc())
            .first()
        )
        if lot:
            lot.quantity = round(float(lot.quantity or 0) + delta, 2)
        else:
            db.add(
                ProductLot(
                    product_id=product.id,
                    branch_id=bid,
                    lot_code=code,
                    expires_at=None,
                    quantity=delta,
                    active=1,
                )
            )
        return

    remaining = abs(delta)
    lots = _lots_query(db, product.id, bid).all()
    total_lot = round(sum(float(lot.quantity or 0) for lot in lots), 2)
    if total_lot + 0.0001 < remaining:
        raise ValueError(
            f"Lotes insuficientes para {product.name}. "
            f"Disponible en lotes: {total_lot:g}, requerido: {remaining:g}. "
            "Reconcilia lotes antes de aplicar el ajuste."
        )
    for lot in lots:
        if remaining <= 0:
            break
        take = min(float(lot.quantity or 0), remaining)
        if take <= 0:
            continue
        lot.quantity = round(float(lot.quantity or 0) - take, 2)
        if lot.quantity <= 0:
            lot.quantity = 0
            lot.active = 0
        remaining = round(remaining - take, 2)


def transfer_lots_between_branches(
    db: Session,
    *,
    product: Product,
    from_branch_id: int,
    to_branch_id: int,
    quantity: float,
) -> None:
    """Mueve cantidad de lotes FEFO de una sucursal a otra (si track_expiry)."""
    if int(getattr(product, "track_expiry", 0) or 0) != 1:
        return
    remaining = round(float(quantity), 2)
    if remaining <= 0:
        return
    lots = _lots_query(db, product.id, from_branch_id).all()
    total_lot = round(sum(float(lot.quantity or 0) for lot in lots), 2)
    if total_lot + 0.0001 < remaining:
        raise ValueError(
            f"No hay suficientes lotes en origen para transferir {product.name}. "
            f"En lotes: {total_lot:g}, solicitado: {remaining:g}."
        )
    for lot in lots:
        if remaining <= 0:
            break
        take = min(float(lot.quantity or 0), remaining)
        if take <= 0:
            continue
        lot.quantity = round(float(lot.quantity or 0) - take, 2)
        if lot.quantity <= 0:
            lot.quantity = 0
            lot.active = 0
        dest = (
            db.query(ProductLot)
            .filter(
                ProductLot.product_id == product.id,
                ProductLot.branch_id == to_branch_id,
                ProductLot.lot_code == lot.lot_code,
                ProductLot.expires_at == lot.expires_at,
                ProductLot.active == 1,
            )
            .first()
        )
        if dest:
            dest.quantity = round(float(dest.quantity or 0) + take, 2)
        else:
            db.add(
                ProductLot(
                    product_id=product.id,
                    branch_id=to_branch_id,
                    lot_code=lot.lot_code,
                    expires_at=lot.expires_at,
                    quantity=take,
                    active=1,
                )
            )
        remaining = round(remaining - take, 2)


def ensure_lots_cover_branch_stock(db: Session, product: Product) -> None:
    """Si FEFO esta activo, crea lotes COBERTURA para cualquier hueco vs BranchStock."""
    if int(getattr(product, "track_expiry", 0) or 0) != 1:
        return
    if int(getattr(product, "tracks_inventory", 0) or 0) != 1:
        return
    from app.models import BranchStock

    rows = db.query(BranchStock).filter(BranchStock.product_id == product.id).all()
    for row in rows:
        bid = int(row.branch_id)
        branch_qty = round(float(row.stock or 0), 2)
        if branch_qty <= 0:
            continue
        lots = _lots_query(db, product.id, bid).all()
        lot_qty = round(sum(float(lot.quantity or 0) for lot in lots), 2)
        gap = round(branch_qty - lot_qty, 2)
        if gap > 0.0001:
            adjust_lots_quantity(
                db,
                product=product,
                quantity_delta=gap,
                branch_id=bid,
                lot_code="COBERTURA",
            )
