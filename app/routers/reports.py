from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_permission, require_roles
from app.models import User
from app.schemas import (
    CashCutReportOut,
    CashierRankingOut,
    MyDayDashboardOut,
    OwnerDashboardOut,
    PaymentMethodBreakdownOut,
    SalesSummaryOut,
    TopProductOut,
)
from app.services.accounting_export_service import export_purchases_book, export_sales_book
from app.services.alert_service import build_system_alerts
from app.services.report_service import (
    build_cash_cut_report,
    build_cashier_ranking,
    build_my_day_dashboard,
    build_owner_dashboard,
    build_payment_method_breakdown,
    build_purchase_suggestions,
    build_sales_summary,
    build_top_products,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _parse_range(date_from: str | None, date_to: str | None) -> tuple[datetime, datetime]:
    try:
        start = datetime.fromisoformat(date_from) if date_from else datetime.utcnow().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        end = datetime.fromisoformat(date_to) if date_to else datetime.utcnow()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Fechas invalidas. Usa ISO (YYYY-MM-DD).") from exc
    if end.hour == 0 and end.minute == 0 and date_to and "T" not in date_to:
        end = end.replace(hour=23, minute=59, second=59)
    return start, end


@router.get("/accounting/sales.csv")
def accounting_sales_csv(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("reports.view")),
):
    start, end = _parse_range(date_from, date_to)
    content = export_sales_book(db, date_from=start, date_to=end)
    return PlainTextResponse(
        content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="libro-ventas.csv"'},
    )


@router.get("/accounting/purchases.csv")
def accounting_purchases_csv(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_permission("reports.view")),
):
    start, end = _parse_range(date_from, date_to)
    content = export_purchases_book(db, date_from=start, date_to=end)
    return PlainTextResponse(
        content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="libro-compras.csv"'},
    )


@router.get("/sales-summary", response_model=SalesSummaryOut)
def sales_summary(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    return build_sales_summary(
        db,
        date_from=date_from,
        date_to=date_to,
        payment_method=payment_method,
    )


@router.get("/top-products", response_model=list[TopProductOut])
def top_products(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    return build_top_products(db, date_from=date_from, date_to=date_to, limit=limit)


@router.get("/payment-methods", response_model=list[PaymentMethodBreakdownOut])
def payment_methods(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    return build_payment_method_breakdown(db, date_from=date_from, date_to=date_to)


@router.get("/cash-cut", response_model=CashCutReportOut | None)
def cash_cut(
    session_id: int | None = Query(default=None),
    user_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    report = build_cash_cut_report(db, session_id=session_id, user_id=user_id)
    if not report:
        return None
    return CashCutReportOut(**report)


@router.get("/cashier-ranking", response_model=list[CashierRankingOut])
def cashier_ranking(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    return build_cashier_ranking(db, date_from=date_from, date_to=date_to)


@router.get("/dashboard", response_model=OwnerDashboardOut)
def owner_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    return build_owner_dashboard(db)


@router.get("/my-day", response_model=MyDayDashboardOut)
def my_day_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    return build_my_day_dashboard(db, user=user)


@router.get("/purchase-suggestions")
def purchase_suggestions(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("reports.view")),
):
    return build_purchase_suggestions(db)


@router.get("/alerts")
def system_alerts(
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("inventory.view", "reports.view", "stock.entry")),
):
    return build_system_alerts(db)
