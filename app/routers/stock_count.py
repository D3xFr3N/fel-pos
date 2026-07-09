from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models import (
    Department,
    InventoryMovement,
    Product,
    StockCountItem,
    StockCountScanLog,
    StockCountSession,
    User,
)
from app.schemas import (
    StockCountItemOut,
    StockCountRecountIn,
    StockCountScanIn,
    StockCountScanLogOut,
    StockCountSessionCreate,
    StockCountSessionOut,
    StockCountSetQuantityIn,
    StockCountTotalsOut,
)

router = APIRouter(prefix="/api/stock-count", tags=["stock-count"])


def _round2(value: float) -> float:
    return round(float(value or 0), 2)


def _recalculate_line(line: StockCountItem) -> None:
    line.counted_quantity = _round2(line.counted_quantity)
    line.system_quantity = _round2(line.system_quantity)
    line.unit_cost_snapshot = _round2(line.unit_cost_snapshot)
    line.unit_price_snapshot = _round2(line.unit_price_snapshot)
    line.difference_quantity = _round2(line.counted_quantity - line.system_quantity)
    line.difference_cost = _round2(line.difference_quantity * line.unit_cost_snapshot)
    line.updated_at = datetime.utcnow()


def _refresh_line_snapshot_from_product(line: StockCountItem, product: Product) -> None:
    line.sku_snapshot = product.sku
    line.name_snapshot = product.name
    line.description_snapshot = product.description
    line.unit_cost_snapshot = product.cost
    line.unit_price_snapshot = product.price
    # Baseline del sistema en el momento del conteo de esta linea.
    line.system_quantity = product.stock


def _line_to_schema(line: StockCountItem) -> StockCountItemOut:
    return StockCountItemOut(
        product_id=line.product_id,
        sku=line.sku_snapshot,
        name=line.name_snapshot,
        description=line.description_snapshot,
        unit_cost=line.unit_cost_snapshot,
        unit_price=line.unit_price_snapshot,
        system_quantity=line.system_quantity,
        counted_quantity=line.counted_quantity,
        difference_quantity=line.difference_quantity,
        difference_cost=line.difference_cost,
        updated_at=line.updated_at,
    )


def _log_to_schema(log: StockCountScanLog) -> StockCountScanLogOut:
    return StockCountScanLogOut(
        id=log.id,
        scanned_at=log.scanned_at,
        scanned_by_user_id=log.scanned_by_user_id,
        scanned_by_username=log.scanned_by.username if log.scanned_by else "-",
        scanned_by_full_name=log.scanned_by.full_name if log.scanned_by else "-",
        product_id=log.product_id,
        sku=log.product.sku if log.product else None,
        product_name=log.product.name if log.product else None,
        action_type=log.action_type,
        quantity=log.quantity,
        before_counted=log.before_counted,
        after_counted=log.after_counted,
        note=log.note,
    )


def _totals_from_lines(lines: list[StockCountItem]) -> StockCountTotalsOut:
    matched_lines = 0
    missing_lines = 0
    extra_lines = 0
    missing_units = 0.0
    extra_units = 0.0
    estimated_loss = 0.0
    estimated_overage_value = 0.0

    for line in lines:
        diff = float(line.difference_quantity or 0)
        diff_cost = float(line.difference_cost or 0)
        if abs(diff) < 0.0001:
            matched_lines += 1
        elif diff < 0:
            missing_lines += 1
            missing_units += abs(diff)
            estimated_loss += abs(diff_cost)
        else:
            extra_lines += 1
            extra_units += diff
            estimated_overage_value += diff_cost

    return StockCountTotalsOut(
        total_lines=len(lines),
        matched_lines=matched_lines,
        missing_lines=missing_lines,
        extra_lines=extra_lines,
        missing_units=_round2(missing_units),
        extra_units=_round2(extra_units),
        estimated_loss=_round2(estimated_loss),
        estimated_overage_value=_round2(estimated_overage_value),
    )


def _session_to_schema(session: StockCountSession, include_items: bool = True) -> StockCountSessionOut:
    ordered_lines = sorted(session.items, key=lambda line: line.updated_at, reverse=True)
    ordered_logs = sorted(session.scan_logs, key=lambda log: log.scanned_at, reverse=True)
    item_schemas = [_line_to_schema(line) for line in ordered_lines] if include_items else []
    log_schemas = [_log_to_schema(log) for log in ordered_logs] if include_items else []
    return StockCountSessionOut(
        id=session.id,
        created_at=session.created_at,
        created_by_user_id=session.created_by_user_id,
        order_code=session.order_code,
        department_id=session.department_id,
        department_name=session.department.name if session.department else None,
        status=session.status,
        notes=session.notes,
        applied_at=session.applied_at,
        applied_by_user_id=session.applied_by_user_id,
        totals=_totals_from_lines(session.items),
        items=item_schemas,
        logs=log_schemas,
    )


def _fetch_session(db: Session, session_id: int) -> StockCountSession | None:
    return (
        db.query(StockCountSession)
        .options(
            joinedload(StockCountSession.items),
            joinedload(StockCountSession.department),
            joinedload(StockCountSession.scan_logs).joinedload(StockCountScanLog.product),
            joinedload(StockCountSession.scan_logs).joinedload(StockCountScanLog.scanned_by),
        )
        .filter(StockCountSession.id == session_id)
        .one_or_none()
    )


def _require_open_session(session: StockCountSession) -> None:
    if session.status != "open":
        raise HTTPException(status_code=400, detail="La sesion de conteo ya no esta abierta.")


def _require_order_scope(session: StockCountSession) -> None:
    if not session.order_code:
        raise HTTPException(
            status_code=400,
            detail="La sesion no tiene codigo de orden. Debes crear una orden de conteo valida.",
        )
    if not session.department_id:
        raise HTTPException(
            status_code=400,
            detail="La sesion no tiene departamento asignado. Debes crear una orden de conteo valida.",
        )


def _add_scan_log(
    db: Session,
    *,
    session_id: int,
    product_id: int | None,
    user_id: int,
    action_type: str,
    quantity: float,
    before_counted: float,
    after_counted: float,
    note: str | None = None,
) -> None:
    db.add(
        StockCountScanLog(
            session_id=session_id,
            product_id=product_id,
            scanned_by_user_id=user_id,
            action_type=action_type,
            quantity=_round2(quantity),
            before_counted=_round2(before_counted),
            after_counted=_round2(after_counted),
            note=(note or "").strip() or None,
        )
    )


@router.get("/sessions", response_model=list[StockCountSessionOut])
def list_stock_count_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    sessions = (
        db.query(StockCountSession)
        .options(joinedload(StockCountSession.items), joinedload(StockCountSession.department))
        .order_by(StockCountSession.created_at.desc(), StockCountSession.id.desc())
        .limit(30)
        .all()
    )
    return [_session_to_schema(session, include_items=False) for session in sessions]


@router.get("/sessions/current", response_model=StockCountSessionOut | None)
def get_current_stock_count_session(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    current = (
        db.query(StockCountSession)
        .options(
            joinedload(StockCountSession.items),
            joinedload(StockCountSession.department),
            joinedload(StockCountSession.scan_logs).joinedload(StockCountScanLog.product),
            joinedload(StockCountSession.scan_logs).joinedload(StockCountScanLog.scanned_by),
        )
        .filter(
            StockCountSession.status == "open",
            StockCountSession.order_code.isnot(None),
            StockCountSession.department_id.isnot(None),
        )
        .order_by(StockCountSession.created_at.desc(), StockCountSession.id.desc())
        .first()
    )
    if not current:
        return None
    return _session_to_schema(current)


@router.post("/sessions", response_model=StockCountSessionOut, status_code=201)
def create_stock_count_session(
    payload: StockCountSessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    current_open = (
        db.query(StockCountSession)
        .filter(
            StockCountSession.status == "open",
            StockCountSession.order_code.isnot(None),
            StockCountSession.department_id.isnot(None),
        )
        .order_by(StockCountSession.created_at.desc(), StockCountSession.id.desc())
        .first()
    )
    if current_open:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Ya existe una orden de conteo abierta (codigo: {current_open.order_code or current_open.id}). "
                "Debes aplicarla antes de crear otra."
            ),
        )

    order_code = (payload.order_code or "").strip().upper()
    if not order_code:
        raise HTTPException(status_code=400, detail="Debes ingresar codigo de orden de conteo.")

    duplicate_order_code = db.query(StockCountSession).filter(StockCountSession.order_code == order_code).first()
    if duplicate_order_code:
        raise HTTPException(status_code=400, detail="El codigo de orden de conteo ya existe.")

    department = db.get(Department, payload.department_id)
    if not department or not department.active:
        raise HTTPException(status_code=400, detail="Departamento invalido para orden de conteo.")

    session = StockCountSession(
        created_by_user_id=user.id,
        order_code=order_code,
        department_id=department.id,
        status="open",
        notes=(payload.notes or "").strip() or None,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return _session_to_schema(session)


@router.get("/sessions/{session_id}", response_model=StockCountSessionOut)
def get_stock_count_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    session = _fetch_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    return _session_to_schema(session)


@router.post("/sessions/{session_id}/scan", response_model=StockCountSessionOut)
def scan_stock_count_item(
    session_id: int,
    payload: StockCountScanIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    session = _fetch_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    _require_open_session(session)
    _require_order_scope(session)

    normalized_sku = (payload.sku or "").strip().upper()
    if not normalized_sku:
        raise HTTPException(status_code=400, detail="Debes ingresar un SKU o codigo para escanear.")

    product = (
        db.query(Product)
        .filter(
            Product.active == 1,
            or_(
                Product.sku.ilike(normalized_sku),
                Product.barcode.ilike(normalized_sku),
            ),
        )
        .one_or_none()
    )
    if not product:
        raise HTTPException(status_code=404, detail=f"No existe producto activo con codigo {normalized_sku}.")
    if not product.department_id:
        raise HTTPException(
            status_code=400,
            detail=(
                f"El producto {product.name} no tiene departamento asignado y no puede contarse en esta orden."
            ),
        )
    if product.department_id != session.department_id:
        expected = session.department.name if session.department else "departamento de la orden"
        got = product.department_name or "sin departamento"
        raise HTTPException(
            status_code=400,
            detail=(
                f"El SKU {product.sku} pertenece a {got}. "
                f"Esta orden ({session.order_code}) solo permite conteo del departamento {expected}."
            ),
        )

    line = next((item for item in session.items if item.product_id == product.id), None)
    if not line:
        line = StockCountItem(
            session_id=session.id,
            product_id=product.id,
            sku_snapshot=product.sku,
            name_snapshot=product.name,
            description_snapshot=product.description,
            unit_cost_snapshot=product.cost,
            unit_price_snapshot=product.price,
            system_quantity=product.stock,
            counted_quantity=0,
        )
        db.add(line)

    before_counted = float(line.counted_quantity or 0)
    if payload.replace_quantity:
        line.counted_quantity = payload.counted_quantity
    else:
        line.counted_quantity = float(line.counted_quantity or 0) + float(payload.counted_quantity or 0)

    _refresh_line_snapshot_from_product(line, product)
    _recalculate_line(line)
    _add_scan_log(
        db,
        session_id=session.id,
        product_id=product.id,
        user_id=user.id,
        action_type="scan_replace" if payload.replace_quantity else "scan_add",
        quantity=float(payload.counted_quantity or 0),
        before_counted=before_counted,
        after_counted=float(line.counted_quantity or 0),
    )
    db.commit()

    refreshed = _fetch_session(db, session.id)
    if not refreshed:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    return _session_to_schema(refreshed)


@router.put("/sessions/{session_id}/items/{product_id}", response_model=StockCountSessionOut)
def set_stock_count_item_quantity(
    session_id: int,
    product_id: int,
    payload: StockCountSetQuantityIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    session = _fetch_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    _require_open_session(session)
    _require_order_scope(session)

    line = next((item for item in session.items if item.product_id == product_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Producto no encontrado en la sesion.")

    product = db.get(Product, line.product_id)
    if not product or not product.active:
        raise HTTPException(status_code=404, detail="Producto no encontrado para actualizar conteo.")

    before_counted = float(line.counted_quantity or 0)
    line.counted_quantity = payload.counted_quantity
    _refresh_line_snapshot_from_product(line, product)
    _recalculate_line(line)
    _add_scan_log(
        db,
        session_id=session.id,
        product_id=line.product_id,
        user_id=user.id,
        action_type="manual_set",
        quantity=float(payload.counted_quantity or 0),
        before_counted=before_counted,
        after_counted=float(line.counted_quantity or 0),
        note="Ajuste manual de cantidad en conteo.",
    )
    db.commit()

    refreshed = _fetch_session(db, session.id)
    if not refreshed:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    return _session_to_schema(refreshed)


@router.delete("/sessions/{session_id}/items/{product_id}", status_code=204)
def delete_stock_count_item(
    session_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    session = _fetch_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    _require_open_session(session)
    _require_order_scope(session)

    line = next((item for item in session.items if item.product_id == product_id), None)
    if not line:
        raise HTTPException(status_code=404, detail="Producto no encontrado en la sesion.")

    _add_scan_log(
        db,
        session_id=session.id,
        product_id=line.product_id,
        user_id=user.id,
        action_type="line_removed",
        quantity=float(line.counted_quantity or 0),
        before_counted=float(line.counted_quantity or 0),
        after_counted=0,
        note="Linea eliminada del conteo.",
    )
    db.delete(line)
    db.commit()
    return Response(status_code=204)


@router.post("/sessions/{session_id}/apply", response_model=StockCountSessionOut)
def apply_stock_count_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    session = _fetch_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    _require_open_session(session)
    _require_order_scope(session)

    if not session.items:
        raise HTTPException(status_code=400, detail="La sesion no tiene productos contados.")

    for line in session.items:
        product = db.get(Product, line.product_id)
        if not product:
            continue

        # Ajuste incremental: se aplica la diferencia capturada en el momento del conteo.
        # Esto evita que ventas/compras posteriores anulen o distorsionen el conteo.
        captured_diff = _round2(line.counted_quantity - line.system_quantity)
        if abs(captured_diff) < 0.0001:
            continue

        before_stock = _round2(product.stock)
        after_stock = _round2(before_stock + captured_diff)
        if after_stock < 0:
            after_stock = 0.0
        adjustment = _round2(after_stock - before_stock)
        if abs(adjustment) < 0.0001:
            continue

        product.stock = after_stock
        db.add(
            InventoryMovement(
                product_id=product.id,
                created_by_user_id=user.id,
                movement_type="count_adjustment",
                quantity=adjustment,
                before_stock=before_stock,
                after_stock=after_stock,
                notes=(
                    f"Ajuste por conteo de inventario #{session.id} "
                    f"(orden {session.order_code or session.id}, diff capturada {captured_diff:+.2f})"
                ),
            )
        )

    session.status = "applied"
    session.applied_at = datetime.utcnow()
    session.applied_by_user_id = user.id
    db.commit()

    refreshed = _fetch_session(db, session.id)
    if not refreshed:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    return _session_to_schema(refreshed)


@router.post("/sessions/{session_id}/recount", response_model=StockCountSessionOut)
def recount_stock_count_session(
    session_id: int,
    payload: StockCountRecountIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    session = _fetch_session(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    _require_open_session(session)
    _require_order_scope(session)

    for line in list(session.items):
        _add_scan_log(
            db,
            session_id=session.id,
            product_id=line.product_id,
            user_id=user.id,
            action_type="recount_reset",
            quantity=float(line.counted_quantity or 0),
            before_counted=float(line.counted_quantity or 0),
            after_counted=0,
            note=(payload.reason or "").strip() or "Reconteo solicitado por admin.",
        )
        db.delete(line)

    reason = (payload.reason or "").strip()
    recount_note = f"Reconteo solicitado por admin ({datetime.utcnow().strftime('%Y-%m-%d %H:%M')})"
    if reason:
        recount_note = f"{recount_note}: {reason}"

    existing_notes = (session.notes or "").strip()
    session.notes = f"{existing_notes}\n{recount_note}".strip() if existing_notes else recount_note
    db.commit()

    refreshed = _fetch_session(db, session.id)
    if not refreshed:
        raise HTTPException(status_code=404, detail="Sesion de conteo no encontrada.")
    return _session_to_schema(refreshed)
