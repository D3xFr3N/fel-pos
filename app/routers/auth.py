from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models import User
from app.schemas import (
    CashierPasswordLoginRequest,
    LoginRequest,
    LoginResponse,
    PasswordConfirmRequest,
    PasswordConfirmResponse,
    UserCreate,
    UserOut,
    UserUpdate,
)
from app.services.auth_service import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    username = payload.username.strip().lower()
    user = db.query(User).filter(User.username == username).first()
    if not user or not user.active:
        raise HTTPException(status_code=401, detail="Credenciales invalidas.")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales invalidas.")

    token = create_access_token(user.id, user.role)
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))


@router.post("/login-cashier", response_model=LoginResponse)
def login_cashier(payload: CashierPasswordLoginRequest, db: Session = Depends(get_db)):
    active_cashiers = (
        db.query(User)
        .filter(User.role == "user", User.active == 1)
        .order_by(User.id.asc())
        .all()
    )
    if not active_cashiers:
        raise HTTPException(
            status_code=403,
            detail="No hay cajero habilitado para cobrar. Solicita activacion al admin.",
        )

    matched = [user for user in active_cashiers if verify_password(payload.password, user.password_hash)]
    if not matched:
        raise HTTPException(status_code=401, detail="Clave invalida o cajero no habilitado para cobrar.")
    if len(matched) > 1:
        raise HTTPException(
            status_code=409,
            detail=(
                "La clave coincide con varios cajeros activos. "
                "Pide al admin usar claves distintas o desactivar usuarios duplicados."
            ),
        )

    user = matched[0]
    token = create_access_token(user.id, user.role)
    return LoginResponse(access_token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.post("/confirm-password", response_model=PasswordConfirmResponse)
def confirm_password(payload: PasswordConfirmRequest, user: User = Depends(get_current_user)):
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=403, detail="Clave incorrecta. No se autorizo la venta.")
    return PasswordConfirmResponse(valid=True, message="Clave confirmada.")


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    return db.query(User).order_by(User.role.asc(), User.full_name.asc(), User.username.asc()).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    username = payload.username.strip().lower()
    full_name = payload.full_name.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Usuario requerido.")
    if not full_name:
        raise HTTPException(status_code=400, detail="Nombre completo requerido.")

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="El usuario ya existe.")

    user = User(
        username=username,
        full_name=full_name,
        role=payload.role,
        password_hash=hash_password(payload.password),
        active=payload.active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin")),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    updates = payload.model_dump(exclude_unset=True)
    target_role = updates.get("role", user.role)
    target_active = updates.get("active", user.active)

    removing_admin_rights = user.role == "admin" and (target_role != "admin" or int(target_active) == 0)
    if removing_admin_rights:
        remaining_active_admins = (
            db.query(User)
            .filter(User.role == "admin", User.active == 1, User.id != user.id)
            .count()
        )
        if remaining_active_admins <= 0:
            raise HTTPException(
                status_code=400,
                detail="Debe existir al menos un admin activo en el sistema.",
            )

    if "full_name" in updates and updates["full_name"] is not None:
        full_name = updates["full_name"].strip()
        if not full_name:
            raise HTTPException(status_code=400, detail="Nombre completo requerido.")
        user.full_name = full_name
    if "role" in updates and updates["role"] is not None:
        user.role = updates["role"]
    if "active" in updates and updates["active"] is not None:
        user.active = updates["active"]
    if "password" in updates and updates["password"]:
        user.password_hash = hash_password(updates["password"])

    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)
