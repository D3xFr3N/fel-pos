from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import require_permission, require_roles
from app.models import FelInvoice, Sale, SaleItem, SalePayment, SaleReturn, SaleReturnItem, User
from app.schemas import PrintReceiptResponse, SaleCreate, SaleOut, SaleReturnCreate, SaleReturnOut
from app.services.audit_service import log_action
from app.services.cash_service import add_cash_movement, can_use_cash_session, get_open_cash_session
from app.services.fel_service import build_fel_pdf_bytes, void_fel_invoice
from app.services.permission_service import user_has_permission
from app.services.receipt_service import open_cash_drawer_with_retry, print_receipt_detailed
from app.services.sale_service import (
    create_sale,
    create_sale_return,
    sale_to_schema,
)

router = APIRouter(prefix="/api/sales", tags=["sales"])


def _require_sale_access(db: Session, sale_id: int, user: User) -> Sale:
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada.")
    if user.role != "admin" and not user_has_permission(user, "sales.view_all"):
        if sale.created_by_user_id != user.id:
            raise HTTPException(status_code=403, detail="No tienes acceso a esta venta.")
    return sale


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
            joinedload(Sale.created_by),
            joinedload(Sale.fel_invoice),
            joinedload(Sale.payments),
            joinedload(Sale.returns).joinedload(SaleReturn.items).joinedload(SaleReturnItem.product),
        )
    )
    if user.role != "admin" and not user_has_permission(user, "sales.view_all"):
        sales = sales.filter(Sale.created_by_user_id == user.id)
    sales = sales.order_by(Sale.created_at.desc()).limit(200).all()
    return [sale_to_schema(sale) for sale in sales]


@router.post("", response_model=SaleOut, status_code=201)
def register_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    try:
        open_session = get_open_cash_session(db, user_id=user.id)
        if not open_session:
            raise ValueError("Debes abrir tu fondo antes de registrar ventas.")
        if not can_use_cash_session(user, open_session):
            raise HTTPException(
                status_code=403,
                detail="Debes usar el fondo que abriste con tu usuario.",
            )
        sale = create_sale(db, payload, user_id=user.id, commit=False)
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
                    commit=False,
                )
        db.commit()
        return sale
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.post("/open-drawer", response_model=PrintReceiptResponse)
def open_drawer_route(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    if not settings.receipt_open_drawer_on_checkout:
        return PrintReceiptResponse(
            ok=True,
            message="Apertura de cajon desactivada en configuracion.",
            drawer_opened=False,
        )
    result = open_cash_drawer_with_retry(attempts=2)
    log_action(
        db,
        user_id=user.id,
        action="drawer_open_ok" if result.get("drawer_opened") else "drawer_open_fail",
        entity_type="printer",
        details=result.get("drawer_error") or result.get("printer_name"),
    )
    db.commit()
    if not result.get("drawer_opened"):
        raise HTTPException(
            status_code=500,
            detail=result.get("drawer_error") or "No se pudo abrir el cajon.",
        )
    return PrintReceiptResponse(
        ok=True,
        message=f"Cajon abierto en {result.get('printer_name')}.",
        drawer_opened=True,
        printer_name=result.get("printer_name"),
        attempts=int(result.get("attempts") or 1),
    )


@router.post("/{sale_id}/returns", response_model=SaleReturnOut, status_code=201)
def register_sale_return(
    sale_id: int,
    payload: SaleReturnCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_permission("sales.returns")),
):
    try:
        open_session = get_open_cash_session(db, user_id=user.id)
        if not open_session:
            raise ValueError("Debes abrir tu fondo antes de registrar devoluciones.")
        if not can_use_cash_session(user, open_session):
            raise HTTPException(
                status_code=403,
                detail="Debes usar el fondo que abriste con tu usuario.",
            )

        sale = (
            db.query(Sale)
            .options(joinedload(Sale.payments), joinedload(Sale.customer))
            .filter(Sale.id == sale_id)
            .one_or_none()
        )
        if not sale:
            raise HTTPException(status_code=404, detail="Venta no encontrada.")

        sale_return = create_sale_return(
            db,
            sale_id=sale_id,
            payload=payload,
            user_id=user.id,
            commit=False,
        )
        cash_refund = float(getattr(sale_return, "cash_refund_amount", 0) or 0)
        if cash_refund > 0:
            add_cash_movement(
                db,
                user_id=user.id,
                movement_type="expense",
                amount=cash_refund,
                description=f"Devolucion venta #{sale_id} NC {sale_return.fel_serie}-{sale_return.fel_numero}",
                sale_id=sale_id,
                commit=False,
            )
        db.commit()
        return sale_return
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        db.rollback()
        raise


@router.get("/{sale_id}/fel-xml")
def get_fel_xml(
    sale_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    _require_sale_access(db, sale_id, user)
    fel = db.query(FelInvoice).filter(FelInvoice.sale_id == sale_id).first()
    if not fel:
        raise HTTPException(status_code=404, detail="Factura FEL no encontrada.")
    return PlainTextResponse(fel.xml_content, media_type="application/xml")


@router.get("/{sale_id}/fel-pdf")
def get_fel_pdf(
    sale_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    sale = _require_sale_access(db, sale_id, user)
    fel = db.query(FelInvoice).filter(FelInvoice.sale_id == sale_id).first()
    if not fel or fel.status not in {"certified", "pending"}:
        raise HTTPException(status_code=404, detail="Factura FEL no encontrada.")
    customer_name = sale.customer.name if sale.customer else "CF"
    pdf = build_fel_pdf_bytes(
        serie=fel.serie,
        numero=fel.numero,
        fel_uuid=fel.uuid,
        customer_name=customer_name,
        total=float(sale.total or 0),
        document_type=fel.document_type or "FACT",
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="fel-{sale_id}.pdf"'},
    )


@router.post("/{sale_id}/fel-void", response_model=SaleOut)
def void_sale_fel(
    sale_id: int,
    reason: str = "Anulacion solicitada",
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    sale = (
        db.query(Sale)
        .options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.customer),
            joinedload(Sale.created_by),
            joinedload(Sale.fel_invoice),
            joinedload(Sale.payments),
            joinedload(Sale.returns).joinedload(SaleReturn.items).joinedload(SaleReturnItem.product),
        )
        .filter(Sale.id == sale_id)
        .one_or_none()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada.")
    fel = sale.fel_invoice
    if not fel:
        raise HTTPException(status_code=400, detail="La venta no tiene FEL para anular.")
    if fel.voided_at:
        raise HTTPException(status_code=400, detail="FEL ya esta anulado.")
    if str(fel.status).lower() != "certified":
        raise HTTPException(status_code=400, detail="Solo se pueden anular DTE certificados.")
    try:
        void_fel_invoice(uuid_value=fel.uuid, reason=reason)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    from datetime import datetime

    fel.voided_at = datetime.utcnow()
    fel.void_reason = (reason or "Anulacion")[:300]
    fel.status = "voided"
    log_action(
        db,
        user_id=user.id,
        action="fel_void",
        entity_type="sale",
        entity_id=sale.id,
        details=fel.uuid,
    )
    db.commit()
    db.refresh(sale)
    return sale_to_schema(sale)


@router.get("/{sale_id}/returns/{sale_return_id}/fel-xml")
def get_sale_return_fel_xml(
    sale_id: int,
    sale_return_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    _require_sale_access(db, sale_id, user)
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
    open_drawer: bool | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "user")),
):
    _require_sale_access(db, sale_id, user)
    want_drawer = (
        settings.receipt_open_drawer_on_checkout if open_drawer is None else bool(open_drawer)
    )

    if not force and not settings.receipt_print_on_checkout:
        if want_drawer:
            result = open_cash_drawer_with_retry(attempts=2)
            log_action(
                db,
                user_id=user.id,
                action="drawer_open_ok" if result.get("drawer_opened") else "drawer_open_fail",
                entity_type="sale",
                entity_id=sale_id,
                details=result.get("drawer_error") or result.get("printer_name"),
            )
            db.commit()
            if not result.get("drawer_opened"):
                raise HTTPException(
                    status_code=500,
                    detail=result.get("drawer_error") or "No se pudo abrir el cajon.",
                )
            return PrintReceiptResponse(
                ok=True,
                message=f"Impresion automatica desactivada; cajon abierto en {result.get('printer_name')}.",
                printed=False,
                drawer_opened=True,
                printer_name=result.get("printer_name"),
                attempts=int(result.get("attempts") or 1),
            )
        return PrintReceiptResponse(
            ok=True,
            message="Impresion automatica desactivada.",
            printed=False,
            drawer_opened=False,
        )

    sale = (
        db.query(Sale)
        .options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.customer),
            joinedload(Sale.created_by),
            joinedload(Sale.fel_invoice),
        )
        .filter(Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada.")

    sale_schema = sale_to_schema(sale)
    result = print_receipt_detailed(sale_schema, open_drawer=want_drawer, attempts=2)
    log_action(
        db,
        user_id=user.id,
        action="receipt_print_ok" if result.get("printed") else "receipt_print_fail",
        entity_type="sale",
        entity_id=sale_id,
        details=result.get("message"),
    )
    db.commit()

    response = PrintReceiptResponse(
        ok=bool(result.get("ok")),
        message=str(result.get("message") or ""),
        printed=bool(result.get("printed")),
        drawer_opened=bool(result.get("drawer_opened")),
        printer_name=result.get("printer_name"),
        print_error=result.get("print_error"),
        drawer_error=result.get("drawer_error"),
        attempts=int(result.get("attempts") or 1),
    )
    if not result.get("printed"):
        # Venta ya guardada: devolvemos detalle sin 500 para permitir reintento UI.
        return response
    return response
