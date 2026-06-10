"""REST API аутентификации менеджеров: register / login / me.

Регистрация по инвайт-кодам: INVITE_CODE → роль manager,
ADMIN_INVITE_CODE → роль admin. Неверный код — 403.
"""
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import Manager, get_session
from app.services.auth import (
    create_token,
    get_current_manager,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger(__name__)

_USERNAME_RE = re.compile(r"^[a-z0-9_]{3,32}$")


class ManagerOut(BaseModel):
    id: int
    username: str
    display_name: str
    role: str


class AuthResponse(BaseModel):
    token: str
    manager: ManagerOut


class RegisterRequest(BaseModel):
    invite_code: str
    username: str
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=100)

    @field_validator("username")
    @classmethod
    def _validate_username(cls, value: str) -> str:
        value = value.strip().lower()
        if not _USERNAME_RE.fullmatch(value):
            raise ValueError("username: 3–32 символа, только [a-z0-9_]")
        return value


class LoginRequest(BaseModel):
    username: str
    password: str


def _manager_out(manager: Manager) -> ManagerOut:
    return ManagerOut(
        id=manager.id,
        username=manager.username,
        display_name=manager.display_name,
        role=manager.role,
    )


@router.post("/register", response_model=AuthResponse)
async def register(
    payload: RegisterRequest, db: AsyncSession = Depends(get_session)
) -> AuthResponse:
    """Регистрация по инвайт-коду. 403 — неверный код, 409 — username занят."""
    settings = get_settings()
    role = None
    if settings.admin_invite_code and payload.invite_code == settings.admin_invite_code:
        role = "admin"
    elif settings.invite_code and payload.invite_code == settings.invite_code:
        role = "manager"
    if role is None:
        raise HTTPException(status_code=403, detail="Неверный инвайт-код")

    existing = await db.scalar(
        select(Manager).where(Manager.username == payload.username)
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Имя пользователя уже занято")

    manager = Manager(
        username=payload.username,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        role=role,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(manager)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Имя пользователя уже занято")
    await db.refresh(manager)
    logger.info("Registered manager '%s' (role=%s)", manager.username, role)
    return AuthResponse(token=create_token(manager), manager=_manager_out(manager))


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest, db: AsyncSession = Depends(get_session)
) -> AuthResponse:
    """Вход по username+password. 401 при неверной паре."""
    username = payload.username.strip().lower()
    manager = await db.scalar(select(Manager).where(Manager.username == username))
    if manager is None or not verify_password(payload.password, manager.password_hash):
        raise HTTPException(
            status_code=401, detail="Неверное имя пользователя или пароль"
        )
    return AuthResponse(token=create_token(manager), manager=_manager_out(manager))


@router.get("/me", response_model=ManagerOut)
async def me(manager: Manager = Depends(get_current_manager)) -> ManagerOut:
    """Текущий менеджер по Bearer-токену."""
    return _manager_out(manager)
