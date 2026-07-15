from __future__ import annotations

from app.config import settings


def get_system_config() -> dict:
    return {
        # Conservado por compatibilidad de API; ya no afecta la logica de caja.
        "cash_shared_session": False,
        "nit_lookup_configured": bool((settings.nit_lookup_url or "").strip()),
    }


def update_system_config(*, cash_shared_session: bool = False) -> dict:
    # No-op funcional: fondos son siempre por cajero. Se mantiene el endpoint.
    _ = cash_shared_session
    return get_system_config()
