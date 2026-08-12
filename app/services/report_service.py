from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.datetime_utils import get_app_timezone
from app.models import CashMovement, CashSession, PendingFelSale, Product, Sale, SaleItem, SaleReturn, SaleReturnItem, User
from app.services.alert_service import build_system_alerts

GUATEMALA_TZ = get_app_timezone()


def guatemala_today_str() -> str:
    return datetime.now(GUATEMALA_TZ).strftime("%Y-%m-%d")


def guatemala_day_bounds_utc_naive(day: str | None = None) -> tuple[datetime, datetime]:
    """Convierte un dia civil de Guatemala a rango UTC naive (como se guarda en DB)."""
    local_day = datetime.strptime(day or guatemala_today_str(), "%Y-%m-%d").date()
    start_local = datetime(local_day.year, local_day.month, local_day.day, tzinfo=GUATEMALA_TZ)
    end_local = start_local + timedelta(days=1)
    start_utc = start_local.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = end_local.astimezone(timezone.utc).replace(tzinfo=None)
    return start_utc, end_utc


def _parse_date(value: str | None, *, end_of_day: bool = False) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    # Filtros de UI (YYYY-MM-DD) deben usar dia civil de Guatemala, no medianoche UTC.
    if len(raw) <= 10:
        try:
            start, end_excl = guatemala_day_bounds_utc_naive(raw[:10])
        except ValueError:
            return None
        if end_of_day:
            return end_excl - timedelta(microseconds=1)
        return start
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", ""))
    except ValueError:
        try:
            parsed = datetime.strptime(raw[:10], "%Y-%m-%d")
        except ValueError:
            return None
        start, end_excl = guatemala_day_bounds_utc_naive(raw[:10])
        return end_excl - timedelta(microseconds=1) if end_of_day else start
    return parsed


def _completed_returns_total_by_sale(db: Session, sale_ids: list[int]) -> dict[int, float]:
    if not sale_ids:
        return {}
    rows = (
        db.query(SaleReturn.sale_id, func.coalesce(func.sum(SaleReturn.total), 0))
        .filter(SaleReturn.sale_id.in_(sale_ids), SaleReturn.status == "completed")
        .group_by(SaleReturn.sale_id)
        .all()
    )
    return {int(sale_id): float(total or 0) for sale_id, total in rows}


def _return_qty_amount_by_product(
    db: Session,
    *,
    sale_ids: list[int] | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    end_exclusive: bool = False,
    user_id: int | None = None,
) -> dict[int, dict[str, float]]:
    """Devuelve {product_id: {qty, amount}} de devoluciones completadas."""
    query = (
        db.query(
            SaleReturnItem.product_id,
            func.coalesce(func.sum(SaleReturnItem.quantity), 0),
            func.coalesce(func.sum(SaleReturnItem.total), 0),
        )
        .join(SaleReturn, SaleReturn.id == SaleReturnItem.sale_return_id)
        .join(Sale, Sale.id == SaleReturn.sale_id)
        .filter(SaleReturn.status == "completed", Sale.status.in_(["completed", "partially_returned", "returned"]))
        .group_by(SaleReturnItem.product_id)
    )
    if sale_ids is not None:
        if not sale_ids:
            return {}
        query = query.filter(SaleReturn.sale_id.in_(sale_ids))
    if start is not None:
        query = query.filter(Sale.created_at >= start)
    if end is not None:
        if end_exclusive:
            query = query.filter(Sale.created_at < end)
        else:
            query = query.filter(Sale.created_at <= end)
    if user_id is not None:
        query = query.filter(Sale.created_by_user_id == user_id)
    return {
        int(product_id): {"qty": float(qty or 0), "amount": float(amount or 0)}
        for product_id, qty, amount in query.all()
    }


def build_sales_summary(
    db: Session,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    payment_method: str | None = None,
) -> dict:
    start = _parse_date(date_from)
    end = _parse_date(date_to, end_of_day=True)
    query = db.query(Sale).filter(Sale.status.in_(["completed", "partially_returned", "returned"]))
    if start:
        query = query.filter(Sale.created_at >= start)
    if end:
        query = query.filter(Sale.created_at <= end)
    if payment_method:
        query = query.filter(Sale.payment_method == payment_method)
    sales = query.all()
    total_sales = sum(float(s.total or 0) for s in sales)
    total_tax = sum(float(s.tax_total or 0) for s in sales)
    sale_ids = [s.id for s in sales]
    returns_by_sale = _completed_returns_total_by_sale(db, sale_ids)
    returns_total = sum(returns_by_sale.values())
    credit_sales = [s for s in sales if int(getattr(s, "is_credit", 0) or 0) == 1]
    credit_gross = sum(float(s.total or 0) for s in credit_sales)
    credit_returns = sum(returns_by_sale.get(s.id, 0.0) for s in credit_sales)
    return {
        "sales_count": len(sales),
        "total_amount": round(total_sales - returns_total, 2),
        "gross_amount": round(total_sales, 2),
        "returns_total": round(returns_total, 2),
        "tax_total": round(total_tax, 2),
        "credit_sales_count": len(credit_sales),
        "credit_sales_amount": round(max(credit_gross - credit_returns, 0.0), 2),
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
        .filter(Sale.status.in_(["completed", "partially_returned", "returned"]))
        .group_by(SaleItem.product_id)
    )
    if start:
        query = query.filter(Sale.created_at >= start)
    if end:
        query = query.filter(Sale.created_at <= end)
    sold_rows = {int(row.product_id): {"qty": float(row.qty or 0), "amount": float(row.amount or 0)} for row in query.all()}
    returns_map = _return_qty_amount_by_product(db, start=start, end=end, end_exclusive=False)
    product_ids = set(sold_rows) | set(returns_map)
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    result = []
    for product_id in product_ids:
        sold = sold_rows.get(product_id, {"qty": 0.0, "amount": 0.0})
        returned = returns_map.get(product_id, {"qty": 0.0, "amount": 0.0})
        qty = max(sold["qty"] - returned["qty"], 0.0)
        amount = max(sold["amount"] - returned["amount"], 0.0)
        if qty <= 0 and amount <= 0:
            continue
        product = products.get(product_id)
        cost = float(product.cost or 0) if product else 0
        result.append(
            {
                "product_id": product_id,
                "sku": product.sku if product else "",
                "name": product.name if product else f"Producto #{product_id}",
                "quantity": round(qty, 2),
                "total_amount": round(amount, 2),
                "estimated_margin": round(amount - (cost * qty), 2),
            }
        )
    result.sort(key=lambda row: row["total_amount"], reverse=True)
    return result[: max(1, int(limit or 20))]


def _cash_cut_from_session(session: CashSession, *, open_sessions_count: int = 1) -> dict:
    movements = session.movements or []
    sales_total = sum(float(m.amount or 0) for m in movements if m.movement_type == "sale")
    returns_total = sum(
        float(m.amount or 0)
        for m in movements
        if m.movement_type == "expense" and m.sale_id is not None
    )
    incomes = sum(float(m.amount or 0) for m in movements if m.movement_type == "income")
    manual_expenses = sum(
        float(m.amount or 0)
        for m in movements
        if m.movement_type == "expense" and m.sale_id is None
    )
    return {
        "session_id": session.id,
        "opened_at": session.opened_at.isoformat() if session.opened_at else None,
        "opened_by": session.opened_by_full_name or session.opened_by_username,
        "opening_amount": round(float(session.opening_amount or 0), 2),
        "expected_amount": round(float(session.expected_amount or 0), 2),
        "sales_total": round(sales_total, 2),
        "returns_total": round(returns_total, 2),
        "other_income": round(incomes, 2),
        "manual_expenses": round(manual_expenses, 2),
        "status": session.status,
        "open_sessions_count": open_sessions_count,
    }


def _aggregate_cash_cuts(cuts: list[dict]) -> dict:
    if len(cuts) == 1:
        return cuts[0]
    return {
        "session_id": 0,
        "opened_at": None,
        "opened_by": f"{len(cuts)} cajas abiertas",
        "opening_amount": round(sum(c["opening_amount"] for c in cuts), 2),
        "expected_amount": round(sum(c["expected_amount"] for c in cuts), 2),
        "sales_total": round(sum(c["sales_total"] for c in cuts), 2),
        "returns_total": round(sum(c["returns_total"] for c in cuts), 2),
        "other_income": round(sum(c["other_income"] for c in cuts), 2),
        "manual_expenses": round(sum(c["manual_expenses"] for c in cuts), 2),
        "status": "open",
        "open_sessions_count": len(cuts),
    }


def build_cash_cuts(
    db: Session,
    *,
    session_id: int | None = None,
    user_id: int | None = None,
) -> list[dict]:
    if session_id:
        session = (
            db.query(CashSession)
            .options(joinedload(CashSession.opened_by), joinedload(CashSession.movements))
            .filter(CashSession.id == session_id)
            .first()
        )
        return [_cash_cut_from_session(session)] if session else []

    query = (
        db.query(CashSession)
        .options(joinedload(CashSession.opened_by), joinedload(CashSession.movements))
        .filter(CashSession.status == "open")
    )
    if user_id is not None:
        query = query.filter(CashSession.opened_by_user_id == user_id)
    sessions = query.order_by(CashSession.opened_at.desc()).all()
    count = len(sessions)
    return [_cash_cut_from_session(session, open_sessions_count=count) for session in sessions]


def build_cash_cut_report(
    db: Session,
    session_id: int | None = None,
    user_id: int | None = None,
) -> dict | None:
    cuts = build_cash_cuts(db, session_id=session_id, user_id=user_id)
    if not cuts:
        return None
    return _aggregate_cash_cuts(cuts)


def build_owner_dashboard(db: Session) -> dict:
    today = guatemala_today_str()
    start, end = guatemala_day_bounds_utc_naive(today)
    summary = _build_sales_summary_range(db, start=start, end=end)
    cash_cuts = build_cash_cuts(db)
    return {
        "sales_summary": summary,
        "payment_methods": _build_payment_method_breakdown_range(db, start=start, end=end),
        "top_products": _build_top_products_range(db, start=start, end=end, limit=10),
        "cash_cut": _aggregate_cash_cuts(cash_cuts) if cash_cuts else None,
        "cash_cuts": cash_cuts,
        "alerts": build_system_alerts(db),
        "pending_fel_count": db.query(PendingFelSale).filter(PendingFelSale.status == "pending").count(),
    }


def build_payment_method_breakdown(db: Session, *, date_from: str | None = None, date_to: str | None = None) -> list[dict]:
    start = _parse_date(date_from)
    end = _parse_date(date_to, end_of_day=True)
    query = (
        db.query(Sale)
        .options(joinedload(Sale.payments))
        .filter(Sale.status.in_(["completed", "partially_returned", "returned"]))
    )
    if start:
        query = query.filter(Sale.created_at >= start)
    if end:
        query = query.filter(Sale.created_at <= end)
    sales = query.all()
    returns_by_sale = _completed_returns_total_by_sale(db, [s.id for s in sales])
    buckets: dict[str, dict] = {}
    for sale in sales:
        sale_total = float(sale.total or 0)
        returned = min(float(returns_by_sale.get(sale.id, 0.0)), sale_total)
        net_ratio = ((sale_total - returned) / sale_total) if sale_total > 0 else 0.0
        payments = list(sale.payments or [])
        if payments:
            lines = [(p.payment_method or "efectivo", float(p.amount or 0)) for p in payments]
        else:
            lines = [(sale.payment_method or "efectivo", sale_total)]
        for method, amount in lines:
            net_amount = round(amount * net_ratio, 2)
            if abs(net_amount) < 0.0001 and sale_total > 0 and returned >= sale_total:
                continue
            bucket = buckets.setdefault(
                method, {"payment_method": method, "sales_count": 0, "total_amount": 0.0}
            )
            bucket["sales_count"] += 1
            bucket["total_amount"] += net_amount
    rows = [
        {
            "payment_method": key,
            "sales_count": value["sales_count"],
            "total_amount": round(value["total_amount"], 2),
        }
        for key, value in buckets.items()
        if abs(value["total_amount"]) >= 0.0001 or value["sales_count"] > 0
    ]
    rows.sort(key=lambda row: row["total_amount"], reverse=True)
    return rows


def build_cashier_ranking(
    db: Session,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict]:
    start = _parse_date(date_from)
    end = _parse_date(date_to, end_of_day=True)
    query = db.query(Sale).filter(
        Sale.status.in_(["completed", "partially_returned", "returned"]),
        Sale.created_by_user_id.isnot(None),
    )
    if start:
        query = query.filter(Sale.created_at >= start)
    if end:
        query = query.filter(Sale.created_at <= end)
    sales = query.all()
    returns_by_sale = _completed_returns_total_by_sale(db, [s.id for s in sales])
    buckets: dict[int, dict] = {}
    for sale in sales:
        user_id = int(sale.created_by_user_id)
        bucket = buckets.setdefault(user_id, {"sales_count": 0, "total_amount": 0.0})
        bucket["sales_count"] += 1
        bucket["total_amount"] += float(sale.total or 0) - float(returns_by_sale.get(sale.id, 0.0))
    users = {user.id: user for user in db.query(User).filter(User.id.in_(list(buckets.keys()))).all()} if buckets else {}
    result = []
    for user_id, bucket in buckets.items():
        user = users.get(user_id)
        result.append(
            {
                "user_id": user_id,
                "full_name": user.full_name if user else f"Usuario #{user_id}",
                "username": user.username if user else "",
                "sales_count": int(bucket["sales_count"]),
                "total_amount": round(max(bucket["total_amount"], 0.0), 2),
            }
        )
    result.sort(key=lambda row: row["total_amount"], reverse=True)
    return result


def build_purchase_suggestions(db: Session, *, days: int = 30) -> list[dict]:
    cutoff = datetime.utcnow() - timedelta(days=days)
    sold_rows = (
        db.query(SaleItem.product_id, func.sum(SaleItem.quantity))
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(Sale.created_at >= cutoff, Sale.status.in_(["completed", "partially_returned", "returned"]))
        .group_by(SaleItem.product_id)
        .all()
    )
    sold_map = {row[0]: float(row[1] or 0) for row in sold_rows}
    returned_rows = (
        db.query(SaleReturnItem.product_id, func.coalesce(func.sum(SaleReturnItem.quantity), 0))
        .join(SaleReturn, SaleReturn.id == SaleReturnItem.sale_return_id)
        .join(Sale, Sale.id == SaleReturn.sale_id)
        .filter(
            Sale.created_at >= cutoff,
            SaleReturn.status == "completed",
            Sale.status.in_(["completed", "partially_returned", "returned"]),
        )
        .group_by(SaleReturnItem.product_id)
        .all()
    )
    for product_id, qty in returned_rows:
        sold_map[product_id] = max(float(sold_map.get(product_id, 0.0)) - float(qty or 0), 0.0)
    products = (
        db.query(Product)
        .filter(Product.active == 1, Product.tracks_inventory == 1)
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


def _sales_in_range(db: Session, *, start: datetime, end: datetime, user_id: int | None = None):
    query = db.query(Sale).filter(
        Sale.status.in_(["completed", "partially_returned", "returned"]),
        Sale.created_at >= start,
        Sale.created_at < end,
    )
    if user_id is not None:
        query = query.filter(Sale.created_by_user_id == user_id)
    return query.all()


def _build_sales_summary_range(
    db: Session,
    *,
    start: datetime,
    end: datetime,
    user_id: int | None = None,
) -> dict:
    sales = _sales_in_range(db, start=start, end=end, user_id=user_id)
    total_sales = sum(float(s.total or 0) for s in sales)
    total_tax = sum(float(s.tax_total or 0) for s in sales)
    sale_ids = [s.id for s in sales]
    returns_by_sale = _completed_returns_total_by_sale(db, sale_ids)
    returns_total = sum(returns_by_sale.values())
    credit_sales = [s for s in sales if int(getattr(s, "is_credit", 0) or 0) == 1]
    credit_gross = sum(float(s.total or 0) for s in credit_sales)
    credit_returns = sum(returns_by_sale.get(s.id, 0.0) for s in credit_sales)
    return {
        "sales_count": len(sales),
        "total_amount": round(total_sales - returns_total, 2),
        "gross_amount": round(total_sales, 2),
        "returns_total": round(returns_total, 2),
        "tax_total": round(total_tax, 2),
        "credit_sales_count": len(credit_sales),
        "credit_sales_amount": round(max(credit_gross - credit_returns, 0.0), 2),
    }


def _build_payment_method_breakdown_range(
    db: Session,
    *,
    start: datetime,
    end: datetime,
    user_id: int | None = None,
) -> list[dict]:
    sales = (
        db.query(Sale)
        .options(joinedload(Sale.payments))
        .filter(
            Sale.status.in_(["completed", "partially_returned", "returned"]),
            Sale.created_at >= start,
            Sale.created_at < end,
        )
    )
    if user_id is not None:
        sales = sales.filter(Sale.created_by_user_id == user_id)
    sales = sales.all()
    returns_by_sale = _completed_returns_total_by_sale(db, [s.id for s in sales])
    buckets: dict[str, dict] = {}
    for sale in sales:
        sale_total = float(sale.total or 0)
        returned = min(float(returns_by_sale.get(sale.id, 0.0)), sale_total)
        net_ratio = ((sale_total - returned) / sale_total) if sale_total > 0 else 0.0
        payments = list(sale.payments or [])
        if payments:
            lines = [(p.payment_method or "efectivo", float(p.amount or 0)) for p in payments]
        else:
            lines = [(sale.payment_method or "efectivo", sale_total)]
        for method, amount in lines:
            net_amount = round(amount * net_ratio, 2)
            bucket = buckets.setdefault(
                method, {"payment_method": method, "sales_count": 0, "total_amount": 0.0}
            )
            bucket["sales_count"] += 1
            bucket["total_amount"] += net_amount
    rows = [
        {
            "payment_method": key,
            "sales_count": value["sales_count"],
            "total_amount": round(value["total_amount"], 2),
        }
        for key, value in buckets.items()
    ]
    rows.sort(key=lambda row: row["total_amount"], reverse=True)
    return rows


def _build_top_products_range(
    db: Session,
    *,
    start: datetime,
    end: datetime,
    limit: int = 10,
    user_id: int | None = None,
) -> list[dict]:
    query = (
        db.query(
            Product.id,
            Product.sku,
            Product.name,
            Product.cost,
            func.coalesce(func.sum(SaleItem.quantity), 0).label("quantity"),
            func.coalesce(func.sum(SaleItem.total), 0).label("total_amount"),
        )
        .join(SaleItem, SaleItem.product_id == Product.id)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .filter(
            Sale.status.in_(["completed", "partially_returned", "returned"]),
            Sale.created_at >= start,
            Sale.created_at < end,
        )
    )
    if user_id is not None:
        query = query.filter(Sale.created_by_user_id == user_id)
    sold_rows = {
        int(row.id): {
            "sku": row.sku,
            "name": row.name,
            "cost": float(row.cost or 0),
            "qty": float(row.quantity or 0),
            "amount": float(row.total_amount or 0),
        }
        for row in query.group_by(Product.id, Product.sku, Product.name, Product.cost).all()
    }
    returns_map = _return_qty_amount_by_product(
        db, start=start, end=end, end_exclusive=True, user_id=user_id
    )
    product_ids = set(sold_rows) | set(returns_map)
    extra_products = {}
    missing_ids = [pid for pid in product_ids if pid not in sold_rows]
    if missing_ids:
        extra_products = {
            p.id: p for p in db.query(Product).filter(Product.id.in_(missing_ids)).all()
        }
    result = []
    for product_id in product_ids:
        sold = sold_rows.get(product_id)
        returned = returns_map.get(product_id, {"qty": 0.0, "amount": 0.0})
        if sold:
            qty = max(sold["qty"] - returned["qty"], 0.0)
            amount = max(sold["amount"] - returned["amount"], 0.0)
            cost = sold["cost"]
            sku = sold["sku"]
            name = sold["name"]
        else:
            product = extra_products.get(product_id)
            qty = 0.0
            amount = 0.0
            cost = float(product.cost or 0) if product else 0.0
            sku = product.sku if product else ""
            name = product.name if product else f"Producto #{product_id}"
        if qty <= 0 and amount <= 0:
            continue
        result.append(
            {
                "product_id": product_id,
                "sku": sku,
                "name": name,
                "quantity": round(qty, 2),
                "total_amount": round(amount, 2),
                "estimated_margin": round(amount - (cost * qty), 2),
            }
        )
    result.sort(key=lambda row: row["total_amount"], reverse=True)
    return result[: max(1, int(limit or 10))]


def build_my_day_dashboard(db: Session, *, user: User) -> dict:
    today = guatemala_today_str()
    start, end = guatemala_day_bounds_utc_naive(today)
    user_id = None if user.role == "admin" else user.id
    pending_query = db.query(PendingFelSale).filter(PendingFelSale.status == "pending")
    if user.role != "admin":
        pending_query = pending_query.join(Sale, Sale.id == PendingFelSale.sale_id).filter(
            Sale.created_by_user_id == user.id
        )
    cash_user_id = None if user.role == "admin" else user.id
    cash_cuts = build_cash_cuts(db, user_id=cash_user_id)
    return {
        "role": user.role,
        "date": today,
        "sales_summary": _build_sales_summary_range(db, start=start, end=end, user_id=user_id),
        "payment_methods": _build_payment_method_breakdown_range(
            db, start=start, end=end, user_id=user_id
        ),
        "top_products": _build_top_products_range(db, start=start, end=end, limit=10, user_id=user_id),
        "cash_cut": _aggregate_cash_cuts(cash_cuts) if cash_cuts else None,
        "cash_cuts": cash_cuts,
        "pending_fel_count": pending_query.count(),
        "alerts": build_system_alerts(db) if user.role == "admin" else [],
    }
