from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import CreditPayment, Customer, Sale, SaleReturn


def _round2(value: float) -> float:
    return round(float(value or 0), 2)


def credit_sale_remaining(
    db: Session,
    sale: Sale,
    *,
    exclude_return_id: int | None = None,
) -> float:
    """Saldo pendiente de UNA venta a credito (sin abonos sin asignar)."""
    returns_query = db.query(SaleReturn).filter(
        SaleReturn.sale_id == sale.id,
        SaleReturn.status == "completed",
    )
    if exclude_return_id is not None:
        returns_query = returns_query.filter(SaleReturn.id != exclude_return_id)
    returns_total = _round2(float(sum(float(r.total or 0) for r in returns_query.all())))
    paid = _round2(
        float(
            sum(
                float(p.amount or 0)
                for p in db.query(CreditPayment).filter(CreditPayment.sale_id == sale.id).all()
            )
        )
    )
    return _round2(max(float(sale.total or 0) - returns_total - paid, 0.0))


def credit_remainings_after_unallocated(
    db: Session,
    customer_id: int,
    *,
    exclude_return_id: int | None = None,
    include_returned: bool = False,
) -> list[tuple[Sale, float]]:
    """
    Ventas a credito abiertas con saldo, descontando abonos sin sale_id en FIFO
    (mas antiguas primero).
    """
    statuses = ["completed", "partially_returned"]
    if include_returned:
        statuses.append("returned")
    sales = (
        db.query(Sale)
        .filter(
            Sale.customer_id == customer_id,
            Sale.is_credit == 1,
            Sale.status.in_(statuses),
        )
        .order_by(Sale.created_at.asc(), Sale.id.asc())
        .all()
    )
    rows: list[tuple[Sale, float]] = []
    for sale in sales:
        rem = credit_sale_remaining(db, sale, exclude_return_id=exclude_return_id)
        if rem > 0.001:
            rows.append((sale, rem))

    unallocated = _round2(
        float(
            sum(
                float(p.amount or 0)
                for p in db.query(CreditPayment)
                .filter(CreditPayment.customer_id == customer_id, CreditPayment.sale_id.is_(None))
                .all()
            )
        )
    )
    adjusted: list[tuple[Sale, float]] = []
    for sale, rem in rows:
        if unallocated > 0.001:
            take = min(rem, unallocated)
            rem = _round2(rem - take)
            unallocated = _round2(unallocated - take)
        if rem > 0.001:
            adjusted.append((sale, rem))
    return adjusted


def allocate_credit_payment_targets(
    db: Session,
    *,
    customer: Customer,
    amount: float,
    sale_id: int | None,
) -> list[tuple[int | None, float]]:
    """
    Devuelve [(sale_id, amount), ...] para registrar abono(s).
    Si sale_id viene, valida una sola venta. Si no, reparte FIFO.
    """
    amount = _round2(amount)
    if amount <= 0:
        raise ValueError("El abono debe ser mayor a 0.")

    if sale_id is not None:
        sale = db.get(Sale, sale_id)
        if not sale or sale.customer_id != customer.id:
            raise ValueError("La venta no pertenece a este cliente.")
        if int(getattr(sale, "is_credit", 0) or 0) != 1:
            raise ValueError("La venta indicada no es a credito.")
        if sale.status not in {"completed", "partially_returned"}:
            raise ValueError("La venta no admite abonos.")
        # Remaining must ignore this sale's share of unallocated differently:
        # use raw remaining on sale only for explicit sale_id.
        remaining = credit_sale_remaining(db, sale)
        # Also subtract FIFO unallocated that would hit this sale first
        remainings = {s.id: rem for s, rem in credit_remainings_after_unallocated(db, customer.id)}
        remaining = remainings.get(sale.id, 0.0)
        if amount > remaining + 0.001:
            raise ValueError(
                f"El abono excede el saldo pendiente de la venta #{sale.id} "
                f"(disponible Q{remaining:.2f})."
            )
        return [(sale.id, amount)]

    targets: list[tuple[int | None, float]] = []
    left = amount
    for sale, rem in credit_remainings_after_unallocated(db, customer.id):
        if left <= 0.001:
            break
        take = _round2(min(left, rem))
        if take <= 0:
            continue
        targets.append((sale.id, take))
        left = _round2(left - take)
    if left > 0.001:
        # No deberia pasar si amount <= credit_balance, pero evita abono huerfano.
        targets.append((None, left))
    return targets
