from sqlalchemy.orm import Session, joinedload

from app.models import FelInvoice, PendingFelSale, Sale, SaleItem
from app.schemas import FelPendingBulkRetryOut, PendingFelSaleOut
from app.services.fel_service import certify_sale


def list_pending_fel_sales(db: Session) -> list[PendingFelSaleOut]:
    rows = (
        db.query(PendingFelSale)
        .options(joinedload(PendingFelSale.sale))
        .filter(PendingFelSale.status == "pending")
        .order_by(PendingFelSale.created_at.asc())
        .all()
    )
    return [_pending_to_schema(row) for row in rows]


def retry_pending_fel_sale(db: Session, *, pending_id: int, user_id: int) -> PendingFelSaleOut:
    pending = (
        db.query(PendingFelSale)
        .options(
            joinedload(PendingFelSale.sale).joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(PendingFelSale.sale).joinedload(Sale.customer),
            joinedload(PendingFelSale.sale).joinedload(Sale.fel_invoice),
        )
        .filter(PendingFelSale.id == pending_id)
        .one_or_none()
    )
    if not pending:
        raise ValueError("Venta FEL pendiente no encontrada.")
    sale = pending.sale
    if not sale:
        raise ValueError("Venta asociada no encontrada.")

    try:
        fel_result = certify_sale(sale, sale.customer)
    except Exception as exc:
        pending.retry_count = int(pending.retry_count or 0) + 1
        pending.last_error = str(exc)
        db.commit()
        db.refresh(pending)
        raise ValueError(f"No se pudo certificar: {exc}") from exc

    if sale.fel_invoice:
        invoice = sale.fel_invoice
        invoice.uuid = fel_result.uuid
        invoice.serie = fel_result.serie
        invoice.numero = fel_result.numero
        invoice.document_type = fel_result.document_type
        invoice.status = fel_result.status
        invoice.xml_content = fel_result.xml_content
        invoice.certifier_response = fel_result.certifier_response
    else:
        invoice = FelInvoice(
            sale_id=sale.id,
            uuid=fel_result.uuid,
            serie=fel_result.serie,
            numero=fel_result.numero,
            document_type=fel_result.document_type,
            status=fel_result.status,
            xml_content=fel_result.xml_content,
            certifier_response=fel_result.certifier_response,
        )
        db.add(invoice)

    pending.status = "certified"
    pending.last_error = None
    db.commit()
    db.refresh(pending)
    return _pending_to_schema(pending)


def dismiss_pending_fel_sale(db: Session, *, pending_id: int) -> PendingFelSaleOut:
    pending = (
        db.query(PendingFelSale)
        .options(joinedload(PendingFelSale.sale))
        .filter(PendingFelSale.id == pending_id, PendingFelSale.status == "pending")
        .one_or_none()
    )
    if not pending:
        raise ValueError("Venta FEL pendiente no encontrada.")
    pending.status = "dismissed"
    pending.last_error = None
    db.commit()
    db.refresh(pending)
    return _pending_to_schema(pending)


def retry_all_pending_fel_sales(db: Session, *, user_id: int) -> FelPendingBulkRetryOut:
    rows = (
        db.query(PendingFelSale)
        .filter(PendingFelSale.status == "pending")
        .order_by(PendingFelSale.created_at.asc())
        .all()
    )
    certified = 0
    failed = 0
    results: list[PendingFelSaleOut] = []
    for row in rows:
        try:
            results.append(retry_pending_fel_sale(db, pending_id=row.id, user_id=user_id))
            certified += 1
        except ValueError:
            failed += 1
            db.refresh(row)
            results.append(_pending_to_schema(row))
    return FelPendingBulkRetryOut(
        total=len(rows),
        certified=certified,
        failed=failed,
        items=results,
    )


def _pending_to_schema(row: PendingFelSale) -> PendingFelSaleOut:
    return PendingFelSaleOut(
        id=row.id,
        sale_id=row.sale_id,
        created_at=row.created_at,
        status=row.status,
        retry_count=row.retry_count,
        last_error=row.last_error,
        sale_total=float(row.sale.total) if row.sale else None,
    )
