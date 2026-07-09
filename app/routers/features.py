from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models import (
    AuditLog,
    Branch,
    PendingFelSale,
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
    BranchUpdate,
    PendingFelSaleOut,
    ProductCostHistoryOut,
    ProductLotCreate,
    ProductLotOut,
    PromotionCreate,
    PromotionOut,
    PromotionUpdate,
    SchoolPackageCreate,
    SchoolPackageOut,
    SchoolPackageItemOut,
)
from app.services.audit_service import log_action
from app.services.fel_pending_service import list_pending_fel_sales, retry_pending_fel_sale

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
    user: User = Depends(require_roles("admin")),
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
    user: User = Depends(require_roles("admin")),
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
    user: User = Depends(require_roles("admin")),
):
    return db.query(Branch).order_by(Branch.name).all()


@router.post("/api/branches", response_model=BranchOut, status_code=201)
def create_branch(
    payload: BranchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
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


@router.get("/api/audit-logs", response_model=list[AuditLogOut])
def list_audit_logs(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    rows = (
        db.query(AuditLog)
        .options(joinedload(AuditLog.user))
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
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    return (
        db.query(ProductLot)
        .filter(ProductLot.product_id == product_id, ProductLot.active == 1)
        .order_by(ProductLot.expires_at.asc().nullslast())
        .all()
    )


@router.post("/api/products/{product_id}/lots", response_model=ProductLotOut, status_code=201)
def create_product_lot(
    product_id: int,
    payload: ProductLotCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    lot = ProductLot(product_id=product_id, **payload.model_dump())
    db.add(lot)
    log_action(
        db,
        user_id=user.id,
        action="lot_create",
        entity_type="product",
        entity_id=product_id,
        details=f"Lote {payload.lot_code}",
    )
    db.commit()
    db.refresh(lot)
    return lot


@router.get("/api/products/{product_id}/cost-history", response_model=list[ProductCostHistoryOut])
def product_cost_history(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
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
    user: User = Depends(require_roles("admin")),
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


@router.get("/api/products/export/csv")
def export_products_csv(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    products = (
        db.query(Product)
        .options(joinedload(Product.supplier), joinedload(Product.department))
        .filter(Product.active == 1)
        .order_by(Product.name)
        .all()
    )
    lines = ["sku,barcode,name,department,supplier,price,cost,stock,min_stock,tax_rate"]
    for product in products:
        lines.append(
            ",".join(
                [
                    _csv_cell(product.sku),
                    _csv_cell(product.barcode or ""),
                    _csv_cell(product.name),
                    _csv_cell(product.department_name or ""),
                    _csv_cell(product.supplier_name or ""),
                    str(product.price),
                    str(product.cost),
                    str(product.stock),
                    str(product.min_stock),
                    str(product.tax_rate),
                ]
            )
        )
    return PlainTextResponse(
        "\n".join(lines),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="catalogo_felpos.csv"'},
    )


@router.get("/api/fel/pending", response_model=list[PendingFelSaleOut])
def pending_fel_sales(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    return list_pending_fel_sales(db)


@router.post("/api/fel/pending/{pending_id}/retry", response_model=PendingFelSaleOut)
def retry_pending_fel(
    pending_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    try:
        return retry_pending_fel_sale(db, pending_id=pending_id, user_id=user.id)
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
