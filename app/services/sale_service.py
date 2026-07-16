import uuid

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
from app.services.nit_service import is_valid_nit, normalize_nit
from app.services.promotion_service import best_promotion_for_line


def _round2(value: float) -> float:
    return round(float(value or 0), 2)


def _load_sale_with_details(db: Session, sale_id: int) -> Sale:
    return (
        db.query(Sale)
        .options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.customer),
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
    if method not in allowed | {"credito", "mixto"}:
        raise ValueError("Metodo de pago invalido.")
    return method, [SalePaymentInput(payment_method=method, amount=_round2(total))]


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


def _sale_return_to_schema(sale_return: SaleReturn) -> SaleReturnOut:
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
) -> SaleReturnOut:
    sale = (
        db.query(Sale)
        .options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.customer),
            joinedload(Sale.fel_invoice),
            joinedload(Sale.returns).joinedload(SaleReturn.items),
        )
        .filter(Sale.id == sale_id)
        .one_or_none()
    )
    if not sale:
        raise ValueError("Venta no encontrada.")
    if sale.status not in {"completed", "partially_returned"}:
        raise ValueError("La venta no permite devoluciones adicionales.")
    if is_fel_enabled() and not sale.fel_invoice:
        raise ValueError("La venta no tiene FEL asociado para emitir nota de credito.")

    sale_items_by_id = {item.id: item for item in sale.items}
    returned_qty_map = _returned_qty_by_sale_item(sale)

    sale_return = SaleReturn(
        sale_id=sale.id,
        created_by_user_id=user_id,
        reason=(payload.reason or "").strip() or None,
        subtotal=0,
        tax_total=0,
        total=0,
        status="completed",
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

        line_subtotal = _round2(sale_item.unit_price * requested_qty)
        line_tax = _round2(line_subtotal * sale_item.tax_rate)
        line_total = _round2(line_subtotal + line_tax)

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
            before_stock = _round2(product.stock)
            product.stock = _round2(before_stock + requested_qty)
            db.add(
                InventoryMovement(
                    product_id=product.id,
                    created_by_user_id=user_id,
                    movement_type="sale_return_in",
                    quantity=requested_qty,
                    before_stock=before_stock,
                    after_stock=product.stock,
                    notes=f"Devolucion venta #{sale.id}",
                )
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

    db.commit()
    db.refresh(sale_return)
    db.refresh(sale_return, attribute_names=["items"])
    for item in sale_return.items:
        db.refresh(item, attribute_names=["product"])
    return _sale_return_to_schema(sale_return)


def create_sale(db: Session, payload: SaleCreate, user_id: int | None = None) -> SaleOut:
    if not payload.items:
        raise ValueError("La venta debe incluir al menos un producto.")

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

    sale = Sale(
        customer_id=customer.id if customer else None,
        payment_method="credito" if is_credit else payload.payment_method,
        created_by_user_id=user_id,
        cart_discount_amount=_round2(payload.cart_discount_amount or 0),
        promotion_id=payload.promotion_id,
        is_credit=1 if is_credit else 0,
    )
    db.add(sale)
    db.flush()

    subtotal = 0.0
    tax_total = 0.0
    total = 0.0
    applied_promotion_id = payload.promotion_id

    for line in payload.items:
        product = db.get(Product, line.product_id)
        if not product or not product.active:
            raise ValueError(f"Producto invalido: {line.product_id}")
        if int(product.tracks_inventory or 0) == 1 and product.stock < line.quantity:
            raise ValueError(
                f"Stock insuficiente para {product.name}. "
                f"Disponible: {product.stock:g}, solicitado: {line.quantity:g}."
            )

        base_unit_price = round(product.price, 2)
        unit_price = base_unit_price
        if (
            product.wholesale_enabled
            and product.wholesale_min_qty > 0
            and line.quantity >= product.wholesale_min_qty
            and product.wholesale_discount_pct > 0
        ):
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

        line_subtotal = round(unit_price * line.quantity, 2)
        if promo_discount > 0:
            line_subtotal = _round2(max(line_subtotal - promo_discount, 0))
        line_tax = round(line_subtotal * product.tax_rate, 2)
        line_total = round(line_subtotal + line_tax, 2)

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
        if int(product.tracks_inventory or 0) == 1:
            before_stock = float(product.stock)
            product.stock -= line.quantity
            after_stock = float(product.stock)
            if user_id:
                db.add(
                    InventoryMovement(
                        product_id=product.id,
                        created_by_user_id=user_id,
                        movement_type="sale_out",
                        quantity=line.quantity,
                        before_stock=before_stock,
                        after_stock=after_stock,
                        notes=f"Venta #{sale.id}",
                    )
                )

        subtotal += line_subtotal
        tax_total += line_tax
        total += line_total

    raw_subtotal = _round2(subtotal)
    if sale.cart_discount_amount > 0:
        discount = min(sale.cart_discount_amount, raw_subtotal)
        sale.cart_discount_amount = discount
        if raw_subtotal > 0:
            ratio = (raw_subtotal - discount) / raw_subtotal
            subtotal = _round2(raw_subtotal - discount)
            tax_total = _round2(tax_total * ratio)
            total = _round2(subtotal + tax_total)

    sale.promotion_id = applied_promotion_id
    sale.subtotal = _round2(subtotal)
    sale.tax_total = _round2(tax_total)
    sale.total = _round2(total)

    payment_method, payment_lines = _resolve_sale_payments(payload, sale.total)
    sale.payment_method = payment_method
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
        if credit_limit > 0 and (credit_balance + sale.total) > credit_limit:
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

    if user_id:
        log_action(
            db,
            user_id=user_id,
            action="sale_create",
            entity_type="sale",
            entity_id=sale.id,
            details=f"Total Q{sale.total:.2f}" + (" credito" if is_credit else ""),
        )

    db.commit()

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
        subtotal=sale.subtotal,
        tax_total=sale.tax_total,
        total=sale.total,
        payment_method=sale.payment_method,
        status=sale.status,
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
