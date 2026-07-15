from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import require_roles
from app.models import FelInvoice, Sale, SaleItem, SalePayment, SaleReturn, SaleReturnItem, User
from app.schemas import PrintReceiptResponse, SaleCreate, SaleOut, SaleReturnCreate, SaleReturnOut
from app.services.cash_service import add_cash_movement, can_use_cash_session, get_open_cash_session
from app.services.receipt_service import print_receipt
from app.services.sale_service import create_sale, create_sale_return, sale_to_schema

router = APIRouter(prefix="/api/sales", tags=["sales"])


@router.get("", response_model=list[SaleOut])
def list_sales(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    sales = (
        db.query(Sale)
        .options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.customer),
            joinedload(Sale.fel_invoice),
            joinedload(Sale.payments),
            joinedload(Sale.returns).joinedload(SaleReturn.items).joinedload(SaleReturnItem.product),
        )
        .order_by(Sale.created_at.desc())
        .limit(50)
        .all()
    )
    return [sale_to_schema(sale) for sale in sales]


@router.post("", response_model=SaleOut, status_code=201)
def register_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    try:
        open_session = get_open_cash_session(db)
        if not open_session:
            raise ValueError("Debes abrir caja antes de registrar ventas.")
        if not can_use_cash_session(user, open_session):
            owner_hint = "otro usuario"
            raise HTTPException(
                status_code=403,
                detail=(
                    f"La caja esta asignada a {owner_hint}. "
                    "Activa caja compartida en Configuracion o pide al admin transferir el turno."
                ),
            )
        sale = create_sale(db, payload, user_id=user.id)
        if not payload.is_credit:
            cash_amount = 0.0
            if payload.payments:
                cash_amount = round(
                    sum(
                        line.amount
                        for line in payload.payments
                        if line.payment_method == "efectivo"
                    ),
                    2,
                )
            elif payload.payment_method == "efectivo":
                cash_amount = sale.total
            if cash_amount > 0:
                add_cash_movement(
                    db,
                    user_id=user.id,
                    movement_type="sale",
                    amount=cash_amount,
                    description=f"Venta #{sale.id}",
                    sale_id=sale.id,
                )
        return sale
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{sale_id}/returns", response_model=SaleReturnOut, status_code=201)
def register_sale_return(
    sale_id: int,
    payload: SaleReturnCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    try:
        open_session = get_open_cash_session(db)
        if not open_session:
            raise ValueError("Debes abrir caja antes de registrar devoluciones.")
        if not can_use_cash_session(user, open_session):
            raise HTTPException(
                status_code=403,
                detail=(
                    "La caja esta asignada a otro usuario. "
                    "Activa caja compartida en Configuracion o pide al admin transferir el turno."
                ),
            )

        sale_return = create_sale_return(
            db,
            sale_id=sale_id,
            payload=payload,
            user_id=user.id,
        )
        add_cash_movement(
            db,
            user_id=user.id,
            movement_type="expense",
            amount=sale_return.total,
            description=f"Devolucion venta #{sale_id} NC {sale_return.fel_serie}-{sale_return.fel_numero}",
            sale_id=sale_id,
        )
        return sale_return
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{sale_id}/fel-xml")
def get_fel_xml(
    sale_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    fel = db.query(FelInvoice).filter(FelInvoice.sale_id == sale_id).first()
    if not fel:
        raise HTTPException(status_code=404, detail="Factura FEL no encontrada.")
    return PlainTextResponse(fel.xml_content, media_type="application/xml")


@router.get("/{sale_id}/returns/{sale_return_id}/fel-xml")
def get_sale_return_fel_xml(
    sale_id: int,
    sale_return_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    sale_return = (
        db.query(SaleReturn)
        .filter(SaleReturn.id == sale_return_id, SaleReturn.sale_id == sale_id)
        .first()
    )
    if not sale_return:
        raise HTTPException(status_code=404, detail="Nota de credito no encontrada.")
    return PlainTextResponse(sale_return.fel_xml_content, media_type="application/xml")


@router.post("/{sale_id}/print-receipt", response_model=PrintReceiptResponse)
def print_sale_receipt(
    sale_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    if not force and not settings.receipt_print_on_checkout:
        return PrintReceiptResponse(ok=True, message="Impresion automatica desactivada.")

    sale = (
        db.query(Sale)
        .options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.customer),
            joinedload(Sale.fel_invoice),
        )
        .filter(Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada.")

    sale_schema = sale_to_schema(sale)
    try:
        print_receipt(
            sale_schema,
            open_drawer=settings.receipt_open_drawer_on_checkout,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo imprimir: {exc}") from exc

    if settings.receipt_open_drawer_on_checkout:
        return PrintReceiptResponse(ok=True, message="Ticket impreso y caja abierta.")
    return PrintReceiptResponse(ok=True, message="Ticket impreso.")
