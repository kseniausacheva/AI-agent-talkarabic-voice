"""Cron-эндпоинты (вызываются по расписанию, напр. Coolify Scheduled Task).

Защита: заголовок X-Cron-Secret должен совпасть с env CRON_SECRET. Если секрет
не задан — эндпоинт выключен (403).
"""
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import Checklist, Manager, get_session
from app.services.telegram import send_telegram

router = APIRouter(prefix="/api/cron", tags=["cron"])
logger = logging.getLogger(__name__)

_STAGES = ("new", "warm", "hot", "rejected")


def _due_info(insights_json):
    """(next_contact_date, stage) из insights_json; None при отсутствии/битости."""
    if not insights_json:
        return None, None
    try:
        data = json.loads(insights_json)
    except ValueError:
        return None, None
    if not isinstance(data, dict):
        return None, None
    ncd = data.get("next_contact_date")
    stage = data.get("stage")
    return (
        ncd if isinstance(ncd, str) and ncd else None,
        stage if stage in _STAGES else None,
    )


@router.post("/notify-due")
async def notify_due(
    x_cron_secret: str = Header(default=""),
    db: AsyncSession = Depends(get_session),
):
    """Шлёт каждому менеджеру с привязанным Telegram список «сегодня связаться»
    (completed, next_contact_date <= сегодня UTC, кроме отказов)."""
    settings = get_settings()
    if not settings.cron_secret or x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=403, detail="Forbidden")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    managers = (
        await db.scalars(
            select(Manager).where(Manager.telegram_chat_id.is_not(None))
        )
    ).all()

    notified = 0
    total_contacts = 0
    for m in managers:
        rows = (
            await db.scalars(
                select(Checklist).where(
                    Checklist.manager_id == m.id,
                    Checklist.status == "completed",
                )
            )
        ).all()
        due = []
        for c in rows:
            ncd, stage = _due_info(c.insights_json)
            if ncd and ncd <= today and stage != "rejected":
                due.append((ncd, c.client_name))
        if not due:
            continue
        due.sort()
        lines = [f"📋 <b>Сегодня связаться</b> ({len(due)})", ""]
        for ncd, name in due[:25]:
            lines.append(f"• {name} — {ncd}")
        if await send_telegram(m.telegram_chat_id, "\n".join(lines)):
            notified += 1
            total_contacts += len(due)

    logger.info("notify_due: %d managers notified, %d contacts", notified, total_contacts)
    return {"managers_notified": notified, "contacts": total_contacts}
