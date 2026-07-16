from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.business_profiles import BusinessProfile


class ProductBase(BaseModel):
    sku: str
    barcode: str | None = Field(default=None, max_length=80)
    name: str
    description: str | None = None
    school_category: str | None = Field(default=None, max_length=120)
    school_grade: str | None = Field(default=None, max_length=80)
    school_brand: str | None = Field(default=None, max_length=120)
    school_variant: str | None = Field(default=None, max_length=120)
    supplier_id: int | None = None
    department_id: int | None = None
    price: float = Field(ge=0)
    cost: float = Field(default=0, ge=0)
    stock: float = Field(default=0, ge=0)
    min_stock: float = Field(default=0, ge=0)
    tracks_inventory: int = Field(default=1, ge=0, le=1)
    tax_rate: float = Field(default=0.12, ge=0, le=1)
    wholesale_enabled: int = Field(default=0, ge=0, le=1)
    wholesale_min_qty: float = Field(default=0, ge=0)
    wholesale_discount_pct: float = Field(default=0, ge=0, le=100)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    sku: str | None = None
    barcode: str | None = Field(default=None, max_length=80)
    name: str | None = None
    description: str | None = None
    school_category: str | None = Field(default=None, max_length=120)
    school_grade: str | None = Field(default=None, max_length=80)
    school_brand: str | None = Field(default=None, max_length=120)
    school_variant: str | None = Field(default=None, max_length=120)
    supplier_id: int | None = None
    department_id: int | None = None
    price: float | None = Field(default=None, ge=0)
    cost: float | None = Field(default=None, ge=0)
    stock: float | None = Field(default=None, ge=0)
    min_stock: float | None = Field(default=None, ge=0)
    tracks_inventory: int | None = Field(default=None, ge=0, le=1)
    tax_rate: float | None = Field(default=None, ge=0, le=1)
    wholesale_enabled: int | None = Field(default=None, ge=0, le=1)
    wholesale_min_qty: float | None = Field(default=None, ge=0)
    wholesale_discount_pct: float | None = Field(default=None, ge=0, le=100)
    active: int | None = None


class ProductOut(ProductBase):
    id: int
    active: int
    supplier_name: str | None = None
    department_name: str | None = None

    model_config = {"from_attributes": True}


class GenerateMissingBarcodesResponse(BaseModel):
    generated_count: int
    message: str


class EleventaImportOut(BaseModel):
    created: int
    updated: int
    skipped: int
    departments_created: int
    suppliers_created: int
    errors: list[str]
    message: str


class BarcodeLabelPrintRequest(BaseModel):
    quantity: int = Field(default=1, ge=1, le=300)
    include_price: bool = False
    include_description: bool = True
    description: str | None = Field(default=None, max_length=500)
    mode: Literal["browser", "thermal"] = "browser"
    width_mm: int = Field(default=50, ge=20, le=120)
    height_mm: int = Field(default=30, ge=15, le=80)
    printer_name: str | None = Field(default=None, max_length=200)


class BarcodeLabelPrintResponse(BaseModel):
    message: str
    printer_name: str | None = None
    quantity: int
    barcode: str


class LabelPrinterConfigOut(BaseModel):
    printer_name: str = ""
    default_printer: str = ""
    available_printers: list[str] = Field(default_factory=list)
    active_printer: str = ""
    platform_supported: bool = True


class LabelPrinterConfigUpdateIn(BaseModel):
    printer_name: str = Field(default="", max_length=200)


class LabelPrinterTestOut(BaseModel):
    ok: bool = True
    message: str
    printer_name: str = ""


class DepartmentBase(BaseModel):
    name: str
    description: str | None = None


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    active: int | None = None


class DepartmentOut(DepartmentBase):
    id: int
    active: int

    model_config = {"from_attributes": True}


class SupplierBase(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    contact_name: str | None = None
    notes: str | None = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    contact_name: str | None = None
    notes: str | None = None
    active: int | None = None


class SupplierOut(SupplierBase):
    id: int
    active: int

    model_config = {"from_attributes": True}


class CustomerBase(BaseModel):
    nit: str
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    credit_limit: float = Field(default=0, ge=0)
    notes: str | None = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    credit_limit: float | None = Field(default=None, ge=0)
    notes: str | None = None
    active: int | None = Field(default=None, ge=0, le=1)


class CustomerOut(CustomerBase):
    id: int
    credit_balance: float = 0
    active: int = 1

    model_config = {"from_attributes": True}


class CreditPaymentCreate(BaseModel):
    amount: float = Field(gt=0)
    payment_method: str = "efectivo"
    notes: str | None = None
    sale_id: int | None = None


class CreditPaymentOut(BaseModel):
    id: int
    customer_id: int
    sale_id: int | None = None
    created_at: datetime
    amount: float
    payment_method: str
    notes: str | None = None

    model_config = {"from_attributes": True}


class CustomerLookupOut(BaseModel):
    nit: str
    name: str
    email: str | None = None
    address: str | None = None
    found: bool = False


class StockEntryCreate(BaseModel):
    quantity: float = Field(gt=0)
    notes: str | None = None


class InventoryMovementOut(BaseModel):
    id: int
    created_at: datetime
    product_id: int
    created_by_user_id: int
    movement_type: str
    quantity: float
    before_stock: float
    after_stock: float
    notes: str | None = None

    model_config = {"from_attributes": True}


class LowStockReportOut(BaseModel):
    product_id: int
    sku: str
    name: str
    department_id: int | None = None
    department_name: str | None = None
    supplier_id: int | None = None
    supplier_name: str | None = None
    stock: float
    min_stock: float
    deficit: float
    low_since_at: datetime | None = None
    low_for_hours: float | None = None
    wholesale_enabled: int
    wholesale_min_qty: float
    wholesale_discount_pct: float


class SaleItemInput(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)


class SalePaymentInput(BaseModel):
    payment_method: str
    amount: float = Field(gt=0)


class SalePaymentOut(BaseModel):
    payment_method: str
    amount: float

    model_config = {"from_attributes": True}


class SaleCreate(BaseModel):
    customer_id: int | None = None
    customer_nit: str | None = None
    customer_name: str | None = None
    payment_method: str = "efectivo"
    is_credit: bool = False
    cart_discount_amount: float = Field(default=0, ge=0)
    promotion_id: int | None = None
    payments: list[SalePaymentInput] | None = None
    items: list[SaleItemInput]


class SaleItemOut(BaseModel):
    sale_item_id: int
    product_id: int
    product_name: str
    quantity: float
    base_unit_price: float
    unit_price: float
    discount_amount: float
    tax_rate: float
    subtotal: float
    tax_amount: float
    total: float


class SaleReturnItemInput(BaseModel):
    sale_item_id: int
    quantity: float = Field(gt=0)


class SaleReturnCreate(BaseModel):
    reason: str | None = None
    items: list[SaleReturnItemInput] = Field(min_length=1)


class SaleReturnItemOut(BaseModel):
    sale_item_id: int
    product_id: int
    product_name: str
    quantity: float
    unit_price: float
    tax_rate: float
    subtotal: float
    tax_amount: float
    total: float


class SaleReturnOut(BaseModel):
    id: int
    created_at: datetime
    created_by_user_id: int
    reason: str | None = None
    subtotal: float
    tax_total: float
    total: float
    status: str
    fel_uuid: str
    fel_serie: str
    fel_numero: str
    fel_document_type: str
    fel_status: str
    items: list[SaleReturnItemOut] = Field(default_factory=list)


class FelInvoiceOut(BaseModel):
    uuid: str
    serie: str
    numero: str
    document_type: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SaleOut(BaseModel):
    id: int
    created_at: datetime
    subtotal: float
    tax_total: float
    total: float
    payment_method: str
    status: str
    cart_discount_amount: float = 0
    wholesale_savings: float = 0
    returned_total: float = 0
    net_total: float = 0
    customer_nit: str | None = None
    customer_name: str | None = None
    items: list[SaleItemOut]
    payments: list[SalePaymentOut] = Field(default_factory=list)
    returns: list[SaleReturnOut] = Field(default_factory=list)
    fel: FelInvoiceOut | None = None


class CompanyConfig(BaseModel):
    nit: str
    nombre: str
    nombre_comercial: str
    direccion: str
    codigo_postal: str = "01001"
    municipio: str
    departamento: str
    afiliacion_iva: str
    establecimiento: str
    fel_mode: str
    fel_mode_label: str = ""
    fel_enabled: bool = True
    certificador: str
    certificador_usuario: str = ""
    certificador_llave_configured: bool = False
    certificador_url: str = ""
    business_profile: BusinessProfile = "abarrotes"


class CompanyConfigUpdateIn(BaseModel):
    nit: str = Field(min_length=1, max_length=20)
    nombre: str = Field(min_length=1, max_length=200)
    nombre_comercial: str = Field(min_length=1, max_length=200)
    direccion: str = Field(min_length=1, max_length=300)
    codigo_postal: str = Field(default="01001", max_length=12)
    municipio: str = Field(min_length=1, max_length=120)
    departamento: str = Field(min_length=1, max_length=120)
    afiliacion_iva: str = Field(default="GEN", max_length=10)
    establecimiento: str = Field(default="1", max_length=10)
    fel_mode: Literal["disabled", "demo", "production"]
    certificador: str = Field(min_length=1, max_length=40)
    certificador_usuario: str = Field(default="", max_length=120)
    certificador_llave: str = Field(default="", max_length=500)
    certificador_url: str = Field(default="", max_length=300)
    business_profile: BusinessProfile = "abarrotes"


class BusinessProfileConfigOut(BaseModel):
    business_profile: BusinessProfile
    business_profile_label: str
    cash_shared_session: bool = False
    nit_lookup_configured: bool = False


class LoginRequest(BaseModel):
    username: str
    password: str


class CashierPasswordLoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class PasswordConfirmRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class PasswordConfirmResponse(BaseModel):
    valid: bool = True
    message: str = "Clave confirmada."


class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: Literal["admin", "user"]
    active: int
    must_change_password: int = 0

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ChangePasswordResponse(BaseModel):
    message: str = "Clave actualizada."
    user: UserOut


class UserCreate(BaseModel):
    username: str
    full_name: str
    role: Literal["admin", "user"] = "user"
    password: str = Field(min_length=4, max_length=128)
    active: int = Field(default=1, ge=0, le=1)


class UserUpdate(BaseModel):
    full_name: str | None = None
    role: Literal["admin", "user"] | None = None
    password: str | None = Field(default=None, min_length=4, max_length=128)
    active: int | None = Field(default=None, ge=0, le=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CashSessionOpen(BaseModel):
    opening_amount: float = Field(ge=0)
    notes: str | None = None


class CashMovementCreate(BaseModel):
    movement_type: Literal["income", "expense"]
    amount: float = Field(gt=0)
    description: str | None = None


class CashSessionClose(BaseModel):
    counted_amount: float = Field(ge=0)
    notes: str | None = None


class CashMovementOut(BaseModel):
    id: int
    cash_session_id: int
    created_by_user_id: int
    created_at: datetime
    movement_type: str
    amount: float
    description: str | None = None
    sale_id: int | None = None

    model_config = {"from_attributes": True}


class CashSessionOut(BaseModel):
    id: int
    opened_at: datetime
    opened_by_user_id: int
    opened_by_full_name: str | None = None
    opened_by_username: str | None = None
    opening_amount: float
    expected_amount: float
    status: str
    notes: str | None = None
    closed_at: datetime | None = None
    closed_by_user_id: int | None = None
    closed_by_full_name: str | None = None
    counted_amount: float | None = None
    difference: float | None = None

    model_config = {"from_attributes": True}


class OrderCreate(BaseModel):
    customer_name: str
    customer_phone: str | None = None
    customer_email: str | None = None
    total_estimate: float = Field(default=0, ge=0)
    notes: str | None = None


class OrderSendRequest(BaseModel):
    channels: list[Literal["whatsapp", "gmail"]] = Field(min_length=1)
    whatsapp_to: str | None = None
    gmail_to: str | None = None


class OrderDispatchOut(BaseModel):
    id: int
    sent_at: datetime
    channel: str
    recipient: str
    status: str
    provider_response: str | None = None

    model_config = {"from_attributes": True}


class OrderOut(BaseModel):
    id: int
    created_at: datetime
    created_by_user_id: int
    customer_name: str
    customer_phone: str | None = None
    customer_email: str | None = None
    total_estimate: float
    status: str
    notes: str | None = None
    dispatches: list[OrderDispatchOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class PrintReceiptResponse(BaseModel):
    ok: bool
    message: str


class ReceiptPrinterConfigOut(BaseModel):
    printer_name: str = ""
    default_printer: str = ""
    available_printers: list[str] = Field(default_factory=list)
    active_printer: str = ""
    print_on_checkout: bool = True
    open_drawer_on_checkout: bool = True
    chars_per_line: int = 48
    bottom_feed_lines: int = 8
    encoding: str = "cp850"
    platform_supported: bool = True
    header_line_1: str = ""
    header_line_2: str = ""
    header_line_3: str = ""
    show_company_nit: bool = True
    show_address: bool = False
    center_header: bool = False
    footer_message: str = "Gracias por su compra"
    footer_extra: str = ""
    ticket_label: str = "TICKET #{id}"
    separator_char: str = "-"
    show_customer: bool = True
    show_date: bool = True
    show_subtotal: bool = True
    show_tax: bool = True
    show_payments: bool = True
    show_fel: bool = True
    show_wholesale_savings: bool = True
    show_item_detail: bool = True
    preview_text: str = ""


class ReceiptPrinterConfigUpdateIn(BaseModel):
    printer_name: str = Field(default="", max_length=200)
    print_on_checkout: bool = True
    open_drawer_on_checkout: bool = True
    chars_per_line: int = Field(default=48, ge=32, le=64)
    bottom_feed_lines: int = Field(default=8, ge=2, le=20)
    encoding: str = Field(default="cp850", max_length=20)
    header_line_1: str = Field(default="", max_length=120)
    header_line_2: str = Field(default="", max_length=120)
    header_line_3: str = Field(default="", max_length=120)
    show_company_nit: bool = True
    show_address: bool = False
    center_header: bool = False
    footer_message: str = Field(default="Gracias por su compra", max_length=200)
    footer_extra: str = Field(default="", max_length=200)
    ticket_label: str = Field(default="TICKET #{id}", max_length=40)
    separator_char: str = Field(default="-", max_length=1)
    show_customer: bool = True
    show_date: bool = True
    show_subtotal: bool = True
    show_tax: bool = True
    show_payments: bool = True
    show_fel: bool = True
    show_wholesale_savings: bool = True
    show_item_detail: bool = True


class ReceiptPrinterTestOut(BaseModel):
    ok: bool
    message: str
    printer_name: str = ""


class BackupFileOut(BaseModel):
    name: str
    created_at: datetime
    size_bytes: int
    size_mb: float


class BackupCreateOut(BaseModel):
    message: str
    backup: BackupFileOut


class BackupRestoreOut(BaseModel):
    message: str
    restored_backup: BackupFileOut
    safety_backup: BackupFileOut


class VersionHistoryEntry(BaseModel):
    version: str
    installed_at: str


class AppVersionOut(BaseModel):
    app_name: str
    creator: str = "D3xFr3N"
    version: str
    build_date: str | None = None
    previous_version: str | None = None
    installed_at: str | None = None
    updated_at: str | None = None
    history: list[VersionHistoryEntry] = []
    changed_on_startup: bool = False


class LanIpOut(BaseModel):
    ip: str | None = None
    detected: bool = False
    message: str = ""


class UpdateCheckOut(BaseModel):
    enabled: bool
    current_version: str
    latest_version: str | None = None
    build_date: str | None = None
    download_url: str | None = None
    release_notes: str | None = None
    update_available: bool = False
    manifest_url: str | None = None
    error: str | None = None
    message: str
    license_required: bool = False
    license_valid: bool = True
    license_status: str | None = None
    license_store_label: str | None = None
    license_store_id: str | None = None
    license_message: str | None = None
    license_cached: bool = False


class LicenseConfigOut(BaseModel):
    store_license_key: str = ""
    license_registry_url: str = ""
    license_required_for_updates: bool = True
    resolved_registry_url: str | None = None
    configured: bool = False
    required: bool = False
    valid: bool = True
    status: str = "optional"
    store_label: str | None = None
    store_id: str | None = None
    message: str = ""
    registry_url: str | None = None
    fingerprint: str | None = None
    checked_at: str | None = None
    cached: bool = False
    license_key_configured: bool = False


class LicenseConfigUpdateIn(BaseModel):
    store_license_key: str = Field(default="", max_length=80)
    license_registry_url: str = ""
    license_required_for_updates: bool = True


class UpdateApplyOut(BaseModel):
    message: str
    target_version: str
    previous_version: str
    backup_name: str | None = None
    restart_script: str | None = None
    restart_required: bool = True
    requires_elevation: bool = False


class PurchaseOrderItemInput(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)


class PurchaseOrderCreate(BaseModel):
    items: list[PurchaseOrderItemInput] = Field(min_length=1)
    notes: str | None = None
    channels: list[Literal["whatsapp", "gmail"]] = Field(default_factory=lambda: ["gmail"])


class PurchaseOrderSendRequest(BaseModel):
    channels: list[Literal["whatsapp", "gmail"]] = Field(min_length=1)


class PurchaseOrderItemOut(BaseModel):
    product_id: int
    product_name: str
    quantity: float
    unit_cost: float
    line_total: float


class PurchaseOrderDispatchOut(BaseModel):
    id: int
    sent_at: datetime
    channel: str
    recipient: str
    status: str
    provider_response: str | None = None

    model_config = {"from_attributes": True}


class PurchaseOrderOut(BaseModel):
    id: int
    created_at: datetime
    supplier_id: int
    supplier_name: str
    total_estimate: float
    status: str
    notes: str | None = None
    items: list[PurchaseOrderItemOut]
    dispatches: list[PurchaseOrderDispatchOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class StockCountSessionCreate(BaseModel):
    order_code: str = Field(min_length=3, max_length=60)
    department_id: int
    notes: str | None = None


class StockCountScanIn(BaseModel):
    sku: str
    counted_quantity: float = Field(default=1, gt=0)
    replace_quantity: bool = False


class StockCountSetQuantityIn(BaseModel):
    counted_quantity: float = Field(ge=0)


class StockCountRecountIn(BaseModel):
    reason: str | None = None


class StockCountTotalsOut(BaseModel):
    total_lines: int
    matched_lines: int
    missing_lines: int
    extra_lines: int
    missing_units: float
    extra_units: float
    estimated_loss: float
    estimated_overage_value: float


class StockCountItemOut(BaseModel):
    product_id: int
    sku: str
    name: str
    description: str | None = None
    unit_cost: float
    unit_price: float
    system_quantity: float
    counted_quantity: float
    difference_quantity: float
    difference_cost: float
    updated_at: datetime


class StockCountScanLogOut(BaseModel):
    id: int
    scanned_at: datetime
    scanned_by_user_id: int
    scanned_by_username: str
    scanned_by_full_name: str
    product_id: int | None = None
    sku: str | None = None
    product_name: str | None = None
    action_type: str
    quantity: float
    before_counted: float
    after_counted: float
    note: str | None = None


class StockCountSessionOut(BaseModel):
    id: int
    created_at: datetime
    created_by_user_id: int
    order_code: str | None = None
    department_id: int | None = None
    department_name: str | None = None
    status: str
    notes: str | None = None
    applied_at: datetime | None = None
    applied_by_user_id: int | None = None
    totals: StockCountTotalsOut
    items: list[StockCountItemOut] = Field(default_factory=list)
    logs: list[StockCountScanLogOut] = Field(default_factory=list)


class SalesSummaryOut(BaseModel):
    sales_count: int
    total_amount: float
    tax_total: float
    credit_sales_count: int
    credit_sales_amount: float


class TopProductOut(BaseModel):
    product_id: int
    sku: str
    name: str
    quantity: float
    total_amount: float
    estimated_margin: float


class PaymentMethodBreakdownOut(BaseModel):
    payment_method: str
    sales_count: int
    total_amount: float


class CashCutReportOut(BaseModel):
    session_id: int
    opened_at: str | None
    opened_by: str | None
    opening_amount: float
    expected_amount: float
    sales_total: float
    returns_total: float
    other_income: float
    status: str


class CashierRankingOut(BaseModel):
    user_id: int
    full_name: str
    username: str
    sales_count: int
    total_amount: float


class OwnerDashboardOut(BaseModel):
    sales_summary: SalesSummaryOut
    payment_methods: list[PaymentMethodBreakdownOut]
    top_products: list[TopProductOut]
    cash_cut: CashCutReportOut | None = None
    alerts: list[dict] = Field(default_factory=list)
    pending_fel_count: int = 0


class SystemAlertOut(BaseModel):
    level: str
    code: str
    message: str
    product_id: int | None = None


class PromotionBase(BaseModel):
    name: str
    promo_type: str = "percent"
    value: float = Field(ge=0)
    min_qty: float = Field(default=0, ge=0)
    product_id: int | None = None
    department_id: int | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    active: int = Field(default=1, ge=0, le=1)


class PromotionCreate(PromotionBase):
    pass


class PromotionUpdate(BaseModel):
    name: str | None = None
    promo_type: str | None = None
    value: float | None = Field(default=None, ge=0)
    min_qty: float | None = Field(default=None, ge=0)
    product_id: int | None = None
    department_id: int | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    active: int | None = Field(default=None, ge=0, le=1)


class PromotionOut(PromotionBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class BranchBase(BaseModel):
    code: str
    name: str
    address: str | None = None
    phone: str | None = None
    active: int = Field(default=1, ge=0, le=1)


class BranchCreate(BranchBase):
    pass


class BranchUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    address: str | None = None
    phone: str | None = None
    active: int | None = Field(default=None, ge=0, le=1)


class BranchOut(BranchBase):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: int
    created_at: datetime
    user_id: int | None = None
    username: str | None = None
    action: str
    entity_type: str | None = None
    entity_id: int | None = None
    details: str | None = None


class ProductLotBase(BaseModel):
    lot_code: str
    expires_at: datetime | None = None
    quantity: float = Field(ge=0)
    active: int = Field(default=1, ge=0, le=1)


class ProductLotCreate(ProductLotBase):
    pass


class ProductLotOut(ProductLotBase):
    id: int
    product_id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class SchoolPackageItemInput(BaseModel):
    product_id: int
    quantity: float = Field(gt=0)


class SchoolPackageCreate(BaseModel):
    name: str
    school_grade: str | None = None
    notes: str | None = None
    items: list[SchoolPackageItemInput] = Field(min_length=1)


class SchoolPackageItemOut(BaseModel):
    product_id: int
    product_name: str
    quantity: float
    unit_price: float


class SchoolPackageOut(BaseModel):
    id: int
    name: str
    school_grade: str | None = None
    notes: str | None = None
    active: int
    created_at: datetime
    items: list[SchoolPackageItemOut] = Field(default_factory=list)
    package_price: float = 0


class PurchaseReceiveRequest(BaseModel):
    invoice_ref: str | None = None


class PurchaseSuggestionOut(BaseModel):
    product_id: int
    sku: str
    name: str
    current_stock: float
    min_stock: float
    sold_last_30_days: float
    suggested_qty: float


class PendingFelSaleOut(BaseModel):
    id: int
    sale_id: int
    created_at: datetime
    status: str
    retry_count: int
    last_error: str | None = None
    sale_total: float | None = None


class FelPendingBulkRetryOut(BaseModel):
    total: int
    certified: int
    failed: int
    items: list[PendingFelSaleOut] = Field(default_factory=list)


class CashSessionTransferIn(BaseModel):
    target_user_id: int = Field(gt=0)


class SystemConfigOut(BaseModel):
    cash_shared_session: bool = False
    nit_lookup_configured: bool = False


class SystemConfigUpdateIn(BaseModel):
    cash_shared_session: bool = False


class ScannerBridgeConfigOut(BaseModel):
    enabled: bool = False
    running: bool = False
    host: str = "0.0.0.0"
    port: int = 18765
    api_base: str = "http://127.0.0.1:8000"
    username: str = "admin"
    password_configured: bool = False
    com_port: str = ""
    listen_address: str = ""
    mobile_url_hint: str = ""


class ScannerBridgeConfigUpdateIn(BaseModel):
    enabled: bool = False
    port: int = Field(default=18765, ge=1024, le=65535)
    username: str = Field(default="admin", min_length=1, max_length=60)
    password: str = ""
    com_port: str = ""


class NotificationConfigOut(BaseModel):
    gmail_sender: str = ""
    gmail_app_password_configured: bool = False
    gmail_smtp_host: str = "smtp.gmail.com"
    gmail_smtp_port: int = 587
    whatsapp_phone_id: str = ""
    whatsapp_token_configured: bool = False
    whatsapp_api_url: str = "https://graph.facebook.com/v20.0"
    gmail_ready: bool = False
    whatsapp_ready: bool = False


class NotificationConfigUpdateIn(BaseModel):
    gmail_sender: str = ""
    gmail_app_password: str = ""
    gmail_smtp_host: str = "smtp.gmail.com"
    gmail_smtp_port: int = Field(default=587, ge=1, le=65535)
    whatsapp_phone_id: str = ""
    whatsapp_token: str = ""
    whatsapp_api_url: str = "https://graph.facebook.com/v20.0"


class NotificationTestIn(BaseModel):
    recipient: str = Field(min_length=3, max_length=120)


class ProductCostHistoryOut(BaseModel):
    id: int
    product_id: int
    created_at: datetime
    previous_cost: float
    new_cost: float
    source: str
    notes: str | None = None

    model_config = {"from_attributes": True}
