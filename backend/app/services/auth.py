"""Auth-сервис: pbkdf2-хеши паролей (stdlib) и JWT-токены (PyJWT, HS256).

Формат хеша пароля: `pbkdf2$<iterations>$<salt_hex>$<hash_hex>`.
JWT payload: {sub: manager_id, username, role, exp}, срок жизни 30 дней.
Секрет — env AUTH_SECRET (дефолт dev-secret-change-me с warning в логе).
"""
import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Dict, Optional

import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import Manager, get_session

logger = logging.getLogger(__name__)

PBKDF2_ITERATIONS = 200_000
TOKEN_TTL_DAYS = 30
JWT_ALGORITHM = "HS256"

_warned_dev_secret = False


def hash_password(password: str) -> str:
    """Хеширует пароль: pbkdf2_hmac('sha256', ..., 200_000 итераций)."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Сверяет пароль с хешем формата pbkdf2$<iterations>$<salt_hex>$<hash_hex>."""
    try:
        scheme, iterations_raw, salt_hex, hash_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        iterations = int(iterations_raw)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except (ValueError, AttributeError):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(digest, expected)


def _auth_secret() -> str:
    global _warned_dev_secret
    secret = get_settings().auth_secret
    if secret == "dev-secret-change-me" and not _warned_dev_secret:
        logger.warning(
            "AUTH_SECRET не задан — используется dev-секрет. "
            "Обязательно задайте AUTH_SECRET в проде!"
        )
        _warned_dev_secret = True
    return secret


def create_token(manager: Manager) -> str:
    """Выпускает JWT для менеджера (HS256, 30 дней)."""
    payload = {
        "sub": str(manager.id),
        "username": manager.username,
        "role": manager.role,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS),
    }
    return jwt.encode(payload, _auth_secret(), algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
    """Декодирует и валидирует JWT. Бросает jwt.InvalidTokenError / ExpiredSignatureError."""
    return jwt.decode(token, _auth_secret(), algorithms=[JWT_ALGORITHM])


async def get_current_manager(
    authorization: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_session),
) -> Manager:
    """FastAPI dependency: текущий менеджер из заголовка Authorization: Bearer <jwt>.

    401 при отсутствии/просрочке/невалидности токена.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    try:
        manager_id = int(payload.get("sub", ""))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    manager = await db.get(Manager, manager_id)
    if manager is None:
        raise HTTPException(status_code=401, detail="Manager not found")
    return manager


async def require_admin(
    manager: Manager = Depends(get_current_manager),
) -> Manager:
    """FastAPI dependency: только admin, иначе 403."""
    if manager.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return manager
