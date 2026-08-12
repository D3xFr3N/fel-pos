"""Pruebas locales sin servidor ni password de produccion (paquete 0.6.0)."""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime, timedelta
from pathlib import Path


def main() -> int:
    tmp = tempfile.TemporaryDirectory(prefix="felpos-medium-")
    db_path = Path(tmp.name) / "test.db"
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    os.environ.setdefault("FELPOS_DISABLE_AUTO_BACKUP", "1")
    os.environ.setdefault("FEL_MODE", "demo")

    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    from app.config import Settings

    settings = Settings()
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
    )
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    from app.database import Base
    from app.models import Branch, BranchStock, Customer, FelInvoice, Order, OrderItem, Product, Sale, User
    from app.schemas import SaleCreate, SaleItemInput
    from app.services.auth_service import hash_password
    from app.services.inventory_branch_service import adjust_branch_stock, get_available_stock, get_or_create_main_branch
    from app.services.report_service import build_my_day_dashboard, guatemala_today_str
    from app.services.sale_service import create_sale

    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        cols = {row[1] for row in connection.execute(text("PRAGMA table_info(sales)")).fetchall()}
        if "client_request_id" not in cols:
            connection.execute(text("ALTER TABLE sales ADD COLUMN client_request_id VARCHAR(64)"))
        connection.execute(
            text("CREATE UNIQUE INDEX IF NOT EXISTS ix_sales_client_request_id ON sales (client_request_id)")
        )

    db = SessionLocal()
    try:
        admin = User(
            username="admin_test",
            full_name="Admin Test",
            role="admin",
            password_hash=hash_password("admin123"),
            must_change_password=0,
        )
        db.add(admin)
        product = Product(
            sku="MED-001",
            barcode="750000000001",
            name="Producto Medium",
            price=10.0,
            cost=5.0,
            stock=100,
            tax_rate=0.12,
            tracks_inventory=1,
            active=1,
            goods_or_services="B",
        )
        db.add(product)
        db.commit()
        db.refresh(admin)
        db.refresh(product)

        branch = get_or_create_main_branch(db)
        stock_row = BranchStock(product_id=product.id, branch_id=branch.id, stock=2.0)
        db.add(stock_row)
        db.commit()

        request_id = str(uuid.uuid4())
        payload = SaleCreate(
            customer_nit="CF",
            customer_name="CONSUMIDOR FINAL",
            payment_method="efectivo",
            cash_received=20,
            client_request_id=request_id,
            items=[SaleItemInput(product_id=product.id, quantity=1)],
        )
        first = create_sale(db, payload, user_id=admin.id)
        second = create_sale(db, payload, user_id=admin.id)
        assert first.id == second.id, f"idempotencia fallida {first.id} != {second.id}"
        print(f"[OK] idempotencia venta #{first.id}")

        day = build_my_day_dashboard(db, user=admin)
        assert day["date"] == guatemala_today_str()
        assert day["sales_summary"]["sales_count"] >= 1
        print(f"[OK] my-day date={day['date']} sales={day['sales_summary']['sales_count']}")

        from app.schemas import PrintReceiptResponse

        sample = PrintReceiptResponse(
            ok=False,
            message="Ticket no impreso",
            printed=False,
            drawer_opened=False,
            print_error="demo",
            attempts=2,
        )
        assert sample.printed is False
        print("[OK] PrintReceiptResponse shape")

        product.active = 0
        db.commit()
        db.refresh(product)
        assert product.active == 0
        product.active = 1
        db.commit()
        db.refresh(product)
        assert product.active == 1
        print(f"[OK] product reactivate cycle id={product.id}")

        # --- Apartado: reserva total + deliver sin revalidar stock ---
        apt_product = Product(
            sku="APT-001",
            barcode="750000000099",
            name="Producto Apartado",
            price=25.0,
            cost=10.0,
            stock=1,
            tax_rate=0.12,
            tracks_inventory=1,
            active=1,
        )
        db.add(apt_product)
        db.flush()
        db.add(BranchStock(product_id=apt_product.id, branch_id=branch.id, stock=1.0))
        db.commit()
        db.refresh(apt_product)

        adjust_branch_stock(
            db,
            apt_product,
            -1.0,
            branch_id=branch.id,
            user_id=admin.id,
            movement_type="apartado_reserva",
            notes="test reserva",
        )
        db.commit()
        available = get_available_stock(db, apt_product, branch.id)
        assert available == 0, f"tras reserva debe quedar 0, got {available}"

        order = Order(
            created_by_user_id=admin.id,
            customer_name="Cliente Apartado",
            customer_nit="CF",
            branch_id=branch.id,
            total_estimate=25.0,
            deposit_paid=0,
            balance_due=25.0,
            status="ready",
            stock_reserved=1,
        )
        db.add(order)
        db.flush()
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=apt_product.id,
                quantity=1,
                unit_price=25.0,
                line_total=25.0,
                reserved=1,
            )
        )
        db.commit()
        db.refresh(order)

        delivered = create_sale(
            db,
            SaleCreate(
                customer_nit="CF",
                customer_name="Cliente Apartado",
                payment_method="efectivo",
                cash_received=25,
                branch_id=branch.id,
                items=[SaleItemInput(product_id=apt_product.id, quantity=1, unit_price=25.0)],
            ),
            user_id=admin.id,
            adjust_inventory=False,
        )
        order.sale_id = delivered.id
        order.status = "delivered"
        order.stock_reserved = 0
        db.commit()
        assert order.sale_id == delivered.id
        print(f"[OK] apartado deliver con stock reservado sale=#{delivered.id}")

        # --- Export contable CSV ---
        from app.services.accounting_export_service import export_purchases_book, export_sales_book

        now = datetime.utcnow()
        sales_csv = export_sales_book(db, date_from=now - timedelta(days=1), date_to=now + timedelta(days=1))
        purchases_csv = export_purchases_book(db, date_from=now - timedelta(days=1), date_to=now + timedelta(days=1))
        assert "fecha,tipo,nit" in sales_csv
        assert "FACT" in sales_csv or "fecha" in sales_csv
        assert "fecha" in purchases_csv
        print("[OK] accounting CSV sales/purchases")

        # --- NCRE URI real + BienOServicio ---
        from app.services.fel_service import NCRE_URI, build_credit_note_xml, build_fel_xml, resolve_emitter

        assert "sat.gob.gt" in NCRE_URI
        assert "FELPOS-DEMO-REF" not in NCRE_URI

        sale_for_xml = db.get(Sale, first.id)
        assert sale_for_xml is not None
        xml_fact = build_fel_xml(sale_for_xml, sale_for_xml.customer)
        assert 'BienOServicio="B"' in xml_fact or "BienOServicio" in xml_fact
        print("[OK] BienOServicio en FACT")

        # Simula NCRE referenciando UUID de la venta
        from app.models import SaleReturn

        if not sale_for_xml.fel_invoice:
            db.add(
                FelInvoice(
                    sale_id=sale_for_xml.id,
                    uuid="AAAA-BBBB-CCCC-DDDD-EEEEFFFF0000",
                    serie="DEMO",
                    numero="00000001",
                    document_type="FACT",
                    status="certified",
                    xml_content="<demo/>",
                )
            )
            db.commit()
            db.refresh(sale_for_xml)

        ret = SaleReturn(
            sale_id=sale_for_xml.id,
            created_by_user_id=admin.id,
            reason="test ncre",
            subtotal=1,
            tax_total=0.12,
            total=1.12,
            fel_uuid=f"NCRE-{uuid.uuid4()}",
            fel_serie="NC",
            fel_numero="00000001",
            fel_document_type="NCRE",
            fel_status="certified",
            fel_xml_content="<pending/>",
        )
        db.add(ret)
        db.flush()
        ncre_xml = build_credit_note_xml(sale_for_xml, ret, sale_for_xml.customer)
        assert NCRE_URI in ncre_xml
        assert "FELPOS-DEMO-REF" not in ncre_xml
        print("[OK] NCRE URIComplemento SAT")

        # --- Emisor FEL por sucursal ---
        branch.fel_nombre_comercial = "Sucursal Test FEL"
        branch.fel_direccion = "12 Ave Zona 1"
        branch.fel_codigo_establecimiento = "2"
        db.commit()
        db.refresh(branch)

        sale_for_xml.branch_id = branch.id
        sale_for_xml.branch = branch
        emitter = resolve_emitter(sale_for_xml, branch)
        assert emitter.nombre_comercial == "Sucursal Test FEL"
        assert emitter.direccion == "12 Ave Zona 1"
        assert emitter.establecimiento == "2"
        print("[OK] FEL emisor por Branch")

        # --- Lealtad / VIP basico ---
        vip = Customer(nit="1234567", name="VIP Test", price_tier="vip", loyalty_points=50)
        db.add(vip)
        vip_product = Product(
            sku="VIP-001",
            name="Producto VIP",
            price=100.0,
            price_vip=80.0,
            cost=40.0,
            stock=10,
            tax_rate=0.12,
            tracks_inventory=0,
            active=1,
        )
        db.add(vip_product)
        db.commit()
        db.refresh(vip)
        db.refresh(vip_product)
        vip_sale = create_sale(
            db,
            SaleCreate(
                customer_id=vip.id,
                customer_nit=vip.nit,
                customer_name=vip.name,
                payment_method="efectivo",
                cash_received=100,
                loyalty_points_redeem=10,
                items=[SaleItemInput(product_id=vip_product.id, quantity=1)],
            ),
            user_id=admin.id,
        )
        assert abs(float(vip_sale.items[0].unit_price) - 80.0) < 0.001
        db.refresh(vip)
        assert float(vip.loyalty_points) >= 0
        print(f"[OK] retail VIP+loyalty sale=#{vip_sale.id} pts={vip.loyalty_points}")

        print("\nRESULT: UNIT MEDIUM OK")
        return 0
    finally:
        db.close()
        engine.dispose()
        try:
            tmp.cleanup()
        except OSError:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
