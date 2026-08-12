import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.models import (
    Customer,
    FelInvoice,
    InventoryMovement,
    PendingFelSale,
    Product,
    Sale,
    SaleItem,
    SalePayment,
    SaleReturn,
    SaleReturnItem,
)
from app.schemas import (
    FelInvoiceOut,
    SaleCreate,
    SaleItemOut,
    SaleOut,
    SalePaymentInput,
    SalePaymentOut,
    SaleReturnCreate,
    SaleReturnItemOut,
    SaleReturnOut,
)
from app.fel_config import is_fel_enabled
from app.services.audit_service import log_action
from app.services.customer_lookup_service import lookup_customer_by_nit
from app.services.fel_service import FelCertificationResult, certify_sale, certify_sale_return
from app.services.inventory_branch_service import adjust_branch_stock, get_available_stock, resolve_branch_id
from app.services.lot_service import deduct_lots_fefo, restock_lots_from_sale_item
from app.services.nit_service import is_valid_nit, normalize_nit
from app.services.promotion_service import best_promotion_for_line


def _round2(value: float) -> float:
    return round(float(value or 0), 2)


def sale_cash_paid_amount(sale: Sale) -> float:
    """Monto en efectivo cobrado en la venta original (0 si credito/tarjeta/transferencia)."""
    if int(getattr(sale, "is_credit", 0) or 0) == 1:
        return 0.0
    payments = list(getattr(sale, "payments", None) or [])
    if payments:
        return _round2(sum(float(p.amount or 0) for p in payments if p.payment_method == "efectivo"))
    if (sale.payment_method or "").strip().lower() == "efectivo":
        return _round2(sale.total)
    if (sale.payment_method or "").strip().lower() == "mixto":
        return 0.0
    return 0.0


def return_cash_refund_amount(
    sale: Sale,
    return_total: float,
    *,
    credit_balance_before: float | None = None,
) -> float:
    """Reembolso en efectivo: proporcional al efectivo cobrado, o exceso si credito ya abonado."""
    ret = _round2(return_total)
    if ret <= 0:
        return 0.0
    if int(getattr(sale, "is_credit", 0) or 0) == 1:
        # Lo que ya no cabe en el saldo pendiente se devolvió en efectivo al cliente (abonos previos).
        if credit_balance_before is None:
            credit_balance_before = float(
                getattr(getattr(sale, "customer", None), "credit_balance", 0) or 0
            )
        applied_to_balance = min(_round2(credit_balance_before), ret)
        return _round2(max(0.0, ret - applied_to_balance))
    cash_paid = sale_cash_paid_amount(sale)
    sale_total = _round2(sale.total)
    if cash_paid <= 0 or sale_total <= 0:
        return 0.0
    return _round2(min(ret, cash_paid * (ret / sale_total)))


def _sale_line_paid_ratio(sale: Sale) -> float:
    """Ratio neto/bruto por descuento de carrito (lineas guardan total bruto)."""
    items_gross = _round2(sum(float(item.total or 0) for item in (sale.items or [])))
    if items_gross <= 0:
        return 1.0
    return min(1.0, max(0.0, _round2(sale.total) / items_gross))


def _load_sale_with_details(db: Session, sale_id: int) -> Sale:
    return (
        db.query(Sale)
        .options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.customer),
            joinedload(Sale.created_by),
            joinedload(Sale.fel_invoice),
            joinedload(Sale.payments),
            joinedload(Sale.returns).joinedload(SaleReturn.items).joinedload(SaleReturnItem.product),
        )
        .filter(Sale.id == sale_id)
        .one()
    )


def _resolve_sale_payments(
    payload: SaleCreate,
    total: float,
) -> tuple[str, list[SalePaymentInput]]:
    allowed = {"efectivo", "tarjeta", "transferencia"}
    if payload.is_credit:
        return "credito", [SalePaymentInput(payment_method="credito", amount=_round2(total))]

    if payload.payments:
        payments = payload.payments
        if len(payments) < 2:
            raise ValueError("El pago mixto requiere al menos dos metodos de pago.")
        paid_total = _round2(sum(line.amount for line in payments))
        if abs(paid_total - _round2(total)) > 0.01:
            raise ValueError(
                f"Los montos de pago deben sumar el total de la venta (Q{total:.2f}). "
                f"Recibido: Q{paid_total:.2f}."
            )
        methods = {line.payment_method for line in payments}
        if not methods.issubset(allowed):
            raise ValueError("Metodos de pago invalidos para cobro mixto.")
        if len(methods) < 2:
            raise ValueError("El pago mixto debe combinar al menos dos metodos distintos.")
        return "mixto", payments

    method = (payload.payment_method or "efectivo").strip().lower()
    if method == "mixto":
        raise ValueError("El pago mixto requiere el detalle de metodos en payments[].")
    if method == "credito":
        raise ValueError("Para vender a credito debes enviar is_credit=true (no solo payment_method).")
    if method not in allowed:
        raise ValueError("Metodo de pago invalido.")
    return method, [SalePaymentInput(payment_method=method, amount=_round2(total))]


def _resolve_cash_tender(payload: SaleCreate, payment_method: str, payment_lines: list[SalePaymentInput]) -> tuple[float, float]:
    """Devuelve (efectivo recibido del cliente, cambio a devolver)."""
    if payload.is_credit or payment_method == "credito":
        return 0.0, 0.0

    cash_due = 0.0
    if payment_method == "efectivo":
        cash_due = _round2(sum(line.amount for line in payment_lines if line.payment_method == "efectivo"))
    elif payment_method == "mixto":
        cash_due = _round2(sum(line.amount for line in payment_lines if line.payment_method == "efectivo"))
    else:
        return 0.0, 0.0

    if cash_due <= 0:
        return 0.0, 0.0

    received = _round2(float(payload.cash_received or 0))
    if received <= 0:
        # Sin captura explicita, asumir pago exacto.
        received = cash_due
    if received + 0.001 < cash_due:
        raise ValueError(
            f"Efectivo insuficiente. Se requieren Q{cash_due:.2f} y se recibieron Q{received:.2f}."
        )
    change = _round2(max(received - cash_due, 0))
    return received, change


def _returned_qty_by_sale_item(sale: Sale) -> dict[int, float]:
    returned: dict[int, float] = {}
    for sale_return in sale.returns:
        if sale_return.status != "completed":
            continue
        for item in sale_return.items:
            returned[item.sale_item_id] = _round2(returned.get(item.sale_item_id, 0) + item.quantity)
    return returned


def _return_item_to_schema(item: SaleReturnItem) -> SaleReturnItemOut:
    return SaleReturnItemOut(
        sale_item_id=item.sale_item_id,
        product_id=item.product_id,
        product_name=item.product.name if item.product else f"Producto #{item.product_id}",
        quantity=item.quantity,
        unit_price=item.unit_price,
        tax_rate=item.tax_rate,
        subtotal=item.subtotal,
        tax_amount=item.tax_amount,
        total=item.total,
    )


def _sale_return_to_schema(
    sale_return: SaleReturn,
    *,
    cash_refund_amount: float = 0.0,
) -> SaleReturnOut:
    return SaleReturnOut(
        id=sale_return.id,
        created_at=sale_return.created_at,
        created_by_user_id=sale_return.created_by_user_id,
        reason=sale_return.reason,
        subtotal=sale_return.subtotal,
        tax_total=sale_return.tax_total,
        total=sale_return.total,
        status=sale_return.status,
        fel_uuid=sale_return.fel_uuid,
        fel_serie=sale_return.fel_serie,
        fel_numero=sale_return.fel_numero,
        fel_document_type=sale_return.fel_document_type,
        fel_status=sale_return.fel_status,
        cash_refund_amount=_round2(cash_refund_amount),
        items=[_return_item_to_schema(item) for item in sale_return.items],
    )


def get_or_create_customer(
    db: Session,
    customer_id: int | None,
    customer_nit: str | None,
    customer_name: str | None,
) -> Customer | None:
    if customer_id:
        return db.get(Customer, customer_id)

    nit = normalize_nit(customer_nit)
    if not is_valid_nit(nit):
        raise ValueError("NIT invalido. Ingresa un NIT valido o deja CF.")
    name = (customer_name or "").strip()

    customer = db.query(Customer).filter(Customer.nit == nit).first()
    if customer:
        if name and customer.name != name:
            customer.name = name
        return customer

    if nit != "CF":
        try:
            lookup_result = lookup_customer_by_nit(nit)
        except Exception:
            lookup_result = None

        if lookup_result:
            customer = Customer(
                nit=lookup_result.nit,
                name=lookup_result.name,
                email=lookup_result.email,
                address=lookup_result.address,
            )
            db.add(customer)
            db.flush()
            return customer

    if not name:
        name = "CONSUMIDOR FINAL" if nit == "CF" else "CLIENTE"

    customer = Customer(nit=nit, name=name)
    db.add(customer)
    db.flush()
    return customer


def create_sale_return(
    db: Session,
    *,
    sale_id: int,
    payload: SaleReturnCreate,
    user_id: int,
    commit: bool = True,
) -> SaleReturnOut:
    client_request_id = (getattr(payload, "client_request_id", None) or "").strip() or None
    if client_request_id:
        existing = (
            db.query(SaleReturn)
            .options(joinedload(SaleReturn.items).joinedload(SaleReturnItem.product))
            .filter(SaleReturn.client_request_id == client_request_id)
            .one_or_none()
        )
        if existing:
            # Reintento idempotente: devolver el reembolso ya calculado (sin mover caja otra vez).
            return _sale_return_to_schema(
                existing,
                cash_refund_amount=float(getattr(existing, "cash_refund_amount", 0) or 0),
            )

    sale = (
        db.query(Sale)
        .filter(Sale.id == sale_id)
        .with_for_update()
        .one_or_none()
    )
    if not sale:
        raise ValueError("Venta no encontrada.")
    if sale.status not in {"completed", "partially_returned"}:
        raise ValueError("La venta no permite devoluciones adicionales.")
    sale = _load_sale_with_details(db, sale_id)
    if is_fel_enabled():
        fel = sale.fel_invoice
        if not fel:
            raise ValueError("La venta no tiene FEL asociado para emitir nota de credito.")
        fel_status = str(fel.status or "").strip().lower()
        if fel_status in {"pending", "error", "failed", "rejected"}:
            raise ValueError(
                "No puedes devolver una venta con FEL pendiente o fallido. "
                "Reintenta la certificacion FEL o descarta el pendiente antes."
            )

    sale_items_by_id = {item.id: item for item in sale.items}
    returned_qty_map = _returned_qty_by_sale_item(sale)
    paid_ratio = _sale_line_paid_ratio(sale)

    sale_return = SaleReturn(
        sale_id=sale.id,
        created_by_user_id=user_id,
        reason=(payload.reason or "").strip() or None,
        subtotal=0,
        tax_total=0,
        total=0,
        status="completed",
        client_request_id=client_request_id,
        fel_uuid=f"PENDING-{uuid.uuid4()}",
        fel_serie="PENDING",
        fel_numero="PENDING",
        fel_document_type="NCRE",
        fel_status="pending",
        fel_xml_content="<pending/>",
    )
    db.add(sale_return)
    db.flush()

    subtotal = 0.0
    tax_total = 0.0
    total = 0.0
    created_items = 0

    for line in payload.items:
        sale_item = sale_items_by_id.get(line.sale_item_id)
        if not sale_item:
            raise ValueError(f"Linea de venta invalida: {line.sale_item_id}")
        available_qty = _round2(sale_item.quantity - returned_qty_map.get(sale_item.id, 0))
        requested_qty = _round2(line.quantity)
        if requested_qty <= 0:
            raise ValueError("La cantidad de devolucion debe ser mayor a 0.")
        if requested_qty > available_qty:
            raise ValueError(
                f"Cantidad de devolucion excede disponible para {sale_item.product.name}. "
                f"Disponible: {available_qty:g}, solicitado: {requested_qty:g}."
            )

        # Proporcional a lo cobrado (incluye descuento de carrito aplicado a la venta).
        qty_factor = requested_qty / sale_item.quantity if sale_item.quantity else 0
        line_total = _round2(sale_item.total * qty_factor * paid_ratio)
        line_tax = _round2(sale_item.tax_amount * qty_factor * paid_ratio)
        line_subtotal = _round2(line_total - line_tax)

        sale_return_item = SaleReturnItem(
            sale_return_id=sale_return.id,
            sale_item_id=sale_item.id,
            product_id=sale_item.product_id,
            quantity=requested_qty,
            unit_price=sale_item.unit_price,
            tax_rate=sale_item.tax_rate,
            subtotal=line_subtotal,
            tax_amount=line_tax,
            total=line_total,
        )
        db.add(sale_return_item)

        product = db.get(Product, sale_item.product_id)
        if not product:
            raise ValueError(f"No se encontro producto para la linea {sale_item.id}.")
        if sale_item.tracks_inventory:
            adjust_branch_stock(
                db,
                product,
                float(requested_qty),
                branch_id=sale.branch_id,
                user_id=user_id,
                movement_type="sale_return_in",
                notes=f"Devolucion venta #{sale.id}",
            )
            restock_lots_from_sale_item(
                db,
                product=product,
                sale_item_id=sale_item.id,
                quantity=float(requested_qty),
                branch_id=sale.branch_id,
            )

        subtotal += line_subtotal
        tax_total += line_tax
        total += line_total
        created_items += 1

    if created_items <= 0:
        raise ValueError("Debes incluir al menos una linea valida para devolucion.")

    sale_return.subtotal = _round2(subtotal)
    sale_return.tax_total = _round2(tax_total)
    sale_return.total = _round2(total)

    db.flush()
    db.refresh(sale_return, attribute_names=["items"])
    for item in sale_return.items:
        db.refresh(item, attribute_names=["product"])

    if is_fel_enabled():
        fel_result = certify_sale_return(sale, sale_return, sale.customer)
        sale_return.fel_uuid = fel_result.uuid
        sale_return.fel_serie = fel_result.serie
        sale_return.fel_numero = fel_result.numero
        sale_return.fel_document_type = fel_result.document_type
        sale_return.fel_status = fel_result.status
        sale_return.fel_xml_content = fel_result.xml_content
        sale_return.fel_certifier_response = fel_result.certifier_response
    else:
        sale_return.fel_uuid = f"NOFEL-{sale_return.id}"
        sale_return.fel_serie = "TICKET"
        sale_return.fel_numero = str(sale_return.id).zfill(8)
        sale_return.fel_document_type = "DEV"
        sale_return.fel_status = "disabled"
        sale_return.fel_xml_content = "<disabled/>"
        sale_return.fel_certifier_response = '{"mode":"disabled","message":"Devolucion sin FEL."}'

    total_returned = _round2(sum(s.total for s in sale.returns if s.status == "completed") + sale_return.total)
    if total_returned >= _round2(sale.total):
        sale.status = "returned"
    elif total_returned > 0:
        sale.status = "partially_returned"
    else:
        sale.status = "completed"

    cash_refund_amount = 0.0
    if int(getattr(sale, "is_credit", 0) or 0) == 1 and sale.customer_id:
        customer = (
            db.query(Customer)
            .filter(Customer.id == sale.customer_id)
            .with_for_update()
            .one_or_none()
        )
        if customer:
            from app.services.credit_service import credit_remainings_after_unallocated

            remainings = {
                s.id: rem
                for s, rem in credit_remainings_after_unallocated(
                    db,
                    customer.id,
                    exclude_return_id=sale_return.id,
                    include_returned=True,
                )
            }
            remaining_on_sale = float(remainings.get(sale.id, 0.0))
            balance = float(customer.credit_balance or 0)
            applied = min(remaining_on_sale, float(sale_return.total or 0), balance)
            customer.credit_balance = _round2(max(0.0, balance - applied))
            cash_refund_amount = _round2(max(0.0, float(sale_return.total or 0) - applied))
    else:
        cash_refund_amount = return_cash_refund_amount(sale, float(sale_return.total or 0))

    sale_return.cash_refund_amount = cash_refund_amount

    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if client_request_id:
                existing = (
                    db.query(SaleReturn)
                    .options(joinedload(SaleReturn.items).joinedload(SaleReturnItem.product))
                    .filter(SaleReturn.client_request_id == client_request_id)
                    .one_or_none()
                )
                if existing:
                    return _sale_return_to_schema(existing, cash_refund_amount=0.0)
            raise
    else:
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            if client_request_id:
                existing = (
                    db.query(SaleReturn)
                    .options(joinedload(SaleReturn.items).joinedload(SaleReturnItem.product))
                    .filter(SaleReturn.client_request_id == client_request_id)
                    .one_or_none()
                )
                if existing:
                    return _sale_return_to_schema(existing, cash_refund_amount=0.0)
            raise
    db.refresh(sale_return)
    db.refresh(sale_return, attribute_names=["items"])
    for item in sale_return.items:
        db.refresh(item, attribute_names=["product"])
    return _sale_return_to_schema(sale_return, cash_refund_amount=cash_refund_amount)


def create_sale(
    db: Session,
    payload: SaleCreate,
    user_id: int | None = None,
    *,
    commit: bool = True,
    adjust_inventory: bool = True,
) -> SaleOut:
    if not payload.items:
        raise ValueError("La venta debe incluir al menos un producto.")

    client_request_id = (payload.client_request_id or "").strip() or None
    if client_request_id:
        existing = (
            db.query(Sale)
            .filter(Sale.client_request_id == client_request_id)
            .one_or_none()
        )
        if existing:
            return sale_to_schema(_load_sale_with_details(db, existing.id))

    prescription_needed: list[str] = []
    for line in payload.items:
        product = db.get(Product, line.product_id)
        if product and product.active and int(getattr(product, "requires_prescription", 0) or 0) == 1:
            prescription_needed.append(product.name)
    if prescription_needed and not bool(getattr(payload, "prescription_confirmed", False)):
        names = ", ".join(prescription_needed[:4])
        extra = "…" if len(prescription_needed) > 4 else ""
        raise ValueError(
            f"Hay medicamentos que requieren receta ({names}{extra}). "
            "Confirma que el cliente presenta receta medica."
        )

    customer = get_or_create_customer(
        db,
        payload.customer_id,
        payload.customer_nit,
        payload.customer_name,
    )

    is_credit = bool(payload.is_credit)
    if is_credit:
        if not customer or customer.nit == "CF":
            raise ValueError("Ventas a credito requieren un cliente registrado con NIT.")
        if not int(getattr(customer, "active", 1)):
            raise ValueError("El cliente no esta activo.")
        customer = (
            db.query(Customer)
            .filter(Customer.id == customer.id)
            .with_for_update()
            .one()
        )

    sale = Sale(
        customer_id=customer.id if customer else None,
        payment_method="credito" if is_credit else payload.payment_method,
        created_by_user_id=user_id,
        cart_discount_amount=_round2(payload.cart_discount_amount or 0),
        promotion_id=payload.promotion_id,
        is_credit=1 if is_credit else 0,
        document_type=("FCAM" if bool(getattr(payload, "use_fcam", False)) and is_credit else "FACT"),
        tip_amount=_round2(getattr(payload, "tip_amount", 0) or 0),
        loyalty_points_redeemed=_round2(getattr(payload, "loyalty_points_redeem", 0) or 0),
        client_request_id=client_request_id,
        branch_id=resolve_branch_id(db, getattr(payload, "branch_id", None)),
    )
    db.add(sale)
    db.flush()

    subtotal = 0.0
    tax_total = 0.0
    total = 0.0
    applied_promotion_id = payload.promotion_id
    sale_branch_id = sale.branch_id

    for line in payload.items:
        product = db.get(Product, line.product_id)
        if not product or not product.active:
            raise ValueError(f"Producto invalido: {line.product_id}")
        # Si adjust_inventory=False (p.ej. entrega de apartado ya reservado),
        # el stock ya se desconto en la reserva y no debe validarse otra vez.
        if adjust_inventory and int(product.tracks_inventory or 0) == 1:
            available = get_available_stock(db, product, sale_branch_id, for_update=True)
            if available < line.quantity:
                raise ValueError(
                    f"Stock insuficiente para {product.name}. "
                    f"Disponible: {available:g}, solicitado: {line.quantity:g}."
                )

        locked_price = getattr(line, "unit_price", None)
        base_unit_price = round(product.price, 2)
        price_tier = (getattr(customer, "price_tier", None) or "retail") if customer else "retail"
        if price_tier == "vip" and getattr(product, "price_vip", None) is not None:
            base_unit_price = round(float(product.price_vip or product.price), 2)
        promo_discount = 0.0
        promo = None
        if locked_price is not None:
            # Precio congelado (p.ej. comanda de mesa): no aplicar mayoreo/promos.
            unit_price = _round2(locked_price)
            base_unit_price = unit_price
            line_discount = 0.0
        else:
            unit_price = base_unit_price
            use_wholesale = (
                product.wholesale_enabled
                and product.wholesale_min_qty > 0
                and line.quantity >= product.wholesale_min_qty
                and product.wholesale_discount_pct > 0
            ) or price_tier == "wholesale"
            if use_wholesale and product.wholesale_discount_pct > 0:
                unit_price = round(base_unit_price * (1 - (product.wholesale_discount_pct / 100)), 2)
            line_discount = round((base_unit_price - unit_price) * line.quantity, 2)

            promo, promo_discount = best_promotion_for_line(
                db,
                product_id=product.id,
                department_id=product.department_id,
                quantity=line.quantity,
                unit_price=unit_price,
            )
            if promo_discount > 0:
                line_discount = _round2(line_discount + promo_discount)
                if promo:
                    applied_promotion_id = promo.id

        # Precio de venta con IVA incluido: el impuesto se desglosa, no se suma encima.
        line_total = round(unit_price * line.quantity, 2)
        if promo_discount > 0:
            line_total = _round2(max(line_total - promo_discount, 0))
        tax_rate = float(product.tax_rate or 0)
        line_tax = _round2(line_total - (line_total / (1 + tax_rate))) if tax_rate > 0 else 0.0
        line_subtotal = _round2(line_total - line_tax)

        item = SaleItem(
            sale_id=sale.id,
            product_id=product.id,
            quantity=line.quantity,
            tracks_inventory=product.tracks_inventory,
            base_unit_price=base_unit_price,
            unit_price=unit_price,
            discount_amount=line_discount,
            tax_rate=product.tax_rate,
            subtotal=line_subtotal,
            tax_amount=line_tax,
            total=line_total,
        )
        db.add(item)
        db.flush()
        if adjust_inventory and int(product.tracks_inventory or 0) == 1:
            adjust_branch_stock(
                db,
                product,
                -float(line.quantity),
                branch_id=sale_branch_id,
                user_id=user_id,
                movement_type="sale_out",
                notes=f"Venta #{sale.id}",
            )
            deduct_lots_fefo(
                db,
                product=product,
                quantity=float(line.quantity),
                sale_item_id=item.id,
                branch_id=sale_branch_id,
            )

        subtotal += line_subtotal
        tax_total += line_tax
        total += line_total

    raw_total = _round2(total)
    if sale.cart_discount_amount > 0:
        max_discount = _round2(raw_total * 0.5)
        discount = min(sale.cart_discount_amount, raw_total, max_discount)
        if _round2(payload.cart_discount_amount or 0) > max_discount + 0.001:
            raise ValueError(
                f"El descuento no puede superar el 50% del total (max Q{max_discount:.2f})."
            )
        sale.cart_discount_amount = discount
        if raw_total > 0:
            ratio = (raw_total - discount) / raw_total
            total = _round2(raw_total - discount)
            tax_total = _round2(tax_total * ratio)
            subtotal = _round2(total - tax_total)

    sale.promotion_id = applied_promotion_id
    sale.subtotal = _round2(subtotal)
    sale.tax_total = _round2(tax_total)
    sale.total = _round2(total)

    # Canje de puntos: 1 punto = Q0.10
    redeem_pts = _round2(getattr(payload, "loyalty_points_redeem", 0) or 0)
    if redeem_pts > 0:
        if not customer:
            raise ValueError("Canje de puntos requiere cliente registrado.")
        available_pts = float(getattr(customer, "loyalty_points", 0) or 0)
        if redeem_pts > available_pts + 0.001:
            raise ValueError(f"Puntos insuficientes. Disponibles: {available_pts:g}.")
        redeem_value = _round2(redeem_pts * 0.10)
        if redeem_value > sale.total:
            redeem_value = sale.total
            redeem_pts = _round2(redeem_value / 0.10)
        if sale.total > 0 and redeem_value > 0:
            ratio = (sale.total - redeem_value) / sale.total
            sale.total = _round2(sale.total - redeem_value)
            sale.tax_total = _round2(sale.tax_total * ratio)
            sale.subtotal = _round2(sale.total - sale.tax_total)
            sale.cart_discount_amount = _round2(float(sale.cart_discount_amount or 0) + redeem_value)
        sale.loyalty_points_redeemed = redeem_pts
        customer.loyalty_points = _round2(available_pts - redeem_pts)

    tip = _round2(getattr(payload, "tip_amount", 0) or 0)
    if tip > 0:
        tip_tax = _round2(tip - (tip / 1.12))
        sale.tip_amount = tip
        sale.tax_total = _round2(sale.tax_total + tip_tax)
        sale.subtotal = _round2(sale.subtotal + (tip - tip_tax))
        sale.total = _round2(sale.total + tip)

    # Acumula 1 punto por cada Q10 de venta (despues de descuentos, sin tip).
    if customer and sale.total > tip:
        earned = _round2(max(sale.total - tip, 0) / 10.0)
        sale.loyalty_points_earned = earned
        customer.loyalty_points = _round2(float(customer.loyalty_points or 0) + earned)

    # Adjunta sucursal para emisor FEL por establecimiento.
    if sale.branch_id:
        from app.models import Branch

        sale.branch = db.get(Branch, sale.branch_id)

    payment_method, payment_lines = _resolve_sale_payments(payload, sale.total)
    cash_received, change_amount = _resolve_cash_tender(payload, payment_method, payment_lines)
    sale.payment_method = payment_method
    sale.cash_received = cash_received
    sale.change_amount = change_amount
    for line in payment_lines:
        db.add(
            SalePayment(
                sale_id=sale.id,
                payment_method=line.payment_method,
                amount=_round2(line.amount),
            )
        )

    if is_credit and customer:
        credit_limit = float(customer.credit_limit or 0)
        credit_balance = float(customer.credit_balance or 0)
        if credit_limit <= 0:
            raise ValueError(
                f"El cliente {customer.name} no tiene limite de credito configurado. "
                "Define un limite mayor a 0 antes de vender a credito."
            )
        if (credit_balance + sale.total) > credit_limit:
            available = _round2(max(credit_limit - credit_balance, 0))
            raise ValueError(
                f"Credito insuficiente para {customer.name}. Disponible: Q{available:.2f}."
            )
        customer.credit_balance = _round2(credit_balance + sale.total)

    db.flush()
    db.refresh(sale, attribute_names=["items"])

    for item in sale.items:
        db.refresh(item, attribute_names=["product"])

    fel_invoice: FelInvoice | None = None
    if is_fel_enabled():
        try:
            fel_result = certify_sale(sale, customer)
            fel_invoice = FelInvoice(
                sale_id=sale.id,
                uuid=fel_result.uuid,
                serie=fel_result.serie,
                numero=fel_result.numero,
                document_type=fel_result.document_type,
                status=fel_result.status,
                xml_content=fel_result.xml_content,
                certifier_response=fel_result.certifier_response,
            )
            db.add(fel_invoice)
        except Exception as exc:
            fel_result = FelCertificationResult(
                uuid=f"PENDING-{uuid.uuid4()}",
                serie="PENDING",
                numero=str(sale.id).zfill(8),
                document_type="FACT",
                status="pending",
                xml_content="<pending/>",
                certifier_response=str(exc),
            )
            fel_invoice = FelInvoice(
                sale_id=sale.id,
                uuid=fel_result.uuid,
                serie=fel_result.serie,
                numero=fel_result.numero,
                document_type=fel_result.document_type,
                status=fel_result.status,
                xml_content=fel_result.xml_content,
                certifier_response=fel_result.certifier_response,
            )
            db.add(fel_invoice)
            db.add(
                PendingFelSale(
                    sale_id=sale.id,
                    status="pending",
                    last_error=str(exc),
                )
            )

    # Bitacora de recetas (farmacia).
    rx = getattr(payload, "prescription", None)
    if rx and prescription_needed:
        from app.models import PrescriptionLog

        product_ids = list(rx.product_ids or [])
        if not product_ids:
            product_ids = [
                line.product_id
                for line in payload.items
                if db.get(Product, line.product_id)
                and int(getattr(db.get(Product, line.product_id), "requires_prescription", 0) or 0) == 1
            ]
        for pid in product_ids:
            db.add(
                PrescriptionLog(
                    sale_id=sale.id,
                    product_id=pid,
                    doctor_name=(rx.doctor_name or "")[:150],
                    license_no=(rx.license_no or "")[:80],
                    patient_name=(rx.patient_name or "")[:150],
                    notes=(rx.notes or None),
                    confirmed_by_user_id=user_id,
                )
            )

    if user_id:
        log_action(
            db,
            user_id=user_id,
            action="sale_create",
            entity_type="sale",
            entity_id=sale.id,
            details=f"Total Q{sale.total:.2f}" + (" credito" if is_credit else ""),
        )

    if commit:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            if client_request_id:
                existing = (
                    db.query(Sale)
                    .filter(Sale.client_request_id == client_request_id)
                    .one_or_none()
                )
                if existing:
                    return sale_to_schema(_load_sale_with_details(db, existing.id))
            raise
    else:
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            if client_request_id:
                existing = (
                    db.query(Sale)
                    .filter(Sale.client_request_id == client_request_id)
                    .one_or_none()
                )
                if existing:
                    return sale_to_schema(_load_sale_with_details(db, existing.id))
            raise

    sale = _load_sale_with_details(db, sale.id)
    return sale_to_schema(sale)


def sale_to_schema(sale: Sale) -> SaleOut:
    wholesale_savings = 0.0
    items: list[SaleItemOut] = []
    for item in sale.items:
        base_unit_price = item.base_unit_price if item.base_unit_price > 0 else item.unit_price
        discount_amount = item.discount_amount if item.discount_amount > 0 else 0.0
        wholesale_savings += discount_amount
        items.append(
            SaleItemOut(
                sale_item_id=item.id,
                product_id=item.product_id,
                product_name=item.product.name,
                quantity=item.quantity,
                base_unit_price=base_unit_price,
                unit_price=item.unit_price,
                discount_amount=discount_amount,
                tax_rate=item.tax_rate,
                subtotal=item.subtotal,
                tax_amount=item.tax_amount,
                total=item.total,
            )
        )

    fel = None
    if sale.fel_invoice:
        fel = FelInvoiceOut.model_validate(sale.fel_invoice)

    return_rows = sorted(sale.returns or [], key=lambda row: row.created_at, reverse=True)
    returns = [_sale_return_to_schema(row) for row in return_rows]
    returned_total = _round2(sum(row.total for row in return_rows if row.status == "completed"))
    net_total = _round2(sale.total - returned_total)
    payments = [
        SalePaymentOut(payment_method=line.payment_method, amount=_round2(line.amount))
        for line in (sale.payments or [])
    ]
    if not payments:
        payments = [
            SalePaymentOut(payment_method=sale.payment_method, amount=_round2(sale.total)),
        ]

    return SaleOut(
        id=sale.id,
        created_at=sale.created_at,
        created_by_user_id=sale.created_by_user_id,
        created_by_username=sale.created_by.username if sale.created_by else None,
        created_by_full_name=sale.created_by.full_name if sale.created_by else None,
        subtotal=sale.subtotal,
        tax_total=sale.tax_total,
        total=sale.total,
        payment_method=sale.payment_method,
        status=sale.status,
        cart_discount_amount=_round2(float(sale.cart_discount_amount or 0)),
        cash_received=_round2(float(getattr(sale, "cash_received", 0) or 0)),
        change_amount=_round2(float(getattr(sale, "change_amount", 0) or 0)),
        tip_amount=_round2(float(getattr(sale, "tip_amount", 0) or 0)),
        loyalty_points_earned=_round2(float(getattr(sale, "loyalty_points_earned", 0) or 0)),
        loyalty_points_redeemed=_round2(float(getattr(sale, "loyalty_points_redeemed", 0) or 0)),
        document_type=str(getattr(sale, "document_type", None) or "FACT"),
        wholesale_savings=round(wholesale_savings, 2),
        returned_total=returned_total,
        net_total=net_total,
        customer_nit=sale.customer.nit if sale.customer else None,
        customer_name=sale.customer.name if sale.customer else None,
        items=items,
        payments=payments,
        returns=returns,
        fel=fel,
    )
