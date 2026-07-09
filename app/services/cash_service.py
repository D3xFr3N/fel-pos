from datetime import datetime

from sqlalchemy.orm import Session

from app.models import CashMovement, CashSession


def get_open_cash_session(db: Session) -> CashSession | None:
    return db.query(CashSession).filter(CashSession.status == "open").first()


def open_cash_session(db: Session, user_id: int, opening_amount: float, notes: str | None) -> CashSession:
    existing = get_open_cash_session(db)
    if existing:
        raise ValueError("Ya existe una caja abierta.")

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
    session = get_open_cash_session(db)
    if not session:
        raise ValueError("No hay caja abierta.")
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
