from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Branch, BranchStock, InventoryMovement, Product


def get_or_create_main_branch(db: Session) -> Branch:
    branch = db.query(Branch).filter(Branch.code == "MAIN").first()
    if branch:
        return branch
    branch = db.query(Branch).order_by(Branch.id.asc()).first()
    if branch:
        return branch
    branch = Branch(code="MAIN", name="Sucursal principal", address="Guatemala")
    db.add(branch)
    db.flush()
    return branch


def resolve_branch_id(db: Session, branch_id: int | None) -> int:
    if branch_id:
        branch = db.get(Branch, branch_id)
        if not branch or not branch.active:
            raise ValueError("Sucursal invalida o inactiva.")
        return int(branch.id)
    return int(get_or_create_main_branch(db).id)


def get_branch_stock_row(
    db: Session,
    product_id: int,
    branch_id: int,
    *,
    for_update: bool = False,
) -> BranchStock:
    query = db.query(BranchStock).filter(
        BranchStock.product_id == product_id,
        BranchStock.branch_id == branch_id,
    )
    if for_update:
        query = query.with_for_update()
    row = query.first()
    if row:
        return row
    row = BranchStock(product_id=product_id, branch_id=branch_id, stock=0)
    db.add(row)
    db.flush()
    if for_update:
        # Releer con lock tras crear la fila (anti carrera en alta concurrente).
        row = (
            db.query(BranchStock)
            .filter(BranchStock.product_id == product_id, BranchStock.branch_id == branch_id)
            .with_for_update()
            .one()
        )
    return row


def get_available_stock(
    db: Session,
    product: Product,
    branch_id: int | None = None,
    *,
    for_update: bool = False,
) -> float:
    if int(product.tracks_inventory or 0) != 1:
        return 999999.0
    bid = resolve_branch_id(db, branch_id)
    row = get_branch_stock_row(db, product.id, bid, for_update=for_update)
    return float(row.stock or 0)


def sync_product_stock_from_branches(db: Session, product: Product) -> None:
    total = (
        db.query(BranchStock)
        .filter(BranchStock.product_id == product.id)
        .all()
    )
    product.stock = round(sum(float(r.stock or 0) for r in total), 2)


def adjust_branch_stock(
    db: Session,
    product: Product,
    quantity_delta: float,
    *,
    branch_id: int | None,
    user_id: int | None,
    movement_type: str,
    notes: str | None = None,
) -> float:
    """Ajusta stock de sucursal y sincroniza Product.stock (suma). Retorna stock de la sucursal."""
    if int(product.tracks_inventory or 0) != 1:
        return float(product.stock or 0)
    bid = resolve_branch_id(db, branch_id)
    row = get_branch_stock_row(db, product.id, bid, for_update=True)
    before = float(row.stock or 0)
    after = round(before + float(quantity_delta), 2)
    if after < -0.0001:
        raise ValueError(
            f"Stock insuficiente para {product.name} en sucursal. "
            f"Disponible: {before:g}, cambio: {quantity_delta:g}."
        )
    row.stock = max(after, 0.0)
    sync_product_stock_from_branches(db, product)
    if user_id:
        db.add(
            InventoryMovement(
                product_id=product.id,
                created_by_user_id=user_id,
                movement_type=movement_type,
                quantity=abs(float(quantity_delta)),
                before_stock=before,
                after_stock=float(row.stock),
                notes=(notes or "")[:300] or None,
                branch_id=bid,
            )
        )
    return float(row.stock)


def bootstrap_branch_stocks(db: Session) -> int:
    """Copia Product.stock a BranchStock de MAIN si aun no existe fila."""
    main = get_or_create_main_branch(db)
    created = 0
    products = db.query(Product).all()
    for product in products:
        existing = (
            db.query(BranchStock)
            .filter(BranchStock.product_id == product.id, BranchStock.branch_id == main.id)
            .first()
        )
        if existing is None:
            db.add(
                BranchStock(
                    product_id=product.id,
                    branch_id=main.id,
                    stock=float(product.stock or 0),
                )
            )
            created += 1
        elif abs(float(existing.stock or 0) - float(product.stock or 0)) > 0.001:
            # Si solo hay MAIN, alinear con product.stock legacy.
            others = (
                db.query(BranchStock)
                .filter(BranchStock.product_id == product.id, BranchStock.branch_id != main.id)
                .count()
            )
            if others == 0:
                existing.stock = float(product.stock or 0)
    db.commit()
    return created


def transfer_between_branches(
    db: Session,
    *,
    product_id: int,
    from_branch_id: int,
    to_branch_id: int,
    quantity: float,
    user_id: int,
    notes: str | None = None,
) -> dict:
    if from_branch_id == to_branch_id:
        raise ValueError("Origen y destino deben ser distintas.")
    qty = round(float(quantity), 2)
    if qty <= 0:
        raise ValueError("Cantidad invalida.")
    product = db.get(Product, product_id)
    if not product or not product.active:
        raise ValueError("Producto invalido.")
    if int(product.tracks_inventory or 0) != 1:
        raise ValueError("Este producto no maneja inventario.")
    from app.services.lot_service import transfer_lots_between_branches

    adjust_branch_stock(
        db,
        product,
        -qty,
        branch_id=from_branch_id,
        user_id=user_id,
        movement_type="transfer_out",
        notes=notes or f"Transferencia a sucursal #{to_branch_id}",
    )
    adjust_branch_stock(
        db,
        product,
        qty,
        branch_id=to_branch_id,
        user_id=user_id,
        movement_type="transfer_in",
        notes=notes or f"Transferencia desde sucursal #{from_branch_id}",
    )
    transfer_lots_between_branches(
        db,
        product=product,
        from_branch_id=from_branch_id,
        to_branch_id=to_branch_id,
        quantity=qty,
    )
    db.commit()
    db.refresh(product)
    return {
        "product_id": product.id,
        "from_branch_id": from_branch_id,
        "to_branch_id": to_branch_id,
        "quantity": qty,
        "product_stock_total": float(product.stock or 0),
    }
