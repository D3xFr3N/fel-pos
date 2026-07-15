from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.models import CashMovement, CashSession, User


def get_open_cash_session(db: Session, user_id: int | None = None) -> CashSession | None:
    query = db.query(CashSession).filter(CashSession.status == "open")
    if user_id is not None:
        query = query.filter(CashSession.opened_by_user_id == user_id)
    return query.order_by(CashSession.opened_at.desc()).first()


def list_open_cash_sessions(db: Session) -> list[CashSession]:
    return (
        db.query(CashSession)
        .options(joinedload(CashSession.opened_by))
        .filter(CashSession.status == "open")
        .order_by(CashSession.opened_at.desc())
        .all()
    )


def can_use_cash_session(user: User, session: CashSession | None) -> bool:
    if not session:
        return False
    if user.role == "admin":
        return True
    return session.opened_by_user_id == user.id


def open_cash_session(db: Session, user_id: int, opening_amount: float, notes: str | None) -> CashSession:
    existing = get_open_cash_session(db, user_id=user_id)
    if existing:
        raise ValueError("Ya tienes un fondo abierto.")

    cash_session = CashSession(
        opened_by_user_id=user_id,
        opening_amount=opening_amount,
        expected_amount=opening_amount,
        notes=notes,
    )
    db.add(cash_session)
    db.commit()
    db.refresh(cash_session)
    return cash_session


def _movement_delta(movement_type: str, amount: float) -> float:
    if movement_type in {"sale", "income"}:
        return amount
    if movement_type == "expense":
        return -amount
    raise ValueError("Tipo de movimiento invalido.")


def add_cash_movement(
    db: Session,
    *,
    user_id: int,
    movement_type: str,
    amount: float,
    description: str | None = None,
    sale_id: int | None = None,
) -> CashMovement:
    session = get_open_cash_session(db, user_id=user_id)
    if not session:
        raise ValueError("Debes abrir tu fondo antes de registrar movimientos.")
    if amount <= 0:
        raise ValueError("El monto debe ser mayor a 0.")

    movement = CashMovement(
        cash_session_id=session.id,
        created_by_user_id=user_id,
        movement_type=movement_type,
        amount=amount,
        description=description,
        sale_id=sale_id,
    )
    session.expected_amount = round(session.expected_amount + _movement_delta(movement_type, amount), 2)
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement


def close_cash_session(
    db: Session,
    *,
    session_id: int,
    user_id: int,
    counted_amount: float,
    notes: str | None,
) -> CashSession:
    session = db.get(CashSession, session_id)
    if not session:
        raise ValueError("Caja no encontrada.")
    if session.status != "open":
        raise ValueError("La caja ya fue cerrada.")
    if counted_amount < 0:
        raise ValueError("El conteo fisico no puede ser negativo.")

    session.status = "closed"
    session.closed_by_user_id = user_id
    session.closed_at = datetime.utcnow()
    session.counted_amount = round(counted_amount, 2)
    session.difference = round(session.counted_amount - session.expected_amount, 2)
    if notes:
        base_notes = session.notes or ""
        session.notes = f"{base_notes}\nCIERRE: {notes}".strip()

    db.commit()
    db.refresh(session)
    return session


def transfer_cash_session(
    db: Session,
    *,
    session_id: int,
    target_user_id: int,
) -> CashSession:
    session = db.get(CashSession, session_id)
    if not session:
        raise ValueError("Caja no encontrada.")
    if session.status != "open":
        raise ValueError("La caja ya fue cerrada.")

    target = db.get(User, target_user_id)
    if not target:
        raise ValueError("Usuario destino no encontrado.")
    if not target.active:
        raise ValueError("El usuario destino esta inactivo.")

    existing_target = get_open_cash_session(db, user_id=target_user_id)
    if existing_target and existing_target.id != session.id:
        raise ValueError(
            f"El cajero {target.username} ya tiene un fondo abierto (# {existing_target.id}). "
            "Cierralo antes de transferir."
        )

    session.opened_by_user_id = target_user_id
    note = f"Transferida a {target.username} ({datetime.utcnow().strftime('%Y-%m-%d %H:%M')})"
    session.notes = f"{session.notes or ''}\n{note}".strip()
    db.commit()
    db.refresh(session)
    return session
