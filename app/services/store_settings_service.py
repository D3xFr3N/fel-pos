from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.business_profiles import normalize_business_profile
from app.fel_config import normalize_fel_mode
from app.config import settings
from app.fel_config import fel_mode_label, is_fel_enabled
from app.data_paths import ENV_FILE_NAME, get_runtime_root
from app.models import StoreSettings
from app.schemas import CompanyConfig, CompanyConfigUpdateIn

STORE_SETTINGS_ID = 1

ENV_KEY_MAP = {
    "emisor_nit": "EMISOR_NIT",
    "emisor_nombre": "EMISOR_NOMBRE",
    "emisor_nombre_comercial": "EMISOR_NOMBRE_COMERCIAL",
    "emisor_direccion": "EMISOR_DIRECCION",
    "emisor_codigo_postal": "EMISOR_CODIGO_POSTAL",
    "emisor_municipio": "EMISOR_MUNICIPIO",
    "emisor_departamento": "EMISOR_DEPARTAMENTO",
    "emisor_pais": "EMISOR_PAIS",
    "emisor_afiliacion_iva": "EMISOR_AFILIACION_IVA",
    "emisor_establecimiento": "EMISOR_ESTABLECIMIENTO",
    "fel_mode": "FEL_MODE",
    "business_profile": "BUSINESS_PROFILE",
    "certificador": "CERTIFICADOR",
    "certificador_usuario": "CERTIFICADOR_USUARIO",
    "certificador_llave": "CERTIFICADOR_LLAVE",
    "certificador_url": "CERTIFICADOR_URL",
}

CERTIFICADOR_DEFAULT_URLS = {
    "infile": "https://certificador.infile.com/api",
    "digifact": "https://felgtaws.digifact.com.gt/gt.com.apinuc",
}


def _default_certificador_url(certificador: str) -> str:
    key = (certificador or "").strip().lower()
    return CERTIFICADOR_DEFAULT_URLS.get(key, "")


def _settings_defaults() -> dict[str, str]:
    return {
        "emisor_nit": settings.emisor_nit,
        "emisor_nombre": settings.emisor_nombre,
        "emisor_nombre_comercial": settings.emisor_nombre_comercial,
        "emisor_direccion": settings.emisor_direccion,
        "emisor_codigo_postal": settings.emisor_codigo_postal,
        "emisor_municipio": settings.emisor_municipio,
        "emisor_departamento": settings.emisor_departamento,
        "emisor_pais": settings.emisor_pais,
        "emisor_afiliacion_iva": settings.emisor_afiliacion_iva,
        "emisor_establecimiento": settings.emisor_establecimiento,
        "fel_mode": settings.fel_mode,
        "business_profile": settings.business_profile,
        "certificador": settings.certificador,
        "certificador_usuario": settings.certificador_usuario,
        "certificador_llave": settings.certificador_llave,
        "certificador_url": settings.certificador_url or _default_certificador_url(settings.certificador),
    }


def apply_store_settings_to_runtime(row: StoreSettings) -> None:
    for attr in ENV_KEY_MAP:
        setattr(settings, attr, getattr(row, attr) or "")


def _upsert_env_value(content: str, env_key: str, value: str) -> str:
    line = f"{env_key}={value}"
    pattern = rf"(?m)^{re.escape(env_key)}=.*$"
    if re.search(pattern, content):
        return re.sub(pattern, line, content, count=1)
    if content and not content.endswith("\n"):
        content += "\n"
    return content + line + "\n"


def sync_store_settings_to_env(row: StoreSettings) -> None:
    env_path = get_runtime_root() / ENV_FILE_NAME
    if env_path.exists():
        content = env_path.read_text(encoding="utf-8")
    else:
        example_path = get_runtime_root() / f"{ENV_FILE_NAME}.example"
        content = example_path.read_text(encoding="utf-8") if example_path.exists() else ""

    for attr, env_key in ENV_KEY_MAP.items():
        value = str(getattr(row, attr) or "")
        content = _upsert_env_value(content, env_key, value)

    env_path.write_text(content, encoding="utf-8")


def get_or_create_store_settings(db: Session) -> StoreSettings:
    row = db.get(StoreSettings, STORE_SETTINGS_ID)
    if row:
        return row

    defaults = _settings_defaults()
    row = StoreSettings(id=STORE_SETTINGS_ID, **defaults)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def bootstrap_store_settings(db: Session) -> StoreSettings:
    row = get_or_create_store_settings(db)
    apply_store_settings_to_runtime(row)
    return row


def store_settings_to_schema(row: StoreSettings) -> CompanyConfig:
    profile = normalize_business_profile(row.business_profile)
    return CompanyConfig(
        nit=row.emisor_nit,
        nombre=row.emisor_nombre,
        nombre_comercial=row.emisor_nombre_comercial,
        direccion=row.emisor_direccion,
        codigo_postal=row.emisor_codigo_postal,
        municipio=row.emisor_municipio,
        departamento=row.emisor_departamento,
        afiliacion_iva=row.emisor_afiliacion_iva,
        establecimiento=row.emisor_establecimiento,
        fel_mode=row.fel_mode,
        fel_mode_label=fel_mode_label(row.fel_mode),
        fel_enabled=is_fel_enabled(row.fel_mode),
        certificador=row.certificador,
        certificador_usuario=row.certificador_usuario,
        certificador_llave_configured=bool((row.certificador_llave or "").strip()),
        certificador_url=row.certificador_url or _default_certificador_url(row.certificador),
        business_profile=profile,
    )


def update_store_settings(db: Session, payload: CompanyConfigUpdateIn) -> StoreSettings:
    row = get_or_create_store_settings(db)
    fel_mode = normalize_fel_mode(payload.fel_mode)

    profile = normalize_business_profile(payload.business_profile)

    certificador = payload.certificador.strip().lower() or "infile"
    certificador_url = (payload.certificador_url or "").strip()
    if not certificador_url:
        certificador_url = _default_certificador_url(certificador)

    certificador_usuario = payload.certificador_usuario.strip()
    certificador_llave = payload.certificador_llave.strip()
    if not certificador_llave:
        certificador_llave = (row.certificador_llave or "").strip()

    if fel_mode == "production":
        if not certificador_usuario:
            raise ValueError("En modo produccion debes indicar el usuario del certificador.")
        if not certificador_llave:
            raise ValueError("En modo produccion debes indicar la llave o token del certificador.")

    row.emisor_nit = payload.nit.strip()
    row.emisor_nombre = payload.nombre.strip()
    row.emisor_nombre_comercial = payload.nombre_comercial.strip()
    row.emisor_direccion = payload.direccion.strip()
    row.emisor_codigo_postal = payload.codigo_postal.strip() or "01001"
    row.emisor_municipio = payload.municipio.strip()
    row.emisor_departamento = payload.departamento.strip()
    row.emisor_afiliacion_iva = payload.afiliacion_iva.strip() or "GEN"
    row.emisor_establecimiento = payload.establecimiento.strip() or "1"
    row.fel_mode = fel_mode
    row.business_profile = profile
    row.certificador = certificador
    row.certificador_usuario = certificador_usuario
    row.certificador_llave = certificador_llave
    row.certificador_url = certificador_url
    row.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    db.refresh(row)
    apply_store_settings_to_runtime(row)
    try:
        sync_store_settings_to_env(row)
    except OSError as exc:
        raise ValueError(f"No se pudo guardar .env: {exc}") from exc
    return row
