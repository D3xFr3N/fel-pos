from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies import require_roles
from app.models import CashMovement, CashSession, User
from app.schemas import CashMovementCreate, CashMovementOut, CashSessionClose, CashSessionOpen, CashSessionOut
from app.services.cash_service import add_cash_movement, close_cash_session, get_open_cash_session, open_cash_session

router = APIRouter(prefix="/api/cash", tags=["cash"])


@router.get("/sessions/current", response_model=CashSessionOut | None)
def get_current_cash_session(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    return get_open_cash_session(db)


@router.get("/sessions", response_model=list[CashSessionOut])
def list_cash_sessions(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    sessions = db.query(CashSession).order_by(CashSession.opened_at.desc()).limit(50).all()
    return sessions


@router.post("/sessions/open", response_model=CashSessionOut, status_code=201)
def open_session(
    payload: CashSessionOpen,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    try:
        return open_cash_session(
            db,
            user_id=user.id,
            opening_amount=payload.opening_amount,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/close", response_model=CashSessionOut)
def close_session(
    session_id: int,
    payload: CashSessionClose,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    session = db.get(CashSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Caja no encontrada.")
    if session.status != "open":
        raise HTTPException(status_code=400, detail="La caja ya fue cerrada.")
    if user.role != "admin" and session.opened_by_user_id != user.id:
        raise HTTPException(status_code=403, detail="Solo admin puede cuadrar una caja de otro usuario.")

    try:
        return close_cash_session(
            db,
            session_id=session_id,
            user_id=user.id,
            counted_amount=payload.counted_amount,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/movements", response_model=CashMovementOut, status_code=201)
def create_movement(
    payload: CashMovementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    session = get_open_cash_session(db)
    if not session:
        raise HTTPException(status_code=400, detail="No hay caja abierta.")
    if session.opened_by_user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Solo el cajero que abrio el fondo puede registrar movimientos de caja.",
        )

    try:
        return add_cash_movement(
            db,
            user_id=user.id,
            movement_type=payload.movement_type,
            amount=payload.amount,
            description=payload.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/sessions/{session_id}/movements", response_model=list[CashMovementOut])
def list_movements(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    session = (
        db.query(CashSession)
        .options(joinedload(CashSession.movements))
        .filter(CashSession.id == session_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Caja no encontrada.")
    if user.role != "admin" and session.opened_by_user_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Solo puedes consultar movimientos de la caja que abriste.",
        )
    return (
        db.query(CashMovement)
        .filter(CashMovement.cash_session_id == session_id)
        .order_by(CashMovement.created_at.desc())
        .all()
    )
