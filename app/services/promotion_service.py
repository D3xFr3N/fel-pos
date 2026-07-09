from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Promotion


def list_active_promotions(db: Session) -> list[Promotion]:
    now = datetime.utcnow()
    promos = db.query(Promotion).filter(Promotion.active == 1).all()
    active: list[Promotion] = []
    for promo in promos:
        if promo.start_at and promo.start_at > now:
            continue
        if promo.end_at and promo.end_at < now:
            continue
        active.append(promo)
    return active


def best_promotion_for_line(
    db: Session,
    *,
    product_id: int,
    department_id: int | None,
    quantity: float,
    unit_price: float,
) -> tuple[Promotion | None, float]:
    best_promo: Promotion | None = None
    best_discount = 0.0
    for promo in list_active_promotions(db):
        if promo.product_id and promo.product_id != product_id:
            continue
        if promo.department_id and promo.department_id != department_id:
            continue
        if quantity < float(promo.min_qty or 0):
            continue
        line_subtotal = unit_price * quantity
        if promo.promo_type == "percent":
            discount = round(line_subtotal * float(promo.value or 0) / 100, 2)
        elif promo.promo_type == "fixed":
            discount = round(min(float(promo.value or 0) * quantity, line_subtotal), 2)
        else:
            continue
        if discount > best_discount:
            best_discount = discount
            best_promo = promo
    return best_promo, best_discount
