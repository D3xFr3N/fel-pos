from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models import CashMovement, CashSession, PendingFelSale, Product, Sale, SaleItem, User
from app.services.alert_service import build_system_alerts


def _parse_date(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", ""))
    except ValueError:
        try:
            parsed = datetime.strptime(value[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if len(value) <= 10 and end_of_day:
        return parsed.replace(hour=23, minute=59, second=59)
    return parsed


def build_sales_summary(
    db: Session,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    payment_method: str | None = None,
) -> dict:
    start = _parse_date(date_from)
    end = _parse_date(date_to, end_of_day=True)
    query = db.query(Sale).filter(Sale.status.in_(["completed", "partially_returned"]))
    if start:
        query = query.filter(Sale.created_at >= start)
    if end:
        query = query.filter(Sale.created_at <= end)
    if payment_method:
        query = query.filter(Sale.payment_method == payment_method)
    sales = query.all()
    total_sales = sum(float(s.total or 0) for s in sales)
    total_tax = sum(float(s.tax_total or 0) for s in sales)
    credit_sales = [s for s in sales if int(getattr(s, "is_credit", 0) or 0) == 1]
    return {
        "sales_count": len(sales),
        "total_amount": round(total_sales, 2),
        "tax_total": round(total_tax, 2),
        "credit_sales_count": len(credit_sales),
        "credit_sales_amount": round(sum(float(s.total or 0) for s in credit_sales), 2),
    }


def build_top_products(
    db: Session,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 20,
) -> list[dict]:
    start = _parse_date(date_from)
    end = _parse_date(date_to, end_of_day=True)
    query = (
        db.query(
            SaleItem.product_id,
            func.sum(SaleItem.quantity).label("qty"),
            func.sum(SaleItem.total).label("amount"),
        )
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.status.in_(["completed", "partially_returned"]))
        .group_by(SaleItem.product_id)
        .order_by(func.sum(SaleItem.total).desc())
    )
    if start:
        query = query.filter(Sale.created_at >= start)
    if end:
        query = query.filter(Sale.created_at <= end)
    rows = query.limit(limit).all()
    product_ids = [row.product_id for row in rows]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()}
    result = []
    for row in rows:
        product = products.get(row.product_id)
        cost = float(product.cost or 0) if product else 0
        amount = float(row.amount or 0)
        qty = float(row.qty or 0)
        margin = round(amount - (cost * qty), 2)
        result.append(
            {
                "product_id": row.product_id,
                "sku": product.sku if product else "",
                "name": product.name if product else f"Producto #{row.product_id}",
                "quantity": round(qty, 2),
                "total_amount": round(amount, 2),
                "estimated_margin": margin,
            }
        )
    return result


def build_cash_cut_report(
    db: Session,
    session_id: int | None = None,
    user_id: int | None = None,
) -> dict | None:
    session = None
    if session_id:
        session = (
            db.query(CashSession)
            .options(joinedload(CashSession.opened_by), joinedload(CashSession.movements))
            .filter(CashSession.id == session_id)
            .first()
        )
    else:
        query = (
            db.query(CashSession)
            .options(joinedload(CashSession.opened_by), joinedload(CashSession.movements))
            .filter(CashSession.status == "open")
        )
        if user_id is not None:
            query = query.filter(CashSession.opened_by_user_id == user_id)
        session = query.order_by(CashSession.opened_at.desc()).first()
    if not session:
        return None
    movements = session.movements or []
    sales_total = sum(float(m.amount or 0) for m in movements if m.movement_type == "sale")
    returns_total = sum(float(m.amount or 0) for m in movements if m.movement_type == "expense")
    incomes = sum(float(m.amount or 0) for m in movements if m.movement_type == "income")
    return {
        "session_id": session.id,
        "opened_at": session.opened_at.isoformat() if session.opened_at else None,
        "opened_by": session.opened_by_full_name or session.opened_by_username,
        "opening_amount": round(float(session.opening_amount or 0), 2),
        "expected_amount": round(float(session.expected_amount or 0), 2),
        "sales_total": round(sales_total, 2),
        "returns_total": round(returns_total, 2),
        "other_income": round(incomes, 2),
        "status": session.status,
    }


def build_payment_method_breakdown(db: Session, *, date_from: str | None = None, date_to: str | None = None) -> list[dict]:
    from app.models import SalePayment

    start = _parse_date(date_from)
    end = _parse_date(date_to, end_of_day=True)
    query = (
        db.query(SalePayment.payment_method, func.sum(SalePayment.amount))
        .join(Sale, Sale.id == SalePayment.sale_id)
        .filter(Sale.status.in_(["completed", "partially_returned"]))
        .group_by(SalePayment.payment_method)
    )
    if start:
        query = query.filter(Sale.created_at >= start)
    if end:
        query = query.filter(Sale.created_at <= end)
    rows = query.all()
    if rows:
        return [
            {
                "payment_method": row[0],
                "sales_count": 0,
                "total_amount": round(float(row[1] or 0), 2),
            }
            for row in rows
        ]

    legacy_query = (
        db.query(Sale.payment_method, func.count(Sale.id), func.sum(Sale.total))
        .filter(Sale.status.in_(["completed", "partially_returned"]))
        .group_by(Sale.payment_method)
    )
    if start:
        legacy_query = legacy_query.filter(Sale.created_at >= start)
    if end:
        legacy_query = legacy_query.filter(Sale.created_at <= end)
    return [
        {
            "payment_method": row[0],
            "sales_count": int(row[1] or 0),
            "total_amount": round(float(row[2] or 0), 2),
        }
        for row in legacy_query.all()
    ]


def build_cashier_ranking(
    db: Session,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict]:
    start = _parse_date(date_from)
    end = _parse_date(date_to, end_of_day=True)
    query = (
        db.query(
            Sale.created_by_user_id,
            func.count(Sale.id),
            func.sum(Sale.total),
        )
        .filter(Sale.status.in_(["completed", "partially_returned"]))
        .filter(Sale.created_by_user_id.isnot(None))
        .group_by(Sale.created_by_user_id)
        .order_by(func.sum(Sale.total).desc())
    )
    if start:
        query = query.filter(Sale.created_at >= start)
    if end:
        query = query.filter(Sale.created_at <= end)
    rows = query.all()
    user_ids = [row[0] for row in rows if row[0]]
    users = {user.id: user for user in db.query(User).filter(User.id.in_(user_ids)).all()}
    result = []
    for row in rows:
        user = users.get(row[0])
        result.append(
            {
                "user_id": row[0],
                "full_name": user.full_name if user else f"Usuario #{row[0]}",
                "username": user.username if user else "",
                "sales_count": int(row[1] or 0),
                "total_amount": round(float(row[2] or 0), 2),
            }
        )
    return result


def build_purchase_suggestions(db: Session, *, days: int = 30) -> list[dict]:
    cutoff = datetime.utcnow() - timedelta(days=days)
    sold_rows = (
        db.query(SaleItem.product_id, func.sum(SaleItem.quantity))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.created_at >= cutoff, Sale.status.in_(["completed", "partially_returned"]))
        .group_by(SaleItem.product_id)
        .all()
    )
    sold_map = {row[0]: float(row[1] or 0) for row in sold_rows}
    products = (
        db.query(Product)
        .filter(Product.active == 1)
        .order_by(Product.name)
        .all()
    )
    suggestions = []
    for product in products:
        sold_qty = sold_map.get(product.id, 0)
        min_stock = float(product.min_stock or 0)
        current_stock = float(product.stock or 0)
        target = max(min_stock, sold_qty)
        suggested = round(max(target - current_stock, 0), 2)
        if suggested <= 0 and current_stock > min_stock:
            continue
        if suggested <= 0 and sold_qty <= 0 and current_stock > min_stock:
            continue
        if suggested > 0 or current_stock <= min_stock:
            suggestions.append(
                {
                    "product_id": product.id,
                    "sku": product.sku,
                    "name": product.name,
                    "current_stock": round(current_stock, 2),
                    "min_stock": round(min_stock, 2),
                    "sold_last_30_days": round(sold_qty, 2),
                    "suggested_qty": max(suggested, round(min_stock - current_stock, 2)) if current_stock <= min_stock else suggested,
                }
            )
    suggestions.sort(key=lambda row: row["suggested_qty"], reverse=True)
    return suggestions[:50]


def build_owner_dashboard(db: Session) -> dict:
    today = datetime.utcnow().strftime("%Y-%m-%d")
    summary = build_sales_summary(db, date_from=today, date_to=today)
    return {
        "sales_summary": summary,
        "payment_methods": build_payment_method_breakdown(db, date_from=today, date_to=today),
        "top_products": build_top_products(db, date_from=today, date_to=today, limit=10),
        "cash_cut": build_cash_cut_report(db),
        "alerts": build_system_alerts(db),
        "pending_fel_count": db.query(PendingFelSale).filter(PendingFelSale.status == "pending").count(),
    }
