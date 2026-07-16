import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.database import Base, engine
from app.models import (  # noqa: F401
    AuditLog,
    Branch,
    CashMovement,
    CashSession,
    CreditPayment,
    Customer,
    Department,
    FelInvoice,
    InventoryMovement,
    Order,
    OrderDispatch,
    PendingFelSale,
    Product,
    ProductCostHistory,
    ProductLot,
    Promotion,
    PurchaseOrder,
    PurchaseOrderDispatch,
    PurchaseOrderItem,
    Sale,
    SaleItem,
    SalePayment,
    SchoolPackage,
    SchoolPackageItem,
    Supplier,
    StockCountItem,
    StockCountScanLog,
    StockCountSession,
    StoreSettings,
    User,
)
from app.routers.auth import router as auth_router
from app.routers.cash import router as cash_router
from app.routers.catalog import (
    config_router,
    customers_router,
    departments_router,
    router as products_router,
    suppliers_router,
)
from app.routers.features import router as features_router
from app.routers.orders import router as orders_router
from app.routers.purchases import router as purchase_orders_router
from app.routers.reports import router as reports_router
from app.routers.sales import router as sales_router
from app.routers.stock_count import router as stock_count_router
from app.routers.system import router as system_router
from app.config import settings
from app.data_paths import ensure_persistent_layout
from app.services.auth_service import hash_password
from app.services.backup_service import create_backup, ensure_daily_auto_backup, ensure_recoverable_database_on_startup
from app.services.store_settings_service import bootstrap_store_settings
from app.services.version_service import sync_installed_version
from app.version import APP_CREATOR, APP_VERSION

app = FastAPI(
    title="FEL POS Guatemala",
    description="Punto de venta tipo Eleventa con facturacion electronica FEL",
    version=APP_VERSION,
    contact={"name": APP_CREATOR},
)

app.include_router(products_router)
app.include_router(suppliers_router)
app.include_router(departments_router)
app.include_router(customers_router)
app.include_router(config_router)
app.include_router(sales_router)
app.include_router(auth_router)
app.include_router(cash_router)
app.include_router(orders_router)
app.include_router(purchase_orders_router)
app.include_router(stock_count_router)
app.include_router(system_router)
app.include_router(reports_router)
app.include_router(features_router)

static_dir = Path(__file__).resolve().parent.parent / "static"
app.mount("/static", StaticFiles(directory=static_dir), name="static")


def ensure_schema_updates() -> None:
    inspector = inspect(engine)
    table_names = set(inspector.get_table_names())
    alter_statements: list[str] = []

    if "products" in table_names:
        columns = {col["name"] for col in inspector.get_columns("products")}
        if "barcode" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN barcode VARCHAR(80)"
            )
        if "wholesale_enabled" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN wholesale_enabled INTEGER NOT NULL DEFAULT 0"
            )
        if "wholesale_min_qty" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN wholesale_min_qty FLOAT NOT NULL DEFAULT 0"
            )
        if "min_stock" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN min_stock FLOAT NOT NULL DEFAULT 0"
            )
        if "tracks_inventory" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN tracks_inventory INTEGER NOT NULL DEFAULT 1"
            )
        if "supplier_id" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN supplier_id INTEGER"
            )
        if "department_id" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN department_id INTEGER"
            )
        if "wholesale_discount_pct" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN wholesale_discount_pct FLOAT NOT NULL DEFAULT 0"
            )
        if "school_category" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN school_category VARCHAR(120)"
            )
        if "school_grade" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN school_grade VARCHAR(80)"
            )
        if "school_brand" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN school_brand VARCHAR(120)"
            )
        if "school_variant" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN school_variant VARCHAR(120)"
            )
        if "sale_by_weight" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN sale_by_weight INTEGER NOT NULL DEFAULT 0"
            )
        if "track_expiry" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN track_expiry INTEGER NOT NULL DEFAULT 0"
            )
        if "branch_id" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN branch_id INTEGER"
            )

    if "customers" in table_names:
        customer_columns = {col["name"] for col in inspector.get_columns("customers")}
        if "credit_limit" not in customer_columns:
            alter_statements.append(
                "ALTER TABLE customers ADD COLUMN credit_limit FLOAT NOT NULL DEFAULT 0"
            )
        if "credit_balance" not in customer_columns:
            alter_statements.append(
                "ALTER TABLE customers ADD COLUMN credit_balance FLOAT NOT NULL DEFAULT 0"
            )
        if "notes" not in customer_columns:
            alter_statements.append(
                "ALTER TABLE customers ADD COLUMN notes VARCHAR(500)"
            )
        if "active" not in customer_columns:
            alter_statements.append(
                "ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1"
            )

    if "sales" in table_names:
        sale_columns = {col["name"] for col in inspector.get_columns("sales")}
        if "created_by_user_id" not in sale_columns:
            alter_statements.append(
                "ALTER TABLE sales ADD COLUMN created_by_user_id INTEGER"
            )
        if "branch_id" not in sale_columns:
            alter_statements.append(
                "ALTER TABLE sales ADD COLUMN branch_id INTEGER"
            )
        if "cart_discount_amount" not in sale_columns:
            alter_statements.append(
                "ALTER TABLE sales ADD COLUMN cart_discount_amount FLOAT NOT NULL DEFAULT 0"
            )
        if "promotion_id" not in sale_columns:
            alter_statements.append(
                "ALTER TABLE sales ADD COLUMN promotion_id INTEGER"
            )
        if "is_credit" not in sale_columns:
            alter_statements.append(
                "ALTER TABLE sales ADD COLUMN is_credit INTEGER NOT NULL DEFAULT 0"
            )

    if "sale_items" in table_names:
        sale_item_columns = {col["name"] for col in inspector.get_columns("sale_items")}
        if "tracks_inventory" not in sale_item_columns:
            alter_statements.append(
                "ALTER TABLE sale_items ADD COLUMN tracks_inventory INTEGER NOT NULL DEFAULT 1"
            )
        if "base_unit_price" not in sale_item_columns:
            alter_statements.append(
                "ALTER TABLE sale_items ADD COLUMN base_unit_price FLOAT NOT NULL DEFAULT 0"
            )
        if "discount_amount" not in sale_item_columns:
            alter_statements.append(
                "ALTER TABLE sale_items ADD COLUMN discount_amount FLOAT NOT NULL DEFAULT 0"
            )

    if "stock_count_sessions" in table_names:
        stock_count_columns = {col["name"] for col in inspector.get_columns("stock_count_sessions")}
        if "order_code" not in stock_count_columns:
            alter_statements.append(
                "ALTER TABLE stock_count_sessions ADD COLUMN order_code VARCHAR(60)"
            )
        if "department_id" not in stock_count_columns:
            alter_statements.append(
                "ALTER TABLE stock_count_sessions ADD COLUMN department_id INTEGER"
            )

    if "users" in table_names:
        user_columns = {col["name"] for col in inspector.get_columns("users")}
        if "must_change_password" not in user_columns:
            alter_statements.append(
                "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"
            )

    if not alter_statements:
        return

    with engine.begin() as connection:
        for statement in alter_statements:
            connection.execute(text(statement))


@app.get("/")
def home():
    return FileResponse(static_dir / "index.html")


@app.get("/mobile")
def mobile_app():
    return FileResponse(static_dir / "mobile.html")


@app.on_event("startup")
def initialize_app_data():
    from app.database import SessionLocal

    try:
        layout = ensure_persistent_layout()
        if layout.get("moved"):
            print(f"[INFO] Datos persistentes migrados a {layout['data_dir']}: {', '.join(layout['moved'])}")
        if os.getenv("FELPOS_PRE_UPDATE_BACKUP", "").strip().lower() in {"1", "true", "yes"}:
            backup = create_backup("pre_update")
            print(f"[INFO] Respaldo pre-actualizacion creado: {backup.get('name', '-')}")
    except Exception as exc:
        print(f"[WARN] No se pudo preparar carpeta de datos persistentes: {exc}")

    try:
        restored = ensure_recoverable_database_on_startup()
        if restored:
            restored_name = (restored.get("restored_backup") or {}).get("name", "-")
            print(f"[INFO] Base recuperada automaticamente desde respaldo: {restored_name}")
    except Exception as exc:
        print(f"[WARN] No se pudo validar recuperacion automatica: {exc}")

    Base.metadata.create_all(bind=engine)
    ensure_schema_updates()
    try:
        ensure_daily_auto_backup()
    except Exception as exc:
        print(f"[WARN] No se pudo crear respaldo automatico: {exc}")

    try:
        version_info = sync_installed_version()
        if version_info.get("changed_on_startup") and version_info.get("previous_version"):
            print(
                f"[INFO] FEL POS actualizado: {version_info['previous_version']} -> {version_info['version']}"
            )
        else:
            print(f"[INFO] FEL POS version {version_info.get('version', '-')}")
    except Exception as exc:
        print(f"[WARN] No se pudo registrar version instalada: {exc}")

    db = SessionLocal()
    try:
        from app.models import Branch

        try:
            bootstrap_store_settings(db)
        except Exception as exc:
            print(f"[WARN] No se pudo cargar configuracion de tienda: {exc}")

        if db.query(Branch).count() == 0:
            db.add(
                Branch(
                    code="MAIN",
                    name="Sucursal principal",
                    address="Guatemala",
                )
            )
            db.commit()

        if db.query(User).count() == 0:
            db.add_all(
                [
                    User(
                        username="admin",
                        full_name="Administrador",
                        role="admin",
                        password_hash=hash_password("admin123"),
                        must_change_password=1,
                    ),
                    User(
                        username="cajero",
                        full_name="Usuario Caja",
                        role="user",
                        password_hash=hash_password("cajero123"),
                        must_change_password=1,
                    ),
                ]
            )
            db.commit()

        from app.services.auth_service import verify_password

        default_passwords = {"admin": "admin123", "cajero": "cajero123"}
        flagged = False
        for username, default_password in default_passwords.items():
            user = db.query(User).filter(User.username == username).first()
            if user and verify_password(default_password, user.password_hash):
                if not user.must_change_password:
                    user.must_change_password = 1
                    flagged = True
        if flagged:
            db.commit()
    finally:
        db.close()

    if settings.scanner_bridge_enabled:
        try:
            from app.services.scanner_bridge_service import start_scanner_bridge

            start_scanner_bridge()
            print(
                f"[INFO] Puente scanner activo en {settings.scanner_bridge_host}:"
                f"{settings.scanner_bridge_port}"
            )
        except Exception as exc:
            print(f"[WARN] No se pudo iniciar puente scanner: {exc}")
