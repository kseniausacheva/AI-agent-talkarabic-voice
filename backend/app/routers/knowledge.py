"""База знаний школы (скрипты, ответы на возражения, описания программ).

Школьный single-text (key 'knowledge_base' в app_settings), редактирует admin.
Используется AI-советником как контекст для рекомендаций по клиенту.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import AppSetting, Manager, get_session
from app.services.auth import require_admin

router = APIRouter(prefix="/api", tags=["knowledge"])
logger = logging.getLogger(__name__)

KNOWLEDGE_KEY = "knowledge_base"


class KnowledgeIn(BaseModel):
    text: str = Field(default="", max_length=400_000)


async def get_knowledge_base(db: AsyncSession) -> str:
    """Текст базы знаний школы (пусто, если не задана) — для советника."""
    row = await db.get(AppSetting, KNOWLEDGE_KEY)
    return row.value if row and row.value else ""


@router.get("/knowledge")
async def read_knowledge(
    admin: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    """Текущая база знаний (admin)."""
    row = await db.get(AppSetting, KNOWLEDGE_KEY)
    return {"text": row.value if row else "", "updated_at": row.updated_at if row else None}


@router.put("/knowledge")
async def write_knowledge(
    payload: KnowledgeIn,
    admin: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_session),
):
    """Сохранить базу знаний (admin)."""
    now = datetime.now(timezone.utc).isoformat()
    row = await db.get(AppSetting, KNOWLEDGE_KEY)
    if row is None:
        db.add(AppSetting(key=KNOWLEDGE_KEY, value=payload.text, updated_at=now))
    else:
        row.value = payload.text
        row.updated_at = now
    await db.commit()
    logger.info("Knowledge base updated by admin '%s' (%d симв.)", admin.username, len(payload.text))
    return {"text": payload.text, "updated_at": now}
