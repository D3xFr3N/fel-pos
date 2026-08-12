from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services.auth_service import decode_access_token
from app.services.device_auth_service import assert_device_allowed
from app.services.permission_service import user_has_any_permission

bearer_scheme = HTTPBearer(auto_error=False)

PASSWORD_CHANGE_ALLOWLIST = frozenset({
    "/api/auth/me",
    "/api/auth/change-password",
})


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Debes iniciar sesion.",
        )

    token_data = decode_access_token(credentials.credentials)
    if not token_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalido o expirado.",
        )

    user = db.get(User, token_data.user_id)
    if not user or not user.active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no autorizado.",
        )
    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_ALLOWLIST:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Debes cambiar tu clave antes de continuar.",
        )

    assert_device_allowed(
        db,
        request,
        token_fingerprint=token_data.device_fingerprint,
        register_if_missing=False,
    )
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    def checker(user: User = Depends(get_current_user)) -> User:
        if roles and user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para esta accion.",
            )
        return user

    return checker


def require_permission(*permissions: str) -> Callable[..., User]:
    """Admin siempre pasa. Cajeros necesitan al menos uno de los permisos."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role == "admin":
            return user
        if permissions and user_has_any_permission(user, *permissions):
            return user
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu usuario no tiene permiso para esta accion. Pide al administrador que lo habilite.",
        )

    return checker
