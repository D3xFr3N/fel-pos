from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_permission, require_roles
from app.models import (
    AuditLog,
    Branch,
    PendingFelSale,
    PrescriptionLog,
    Product,
    ProductCostHistory,
    ProductLot,
    Promotion,
    Sale,
    SchoolPackage,
    SchoolPackageItem,
    User,
)
from app.schemas import (
    AuditLogOut,
    BranchCreate,
    BranchOut,
    BranchStockOut,
    BranchTransferCreate,
    BranchUpdate,
    PendingFelSaleOut,
    FelPendingBulkRetryOut,
    ProductCostHistoryOut,
    ProductLotCreate,
    ProductLotOut,
    PromotionCreate,
    PromotionOut,
    PromotionUpdate,
    SchoolPackageCreate,
    SchoolPackageOut,
    SchoolPackageItemOut,
    SchoolPackageUpdate,
)
from app.services.audit_service import log_action
from app.services.fel_pending_service import (
    dismiss_pending_fel_sale,
    list_pending_fel_sales,
    retry_all_pending_fel_sales,
    retry_pending_fel_sale,
)

router = APIRouter(tags=["features"])


@router.get("/api/promotions", response_model=list[PromotionOut])
def list_promotions(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    return db.query(Promotion).order_by(Promotion.created_at.desc()).all()


@router.post("/api/promotions", response_model=PromotionOut, status_code=201)
def create_promotion(
    payload: PromotionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("promotions.manage")),
):
    promo = Promotion(**payload.model_dump())
    db.add(promo)
    log_action(db, user_id=user.id, action="promotion_create", entity_type="promotion", details=payload.name)
    db.commit()
    db.refresh(promo)
    return promo


@router.patch("/api/promotions/{promotion_id}", response_model=PromotionOut)
def update_promotion(
    promotion_id: int,
    payload: PromotionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("promotions.manage")),
):
    promo = db.get(Promotion, promotion_id)
    if not promo:
        raise HTTPException(status_code=404, detail="Promocion no encontrada.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(promo, key, value)
    log_action(db, user_id=user.id, action="promotion_update", entity_type="promotion", entity_id=promo.id)
    db.commit()
    db.refresh(promo)
    return promo


@router.get("/api/branches", response_model=list[BranchOut])
def list_branches(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    return db.query(Branch).order_by(Branch.name).all()


@router.post("/api/branches", response_model=BranchOut, status_code=201)
def create_branch(
    payload: BranchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    from app.services.store_settings_service import is_multi_branch_enabled, set_multi_branch_enabled

    if not is_multi_branch_enabled(db):
        # Activar al crear la primera sucursal extra.
        set_multi_branch_enabled(db, True)
    branch = Branch(**payload.model_dump())
    db.add(branch)
    log_action(db, user_id=user.id, action="branch_create", entity_type="branch", details=branch.name)
    db.commit()
    db.refresh(branch)
    return branch


@router.patch("/api/branches/{branch_id}", response_model=BranchOut)
def update_branch(
    branch_id: int,
    payload: BranchUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    branch = db.get(Branch, branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(branch, key, value)
    db.commit()
    db.refresh(branch)
    return branch


@router.get("/api/branches/{branch_id}/stock", response_model=list[BranchStockOut])
def list_branch_stock(
    branch_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    from app.models import BranchStock

    branch = db.get(Branch, branch_id)
    if not branch:
        raise HTTPException(status_code=404, detail="Sucursal no encontrada.")
    rows = (
        db.query(BranchStock)
        .options(joinedload(BranchStock.product), joinedload(BranchStock.branch))
        .filter(BranchStock.branch_id == branch_id)
        .all()
    )
    return [
        BranchStockOut(
            product_id=row.product_id,
            branch_id=row.branch_id,
            branch_code=branch.code,
            branch_name=branch.name,
            stock=float(row.stock or 0),
        )
        for row in rows
        if row.product and row.product.active
    ]


@router.get("/api/products/{product_id}/branch-stock", response_model=list[BranchStockOut])
def product_branch_stock(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    from app.models import BranchStock
    from app.services.inventory_branch_service import get_branch_stock_row, get_or_create_main_branch

    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    get_or_create_main_branch(db)
    branches = db.query(Branch).filter(Branch.active == 1).order_by(Branch.id.asc()).all()
    out = []
    for branch in branches:
        row = get_branch_stock_row(db, product_id, branch.id)
        out.append(
            BranchStockOut(
                product_id=product_id,
                branch_id=branch.id,
                branch_code=branch.code,
                branch_name=branch.name,
                stock=float(row.stock or 0),
            )
        )
    db.commit()
    return out


@router.post("/api/inventory/transfer")
def transfer_stock(
    payload: BranchTransferCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    from app.services.inventory_branch_service import transfer_between_branches
    from app.services.store_settings_service import is_multi_branch_enabled

    if not is_multi_branch_enabled(db):
        raise HTTPException(
            status_code=400,
            detail="Activa multi-sucursal en Configuracion para transferir inventario.",
        )

    try:
        result = transfer_between_branches(
            db,
            product_id=payload.product_id,
            from_branch_id=payload.from_branch_id,
            to_branch_id=payload.to_branch_id,
            quantity=payload.quantity,
            user_id=user.id,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    log_action(
        db,
        user_id=user.id,
        action="branch_transfer",
        entity_type="product",
        entity_id=payload.product_id,
        details=f"{payload.quantity} de #{payload.from_branch_id} a #{payload.to_branch_id}",
    )
    db.commit()
    return result


@router.get("/api/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    from app.services.report_service import guatemala_day_bounds_utc_naive, guatemala_today_str

    start_utc, end_utc = guatemala_day_bounds_utc_naive(guatemala_today_str())
    rows = (
        db.query(AuditLog)
        .options(joinedload(AuditLog.user))
        .filter(AuditLog.created_at >= start_utc, AuditLog.created_at < end_utc)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        AuditLogOut(
            id=row.id,
            created_at=row.created_at,
            user_id=row.user_id,
            username=row.user.username if row.user else None,
            action=row.action,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            details=row.details,
        )
        for row in rows
    ]


@router.get("/api/products/{product_id}/lots", response_model=list[ProductLotOut])
def list_product_lots(
    product_id: int,
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.view", "stock.entry")),
):
    from app.services.inventory_branch_service import resolve_branch_id

    query = db.query(ProductLot).filter(ProductLot.product_id == product_id, ProductLot.active == 1)
    if branch_id is not None:
        bid = resolve_branch_id(db, branch_id)
        query = query.filter(ProductLot.branch_id == bid)
    return query.order_by(ProductLot.expires_at.asc().nullslast()).all()


@router.get("/api/pharmacy/prescriptions")
def list_prescriptions(
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.view", "stock.entry", "products.view", "sales.create")),
):
    rows = (
        db.query(PrescriptionLog)
        .options(joinedload(PrescriptionLog.product), joinedload(PrescriptionLog.confirmed_by))
        .order_by(PrescriptionLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": row.id,
            "sale_id": row.sale_id,
            "product_id": row.product_id,
            "product_name": row.product.name if row.product else None,
            "doctor_name": row.doctor_name,
            "license_no": row.license_no,
            "patient_name": row.patient_name,
            "notes": row.notes,
            "confirmed_by": row.confirmed_by.full_name if row.confirmed_by else None,
            "created_at": row.created_at.isoformat(sep=" ", timespec="seconds") if row.created_at else None,
        }
        for row in rows
    ]


@router.get("/api/pharmacy/expiring-lots")
def list_expiring_lots(
    days: int | None = Query(default=None, ge=1, le=365),
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.view", "stock.entry", "products.view")),
):
    """Lotes vencidos o por vencer (panel farmacia / inventario FEFO)."""
    from app.business_profiles import profile_capabilities
    from app.services.inventory_branch_service import resolve_branch_id
    from app.services.store_settings_service import get_or_create_store_settings

    caps = profile_capabilities(get_or_create_store_settings(db).business_profile)
    alert_days = int(days or caps.get("expiry_alert_days") or 30)
    now = datetime.utcnow()
    cutoff = now + timedelta(days=alert_days)
    query = (
        db.query(ProductLot)
        .options(joinedload(ProductLot.product))
        .filter(
            ProductLot.active == 1,
            ProductLot.quantity > 0,
            ProductLot.expires_at.isnot(None),
            ProductLot.expires_at <= cutoff,
        )
    )
    if branch_id is not None:
        bid = resolve_branch_id(db, branch_id)
        query = query.filter(ProductLot.branch_id == bid)
    lots = query.order_by(ProductLot.expires_at.asc()).limit(100).all()
    rows = []
    for lot in lots:
        product = lot.product
        days_left = (lot.expires_at.date() - now.date()).days if lot.expires_at else 0
        if days_left < 0:
            status = "expired"
        elif days_left <= 7:
            status = "critical"
        elif days_left <= 30:
            status = "warning"
        else:
            status = "info"
        rows.append(
            {
                "lot_id": lot.id,
                "product_id": lot.product_id,
                "product_name": product.name if product else f"Producto #{lot.product_id}",
                "sku": product.sku if product else None,
                "lot_code": lot.lot_code,
                "quantity": float(lot.quantity or 0),
                "expires_at": lot.expires_at.isoformat() if lot.expires_at else None,
                "days_left": days_left,
                "status": status,
                "branch_id": lot.branch_id,
            }
        )
    return {
        "days": alert_days,
        "pharmacy": bool(caps.get("pharmacy")),
        "count": len(rows),
        "items": rows,
    }


@router.post("/api/products/{product_id}/lots", response_model=ProductLotOut, status_code=201)
def create_product_lot(
    product_id: int,
    payload: ProductLotCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("stock.entry")),
):
    from app.services.inventory_branch_service import adjust_branch_stock, resolve_branch_id

    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    data = payload.model_dump()
    bid = resolve_branch_id(db, data.pop("branch_id", None))
    lot = ProductLot(product_id=product_id, branch_id=bid, **data)
    db.add(lot)
    db.flush()
    qty = float(payload.quantity or 0)
    if qty > 0 and int(product.tracks_inventory or 0) == 1:
        # Si se activa FEFO por primera vez, cubrir stock existente ANTES del ingreso del lote.
        if int(product.track_expiry or 0) != 1:
            product.track_expiry = 1
            from app.services.lot_service import ensure_lots_cover_branch_stock

            ensure_lots_cover_branch_stock(db, product)
        adjust_branch_stock(
            db,
            product,
            qty,
            branch_id=bid,
            user_id=user.id,
            movement_type="lot_entry",
            notes=f"Lote {payload.lot_code}",
        )
        product.track_expiry = 1
    log_action(
        db,
        user_id=user.id,
        action="lot_create",
        entity_type="product",
        entity_id=product_id,
        details=f"Lote {payload.lot_code} sucursal #{bid}",
    )
    db.commit()
    db.refresh(lot)
    return lot


@router.get("/api/products/{product_id}/cost-history", response_model=list[ProductCostHistoryOut])
def product_cost_history(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.view_cost")),
):
    return (
        db.query(ProductCostHistory)
        .filter(ProductCostHistory.product_id == product_id)
        .order_by(ProductCostHistory.created_at.desc())
        .limit(100)
        .all()
    )


@router.get("/api/school-packages", response_model=list[SchoolPackageOut])
def list_school_packages(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    packages = (
        db.query(SchoolPackage)
        .options(joinedload(SchoolPackage.items).joinedload(SchoolPackageItem.product))
        .filter(SchoolPackage.active == 1)
        .order_by(SchoolPackage.name)
        .all()
    )
    return [_school_package_to_schema(pkg) for pkg in packages]


@router.post("/api/school-packages", response_model=SchoolPackageOut, status_code=201)
def create_school_package(
    payload: SchoolPackageCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.edit", "promotions.manage")),
):
    package = SchoolPackage(
        name=payload.name.strip(),
        school_grade=(payload.school_grade or "").strip() or None,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(package)
    db.flush()
    for line in payload.items:
        product = db.get(Product, line.product_id)
        if not product or not product.active:
            raise HTTPException(status_code=400, detail=f"Producto invalido: {line.product_id}")
        db.add(
            SchoolPackageItem(
                package_id=package.id,
                product_id=line.product_id,
                quantity=line.quantity,
            )
        )
    db.commit()
    refreshed = (
        db.query(SchoolPackage)
        .options(joinedload(SchoolPackage.items).joinedload(SchoolPackageItem.product))
        .filter(SchoolPackage.id == package.id)
        .one()
    )
    return _school_package_to_schema(refreshed)


@router.put("/api/school-packages/{package_id}", response_model=SchoolPackageOut)
def update_school_package(
    package_id: int,
    payload: SchoolPackageUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.edit", "promotions.manage")),
):
    package = db.get(SchoolPackage, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Paquete no encontrado.")
    data = payload.model_dump(exclude_unset=True)
    items = data.pop("items", None)
    for key, value in data.items():
        if key in {"name", "school_grade", "notes"} and isinstance(value, str):
            value = value.strip() or None
            if key == "name" and not value:
                raise HTTPException(status_code=400, detail="El nombre es obligatorio.")
        setattr(package, key, value)
    if items is not None:
        if not items:
            raise HTTPException(status_code=400, detail="El paquete debe tener al menos un producto.")
        db.query(SchoolPackageItem).filter(SchoolPackageItem.package_id == package.id).delete()
        for line in items:
            pid = int(line["product_id"])
            qty = float(line["quantity"])
            product = db.get(Product, pid)
            if not product or not product.active:
                raise HTTPException(status_code=400, detail=f"Producto invalido: {pid}")
            db.add(SchoolPackageItem(package_id=package.id, product_id=pid, quantity=qty))
    db.commit()
    refreshed = (
        db.query(SchoolPackage)
        .options(joinedload(SchoolPackage.items).joinedload(SchoolPackageItem.product))
        .filter(SchoolPackage.id == package.id)
        .one()
    )
    return _school_package_to_schema(refreshed)


@router.delete("/api/school-packages/{package_id}", response_model=SchoolPackageOut)
def deactivate_school_package(
    package_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.edit", "promotions.manage")),
):
    package = db.get(SchoolPackage, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Paquete no encontrado.")
    package.active = 0
    db.commit()
    refreshed = (
        db.query(SchoolPackage)
        .options(joinedload(SchoolPackage.items).joinedload(SchoolPackageItem.product))
        .filter(SchoolPackage.id == package.id)
        .one()
    )
    return _school_package_to_schema(refreshed)


@router.get("/api/products/export/csv")
def export_products_csv(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("products.view")),
):
    include_cost = user.role == "admin" or "products.view_cost" in (
        getattr(user, "permissions", None) or []
    )
    # Prefer permission helper when available.
    try:
        from app.services.permission_service import user_has_permission

        include_cost = user_has_permission(user, "products.view_cost")
    except Exception:
        pass
    products = (
        db.query(Product)
        .options(joinedload(Product.supplier), joinedload(Product.department))
        .filter(Product.active == 1)
        .order_by(Product.name)
        .all()
    )
    header = ["sku", "barcode", "name", "department", "supplier", "price"]
    if include_cost:
        header.append("cost")
    header.extend(["stock", "min_stock", "tax_rate"])
    lines = [",".join(header)]
    for product in products:
        row = [
            _csv_cell(product.sku),
            _csv_cell(product.barcode or ""),
            _csv_cell(product.name),
            _csv_cell(product.department_name or ""),
            _csv_cell(product.supplier_name or ""),
            str(product.price),
        ]
        if include_cost:
            row.append(str(product.cost))
        row.extend(
            [
                str(product.stock),
                str(product.min_stock),
                str(product.tax_rate),
            ]
        )
        lines.append(",".join(row))
    return PlainTextResponse(
        "\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="catalogo_felpos.csv"'},
    )


@router.get("/api/fel/pending", response_model=list[PendingFelSaleOut])
def pending_fel_sales(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    return list_pending_fel_sales(db, user=user)


@router.post("/api/fel/pending/{pending_id}/retry", response_model=PendingFelSaleOut)
def retry_pending_fel(
    pending_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    pending = db.query(PendingFelSale).filter(PendingFelSale.id == pending_id).one_or_none()
    if not pending:
        raise HTTPException(status_code=404, detail="Venta FEL pendiente no encontrada.")
    if user.role != "admin":
        sale = db.query(Sale).filter(Sale.id == pending.sale_id).one_or_none()
        if not sale or sale.created_by_user_id != user.id:
            raise HTTPException(status_code=403, detail="Solo puedes reintentar tus ventas pendientes.")
    try:
        return retry_pending_fel_sale(db, pending_id=pending_id, user_id=user.id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/api/fel/pending/retry-all", response_model=FelPendingBulkRetryOut)
def retry_all_pending_fel(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    if user.role != "admin":
        # Cajero: reintenta solo las suyas.
        pending_ids = [
            row.id
            for row in list_pending_fel_sales(db, user=user)
        ]
        certified = 0
        failed = 0
        items = []
        for pending_id in pending_ids:
            try:
                items.append(retry_pending_fel_sale(db, pending_id=pending_id, user_id=user.id))
                certified += 1
            except ValueError:
                failed += 1
                refreshed = [
                    item for item in list_pending_fel_sales(db, user=user) if item.id == pending_id
                ]
                if refreshed:
                    items.append(refreshed[0])
        return FelPendingBulkRetryOut(
            total=len(pending_ids),
            certified=certified,
            failed=failed,
            items=items,
        )
    return retry_all_pending_fel_sales(db, user_id=user.id)


@router.post("/api/fel/pending/{pending_id}/dismiss", response_model=PendingFelSaleOut)
def dismiss_pending_fel(
    pending_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    try:
        result = dismiss_pending_fel_sale(db, pending_id=pending_id)
        log_action(
            db,
            user_id=user.id,
            action="fel_pending_dismissed",
            entity_type="pending_fel_sale",
            entity_id=pending_id,
            details=f"sale_id={result.sale_id}",
        )
        db.commit()
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _csv_cell(value: str) -> str:
    cleaned = (value or "").replace('"', '""')
    if "," in cleaned or '"' in cleaned:
        return f'"{cleaned}"'
    return cleaned


def _school_package_to_schema(package: SchoolPackage) -> SchoolPackageOut:
    items: list[SchoolPackageItemOut] = []
    package_price = 0.0
    for line in package.items:
        product = line.product
        unit_price = float(product.price or 0) if product else 0
        package_price += unit_price * float(line.quantity or 0)
        items.append(
            SchoolPackageItemOut(
                product_id=line.product_id,
                product_name=product.name if product else f"Producto #{line.product_id}",
                quantity=line.quantity,
                unit_price=round(unit_price, 2),
            )
        )
    return SchoolPackageOut(
        id=package.id,
        name=package.name,
        school_grade=package.school_grade,
        notes=package.notes,
        active=package.active,
        created_at=package.created_at,
        items=items,
        package_price=round(package_price, 2),
    )
