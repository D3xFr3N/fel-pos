from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models import DiningCheck, DiningCheckItem, DiningTable, Product, User
from app.schemas import (
    DiningCheckItemCreate,
    DiningCheckItemOut,
    DiningCheckOpen,
    DiningCheckOut,
    DiningCheckPay,
    DiningSplitRequest,
    DiningTableCreate,
    DiningTableOut,
    DiningTableUpdate,
    SaleCreate,
    SaleItemInput,
)
from app.services.audit_service import log_action
from app.services.cash_service import add_cash_movement, can_use_cash_session, get_open_cash_session
from app.services.sale_service import create_sale

router = APIRouter(prefix="/api/dining", tags=["dining"])


def _check_to_out(check: DiningCheck) -> DiningCheckOut:
    items = []
    total = 0.0
    for item in check.items or []:
        line_total = round(float(item.quantity or 0) * float(item.unit_price or 0), 2)
        total += line_total
        items.append(
            DiningCheckItemOut(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else None,
                quantity=float(item.quantity or 0),
                unit_price=float(item.unit_price or 0),
                notes=item.notes,
                status=item.status,
                line_total=line_total,
            )
        )
    return DiningCheckOut(
        id=check.id,
        table_id=check.table_id,
        table_code=check.table.code if check.table else None,
        table_name=check.table.name if check.table else None,
        status=check.status,
        notes=check.notes,
        tip_amount=float(getattr(check, "tip_amount", 0) or 0),
        opened_at=check.opened_at,
        closed_at=check.closed_at,
        sale_id=check.sale_id,
        branch_id=check.branch_id,
        items=items,
        total=round(total, 2),
    )


def _table_to_out(table: DiningTable, open_check_id: int | None = None) -> DiningTableOut:
    return DiningTableOut(
        id=table.id,
        code=table.code,
        name=table.name,
        seats=table.seats,
        status=table.status,
        active=table.active,
        branch_id=table.branch_id,
        open_check_id=open_check_id,
    )


@router.get("/tables", response_model=list[DiningTableOut])
def list_tables(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    tables = db.query(DiningTable).filter(DiningTable.active == 1).order_by(DiningTable.code.asc()).all()
    open_checks = (
        db.query(DiningCheck)
        .filter(DiningCheck.status.in_(["open", "sent"]))
        .all()
    )
    open_by_table = {c.table_id: c.id for c in open_checks}
    return [_table_to_out(t, open_by_table.get(t.id)) for t in tables]


@router.post("/tables", response_model=DiningTableOut, status_code=201)
def create_table(
    payload: DiningTableCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    code = payload.code.strip().upper()
    if db.query(DiningTable).filter(DiningTable.code == code).first():
        raise HTTPException(status_code=400, detail="Ya existe una mesa con ese codigo.")
    table = DiningTable(
        code=code,
        name=payload.name.strip(),
        seats=payload.seats,
        branch_id=payload.branch_id,
        status="free",
        active=1,
    )
    db.add(table)
    log_action(db, user_id=user.id, action="dining_table_create", entity_type="dining_table", details=code)
    db.commit()
    db.refresh(table)
    return _table_to_out(table)


@router.patch("/tables/{table_id}", response_model=DiningTableOut)
def update_table(
    table_id: int,
    payload: DiningTableUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    table = db.get(DiningTable, table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Mesa no encontrada.")
    data = payload.model_dump(exclude_unset=True)
    if "code" in data and data["code"]:
        data["code"] = data["code"].strip().upper()
    for key, value in data.items():
        setattr(table, key, value)
    db.commit()
    db.refresh(table)
    return _table_to_out(table)


@router.post("/checks", response_model=DiningCheckOut, status_code=201)
def open_check(
    payload: DiningCheckOpen,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    table = (
        db.query(DiningTable)
        .filter(DiningTable.id == payload.table_id)
        .with_for_update()
        .one_or_none()
    )
    if not table or not table.active:
        raise HTTPException(status_code=404, detail="Mesa no encontrada.")
    existing = (
        db.query(DiningCheck)
        .filter(DiningCheck.table_id == table.id, DiningCheck.status.in_(["open", "sent"]))
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="La mesa ya tiene una comanda abierta.")
    check = DiningCheck(
        table_id=table.id,
        opened_by_user_id=user.id,
        notes=payload.notes,
        status="open",
        branch_id=payload.branch_id or table.branch_id,
    )
    table.status = "occupied"
    db.add(check)
    db.commit()
    check = (
        db.query(DiningCheck)
        .options(
            joinedload(DiningCheck.table),
            joinedload(DiningCheck.items).joinedload(DiningCheckItem.product),
        )
        .filter(DiningCheck.id == check.id)
        .one()
    )
    return _check_to_out(check)


@router.get("/checks/open", response_model=list[DiningCheckOut])
def list_open_checks(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    rows = (
        db.query(DiningCheck)
        .options(
            joinedload(DiningCheck.table),
            joinedload(DiningCheck.items).joinedload(DiningCheckItem.product),
        )
        .filter(DiningCheck.status.in_(["open", "sent"]))
        .order_by(DiningCheck.opened_at.desc())
        .all()
    )
    return [_check_to_out(row) for row in rows]


@router.get("/checks/{check_id}", response_model=DiningCheckOut)
def get_check(
    check_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    check = (
        db.query(DiningCheck)
        .options(
            joinedload(DiningCheck.table),
            joinedload(DiningCheck.items).joinedload(DiningCheckItem.product),
        )
        .filter(DiningCheck.id == check_id)
        .one_or_none()
    )
    if not check:
        raise HTTPException(status_code=404, detail="Comanda no encontrada.")
    return _check_to_out(check)


@router.post("/checks/{check_id}/items", response_model=DiningCheckOut)
def add_check_item(
    check_id: int,
    payload: DiningCheckItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    check = (
        db.query(DiningCheck)
        .filter(DiningCheck.id == check_id)
        .with_for_update()
        .one_or_none()
    )
    if not check or check.status not in {"open", "sent"}:
        raise HTTPException(status_code=400, detail="Comanda no disponible.")
    product = db.get(Product, payload.product_id)
    if not product or not product.active:
        raise HTTPException(status_code=404, detail="Producto no encontrado.")
    if int(product.tracks_inventory or 0) == 1:
        from app.services.inventory_branch_service import get_available_stock

        available = get_available_stock(db, product, check.branch_id)
        if available + 0.0001 < float(payload.quantity or 0):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Stock insuficiente para {product.name}. "
                    f"Disponible: {available:g}, solicitado: {float(payload.quantity):g}."
                ),
            )
    item = DiningCheckItem(
        check_id=check.id,
        product_id=product.id,
        quantity=payload.quantity,
        unit_price=float(product.price or 0),
        notes=payload.notes,
        status="pending",
    )
    db.add(item)
    # Nuevos items quedan pending hasta "Enviar a cocina".
    if check.status not in {"open", "sent"}:
        check.status = "open"
    db.commit()
    return get_check(check_id, db, user)


@router.post("/checks/{check_id}/send-kitchen", response_model=DiningCheckOut)
def send_check_to_kitchen(
    check_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    check = (
        db.query(DiningCheck)
        .options(
            joinedload(DiningCheck.table),
            joinedload(DiningCheck.items).joinedload(DiningCheckItem.product),
        )
        .filter(DiningCheck.id == check_id)
        .with_for_update()
        .one_or_none()
    )
    if not check or check.status not in {"open", "sent"}:
        raise HTTPException(status_code=400, detail="Comanda no disponible.")
    pending = [item for item in (check.items or []) if item.status == "pending"]
    if not pending:
        raise HTTPException(status_code=400, detail="No hay items pendientes para cocina.")
    for item in pending:
        item.status = "sent"
    check.status = "sent"
    db.commit()

    # Intenta imprimir ticket de cocina (no bloquea si falla la impresora).
    try:
        from app.services.receipt_service import print_raw_text

        lines = [
            "=== COCINA ===",
            f"Mesa: {(check.table.code if check.table else '?')} {check.table.name if check.table else ''}".strip(),
            f"Comanda #{check.id}",
            "--------------",
        ]
        for item in pending:
            name = item.product.name if item.product else f"#{item.product_id}"
            note = f" ({item.notes})" if item.notes else ""
            lines.append(f"{item.quantity:g} x {name}{note}")
        lines.append("--------------")
        print_raw_text("\n".join(lines) + "\n\n")
    except Exception:
        pass

    log_action(
        db,
        user_id=user.id,
        action="dining_send_kitchen",
        entity_type="dining_check",
        entity_id=check.id,
        details=f"{len(pending)} item(s)",
    )
    db.commit()
    return get_check(check_id, db, user)


@router.patch("/checks/{check_id}/items/{item_id}/status", response_model=DiningCheckOut)
def update_check_item_status(
    check_id: int,
    item_id: int,
    status: str = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    normalized = (status or "").strip().lower()
    if normalized not in {"pending", "sent", "done"}:
        raise HTTPException(status_code=400, detail="Estado invalido. Usa pending, sent o done.")
    check = (
        db.query(DiningCheck)
        .filter(DiningCheck.id == check_id)
        .with_for_update()
        .one_or_none()
    )
    if not check or check.status not in {"open", "sent"}:
        raise HTTPException(status_code=400, detail="Comanda no disponible.")
    item = db.get(DiningCheckItem, item_id)
    if not item or item.check_id != check.id:
        raise HTTPException(status_code=404, detail="Item de comanda no encontrado.")
    item.status = normalized
    db.commit()
    return get_check(check_id, db, user)


@router.get("/kitchen", response_model=list[DiningCheckOut])
def list_kitchen_orders(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    checks = (
        db.query(DiningCheck)
        .options(
            joinedload(DiningCheck.table),
            joinedload(DiningCheck.items).joinedload(DiningCheckItem.product),
        )
        .filter(DiningCheck.status.in_(["open", "sent"]))
        .order_by(DiningCheck.opened_at.asc())
        .all()
    )
    # Solo comandas con algo pendiente o enviado a cocina.
    result = []
    for check in checks:
        items = [i for i in (check.items or []) if i.status in {"pending", "sent"}]
        if items:
            result.append(_check_to_out(check))
    return result


@router.delete("/checks/{check_id}/items/{item_id}", response_model=DiningCheckOut)
def remove_check_item(
    check_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    check = (
        db.query(DiningCheck)
        .filter(DiningCheck.id == check_id)
        .with_for_update()
        .one_or_none()
    )
    if not check or check.status not in {"open", "sent"}:
        raise HTTPException(status_code=400, detail="Comanda no disponible.")
    item = db.get(DiningCheckItem, item_id)
    if not item or item.check_id != check.id:
        raise HTTPException(status_code=404, detail="Item de comanda no encontrado.")
    db.delete(item)
    db.flush()
    remaining = (
        db.query(DiningCheckItem).filter(DiningCheckItem.check_id == check.id).count()
    )
    if remaining <= 0:
        check.status = "open"
    db.commit()
    return get_check(check_id, db, user)


@router.post("/checks/{check_id}/split", response_model=DiningCheckOut)
def split_check(
    check_id: int,
    payload: DiningSplitRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    """Mueve items seleccionados a una nueva comanda en la misma mesa."""
    check = (
        db.query(DiningCheck)
        .options(joinedload(DiningCheck.items), joinedload(DiningCheck.table))
        .filter(DiningCheck.id == check_id)
        .with_for_update()
        .one_or_none()
    )
    if not check or check.status not in {"open", "sent"}:
        raise HTTPException(status_code=400, detail="Comanda no disponible.")
    move_ids = set(int(i) for i in payload.item_ids)
    to_move = [item for item in (check.items or []) if item.id in move_ids]
    if not to_move:
        raise HTTPException(status_code=400, detail="No hay items validos para dividir.")
    if len(to_move) >= len(check.items or []):
        raise HTTPException(status_code=400, detail="Debes dejar al menos un item en la comanda original.")

    new_check = DiningCheck(
        table_id=check.table_id,
        opened_by_user_id=user.id,
        status="open",
        notes=f"Dividida desde #{check.id}",
        branch_id=check.branch_id,
    )
    db.add(new_check)
    db.flush()
    for item in to_move:
        item.check_id = new_check.id
        item.status = "pending"
    db.commit()
    return get_check(new_check.id, db, user)


@router.post("/checks/{check_id}/pay", response_model=DiningCheckOut)
def pay_check(
    check_id: int,
    payload: DiningCheckPay,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    # Reserva atomica de la comanda (evita cobro vs agregar/quitar/cancelar concurrente).
    reserved = (
        db.query(DiningCheck)
        .filter(
            DiningCheck.id == check_id,
            DiningCheck.status.in_(["open", "sent"]),
            DiningCheck.sale_id.is_(None),
        )
        .update({"status": "paying"}, synchronize_session=False)
    )
    if reserved != 1:
        check = db.get(DiningCheck, check_id)
        if check and check.sale_id:
            raise HTTPException(status_code=400, detail="Esta comanda ya fue cobrada.")
        raise HTTPException(status_code=400, detail="Comanda no disponible para cobro.")

    check = (
        db.query(DiningCheck)
        .options(joinedload(DiningCheck.items), joinedload(DiningCheck.table))
        .filter(DiningCheck.id == check_id)
        .with_for_update()
        .one()
    )
    if not check.items:
        check.status = "open"
        db.commit()
        raise HTTPException(status_code=400, detail="La comanda no tiene productos.")
    payments = payload.payments
    payment_method = payload.payment_method or "efectivo"
    if payments:
        payment_method = "mixto" if len(payments) > 1 else payments[0].payment_method
    sale_payload = SaleCreate(
        customer_nit=payload.customer_nit or "CF",
        customer_name=payload.customer_name or "CONSUMIDOR FINAL",
        payment_method=payment_method,
        cash_received=payload.cash_received,
        tip_amount=float(getattr(payload, "tip_amount", 0) or 0),
        payments=payments,
        branch_id=check.branch_id,
        client_request_id=f"dining-check-{check.id}",
        items=[
            SaleItemInput(
                product_id=item.product_id,
                quantity=float(item.quantity),
                unit_price=float(item.unit_price or 0),
            )
            for item in check.items
        ],
    )
    check.tip_amount = float(getattr(payload, "tip_amount", 0) or 0)
    try:
        open_session = get_open_cash_session(db, user_id=user.id)
        if not open_session:
            raise ValueError("Debes abrir tu fondo antes de cobrar mesas.")
        if not can_use_cash_session(user, open_session):
            raise HTTPException(
                status_code=403,
                detail="Debes usar el fondo que abriste con tu usuario.",
            )
        sale = create_sale(db, sale_payload, user_id=user.id, commit=False)
        cash_amount = 0.0
        if payments:
            cash_amount = round(
                sum(float(line.amount) for line in payments if line.payment_method == "efectivo"),
                2,
            )
        elif payment_method == "efectivo":
            cash_amount = float(sale.total or 0)
        if cash_amount > 0:
            add_cash_movement(
                db,
                user_id=user.id,
                movement_type="sale",
                amount=cash_amount,
                description=f"Mesa / venta #{sale.id}",
                sale_id=sale.id,
                commit=False,
            )
        check.status = "paid"
        check.closed_at = datetime.utcnow()
        check.sale_id = sale.id
        table = db.get(DiningTable, check.table_id)
        if table:
            table.status = "free"
        log_action(
            db,
            user_id=user.id,
            action="dining_check_paid",
            entity_type="dining_check",
            entity_id=check.id,
            details=f"Venta #{sale.id}",
        )
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise
    return get_check(check_id, db, user)


@router.post("/checks/{check_id}/cancel", response_model=DiningCheckOut)
def cancel_check(
    check_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    check = (
        db.query(DiningCheck)
        .filter(DiningCheck.id == check_id)
        .with_for_update()
        .one_or_none()
    )
    if not check or check.status not in {"open", "sent"}:
        raise HTTPException(status_code=400, detail="Comanda no disponible.")
    check.status = "cancelled"
    check.closed_at = datetime.utcnow()
    table = db.get(DiningTable, check.table_id)
    if table:
        table.status = "free"
    db.commit()
    return get_check(check_id, db, user)
