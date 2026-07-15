from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_roles
from app.models import User
from app.schemas import (
    CashCutReportOut,
    CashierRankingOut,
    OwnerDashboardOut,
    PaymentMethodBreakdownOut,
    SalesSummaryOut,
    TopProductOut,
)
from app.services.alert_service import build_system_alerts
from app.services.report_service import (
    build_cash_cut_report,
    build_cashier_ranking,
    build_owner_dashboard,
    build_payment_method_breakdown,
    build_purchase_suggestions,
    build_sales_summary,
    build_top_products,
)

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/sales-summary", response_model=SalesSummaryOut)
def sales_summary(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
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
    user: User = Depends(require_roles("admin")),
):
    return build_top_products(db, date_from=date_from, date_to=date_to, limit=limit)


@router.get("/payment-methods", response_model=list[PaymentMethodBreakdownOut])
def payment_methods(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    return build_payment_method_breakdown(db, date_from=date_from, date_to=date_to)


@router.get("/cash-cut", response_model=CashCutReportOut | None)
def cash_cut(
    session_id: int | None = Query(default=None),
    user_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
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
    user: User = Depends(require_roles("admin")),
):
    return build_cashier_ranking(db, date_from=date_from, date_to=date_to)


@router.get("/dashboard", response_model=OwnerDashboardOut)
def owner_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    return build_owner_dashboard(db)


@router.get("/purchase-suggestions")
def purchase_suggestions(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    return build_purchase_suggestions(db)


@router.get("/alerts")
def system_alerts(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    return build_system_alerts(db)
