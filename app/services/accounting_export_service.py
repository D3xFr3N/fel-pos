from __future__ import annotations

import csv
import io
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.models import FelInvoice, PurchaseOrder, Sale, SaleReturn


def _csv_bytes(headers: list[str], rows: list[list]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return buffer.getvalue()


def export_sales_book(db: Session, *, date_from: datetime, date_to: datetime) -> str:
    sales = (
        db.query(Sale)
        .options(joinedload(Sale.fel_invoice), joinedload(Sale.customer))
        .filter(Sale.created_at >= date_from, Sale.created_at <= date_to)
        .order_by(Sale.created_at.asc())
        .all()
    )
    rows: list[list] = []
    for sale in sales:
        fel = sale.fel_invoice
        rows.append(
            [
                sale.created_at.isoformat(sep=" ", timespec="seconds"),
                sale.document_type or (fel.document_type if fel else "FACT"),
                (sale.customer.nit if sale.customer else "CF"),
                (sale.customer.name if sale.customer else "CONSUMIDOR FINAL"),
                fel.serie if fel else "",
                fel.numero if fel else "",
                fel.uuid if fel else "",
                f"{float(sale.subtotal or 0):.2f}",
                f"{float(sale.tax_total or 0):.2f}",
                f"{float(sale.total or 0):.2f}",
                fel.status if fel else "sin_fel",
                "ANULADO" if (fel and fel.voided_at) else "VIGENTE",
            ]
        )

    returns = (
        db.query(SaleReturn)
        .options(joinedload(SaleReturn.sale).joinedload(Sale.customer))
        .filter(SaleReturn.created_at >= date_from, SaleReturn.created_at <= date_to)
        .order_by(SaleReturn.created_at.asc())
        .all()
    )
    for ret in returns:
        sale = ret.sale
        rows.append(
            [
                ret.created_at.isoformat(sep=" ", timespec="seconds"),
                "NCRE",
                (sale.customer.nit if sale and sale.customer else "CF"),
                (sale.customer.name if sale and sale.customer else "CONSUMIDOR FINAL"),
                ret.fel_serie or "",
                ret.fel_numero or "",
                "",
                f"{float(ret.subtotal or 0):.2f}",
                f"{float(ret.tax_total or 0):.2f}",
                f"{float(ret.total or 0):.2f}",
                ret.fel_status or "",
                "VIGENTE",
            ]
        )

    return _csv_bytes(
        [
            "fecha",
            "tipo",
            "nit",
            "nombre",
            "serie",
            "numero",
            "uuid",
            "neto",
            "iva",
            "total",
            "fel_status",
            "estado",
        ],
        rows,
    )


def export_purchases_book(db: Session, *, date_from: datetime, date_to: datetime) -> str:
    orders = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.supplier), joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.created_at >= date_from, PurchaseOrder.created_at <= date_to)
        .order_by(PurchaseOrder.created_at.asc())
        .all()
    )
    rows: list[list] = []
    for order in orders:
        supplier = order.supplier
        rows.append(
            [
                order.created_at.isoformat(sep=" ", timespec="seconds"),
                order.id,
                supplier.name if supplier else "",
                getattr(supplier, "nit", "") if supplier else "",
                order.status,
                f"{float(order.total_estimate or 0):.2f}",
                (order.notes or "")[:120],
            ]
        )
    return _csv_bytes(
        ["fecha", "oc_id", "proveedor", "nit", "estado", "total_estimado", "notas"],
        rows,
    )
