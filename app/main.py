import os
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.database import Base, engine
from app.models import (  # noqa: F401
    AuditLog,
    AuthorizedDevice,
    Branch,
    BranchStock,
    CashMovement,
    CashSession,
    CreditPayment,
    Customer,
    Department,
    DiningCheck,
    DiningCheckItem,
    DiningTable,
    FelInvoice,
    InventoryMovement,
    Order,
    OrderDispatch,
    OrderItem,
    PendingFelSale,
    PrescriptionLog,
    Product,
    ProductCostHistory,
    ProductLot,
    Promotion,
    PurchaseOrder,
    PurchaseOrderDispatch,
    PurchaseOrderItem,
    Sale,
    SaleItem,
    SaleItemLot,
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
from app.routers.devices import router as devices_router
from app.routers.dining import router as dining_router
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


@app.middleware("http")
async def prevent_stale_frontend_assets(request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


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
app.include_router(devices_router)
app.include_router(dining_router)
app.include_router(reports_router)
app.include_router(features_router)

def _resolve_static_dir() -> Path:
    candidates: list[Path] = []
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "static")
    candidates.append(Path(__file__).resolve().parent.parent / "static")
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent / "static")
    for path in candidates:
        if path.is_dir():
            return path
    return candidates[0]


static_dir = _resolve_static_dir()
if not static_dir.is_dir():
    raise RuntimeError(
        f"No se encontro la carpeta static. Buscado en: {static_dir} "
        f"(frozen={getattr(sys, 'frozen', False)} meipass={getattr(sys, '_MEIPASS', None)})"
    )
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
        if "requires_prescription" not in columns:
            alter_statements.append(
                "ALTER TABLE products ADD COLUMN requires_prescription INTEGER NOT NULL DEFAULT 0"
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
        if "cash_received" not in sale_columns:
            alter_statements.append(
                "ALTER TABLE sales ADD COLUMN cash_received FLOAT NOT NULL DEFAULT 0"
            )
        if "change_amount" not in sale_columns:
            alter_statements.append(
                "ALTER TABLE sales ADD COLUMN change_amount FLOAT NOT NULL DEFAULT 0"
            )
        if "client_request_id" not in sale_columns:
            alter_statements.append(
                "ALTER TABLE sales ADD COLUMN client_request_id VARCHAR(64)"
            )

    if "sale_returns" in table_names:
        sale_return_columns = {col["name"] for col in inspector.get_columns("sale_returns")}
        if "client_request_id" not in sale_return_columns:
            alter_statements.append(
                "ALTER TABLE sale_returns ADD COLUMN client_request_id VARCHAR(64)"
            )
        if "cash_refund_amount" not in sale_return_columns:
            alter_statements.append(
                "ALTER TABLE sale_returns ADD COLUMN cash_refund_amount FLOAT NOT NULL DEFAULT 0"
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
        if "branch_id" not in stock_count_columns:
            alter_statements.append(
                "ALTER TABLE stock_count_sessions ADD COLUMN branch_id INTEGER"
            )

    if "users" in table_names:
        user_columns = {col["name"] for col in inspector.get_columns("users")}
        if "must_change_password" not in user_columns:
            alter_statements.append(
                "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0"
            )
        if "permissions" not in user_columns:
            alter_statements.append(
                "ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '[\"sales.returns\"]'"
            )

    if "product_lots" in table_names:
        lot_columns = {col["name"] for col in inspector.get_columns("product_lots")}
        if "branch_id" not in lot_columns:
            alter_statements.append("ALTER TABLE product_lots ADD COLUMN branch_id INTEGER")

    if "inventory_movements" in table_names:
        movement_columns = {col["name"] for col in inspector.get_columns("inventory_movements")}
        if "branch_id" not in movement_columns:
            alter_statements.append("ALTER TABLE inventory_movements ADD COLUMN branch_id INTEGER")

    if "orders" in table_names:
        order_columns = {col["name"] for col in inspector.get_columns("orders")}
        if "deposit_paid" not in order_columns:
            alter_statements.append("ALTER TABLE orders ADD COLUMN deposit_paid FLOAT NOT NULL DEFAULT 0")
        if "balance_due" not in order_columns:
            alter_statements.append("ALTER TABLE orders ADD COLUMN balance_due FLOAT NOT NULL DEFAULT 0")
        if "pickup_at" not in order_columns:
            alter_statements.append("ALTER TABLE orders ADD COLUMN pickup_at DATETIME")
        if "sale_id" not in order_columns:
            alter_statements.append("ALTER TABLE orders ADD COLUMN sale_id INTEGER")
        if "customer_id" not in order_columns:
            alter_statements.append("ALTER TABLE orders ADD COLUMN customer_id INTEGER")
        if "customer_nit" not in order_columns:
            alter_statements.append("ALTER TABLE orders ADD COLUMN customer_nit VARCHAR(20)")
        if "branch_id" not in order_columns:
            alter_statements.append("ALTER TABLE orders ADD COLUMN branch_id INTEGER")
        if "stock_reserved" not in order_columns:
            alter_statements.append("ALTER TABLE orders ADD COLUMN stock_reserved INTEGER NOT NULL DEFAULT 0")

    if "products" in table_names:
        product_columns = {col["name"] for col in inspector.get_columns("products")}
        if "price_vip" not in product_columns:
            alter_statements.append("ALTER TABLE products ADD COLUMN price_vip FLOAT")
        if "goods_or_services" not in product_columns:
            alter_statements.append("ALTER TABLE products ADD COLUMN goods_or_services VARCHAR(1) DEFAULT 'B'")
        if "dining_modifiers" not in product_columns:
            alter_statements.append("ALTER TABLE products ADD COLUMN dining_modifiers VARCHAR(500)")

    if "customers" in table_names:
        customer_columns = {col["name"] for col in inspector.get_columns("customers")}
        if "municipality" not in customer_columns:
            alter_statements.append("ALTER TABLE customers ADD COLUMN municipality VARCHAR(80)")
        if "department" not in customer_columns:
            alter_statements.append("ALTER TABLE customers ADD COLUMN department VARCHAR(80)")
        if "price_tier" not in customer_columns:
            alter_statements.append("ALTER TABLE customers ADD COLUMN price_tier VARCHAR(20) DEFAULT 'retail'")
        if "loyalty_points" not in customer_columns:
            alter_statements.append("ALTER TABLE customers ADD COLUMN loyalty_points FLOAT NOT NULL DEFAULT 0")

    if "sales" in table_names:
        sale_columns2 = {col["name"] for col in inspector.get_columns("sales")}
        if "document_type" not in sale_columns2:
            alter_statements.append("ALTER TABLE sales ADD COLUMN document_type VARCHAR(10) DEFAULT 'FACT'")
        if "tip_amount" not in sale_columns2:
            alter_statements.append("ALTER TABLE sales ADD COLUMN tip_amount FLOAT NOT NULL DEFAULT 0")
        if "loyalty_points_earned" not in sale_columns2:
            alter_statements.append("ALTER TABLE sales ADD COLUMN loyalty_points_earned FLOAT NOT NULL DEFAULT 0")
        if "loyalty_points_redeemed" not in sale_columns2:
            alter_statements.append("ALTER TABLE sales ADD COLUMN loyalty_points_redeemed FLOAT NOT NULL DEFAULT 0")

    if "fel_invoices" in table_names:
        fel_columns = {col["name"] for col in inspector.get_columns("fel_invoices")}
        if "voided_at" not in fel_columns:
            alter_statements.append("ALTER TABLE fel_invoices ADD COLUMN voided_at DATETIME")
        if "void_reason" not in fel_columns:
            alter_statements.append("ALTER TABLE fel_invoices ADD COLUMN void_reason VARCHAR(300)")

    if "branches" in table_names:
        branch_columns = {col["name"] for col in inspector.get_columns("branches")}
        if "fel_nombre_comercial" not in branch_columns:
            alter_statements.append("ALTER TABLE branches ADD COLUMN fel_nombre_comercial VARCHAR(200)")
        if "fel_direccion" not in branch_columns:
            alter_statements.append("ALTER TABLE branches ADD COLUMN fel_direccion VARCHAR(300)")
        if "fel_codigo_establecimiento" not in branch_columns:
            alter_statements.append("ALTER TABLE branches ADD COLUMN fel_codigo_establecimiento VARCHAR(10)")
        if "fel_municipio" not in branch_columns:
            alter_statements.append("ALTER TABLE branches ADD COLUMN fel_municipio VARCHAR(80)")
        if "fel_departamento" not in branch_columns:
            alter_statements.append("ALTER TABLE branches ADD COLUMN fel_departamento VARCHAR(80)")

    if "dining_checks" in table_names:
        dining_columns = {col["name"] for col in inspector.get_columns("dining_checks")}
        if "tip_amount" not in dining_columns:
            alter_statements.append("ALTER TABLE dining_checks ADD COLUMN tip_amount FLOAT NOT NULL DEFAULT 0")

    if "authorized_devices" in table_names:
        device_columns = {col["name"] for col in inspector.get_columns("authorized_devices")}
        if "branch_id" not in device_columns:
            alter_statements.append("ALTER TABLE authorized_devices ADD COLUMN branch_id INTEGER")

    with engine.begin() as connection:
        for statement in alter_statements:
            connection.execute(text(statement))

        # Indexes for hot report/alert paths (safe to re-run).
        for index_sql in (
            "CREATE INDEX IF NOT EXISTS ix_sales_created_at ON sales (created_at)",
            "CREATE INDEX IF NOT EXISTS ix_sales_created_by_user_id ON sales (created_by_user_id)",
            "CREATE INDEX IF NOT EXISTS ix_sale_items_product_id ON sale_items (product_id)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_movements_product_id ON inventory_movements (product_id)",
            "CREATE INDEX IF NOT EXISTS ix_inventory_movements_product_created ON inventory_movements (product_id, created_at)",
            "CREATE INDEX IF NOT EXISTS ix_cash_movements_cash_session_id ON cash_movements (cash_session_id)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_sales_client_request_id ON sales (client_request_id)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_sale_returns_client_request_id ON sale_returns (client_request_id)",
        ):
            try:
                connection.execute(text(index_sql))
            except Exception:
                # Older SQLite/corrupt catalogs should not block startup.
                pass


@app.get("/")
def home():
    return FileResponse(static_dir / "index.html")


@app.get("/mobile")
def mobile_app():
    return FileResponse(static_dir / "mobile.html")


@app.get("/mobile/open-app")
def mobile_open_app():
    return FileResponse(static_dir / "mobile-open-app.html")


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
        from app.services.security_bootstrap import ensure_security_secret

        rotated = ensure_security_secret()
        if rotated:
            print("[INFO] SECURITY_SECRET generado automaticamente (antes usaba el valor por defecto).")
    except Exception as exc:
        print(f"[WARN] No se pudo asegurar SECURITY_SECRET: {exc}")
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

        try:
            from app.services.inventory_branch_service import bootstrap_branch_stocks

            created_stocks = bootstrap_branch_stocks(db)
            if created_stocks:
                print(f"[INFO] Stock por sucursal inicializado: {created_stocks} productos")
        except Exception as exc:
            print(f"[WARN] No se pudo inicializar stock por sucursal: {exc}")

        try:
            from app.models import ProductLot, Sale
            from app.services.inventory_branch_service import get_or_create_main_branch

            main = get_or_create_main_branch(db)
            orphan_lots = db.query(ProductLot).filter(ProductLot.branch_id.is_(None)).all()
            if orphan_lots:
                for lot in orphan_lots:
                    lot.branch_id = main.id
                db.commit()
                print(f"[INFO] Lotes asignados a sucursal MAIN: {len(orphan_lots)}")
            orphan_sales = db.query(Sale).filter(Sale.branch_id.is_(None)).all()
            if orphan_sales:
                for sale in orphan_sales:
                    sale.branch_id = main.id
                db.commit()
                print(f"[INFO] Ventas sin sucursal asignadas a MAIN: {len(orphan_sales)}")
        except Exception as exc:
            print(f"[WARN] No se pudo migrar branch_id de lotes/ventas: {exc}")

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

        try:
            from app.services.device_auth_service import ensure_server_device

            ensure_server_device(db)
        except Exception as exc:
            print(f"[WARN] No se pudo registrar PC servidor: {exc}")

        try:
            from app.services.fel_pending_service import auto_retry_pending_fel_sales

            retry_result = auto_retry_pending_fel_sales(db)
            if retry_result.total:
                print(
                    f"[INFO] Reintento FEL pendiente al iniciar: "
                    f"{retry_result.certified}/{retry_result.total} certificadas"
                )
        except Exception as exc:
            print(f"[WARN] No se pudo reintentar FEL pendiente al iniciar: {exc}")
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
