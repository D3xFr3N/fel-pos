from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.business_profiles import business_profile_label, normalize_business_profile
from app.config import settings
from app.services.printer_config_service import (
    get_receipt_printer_config,
    print_receipt_test_page,
    update_receipt_printer_config,
)
from app.services.store_settings_service import (
    bootstrap_store_settings,
    store_settings_to_schema,
    update_store_settings,
)

from app.database import get_db
from app.dependencies import require_roles
from app.models import CreditPayment, Customer, Department, InventoryMovement, Product, Supplier, User
from app.schemas import (
    BarcodeLabelPrintRequest,
    BarcodeLabelPrintResponse,
    BusinessProfileConfigOut,
    CompanyConfig,
    CompanyConfigUpdateIn,
    CreditPaymentCreate,
    CreditPaymentOut,
    CustomerCreate,
    CustomerLookupOut,
    CustomerOut,
    CustomerUpdate,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    EleventaImportOut,
    GenerateMissingBarcodesResponse,
    InventoryMovementOut,
    LowStockReportOut,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    ReceiptPrinterConfigOut,
    ReceiptPrinterConfigUpdateIn,
    ReceiptPrinterTestOut,
    SupplierCreate,
    SupplierOut,
    SupplierUpdate,
    StockEntryCreate,
)
from app.services.audit_service import log_action
from app.services.customer_lookup_service import lookup_customer_by_nit
from app.services.eleventa_import_service import (
    DEFAULT_SUPPLIER_NAME,
    import_eleventa_rows,
    map_eleventa_columns,
    parse_eleventa_file,
)
from app.services.label_service import print_barcode_labels
from app.services.nit_service import is_valid_nit, normalize_nit

router = APIRouter(prefix="/api/products", tags=["products"])


def _product_to_out(product: Product, *, include_cost: bool = True) -> ProductOut:
    data = ProductOut.model_validate(product)
    if not include_cost:
        data.cost = 0
    return data


def _clean_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _normalize_barcode_value(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().upper()
    return cleaned or None


def _assign_generated_barcode(db: Session, product: Product) -> Product:
    if product.barcode:
        return product

    base_code = f"FEL{product.id:06d}"
    candidate = base_code
    suffix = 1
    while (
        db.query(Product)
        .filter(Product.barcode == candidate, Product.id != product.id)
        .first()
        is not None
    ):
        candidate = f"{base_code}{suffix:02d}"
        suffix += 1
        if suffix > 99:
            raise HTTPException(
                status_code=500,
                detail="No se pudo generar codigo de barras unico para este producto.",
            )

    product.barcode = candidate
    return product


@router.get("", response_model=list[ProductOut])
def list_products(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "user")),
):
    products = (
        db.query(Product)
        .options(joinedload(Product.supplier), joinedload(Product.department))
        .filter(Product.active == 1)
        .order_by(Product.name)
        .all()
    )
    include_cost = user.role == "admin"
    return [_product_to_out(product, include_cost=include_cost) for product in products]


@router.get("/{product_id}/kardex", response_model=list[InventoryMovementOut])
def product_kardex(
    product_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    return (
        db.query(InventoryMovement)
        .filter(InventoryMovement.product_id == product_id)
        .order_by(InventoryMovement.created_at.desc())
        .limit(200)
        .all()
    )


@router.get("/low-stock", response_model=list[ProductOut])
def list_low_stock_products(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    return (
        db.query(Product)
        .options(joinedload(Product.supplier), joinedload(Product.department))
        .filter(Product.active == 1, Product.min_stock > 0, Product.stock <= Product.min_stock)
        .order_by(Product.stock.asc(), Product.name.asc())
        .all()
    )


@router.get("/low-stock/report", response_model=list[LowStockReportOut])
def low_stock_report(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    low_products = (
        db.query(Product)
        .options(joinedload(Product.supplier), joinedload(Product.department))
        .filter(Product.active == 1, Product.min_stock > 0, Product.stock <= Product.min_stock)
        .order_by(Product.stock.asc(), Product.name.asc())
        .all()
    )

    now = datetime.utcnow()
    report: list[LowStockReportOut] = []
    for product in low_products:
        movements = (
            db.query(InventoryMovement)
            .filter(InventoryMovement.product_id == product.id)
            .order_by(InventoryMovement.created_at.asc())
            .all()
        )

        low_since_at = None
        for movement in movements:
            if movement.after_stock <= product.min_stock:
                if low_since_at is None:
                    low_since_at = movement.created_at
            else:
                low_since_at = None

        low_for_hours = None
        if low_since_at:
            low_for_hours = round((now - low_since_at).total_seconds() / 3600, 2)

        report.append(
            LowStockReportOut(
                product_id=product.id,
                sku=product.sku,
                name=product.name,
                department_id=product.department_id,
                department_name=product.department_name,
                supplier_id=product.supplier_id,
                supplier_name=product.supplier_name,
                stock=product.stock,
                min_stock=product.min_stock,
                deficit=round(max(product.min_stock - product.stock, 0), 2),
                low_since_at=low_since_at,
                low_for_hours=low_for_hours,
                wholesale_enabled=product.wholesale_enabled,
                wholesale_min_qty=product.wholesale_min_qty,
                wholesale_discount_pct=product.wholesale_discount_pct,
            )
        )

    return report


@router.get("/by-sku/{sku}", response_model=ProductOut)
def get_product_by_sku(
    sku: str,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "user")),
):
    normalized_code = (sku or "").strip().upper()
    if not normalized_code:
        raise HTTPException(status_code=400, detail="Codigo requerido.")
    product = (
        db.query(Product)
        .options(joinedload(Product.supplier), joinedload(Product.department))
        .filter(
            Product.active == 1,
            or_(
                Product.sku.ilike(normalized_code),
                Product.barcode.ilike(normalized_code),
            ),
        )
        .one_or_none()
    )
    if not product:
        raise HTTPException(status_code=404, detail=f"No se encontro producto con codigo {normalized_code}.")
    return product


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    if not payload.supplier_id:
        raise HTTPException(status_code=400, detail="Debes asignar proveedor al producto.")
    supplier = db.get(Supplier, payload.supplier_id)
    if not supplier or not supplier.active:
        raise HTTPException(status_code=400, detail="Proveedor invalido.")
    if payload.department_id:
        department = db.get(Department, payload.department_id)
        if not department or not department.active:
            raise HTTPException(status_code=400, detail="Departamento invalido.")

    payload_data = payload.model_dump()
    for key in ("description", "school_category", "school_grade", "school_brand", "school_variant"):
        payload_data[key] = _clean_optional_text(payload_data.get(key))
    payload_data["barcode"] = _normalize_barcode_value(payload_data.get("barcode"))

    existing = db.query(Product).filter(Product.sku == payload.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail="SKU ya existe.")
    if payload_data["barcode"]:
        existing_barcode = db.query(Product).filter(Product.barcode == payload_data["barcode"]).first()
        if existing_barcode:
            raise HTTPException(status_code=400, detail="Codigo de barras ya existe.")
    product = Product(**payload_data)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.post("/{product_id}/stock-entry", response_model=InventoryMovementOut, status_code=201)
def register_stock_entry(
    product_id: int,
    payload: StockEntryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    product = db.get(Product, product_id)
    if not product or not product.active:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")

    before_stock = float(product.stock)
    product.stock = round(before_stock + payload.quantity, 2)
    movement = InventoryMovement(
        product_id=product.id,
        created_by_user_id=user.id,
        movement_type="entry",
        quantity=payload.quantity,
        before_stock=before_stock,
        after_stock=product.stock,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    previous_price = float(product.price or 0)
    previous_cost = float(product.cost or 0)
    payload_data = payload.model_dump(exclude_unset=True)
    for key in ("description", "school_category", "school_grade", "school_brand", "school_variant"):
        if key in payload_data:
            payload_data[key] = _clean_optional_text(payload_data.get(key))
    if "barcode" in payload_data:
        payload_data["barcode"] = _normalize_barcode_value(payload_data.get("barcode"))
    if "supplier_id" in payload_data and payload_data["supplier_id"]:
        supplier = db.get(Supplier, payload_data["supplier_id"])
        if not supplier or not supplier.active:
            raise HTTPException(status_code=400, detail="Proveedor invalido.")
    if "department_id" in payload_data and payload_data["department_id"]:
        department = db.get(Department, payload_data["department_id"])
        if not department or not department.active:
            raise HTTPException(status_code=400, detail="Departamento invalido.")
    if "barcode" in payload_data and payload_data["barcode"]:
        existing_barcode = (
            db.query(Product)
            .filter(Product.barcode == payload_data["barcode"], Product.id != product_id)
            .first()
        )
        if existing_barcode:
            raise HTTPException(status_code=400, detail="Codigo de barras ya existe.")
    for key, value in payload_data.items():
        setattr(product, key, value)
    if "price" in payload_data and float(product.price or 0) != previous_price:
        log_action(
            db,
            user_id=user.id,
            action="price_change",
            entity_type="product",
            entity_id=product.id,
            details=f"{previous_price} -> {product.price}",
        )
    if "cost" in payload_data and float(product.cost or 0) != previous_cost:
        log_action(
            db,
            user_id=user.id,
            action="cost_change",
            entity_type="product",
            entity_id=product.id,
            details=f"{previous_cost} -> {product.cost}",
        )
    db.commit()
    db.refresh(product)
    return product


@router.post("/import/eleventa", response_model=EleventaImportOut)
async def import_products_from_eleventa(
    file: UploadFile = File(...),
    update_existing: bool = Form(default=True),
    update_stock: bool = Form(default=True),
    default_supplier_name: str = Form(default=DEFAULT_SUPPLIER_NAME),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Debes seleccionar un archivo.")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="El archivo esta vacio.")

    try:
        headers, rows = parse_eleventa_file(content, file.filename)
        column_map = map_eleventa_columns(headers)
        stats = import_eleventa_rows(
            db,
            user_id=user.id,
            rows=rows,
            column_map=column_map,
            update_existing=update_existing,
            update_stock=update_stock,
            default_supplier_name=(default_supplier_name or DEFAULT_SUPPLIER_NAME).strip()
            or DEFAULT_SUPPLIER_NAME,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    message = (
        f"Importacion completada: {stats.created} creados, {stats.updated} actualizados, "
        f"{stats.skipped} omitidos."
    )
    return EleventaImportOut(
        created=stats.created,
        updated=stats.updated,
        skipped=stats.skipped,
        departments_created=stats.departments_created,
        suppliers_created=stats.suppliers_created,
        errors=stats.errors[:50],
        message=message,
    )


@router.post("/generate-missing-barcodes", response_model=GenerateMissingBarcodesResponse)
def generate_missing_barcodes(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    products = (
        db.query(Product)
        .filter(Product.active == 1, or_(Product.barcode.is_(None), Product.barcode == ""))
        .order_by(Product.id.asc())
        .all()
    )
    generated = 0
    for product in products:
        _assign_generated_barcode(db, product)
        generated += 1
    if generated:
        db.commit()
    return GenerateMissingBarcodesResponse(
        generated_count=generated,
        message=f"Se generaron {generated} codigo(s) de barras.",
    )


@router.post("/{product_id}/generate-barcode", response_model=ProductOut)
def generate_product_barcode(
    product_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    if not product.active:
        raise HTTPException(status_code=400, detail="El producto esta inactivo.")
    _assign_generated_barcode(db, product)
    db.commit()
    db.refresh(product)
    return product


@router.post("/{product_id}/print-labels", response_model=BarcodeLabelPrintResponse)
def print_product_barcode_labels(
    product_id: int,
    payload: BarcodeLabelPrintRequest,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    if not product.active:
        raise HTTPException(status_code=400, detail="El producto esta inactivo.")

    barcode = _normalize_barcode_value(product.barcode)
    if not barcode:
        _assign_generated_barcode(db, product)
        db.commit()
        db.refresh(product)
        barcode = _normalize_barcode_value(product.barcode)

    if not barcode:
        raise HTTPException(status_code=400, detail="El producto no tiene codigo de barras.")

    label_description = _clean_optional_text(payload.description) if payload.description is not None else product.description
    if payload.description is not None and label_description != product.description:
        product.description = label_description
        db.commit()
        db.refresh(product)

    if payload.mode == "thermal":
        printer_name = print_barcode_labels(
            product_name=product.name,
            barcode=barcode,
            quantity=payload.quantity,
            price=product.price if payload.include_price else None,
            description=label_description if payload.include_description else None,
        )
        return BarcodeLabelPrintResponse(
            message=f"Se enviaron {payload.quantity} etiqueta(s) a la impresora.",
            printer_name=printer_name,
            quantity=payload.quantity,
            barcode=barcode,
        )

    return BarcodeLabelPrintResponse(
        message="Usa impresion por navegador desde la interfaz.",
        printer_name=None,
        quantity=payload.quantity,
        barcode=barcode,
    )


suppliers_router = APIRouter(prefix="/api/suppliers", tags=["suppliers"])


@suppliers_router.get("", response_model=list[SupplierOut])
def list_suppliers(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    return db.query(Supplier).filter(Supplier.active == 1).order_by(Supplier.name).all()


@suppliers_router.post("", response_model=SupplierOut, status_code=201)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    existing = db.query(Supplier).filter(Supplier.name == payload.name.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Proveedor ya existe.")
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@suppliers_router.put("/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    supplier = db.get(Supplier, supplier_id)
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(supplier, key, value)
    db.commit()
    db.refresh(supplier)
    return supplier


departments_router = APIRouter(prefix="/api/departments", tags=["departments"])


@departments_router.get("", response_model=list[DepartmentOut])
def list_departments(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "user")),
):
    return db.query(Department).filter(Department.active == 1).order_by(Department.name).all()


@departments_router.post("", response_model=DepartmentOut, status_code=201)
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nombre de departamento requerido.")
    existing = db.query(Department).filter(Department.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Departamento ya existe.")
    department = Department(name=name, description=(payload.description or "").strip() or None)
    db.add(department)
    db.commit()
    db.refresh(department)
    return department


@departments_router.put("/{department_id}", response_model=DepartmentOut)
def update_department(
    department_id: int,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    department = db.get(Department, department_id)
    if not department:
        raise HTTPException(status_code=404, detail="Departamento no encontrado.")

    payload_data = payload.model_dump(exclude_unset=True)
    if "name" in payload_data and payload_data["name"] is not None:
        name = payload_data["name"].strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nombre de departamento requerido.")
        existing = db.query(Department).filter(Department.name == name, Department.id != department_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Departamento ya existe.")
        payload_data["name"] = name

    if "description" in payload_data and payload_data["description"] is not None:
        payload_data["description"] = (payload_data["description"] or "").strip() or None

    for key, value in payload_data.items():
        setattr(department, key, value)
    db.commit()
    db.refresh(department)
    return department


customers_router = APIRouter(prefix="/api/customers", tags=["customers"])


@customers_router.get("", response_model=list[CustomerOut])
def list_customers(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "user")),
):
    return db.query(Customer).order_by(Customer.name).all()


@customers_router.get("/lookup/{nit}", response_model=CustomerLookupOut)
def lookup_customer(
    nit: str,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "user")),
):
    cleaned_nit = normalize_nit(nit)
    if not cleaned_nit or cleaned_nit == "CF":
        return CustomerLookupOut(nit="CF", name="CONSUMIDOR FINAL", found=False)
    if not is_valid_nit(cleaned_nit):
        raise HTTPException(status_code=400, detail="NIT invalido.")

    existing = db.query(Customer).filter(Customer.nit == cleaned_nit).first()
    if existing:
        return CustomerLookupOut(
            nit=existing.nit,
            name=existing.name,
            email=existing.email,
            address=existing.address,
            found=True,
        )

    try:
        lookup_result = lookup_customer_by_nit(cleaned_nit)
    except Exception:
        lookup_result = None

    if lookup_result:
        return CustomerLookupOut(
            nit=lookup_result.nit,
            name=lookup_result.name,
            email=lookup_result.email,
            address=lookup_result.address,
            found=True,
        )

    return CustomerLookupOut(nit=cleaned_nit, name="CLIENTE", found=False)


@customers_router.post("", response_model=CustomerOut, status_code=201)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "user")),
):
    existing = db.query(Customer).filter(Customer.nit == payload.nit).first()
    if existing:
        raise HTTPException(status_code=400, detail="NIT ya registrado.")
    customer = Customer(**payload.model_dump())
    db.add(customer)
    log_action(db, user_id=user.id, action="customer_create", entity_type="customer", details=customer.nit)
    db.commit()
    db.refresh(customer)
    return customer


@customers_router.patch("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(customer, key, value)
    log_action(db, user_id=user.id, action="customer_update", entity_type="customer", entity_id=customer.id)
    db.commit()
    db.refresh(customer)
    return customer


@customers_router.post("/{customer_id}/credit-payments", response_model=CreditPaymentOut, status_code=201)
def register_credit_payment(
    customer_id: int,
    payload: CreditPaymentCreate,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin", "user")),
):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Cliente no encontrado.")
    amount = round(float(payload.amount), 2)
    balance = round(float(customer.credit_balance or 0), 2)
    if amount > balance:
        raise HTTPException(status_code=400, detail=f"El abono excede el saldo pendiente (Q{balance:.2f}).")
    payment = CreditPayment(
        customer_id=customer.id,
        sale_id=payload.sale_id,
        created_by_user_id=user.id,
        amount=amount,
        payment_method=payload.payment_method,
        notes=(payload.notes or "").strip() or None,
    )
    customer.credit_balance = round(balance - amount, 2)
    db.add(payment)
    log_action(
        db,
        user_id=user.id,
        action="credit_payment",
        entity_type="customer",
        entity_id=customer.id,
        details=f"Abono Q{amount:.2f}",
    )
    db.commit()
    db.refresh(payment)
    return payment


config_router = APIRouter(prefix="/api/config", tags=["config"])


@config_router.get("/profile", response_model=BusinessProfileConfigOut)
def get_business_profile(db: Session = Depends(get_db), user=Depends(require_roles("admin", "user"))):
    row = bootstrap_store_settings(db)
    profile = normalize_business_profile(row.business_profile)
    return BusinessProfileConfigOut(
        business_profile=profile,
        business_profile_label=business_profile_label(profile),
    )


@config_router.get("", response_model=CompanyConfig)
def get_config(db: Session = Depends(get_db), user=Depends(require_roles("admin"))):
    row = bootstrap_store_settings(db)
    return store_settings_to_schema(row)


@config_router.put("", response_model=CompanyConfig)
def save_config(
    payload: CompanyConfigUpdateIn,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    from app.services.audit_service import log_action

    try:
        row = update_store_settings(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    log_action(
        db,
        user_id=user.id,
        action="store_settings_updated",
        entity_type="store_settings",
        entity_id=row.id,
        details=f"fel_mode={row.fel_mode}; certificador={row.certificador}",
    )
    db.commit()
    return store_settings_to_schema(row)


@config_router.get("/receipt-printer", response_model=ReceiptPrinterConfigOut)
def get_receipt_printer_config_route(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    bootstrap_store_settings(db)
    return ReceiptPrinterConfigOut(**get_receipt_printer_config())


@config_router.put("/receipt-printer", response_model=ReceiptPrinterConfigOut)
def save_receipt_printer_config_route(
    payload: ReceiptPrinterConfigUpdateIn,
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    bootstrap_store_settings(db)
    try:
        result = update_receipt_printer_config(
            printer_name=payload.printer_name,
            print_on_checkout=payload.print_on_checkout,
            open_drawer_on_checkout=payload.open_drawer_on_checkout,
            chars_per_line=payload.chars_per_line,
            encoding=payload.encoding,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo guardar .env: {exc}") from exc

    log_action(
        db,
        user_id=user.id,
        action="receipt_printer_updated",
        entity_type="printer_config",
        entity_id=1,
        details=f"printer={result.get('active_printer') or '-'}",
    )
    db.commit()
    return ReceiptPrinterConfigOut(**result)


@config_router.post("/receipt-printer/test", response_model=ReceiptPrinterTestOut)
def test_receipt_printer_route(
    db: Session = Depends(get_db),
    user=Depends(require_roles("admin")),
):
    bootstrap_store_settings(db)
    try:
        printer_name = print_receipt_test_page(open_drawer=bool(settings.receipt_open_drawer_on_checkout))
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    message = f"Ticket de prueba enviado a {printer_name}."
    if settings.receipt_open_drawer_on_checkout:
        message += " Se intento abrir el cajon."
    return ReceiptPrinterTestOut(ok=True, message=message, printer_name=printer_name)
