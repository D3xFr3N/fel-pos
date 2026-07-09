from pydantic_settings import BaseSettings, SettingsConfigDict

from app.data_paths import get_default_backup_dir, get_default_database_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = get_default_database_url()
    fel_mode: str = "demo"
    business_profile: str = "abarrotes"
    security_secret: str = "change-this-secret"
    access_token_minutes: int = 720

    emisor_nit: str = "12345678"
    emisor_nombre: str = "Mi Empresa S.A."
    emisor_nombre_comercial: str = "Mi Tienda"
    emisor_direccion: str = "Ciudad de Guatemala"
    emisor_codigo_postal: str = "01001"
    emisor_municipio: str = "Guatemala"
    emisor_departamento: str = "Guatemala"
    emisor_pais: str = "GT"
    emisor_afiliacion_iva: str = "GEN"
    emisor_establecimiento: str = "1"

    certificador: str = "infile"
    certificador_usuario: str = ""
    certificador_llave: str = ""
    certificador_url: str = ""

    gmail_sender: str = ""
    gmail_app_password: str = ""
    gmail_smtp_host: str = "smtp.gmail.com"
    gmail_smtp_port: int = 587

    whatsapp_phone_id: str = ""
    whatsapp_token: str = ""
    whatsapp_api_url: str = "https://graph.facebook.com/v20.0"

    nit_lookup_url: str = ""
    nit_lookup_token: str = ""
    nit_lookup_timeout_seconds: int = 8

    receipt_printer_name: str = ""
    receipt_print_on_checkout: bool = True
    receipt_open_drawer_on_checkout: bool = True
    receipt_chars_per_line: int = 48
    receipt_encoding: str = "cp850"

    label_printer_name: str = ""
    label_default_width_mm: int = 50
    label_default_height_mm: int = 30
    label_encoding: str = "cp850"

    backup_dir: str = get_default_backup_dir()
    backup_auto_daily: bool = True
    backup_retention_days: int = 30
    backup_auto_on_commit: bool = True
    backup_auto_min_interval_seconds: int = 60

    update_manifest_url: str = ""


settings = Settings()
