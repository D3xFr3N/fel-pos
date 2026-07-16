from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from xml.etree.ElementTree import Element, SubElement, tostring

from app.config import settings
from app.fel_config import is_fel_enabled, normalize_fel_mode
from app.models import Customer, Sale, SaleItem, SaleReturn, SaleReturnItem


@dataclass
class FelCertificationResult:
    uuid: str
    serie: str
    numero: str
    document_type: str
    status: str
    xml_content: str
    certifier_response: str | None = None


def _format_amount(value: float) -> str:
    return f"{value:.6f}"


def _build_document_xml(
    *,
    document_type: str,
    emission_date: datetime,
    customer: Customer | None,
    item_lines: list[dict],
    tax_total: float,
    grand_total: float,
    reference_uuid: str | None = None,
    reference_reason: str | None = None,
) -> str:
    receptor_nit = customer.nit if customer else "CF"
    receptor_name = customer.name if customer else "CONSUMIDOR FINAL"

    root = Element(
        "dte:GTDocumento",
        {
            "xmlns:dte": "http://www.sat.gob.gt/dte/fel/0.2.0",
            "Version": "0.2",
        },
    )
    sat = SubElement(root, "dte:SAT", ClaseDocumento="dte")
    dte = SubElement(sat, "dte:DTE", ID="DatosCertificados")
    datos = SubElement(dte, "dte:DatosEmision", ID="DatosEmision")

    SubElement(datos, "dte:DatosGenerales", {
        "Tipo": document_type,
        "FechaHoraEmision": emission_date.replace(tzinfo=timezone.utc).isoformat(),
        "CodigoMoneda": "GTQ",
    })

    emisor = SubElement(datos, "dte:Emisor", {
        "NITEmisor": settings.emisor_nit,
        "NombreEmisor": settings.emisor_nombre,
        "CodigoEstablecimiento": settings.emisor_establecimiento,
        "NombreComercial": settings.emisor_nombre_comercial,
        "AfiliacionIVA": settings.emisor_afiliacion_iva,
    })
    SubElement(emisor, "dte:DireccionEmisor").append(
        _address(settings.emisor_direccion, settings.emisor_municipio, settings.emisor_departamento)
    )

    receptor = SubElement(datos, "dte:Receptor", {
        "IDReceptor": receptor_nit,
        "NombreReceptor": receptor_name,
    })
    SubElement(receptor, "dte:DireccionReceptor").append(
        _address("Ciudad", "Guatemala", "Guatemala")
    )

    frases = SubElement(datos, "dte:Frases")
    SubElement(frases, "dte:Frase", {
        "TipoFrase": "1",
        "CodigoEscenario": "1",
    })

    items_node = SubElement(datos, "dte:Items")
    for index, line in enumerate(item_lines, start=1):
        item_node = SubElement(items_node, "dte:Item", {
            "NumeroLinea": str(index),
            "BienOServicio": "B",
        })
        SubElement(item_node, "dte:Cantidad").text = _format_amount(float(line["quantity"]))
        SubElement(item_node, "dte:UnidadMedida").text = "UNI"
        SubElement(item_node, "dte:Descripcion").text = str(line["description"])
        # PrecioUnitario y Precio van con IVA incluido; MontoGravable es la base sin IVA.
        SubElement(item_node, "dte:PrecioUnitario").text = _format_amount(float(line["unit_price"]))
        SubElement(item_node, "dte:Precio").text = _format_amount(float(line.get("price", line["total"])))
        SubElement(item_node, "dte:Descuento").text = _format_amount(float(line.get("discount", 0)))
        taxes = SubElement(item_node, "dte:Impuestos")
        tax = SubElement(taxes, "dte:Impuesto")
        SubElement(tax, "dte:NombreCorto").text = "IVA"
        SubElement(tax, "dte:CodigoUnidadGravable").text = "1"
        SubElement(tax, "dte:MontoGravable").text = _format_amount(float(line["subtotal"]))
        SubElement(tax, "dte:MontoImpuesto").text = _format_amount(float(line["tax_amount"]))
        SubElement(item_node, "dte:Total").text = _format_amount(float(line["total"]))

    totals = SubElement(datos, "dte:Totales")
    total_taxes = SubElement(totals, "dte:TotalImpuestos")
    total_tax = SubElement(total_taxes, "dte:TotalImpuesto", {"NombreCorto": "IVA"})
    SubElement(total_tax, "dte:TotalMontoImpuesto").text = _format_amount(tax_total)
    SubElement(totals, "dte:GranTotal").text = _format_amount(grand_total)

    if document_type == "NCRE" and reference_uuid:
        complementos = SubElement(datos, "dte:Complementos")
        complemento = SubElement(
            complementos,
            "dte:Complemento",
            {
                "IDComplemento": "ReferenciaNotaCredito",
                "NombreComplemento": "Referencia NC",
                "URIComplemento": "FELPOS-DEMO-REF",
            },
        )
        referencia = SubElement(complemento, "dte:ReferenciasNota")
        SubElement(referencia, "dte:UUIDReferencia").text = reference_uuid
        SubElement(referencia, "dte:MotivoAjuste").text = reference_reason or "Devolucion"

    xml_bytes = tostring(root, encoding="utf-8", xml_declaration=True)
    return xml_bytes.decode("utf-8")


def build_fel_xml(sale: Sale, customer: Customer | None) -> str:
    items = list(sale.items)
    gross_total = round(sum(float(item.total or 0) for item in items), 2)
    cart_discount = min(round(float(sale.cart_discount_amount or 0), 2), gross_total)
    remaining_discount = cart_discount
    lines: list[dict] = []
    for index, item in enumerate(items):
        if index == len(items) - 1:
            item_discount = remaining_discount
        elif gross_total > 0:
            item_discount = round(cart_discount * float(item.total or 0) / gross_total, 2)
            item_discount = min(item_discount, remaining_discount)
        else:
            item_discount = 0.0
        remaining_discount = round(remaining_discount - item_discount, 2)

        line_total = round(max(float(item.total or 0) - item_discount, 0), 2)
        tax_rate = float(item.tax_rate or 0)
        line_tax = round(line_total - (line_total / (1 + tax_rate)), 2) if tax_rate > 0 else 0.0
        line_subtotal = round(line_total - line_tax, 2)
        lines.append(
            {
                "quantity": item.quantity,
                "description": item.product.name,
                "unit_price": item.unit_price,
                "price": item.total,
                "discount": item_discount,
                "subtotal": line_subtotal,
                "tax_amount": line_tax,
                "total": line_total,
            }
        )
    if lines:
        tax_difference = round(float(sale.tax_total or 0) - sum(line["tax_amount"] for line in lines), 2)
        if tax_difference:
            lines[-1]["tax_amount"] = round(lines[-1]["tax_amount"] + tax_difference, 2)
            lines[-1]["subtotal"] = round(lines[-1]["total"] - lines[-1]["tax_amount"], 2)
    return _build_document_xml(
        document_type="FACT",
        emission_date=sale.created_at,
        customer=customer,
        item_lines=lines,
        tax_total=sale.tax_total,
        grand_total=sale.total,
    )


def build_credit_note_xml(sale: Sale, sale_return: SaleReturn, customer: Customer | None) -> str:
    reference_uuid = sale.fel_invoice.uuid if sale.fel_invoice else None
    lines = [
        {
            "quantity": item.quantity,
            "description": item.product.name if item.product else f"Producto #{item.product_id}",
            "unit_price": item.unit_price,
            "subtotal": item.subtotal,
            "tax_amount": item.tax_amount,
            "total": item.total,
        }
        for item in sale_return.items
    ]
    return _build_document_xml(
        document_type="NCRE",
        emission_date=sale_return.created_at,
        customer=customer,
        item_lines=lines,
        tax_total=sale_return.tax_total,
        grand_total=sale_return.total,
        reference_uuid=reference_uuid,
        reference_reason=sale_return.reason,
    )


def _address(street: str, municipality: str, department: str) -> Element:
    address = Element("dte:Direccion")
    SubElement(address, "dte:Direccion").text = street
    SubElement(address, "dte:CodigoPostal").text = settings.emisor_codigo_postal
    SubElement(address, "dte:Municipio").text = municipality
    SubElement(address, "dte:Departamento").text = department
    SubElement(address, "dte:Pais").text = settings.emisor_pais
    return address


class DemoCertifier:
    def certify(self, sale: Sale, customer: Customer | None) -> FelCertificationResult:
        xml_content = build_fel_xml(sale, customer)
        fel_uuid = str(uuid.uuid4()).upper()
        return FelCertificationResult(
            uuid=fel_uuid,
            serie="DEMO",
            numero=str(sale.id).zfill(8),
            document_type="FACT",
            status="certified",
            xml_content=xml_content,
            certifier_response='{"mode":"demo","message":"Factura simulada. Conecta tu certificador para produccion."}',
        )

    def certify_credit_note(
        self,
        sale: Sale,
        sale_return: SaleReturn,
        customer: Customer | None,
    ) -> FelCertificationResult:
        xml_content = build_credit_note_xml(sale, sale_return, customer)
        return FelCertificationResult(
            uuid=str(uuid.uuid4()).upper(),
            serie="NCDEMO",
            numero=str(sale_return.id).zfill(8),
            document_type="NCRE",
            status="certified",
            xml_content=xml_content,
            certifier_response='{"mode":"demo","message":"Nota de credito simulada."}',
        )


class InfileCertifier:
    """Adaptador base para certificador Infile. Requiere credenciales reales."""

    def certify(self, sale: Sale, customer: Customer | None) -> FelCertificationResult:
        xml_content = build_fel_xml(sale, customer)
        if not settings.certificador_usuario or not settings.certificador_llave:
            raise ValueError(
                "Configura CERTIFICADOR_USUARIO y CERTIFICADOR_LLAVE en .env para modo produccion."
            )
        raise NotImplementedError(
            "Integracion Infile pendiente de credenciales y endpoint del certificador."
        )

    def certify_credit_note(
        self,
        sale: Sale,
        sale_return: SaleReturn,
        customer: Customer | None,
    ) -> FelCertificationResult:
        _ = build_credit_note_xml(sale, sale_return, customer)
        if not settings.certificador_usuario or not settings.certificador_llave:
            raise ValueError(
                "Configura CERTIFICADOR_USUARIO y CERTIFICADOR_LLAVE en .env para modo produccion."
            )
        raise NotImplementedError(
            "Integracion Infile para nota de credito pendiente de credenciales y endpoint del certificador."
        )


def get_certifier():
    if not is_fel_enabled():
        return DemoCertifier()
    if settings.fel_mode == "demo":
        return DemoCertifier()
    if settings.certificador.lower() == "infile":
        return InfileCertifier()
    return DemoCertifier()


def certify_sale(sale: Sale, customer: Customer | None) -> FelCertificationResult:
    certifier = get_certifier()
    return certifier.certify(sale, customer)


def certify_sale_return(
    sale: Sale,
    sale_return: SaleReturn,
    customer: Customer | None,
) -> FelCertificationResult:
    certifier = get_certifier()
    return certifier.certify_credit_note(sale, sale_return, customer)
