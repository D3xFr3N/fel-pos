from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)
    active: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    products: Mapped[list["Product"]] = relationship("Product", back_populates="supplier")


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    active: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    products: Mapped[list["Product"]] = relationship("Product", back_populates="department")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sku: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    barcode: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    school_category: Mapped[str | None] = mapped_column(String(120), nullable=True)
    school_grade: Mapped[str | None] = mapped_column(String(80), nullable=True)
    school_brand: Mapped[str | None] = mapped_column(String(120), nullable=True)
    school_variant: Mapped[str | None] = mapped_column(String(120), nullable=True)
    supplier_id: Mapped[int | None] = mapped_column(ForeignKey("suppliers.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    price: Mapped[float] = mapped_column(Float, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0)
    stock: Mapped[float] = mapped_column(Float, default=0)
    min_stock: Mapped[float] = mapped_column(Float, default=0)
    tracks_inventory: Mapped[int] = mapped_column(Integer, default=1)
    tax_rate: Mapped[float] = mapped_column(Float, default=0.12)
    wholesale_enabled: Mapped[int] = mapped_column(Integer, default=0)
    wholesale_min_qty: Mapped[float] = mapped_column(Float, default=0)
    wholesale_discount_pct: Mapped[float] = mapped_column(Float, default=0)
    active: Mapped[int] = mapped_column(Integer, default=1)
    sale_by_weight: Mapped[int] = mapped_column(Integer, default=0)
    track_expiry: Mapped[int] = mapped_column(Integer, default=0)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), nullable=True)

    supplier: Mapped[Supplier | None] = relationship("Supplier", back_populates="products")
    department: Mapped[Department | None] = relationship("Department", back_populates="products")

    @property
    def supplier_name(self) -> str | None:
        return self.supplier.name if self.supplier else None

    @property
    def department_name(self) -> str | None:
        return self.department.name if self.department else None


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nit: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    credit_limit: Mapped[float] = mapped_column(Float, default=0)
    credit_balance: Mapped[float] = mapped_column(Float, default=0)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
    active: Mapped[int] = mapped_column(Integer, default=1)


class Sale(Base):
    __tablename__ = "sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    tax_total: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    payment_method: Mapped[str] = mapped_column(String(30), default="efectivo")
    status: Mapped[str] = mapped_column(String(20), default="completed")
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"), nullable=True)
    cart_discount_amount: Mapped[float] = mapped_column(Float, default=0)
    cash_received: Mapped[float] = mapped_column(Float, default=0)
    change_amount: Mapped[float] = mapped_column(Float, default=0)
    promotion_id: Mapped[int | None] = mapped_column(ForeignKey("promotions.id"), nullable=True)
    is_credit: Mapped[int] = mapped_column(Integer, default=0)

    customer: Mapped[Customer | None] = relationship("Customer")
    items: Mapped[list["SaleItem"]] = relationship(
        "SaleItem", back_populates="sale", cascade="all, delete-orphan"
    )
    returns: Mapped[list["SaleReturn"]] = relationship(
        "SaleReturn", back_populates="sale", cascade="all, delete-orphan"
    )
    fel_invoice: Mapped["FelInvoice | None"] = relationship(
        "FelInvoice", back_populates="sale", uselist=False
    )
    payments: Mapped[list["SalePayment"]] = relationship(
        "SalePayment", back_populates="sale", cascade="all, delete-orphan"
    )


class SalePayment(Base):
    __tablename__ = "sale_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    payment_method: Mapped[str] = mapped_column(String(30))
    amount: Mapped[float] = mapped_column(Float, default=0)

    sale: Mapped[Sale] = relationship("Sale", back_populates="payments")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Float, default=1)
    tracks_inventory: Mapped[int] = mapped_column(Integer, default=1)
    base_unit_price: Mapped[float] = mapped_column(Float, default=0)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    discount_amount: Mapped[float] = mapped_column(Float, default=0)
    tax_rate: Mapped[float] = mapped_column(Float, default=0.12)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)

    sale: Mapped[Sale] = relationship("Sale", back_populates="items")
    product: Mapped[Product] = relationship("Product")
    return_items: Mapped[list["SaleReturnItem"]] = relationship(
        "SaleReturnItem", back_populates="sale_item", cascade="all, delete-orphan"
    )


class SaleReturn(Base):
    __tablename__ = "sale_returns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str | None] = mapped_column(String(300), nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    tax_total: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="completed")
    fel_uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    fel_serie: Mapped[str] = mapped_column(String(20))
    fel_numero: Mapped[str] = mapped_column(String(20))
    fel_document_type: Mapped[str] = mapped_column(String(10), default="NCRE")
    fel_status: Mapped[str] = mapped_column(String(20), default="certified")
    fel_xml_content: Mapped[str] = mapped_column(Text)
    fel_certifier_response: Mapped[str | None] = mapped_column(Text, nullable=True)

    sale: Mapped[Sale] = relationship("Sale", back_populates="returns")
    created_by: Mapped["User"] = relationship("User")
    items: Mapped[list["SaleReturnItem"]] = relationship(
        "SaleReturnItem", back_populates="sale_return", cascade="all, delete-orphan"
    )


class SaleReturnItem(Base):
    __tablename__ = "sale_return_items"
    __table_args__ = (UniqueConstraint("sale_return_id", "sale_item_id", name="uq_sale_return_item_line"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_return_id: Mapped[int] = mapped_column(ForeignKey("sale_returns.id"))
    sale_item_id: Mapped[int] = mapped_column(ForeignKey("sale_items.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Float, default=0)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    tax_rate: Mapped[float] = mapped_column(Float, default=0)
    subtotal: Mapped[float] = mapped_column(Float, default=0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0)
    total: Mapped[float] = mapped_column(Float, default=0)

    sale_return: Mapped[SaleReturn] = relationship("SaleReturn", back_populates="items")
    sale_item: Mapped[SaleItem] = relationship("SaleItem", back_populates="return_items")
    product: Mapped[Product] = relationship("Product")


class FelInvoice(Base):
    __tablename__ = "fel_invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), unique=True)
    uuid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    serie: Mapped[str] = mapped_column(String(20))
    numero: Mapped[str] = mapped_column(String(20))
    document_type: Mapped[str] = mapped_column(String(10), default="FACT")
    status: Mapped[str] = mapped_column(String(20), default="certified")
    xml_content: Mapped[str] = mapped_column(Text)
    certifier_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    sale: Mapped[Sale] = relationship("Sale", back_populates="fel_invoice")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(150))
    role: Mapped[str] = mapped_column(String(20), default="user")
    password_hash: Mapped[str] = mapped_column(String(255))
    active: Mapped[int] = mapped_column(Integer, default=1)
    must_change_password: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class CashSession(Base):
    __tablename__ = "cash_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    opened_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    opening_amount: Mapped[float] = mapped_column(Float, default=0)
    expected_amount: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="open")
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    closed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    counted_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    difference: Mapped[float | None] = mapped_column(Float, nullable=True)

    opened_by: Mapped[User] = relationship("User", foreign_keys=[opened_by_user_id])
    closed_by: Mapped[User | None] = relationship("User", foreign_keys=[closed_by_user_id])
    movements: Mapped[list["CashMovement"]] = relationship(
        "CashMovement", back_populates="cash_session", cascade="all, delete-orphan"
    )

    @property
    def opened_by_full_name(self) -> str | None:
        return self.opened_by.full_name if self.opened_by else None

    @property
    def opened_by_username(self) -> str | None:
        return self.opened_by.username if self.opened_by else None

    @property
    def closed_by_full_name(self) -> str | None:
        return self.closed_by.full_name if self.closed_by else None


class CashMovement(Base):
    __tablename__ = "cash_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cash_session_id: Mapped[int] = mapped_column(ForeignKey("cash_sessions.id"))
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    movement_type: Mapped[str] = mapped_column(String(20))
    amount: Mapped[float] = mapped_column(Float, default=0)
    description: Mapped[str | None] = mapped_column(String(400), nullable=True)
    sale_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    cash_session: Mapped[CashSession] = relationship("CashSession", back_populates="movements")
    created_by: Mapped[User] = relationship("User")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    customer_name: Mapped[str] = mapped_column(String(200))
    customer_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    customer_email: Mapped[str | None] = mapped_column(String(120), nullable=True)
    total_estimate: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[User] = relationship("User")
    dispatches: Mapped[list["OrderDispatch"]] = relationship(
        "OrderDispatch", back_populates="order", cascade="all, delete-orphan"
    )


class OrderDispatch(Base):
    __tablename__ = "order_dispatches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    channel: Mapped[str] = mapped_column(String(20))
    recipient: Mapped[str] = mapped_column(String(150))
    status: Mapped[str] = mapped_column(String(20), default="queued")
    provider_response: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped[Order] = relationship("Order", back_populates="dispatches")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"))
    total_estimate: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="created")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped[User] = relationship("User")
    supplier: Mapped[Supplier] = relationship("Supplier")
    items: Mapped[list["PurchaseOrderItem"]] = relationship(
        "PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan"
    )
    dispatches: Mapped[list["PurchaseOrderDispatch"]] = relationship(
        "PurchaseOrderDispatch", back_populates="purchase_order", cascade="all, delete-orphan"
    )


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Float, default=0)
    unit_cost: Mapped[float] = mapped_column(Float, default=0)
    line_total: Mapped[float] = mapped_column(Float, default=0)

    purchase_order: Mapped[PurchaseOrder] = relationship("PurchaseOrder", back_populates="items")
    product: Mapped[Product] = relationship("Product")


class PurchaseOrderDispatch(Base):
    __tablename__ = "purchase_order_dispatches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    purchase_order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"))
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    channel: Mapped[str] = mapped_column(String(20))
    recipient: Mapped[str] = mapped_column(String(150))
    status: Mapped[str] = mapped_column(String(20), default="queued")
    provider_response: Mapped[str | None] = mapped_column(Text, nullable=True)

    purchase_order: Mapped[PurchaseOrder] = relationship("PurchaseOrder", back_populates="dispatches")


class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    movement_type: Mapped[str] = mapped_column(String(20), default="entry")
    quantity: Mapped[float] = mapped_column(Float, default=0)
    before_stock: Mapped[float] = mapped_column(Float, default=0)
    after_stock: Mapped[float] = mapped_column(Float, default=0)
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)

    product: Mapped[Product] = relationship("Product")
    created_by: Mapped[User] = relationship("User")


class StockCountSession(Base):
    __tablename__ = "stock_count_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    order_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    applied_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    created_by: Mapped[User] = relationship("User", foreign_keys=[created_by_user_id])
    applied_by: Mapped[User | None] = relationship("User", foreign_keys=[applied_by_user_id])
    department: Mapped[Department | None] = relationship("Department")
    items: Mapped[list["StockCountItem"]] = relationship(
        "StockCountItem", back_populates="session", cascade="all, delete-orphan"
    )
    scan_logs: Mapped[list["StockCountScanLog"]] = relationship(
        "StockCountScanLog", back_populates="session", cascade="all, delete-orphan"
    )


class StockCountItem(Base):
    __tablename__ = "stock_count_items"
    __table_args__ = (UniqueConstraint("session_id", "product_id", name="uq_stock_count_session_product"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("stock_count_sessions.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    sku_snapshot: Mapped[str] = mapped_column(String(50))
    name_snapshot: Mapped[str] = mapped_column(String(200))
    description_snapshot: Mapped[str | None] = mapped_column(String(500), nullable=True)
    unit_cost_snapshot: Mapped[float] = mapped_column(Float, default=0)
    unit_price_snapshot: Mapped[float] = mapped_column(Float, default=0)
    system_quantity: Mapped[float] = mapped_column(Float, default=0)
    counted_quantity: Mapped[float] = mapped_column(Float, default=0)
    difference_quantity: Mapped[float] = mapped_column(Float, default=0)
    difference_cost: Mapped[float] = mapped_column(Float, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    session: Mapped[StockCountSession] = relationship("StockCountSession", back_populates="items")
    product: Mapped[Product] = relationship("Product")


class StockCountScanLog(Base):
    __tablename__ = "stock_count_scan_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("stock_count_sessions.id"))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    scanned_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    scanned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    action_type: Mapped[str] = mapped_column(String(30), default="scan_add")
    quantity: Mapped[float] = mapped_column(Float, default=0)
    before_counted: Mapped[float] = mapped_column(Float, default=0)
    after_counted: Mapped[float] = mapped_column(Float, default=0)
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)

    session: Mapped[StockCountSession] = relationship("StockCountSession", back_populates="scan_logs")
    product: Mapped[Product | None] = relationship("Product")
    scanned_by: Mapped[User] = relationship("User")


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    active: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Promotion(Base):
    __tablename__ = "promotions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    promo_type: Mapped[str] = mapped_column(String(20), default="percent")
    value: Mapped[float] = mapped_column(Float, default=0)
    min_qty: Mapped[float] = mapped_column(Float, default=0)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    start_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    active: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    product: Mapped[Product | None] = relationship("Product")
    department: Mapped[Department | None] = relationship("Department")


class CreditPayment(Base):
    __tablename__ = "credit_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    sale_id: Mapped[int | None] = mapped_column(ForeignKey("sales.id"), nullable=True)
    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    amount: Mapped[float] = mapped_column(Float, default=0)
    payment_method: Mapped[str] = mapped_column(String(30), default="efectivo")
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)

    customer: Mapped[Customer] = relationship("Customer")
    sale: Mapped[Sale | None] = relationship("Sale")
    created_by: Mapped[User] = relationship("User")


class ProductCostHistory(Base):
    __tablename__ = "product_cost_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    previous_cost: Mapped[float] = mapped_column(Float, default=0)
    new_cost: Mapped[float] = mapped_column(Float, default=0)
    source: Mapped[str] = mapped_column(String(40), default="manual")
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)

    product: Mapped[Product] = relationship("Product")


class ProductLot(Base):
    __tablename__ = "product_lots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    lot_code: Mapped[str] = mapped_column(String(80))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    quantity: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    active: Mapped[int] = mapped_column(Integer, default=1)

    product: Mapped[Product] = relationship("Product")


class SchoolPackage(Base):
    __tablename__ = "school_packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    school_grade: Mapped[str | None] = mapped_column(String(80), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)
    active: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    items: Mapped[list["SchoolPackageItem"]] = relationship(
        "SchoolPackageItem", back_populates="package", cascade="all, delete-orphan"
    )


class SchoolPackageItem(Base):
    __tablename__ = "school_package_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    package_id: Mapped[int] = mapped_column(ForeignKey("school_packages.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[float] = mapped_column(Float, default=1)

    package: Mapped[SchoolPackage] = relationship("SchoolPackage", back_populates="items")
    product: Mapped[Product] = relationship("Product")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(60))
    entity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User | None] = relationship("User")


class StoreSettings(Base):
    __tablename__ = "store_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    emisor_nit: Mapped[str] = mapped_column(String(20), default="12345678")
    emisor_nombre: Mapped[str] = mapped_column(String(200), default="Mi Empresa S.A.")
    emisor_nombre_comercial: Mapped[str] = mapped_column(String(200), default="Mi Tienda")
    emisor_direccion: Mapped[str] = mapped_column(String(300), default="Ciudad de Guatemala")
    emisor_codigo_postal: Mapped[str] = mapped_column(String(12), default="01001")
    emisor_municipio: Mapped[str] = mapped_column(String(120), default="Guatemala")
    emisor_departamento: Mapped[str] = mapped_column(String(120), default="Guatemala")
    emisor_pais: Mapped[str] = mapped_column(String(4), default="GT")
    emisor_afiliacion_iva: Mapped[str] = mapped_column(String(10), default="GEN")
    emisor_establecimiento: Mapped[str] = mapped_column(String(10), default="1")
    fel_mode: Mapped[str] = mapped_column(String(20), default="demo")
    business_profile: Mapped[str] = mapped_column(String(30), default="abarrotes")
    certificador: Mapped[str] = mapped_column(String(40), default="infile")
    certificador_usuario: Mapped[str] = mapped_column(String(120), default="")
    certificador_llave: Mapped[str] = mapped_column(String(500), default="")
    certificador_url: Mapped[str] = mapped_column(String(300), default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PendingFelSale(Base):
    __tablename__ = "pending_fel_sales"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    sale_id: Mapped[int] = mapped_column(ForeignKey("sales.id"), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    sale: Mapped[Sale] = relationship("Sale")
