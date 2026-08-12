"""FEL DTE builders, certifiers, void and PDF helpers."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from xml.etree.ElementTree import Element, SubElement, tostring

from app.config import settings
from app.fel_config import is_fel_enabled, normalize_fel_mode
from app.models import Branch, Customer, Sale, SaleItem, SaleReturn, SaleReturnItem

NCRE_URI = "http://www.sat.gob.gt/face2/ComplementoReferenciaNota/0.1.0"
FCAM_URI = "http://www.sat.gob.gt/dte/fel/CompCambiaria/0.1.0"
SAT_QUERY_URL = "https://felpub.c.sat.gob.gt/verificador/home.xhtml?t=d&c={uuid}"


@dataclass
class FelCertificationResult:
    uuid: str
    serie: str
    numero: str
    document_type: str
    status: str
    xml_content: str
    certifier_response: str | None = None


@dataclass
class EmitterInfo:
    nit: str
    nombre: str
    nombre_comercial: str
    direccion: str
    establecimiento: str
    municipio: str
    departamento: str
    afiliacion_iva: str
    codigo_postal: str
    pais: str


def resolve_emitter(sale: Sale | None = None, branch: Branch | None = None) -> EmitterInfo:
    info = EmitterInfo(
        nit=settings.emisor_nit,
        nombre=settings.emisor_nombre,
        nombre_comercial=settings.emisor_nombre_comercial,
        direccion=settings.emisor_direccion,
        establecimiento=settings.emisor_establecimiento,
        municipio=settings.emisor_municipio,
        departamento=settings.emisor_departamento,
        afiliacion_iva=settings.emisor_afiliacion_iva,
        codigo_postal=settings.emisor_codigo_postal,
        pais=settings.emisor_pais,
    )
    if branch is not None:
        if branch.fel_nombre_comercial:
            info.nombre_comercial = branch.fel_nombre_comercial
        if branch.fel_direccion or branch.address:
            info.direccion = branch.fel_direccion or branch.address or info.direccion
        if branch.fel_codigo_establecimiento:
            info.establecimiento = branch.fel_codigo_establecimiento
        if branch.fel_municipio:
            info.municipio = branch.fel_municipio
        if branch.fel_departamento:
            info.departamento = branch.fel_departamento
    return info


def _format_amount(value: float) -> str:
    return f"{value:.6f}"


def _address(street: str, municipality: str, department: str, *, codigo_postal: str | None = None) -> Element:
    address = Element("dte:Direccion")
    SubElement(address, "dte:Direccion").text = street or "Ciudad"
    SubElement(address, "dte:CodigoPostal").text = codigo_postal or settings.emisor_codigo_postal
    SubElement(address, "dte:Municipio").text = municipality or "Guatemala"
    SubElement(address, "dte:Departamento").text = department or "Guatemala"
    SubElement(address, "dte:Pais").text = settings.emisor_pais
    return address


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
    emitter: EmitterInfo | None = None,
) -> str:
    emitter = emitter or resolve_emitter()
    receptor_nit = customer.nit if customer else "CF"
    receptor_name = customer.name if customer else "CONSUMIDOR FINAL"
    receptor_street = (customer.address if customer and customer.address else "Ciudad")
    receptor_muni = (customer.municipality if customer and customer.municipality else "Guatemala")
    receptor_dept = (customer.department if customer and customer.department else "Guatemala")

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

    SubElement(
        datos,
        "dte:DatosGenerales",
        {
            "Tipo": document_type,
            "FechaHoraEmision": emission_date.replace(tzinfo=timezone.utc).isoformat(),
            "CodigoMoneda": "GTQ",
        },
    )

    emisor = SubElement(
        datos,
        "dte:Emisor",
        {
            "NITEmisor": emitter.nit,
            "NombreEmisor": emitter.nombre,
            "CodigoEstablecimiento": emitter.establecimiento,
            "NombreComercial": emitter.nombre_comercial,
            "AfiliacionIVA": emitter.afiliacion_iva,
        },
    )
    SubElement(emisor, "dte:DireccionEmisor").append(
        _address(emitter.direccion, emitter.municipio, emitter.departamento, codigo_postal=emitter.codigo_postal)
    )

    receptor = SubElement(
        datos,
        "dte:Receptor",
        {
            "IDReceptor": receptor_nit,
            "NombreReceptor": receptor_name,
        },
    )
    SubElement(receptor, "dte:DireccionReceptor").append(
        _address(receptor_street, receptor_muni, receptor_dept)
    )

    frases = SubElement(datos, "dte:Frases")
    SubElement(frases, "dte:Frase", {"TipoFrase": "1", "CodigoEscenario": "1"})

    items_node = SubElement(datos, "dte:Items")
    for index, line in enumerate(item_lines, start=1):
        bien = str(line.get("goods_or_services") or "B").upper()[:1]
        if bien not in {"B", "S"}:
            bien = "B"
        item_node = SubElement(items_node, "dte:Item", {"NumeroLinea": str(index), "BienOServicio": bien})
        SubElement(item_node, "dte:Cantidad").text = _format_amount(float(line["quantity"]))
        SubElement(item_node, "dte:UnidadMedida").text = "UNI"
        SubElement(item_node, "dte:Descripcion").text = str(line["description"])
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
                "IDComplemento": "ReferenciasNota",
                "NombreComplemento": "ReferenciasNota",
                "URIComplemento": NCRE_URI,
            },
        )
        referencia = SubElement(
            complemento,
            "cno:ReferenciasNota",
            {
                "xmlns:cno": NCRE_URI,
                "Version": "0.0",
                "NumeroAutorizacionDocumentoOrigen": reference_uuid,
                "FechaEmisionDocumentoOrigen": emission_date.date().isoformat(),
                "MotivoAjuste": (reference_reason or "Devolucion")[:100],
            },
        )
        # Algunos certificadores leen nodos hijo en lugar de atributos.
        SubElement(referencia, "cno:NumeroAutorizacionDocumentoOrigen").text = reference_uuid
        SubElement(referencia, "cno:MotivoAjuste").text = (reference_reason or "Devolucion")[:100]

    if document_type == "FCAM":
        complementos = datos.find("dte:Complementos")
        if complementos is None:
            complementos = SubElement(datos, "dte:Complementos")
        complemento = SubElement(
            complementos,
            "dte:Complemento",
            {
                "IDComplemento": "FCAM",
                "NombreComplemento": "AbonosFacturaCambiaria",
                "URIComplemento": FCAM_URI,
            },
        )
        abonos = SubElement(
            complemento,
            "cfc:AbonosFacturaCambiaria",
            {"xmlns:cfc": FCAM_URI, "Version": "1"},
        )
        abono = SubElement(abonos, "cfc:Abono")
        SubElement(abono, "cfc:NumeroAbono").text = "1"
        SubElement(abono, "cfc:FechaVencimiento").text = emission_date.date().isoformat()
        SubElement(abono, "cfc:MontoAbono").text = _format_amount(grand_total)

    xml_bytes = tostring(root, encoding="utf-8", xml_declaration=True)
    return xml_bytes.decode("utf-8")


def _sale_item_lines(sale: Sale) -> list[dict]:
    items = list(sale.items)
    gross_total = round(sum(float(item.total or 0) for item in items), 2)
    tip = round(float(getattr(sale, "tip_amount", 0) or 0), 2)
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
        product = item.product
        goods = getattr(product, "goods_or_services", None) if product else "B"
        lines.append(
            {
                "quantity": item.quantity,
                "description": product.name if product else f"Item #{item.product_id}",
                "unit_price": item.unit_price,
                "price": item.total,
                "discount": item_discount,
                "subtotal": line_subtotal,
                "tax_amount": line_tax,
                "total": line_total,
                "goods_or_services": goods or "B",
            }
        )
    if tip > 0:
        tip_tax = round(tip - (tip / 1.12), 2)
        lines.append(
            {
                "quantity": 1,
                "description": "Propina",
                "unit_price": tip,
                "price": tip,
                "discount": 0,
                "subtotal": round(tip - tip_tax, 2),
                "tax_amount": tip_tax,
                "total": tip,
                "goods_or_services": "S",
            }
        )
    if lines:
        tax_difference = round(float(sale.tax_total or 0) - sum(line["tax_amount"] for line in lines), 2)
        if tax_difference:
            lines[-1]["tax_amount"] = round(lines[-1]["tax_amount"] + tax_difference, 2)
            lines[-1]["subtotal"] = round(lines[-1]["total"] - lines[-1]["tax_amount"], 2)
    return lines


def _emitter_for_sale(sale: Sale) -> EmitterInfo:
    branch = getattr(sale, "branch", None)
    if branch is None and getattr(sale, "branch_id", None):
        from sqlalchemy.orm import object_session

        session = object_session(sale)
        if session is not None:
            branch = session.get(Branch, sale.branch_id)
            if branch is not None:
                try:
                    sale.branch = branch
                except Exception:
                    pass
    return resolve_emitter(sale, branch)


def build_fel_xml(sale: Sale, customer: Customer | None) -> str:
    doc_type = (getattr(sale, "document_type", None) or "FACT").upper()
    if doc_type not in {"FACT", "FCAM"}:
        doc_type = "FACT"
    lines = _sale_item_lines(sale)
    return _build_document_xml(
        document_type=doc_type,
        emission_date=sale.created_at,
        customer=customer,
        item_lines=lines,
        tax_total=sale.tax_total,
        grand_total=sale.total,
        emitter=_emitter_for_sale(sale),
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
            "goods_or_services": getattr(item.product, "goods_or_services", "B") if item.product else "B",
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
        emitter=_emitter_for_sale(sale),
    )


class DemoCertifier:
    def certify(self, sale: Sale, customer: Customer | None) -> FelCertificationResult:
        xml_content = build_fel_xml(sale, customer)
        doc_type = (getattr(sale, "document_type", None) or "FACT").upper()
        fel_uuid = str(uuid.uuid4()).upper()
        return FelCertificationResult(
            uuid=fel_uuid,
            serie="DEMO",
            numero=str(sale.id).zfill(8),
            document_type=doc_type if doc_type in {"FACT", "FCAM"} else "FACT",
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

    def void_document(self, *, uuid_value: str, reason: str) -> dict:
        return {"mode": "demo", "voided": True, "uuid": uuid_value, "reason": reason}


def _require_certifier_credentials() -> None:
    if not (settings.certificador_usuario or "").strip() or not (settings.certificador_llave or "").strip():
        raise ValueError(
            "Configura usuario y llave del certificador (Configuracion / .env) para FEL produccion."
        )


def _b64(xml_content: str) -> str:
    import base64

    return base64.b64encode(xml_content.encode("utf-8")).decode("ascii")


def _dig(payload: dict, *paths: tuple[str, ...]) -> str | None:
    for path in paths:
        cur: object = payload
        ok = True
        for key in path:
            if not isinstance(cur, dict) or key not in cur:
                ok = False
                break
            cur = cur[key]
        if ok and cur is not None and str(cur).strip():
            return str(cur).strip()
    return None


def _parse_certifier_payload(payload: dict, *, document_type: str, xml_fallback: str) -> FelCertificationResult:
    if not isinstance(payload, dict):
        raise ValueError("Respuesta del certificador invalida.")

    resultado = payload.get("resultado")
    if resultado is False or str(payload.get("codigo") or "").upper() in {"ERROR", "FAIL", "FAILED"}:
        detail = (
            payload.get("descripcion")
            or payload.get("mensaje")
            or payload.get("message")
            or payload.get("descripcion_errores")
            or payload
        )
        raise ValueError(f"Certificador rechazo el DTE: {detail}")

    uuid_value = _dig(
        payload,
        ("uuid",),
        ("UUID",),
        ("uuid_dte",),
        ("autorizacion",),
        ("data", "uuid"),
        ("respuesta", "uuid"),
        ("dte", "uuid"),
    )
    serie = _dig(payload, ("serie",), ("Serie",), ("data", "serie"), ("respuesta", "serie"), ("dte", "serie"))
    numero = _dig(
        payload,
        ("numero",),
        ("Numero",),
        ("numero_dte",),
        ("data", "numero"),
        ("respuesta", "numero"),
        ("dte", "numero"),
    )
    xml_certified = _dig(
        payload,
        ("xml_certificado",),
        ("xml",),
        ("xml_dte",),
        ("data", "xml_certificado"),
        ("respuesta", "xml_certificado"),
    )
    if xml_certified and not xml_certified.lstrip().startswith("<"):
        try:
            import base64

            xml_certified = base64.b64decode(xml_certified).decode("utf-8")
        except Exception:
            pass

    if not uuid_value:
        raise ValueError(f"Certificador no devolvio UUID. Respuesta: {payload}")

    import json

    return FelCertificationResult(
        uuid=uuid_value.upper(),
        serie=(serie or "FEL").upper(),
        numero=str(numero or "0"),
        document_type=document_type,
        status="certified",
        xml_content=xml_certified or xml_fallback,
        certifier_response=json.dumps(payload, ensure_ascii=False)[:4000],
    )


class InfileCertifier:
    DEFAULT_UNIFIED = "https://certificador.feel.com.gt/fel/procesounificado/transaccion/v2/xml"
    DEFAULT_VOID = "https://certificador.feel.com.gt/fel/anulacion/v2/dte/"

    def _endpoint(self) -> str:
        configured = (settings.certificador_url or "").strip().rstrip("/")
        if not configured or "infile.com" in configured:
            return self.DEFAULT_UNIFIED
        return configured

    def _headers(self, identificador: str) -> dict[str, str]:
        return {
            "Content-Type": "application/json",
            "usuario": (settings.certificador_usuario or "").strip(),
            "llave": (settings.certificador_llave or "").strip(),
            "identificador": identificador[:50],
        }

    def _post(self, *, xml_content: str, document_type: str, identificador: str) -> FelCertificationResult:
        import httpx

        _require_certifier_credentials()
        endpoint = self._endpoint()
        nit = (settings.emisor_nit or "").replace("-", "").strip()
        body = {
            "nit_emisor": nit,
            "correo_copia": "",
            "xml_dte": _b64(xml_content),
        }
        try:
            response = httpx.post(endpoint, headers=self._headers(identificador), json=body, timeout=45.0)
        except httpx.HTTPError as exc:
            raise ValueError(f"No se pudo contactar Infile: {exc}") from exc

        try:
            payload = response.json()
        except Exception as exc:
            raise ValueError(
                f"Infile respondio HTTP {response.status_code} sin JSON: {response.text[:400]}"
            ) from exc

        if response.status_code >= 400:
            raise ValueError(f"Infile HTTP {response.status_code}: {payload}")
        return _parse_certifier_payload(payload, document_type=document_type, xml_fallback=xml_content)

    def certify(self, sale: Sale, customer: Customer | None) -> FelCertificationResult:
        xml_content = build_fel_xml(sale, customer)
        doc_type = (getattr(sale, "document_type", None) or "FACT").upper()
        if doc_type not in {"FACT", "FCAM"}:
            doc_type = "FACT"
        return self._post(xml_content=xml_content, document_type=doc_type, identificador=f"{doc_type}-{sale.id}")

    def certify_credit_note(
        self,
        sale: Sale,
        sale_return: SaleReturn,
        customer: Customer | None,
    ) -> FelCertificationResult:
        xml_content = build_credit_note_xml(sale, sale_return, customer)
        return self._post(
            xml_content=xml_content,
            document_type="NCRE",
            identificador=f"NCRE-{sale_return.id}",
        )

    def void_document(self, *, uuid_value: str, reason: str) -> dict:
        import httpx
        from datetime import date

        _require_certifier_credentials()
        nit = (settings.emisor_nit or "").replace("-", "").strip()
        body = {
            "nit_emisor": nit,
            "uuid": uuid_value,
            "motivo": (reason or "Anulacion")[:100],
            "fecha_anulacion": date.today().isoformat(),
        }
        try:
            response = httpx.post(
                self.DEFAULT_VOID,
                headers=self._headers(f"VOID-{uuid_value[:20]}"),
                json=body,
                timeout=45.0,
            )
        except httpx.HTTPError as exc:
            raise ValueError(f"No se pudo anular en Infile: {exc}") from exc
        try:
            payload = response.json()
        except Exception as exc:
            raise ValueError(f"Infile anulacion HTTP {response.status_code}: {response.text[:400]}") from exc
        if response.status_code >= 400:
            raise ValueError(f"Infile anulacion rechazo: {payload}")
        return payload if isinstance(payload, dict) else {"raw": payload}


class DigifactCertifier:
    DEFAULT_URL = "https://felgtaws.digifact.com.gt/gt.com.apinuc/api/v2/transform/nuc"

    def _endpoint(self) -> str:
        configured = (settings.certificador_url or "").strip().rstrip("/")
        return configured or self.DEFAULT_URL

    def _post(self, *, xml_content: str, document_type: str, request_id: str) -> FelCertificationResult:
        import httpx
        import json

        _require_certifier_credentials()
        endpoint = self._endpoint()
        nit = (settings.emisor_nit or "").replace("-", "").strip()
        headers = {
            "Content-Type": "application/json",
            "Usuario": (settings.certificador_usuario or "").strip(),
            "Password": (settings.certificador_llave or "").strip(),
            "NIT": nit,
        }
        body = {
            "NIT": nit,
            "XML": xml_content,
            "XMLBase64": _b64(xml_content),
            "TipoDocumento": document_type,
            "RequestId": request_id,
        }
        try:
            response = httpx.post(endpoint, headers=headers, json=body, timeout=45.0)
        except httpx.HTTPError as exc:
            raise ValueError(f"No se pudo contactar Digifact: {exc}") from exc
        try:
            payload = response.json()
        except Exception as exc:
            raise ValueError(
                f"Digifact respondio HTTP {response.status_code} sin JSON: {response.text[:400]}"
            ) from exc
        if response.status_code >= 400:
            raise ValueError(f"Digifact HTTP {response.status_code}: {payload}")
        try:
            return _parse_certifier_payload(payload, document_type=document_type, xml_fallback=xml_content)
        except ValueError:
            nested = payload.get("ResponseData") if isinstance(payload, dict) else None
            if isinstance(nested, dict):
                return _parse_certifier_payload(nested, document_type=document_type, xml_fallback=xml_content)
            if isinstance(nested, str):
                try:
                    return _parse_certifier_payload(
                        json.loads(nested), document_type=document_type, xml_fallback=xml_content
                    )
                except Exception:
                    pass
            raise

    def certify(self, sale: Sale, customer: Customer | None) -> FelCertificationResult:
        xml_content = build_fel_xml(sale, customer)
        doc_type = (getattr(sale, "document_type", None) or "FACT").upper()
        if doc_type not in {"FACT", "FCAM"}:
            doc_type = "FACT"
        return self._post(xml_content=xml_content, document_type=doc_type, request_id=f"{doc_type}-{sale.id}")

    def certify_credit_note(
        self,
        sale: Sale,
        sale_return: SaleReturn,
        customer: Customer | None,
    ) -> FelCertificationResult:
        xml_content = build_credit_note_xml(sale, sale_return, customer)
        return self._post(
            xml_content=xml_content,
            document_type="NCRE",
            request_id=f"NCRE-{sale_return.id}",
        )

    def void_document(self, *, uuid_value: str, reason: str) -> dict:
        # Digifact void endpoints vary by contract; mark local void and log attempt.
        import httpx

        _require_certifier_credentials()
        nit = (settings.emisor_nit or "").replace("-", "").strip()
        endpoint = self._endpoint().rstrip("/") + "/void"
        try:
            response = httpx.post(
                endpoint,
                headers={
                    "Content-Type": "application/json",
                    "Usuario": (settings.certificador_usuario or "").strip(),
                    "Password": (settings.certificador_llave or "").strip(),
                    "NIT": nit,
                },
                json={"UUID": uuid_value, "Motivo": reason, "NIT": nit},
                timeout=45.0,
            )
            try:
                payload = response.json()
            except Exception:
                payload = {"text": response.text[:400]}
            if response.status_code >= 400:
                raise ValueError(f"Digifact anulacion HTTP {response.status_code}: {payload}")
            return payload if isinstance(payload, dict) else {"raw": payload}
        except httpx.HTTPError as exc:
            raise ValueError(f"No se pudo anular en Digifact: {exc}") from exc


def get_certifier():
    mode = normalize_fel_mode(settings.fel_mode)
    if mode == "disabled" or not is_fel_enabled():
        return DemoCertifier()
    if mode == "demo":
        return DemoCertifier()
    cert = (settings.certificador or "infile").strip().lower()
    if cert == "infile":
        return InfileCertifier()
    if cert == "digifact":
        return DigifactCertifier()
    raise ValueError(f"Certificador no soportado: {cert}. Usa infile o digifact.")


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


def void_fel_invoice(*, uuid_value: str, reason: str) -> dict:
    certifier = get_certifier()
    if hasattr(certifier, "void_document"):
        return certifier.void_document(uuid_value=uuid_value, reason=reason)
    raise ValueError("El certificador no soporta anulacion.")


def sat_query_url(fel_uuid: str) -> str:
    return SAT_QUERY_URL.format(uuid=(fel_uuid or "").strip().upper())


def build_fel_pdf_bytes(
    *,
    serie: str,
    numero: str,
    fel_uuid: str,
    customer_name: str,
    total: float,
    document_type: str = "FACT",
    emisor_nombre: str | None = None,
) -> bytes:
    """Minimal single-page PDF (no external deps) with DTE summary + SAT URL/QR link."""
    title = f"FEL {document_type} {serie}-{numero}"
    query = sat_query_url(fel_uuid)
    lines = [
        emisor_nombre or settings.emisor_nombre_comercial or "FEL POS",
        title,
        f"UUID: {fel_uuid}",
        f"Cliente: {customer_name or 'CF'}",
        f"Total: Q {float(total or 0):.2f}",
        "Consulta / QR SAT (escanear URL):",
        query[:90],
        query[90:180] if len(query) > 90 else "",
    ]
    lines = [line for line in lines if line]

    def esc(text: str) -> str:
        return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    content_lines = ["BT", "/F1 11 Tf", "50 780 Td", "14 TL"]
    first = True
    for line in lines:
        if first:
            content_lines.append(f"({esc(line)}) Tj")
            first = False
        else:
            content_lines.append("T*")
            content_lines.append(f"({esc(line)}) Tj")
    content_lines.append("ET")
    # Visual QR stand-in: thick black frame so the printout marks the verification block.
    content_lines.extend(
        [
            "q",
            "2 w",
            "50 520 120 120 re S",
            "BT",
            "/F1 9 Tf",
            "60 575 Td",
            "(QR SAT) Tj",
            "T*",
            "(ver URL) Tj",
            "ET",
            "Q",
        ]
    )
    stream = "\n".join(content_lines).encode("latin-1", errors="replace")

    objects: list[bytes] = []
    objects.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objects.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objects.append(
        b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n"
    )
    objects.append(b"4 0 obj<< /Length " + str(len(stream)).encode() + b" >>stream\n" + stream + b"\nendstream\nendobj\n")
    objects.append(b"5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")

    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(out))
        out.extend(obj)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    out.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode())
    out.extend(
        f"trailer<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()
    )
    return bytes(out)
