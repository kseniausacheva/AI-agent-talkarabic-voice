"""Fire-and-forget синхронизация завершённых чеклистов в Google Sheets.

POST JSON на вебхук Apps Script (env GSHEETS_WEBHOOK_URL; пусто ⇒ выключено).
Ошибки только логируются — ответ пользователю НЕ ломают. При HTTP 200
выставляем sheet_synced=1. Инструкция по настройке: docs/GSHEETS_SETUP.md.
"""
import json
import logging

import httpx

from app.config import get_settings
from app.db import Checklist, Manager, get_session_factory

logger = logging.getLogger(__name__)

SUMMARY_MAX_LEN = 500
REQUEST_TIMEOUT = 10.0


async def sync_checklist_to_sheets(session_id: str) -> None:
    """Отправляет завершённый чеклист в Google Sheets. Вызывать через asyncio.create_task."""
    settings = get_settings()
    url = settings.gsheets_webhook_url
    if not url:
        return
    try:
        factory = get_session_factory()
        async with factory() as db:
            row = await db.get(Checklist, session_id)
            if row is None or row.status != "completed":
                logger.warning("GSheets sync: чеклист %s не найден/не завершён", session_id)
                return
            if row.sheet_synced:
                logger.info("GSheets sync: %s уже синхронизирован, пропуск", session_id)
                return
            manager = await db.get(Manager, row.manager_id)
            summaries = json.loads(row.summaries_json or "[]")
            summary = " · ".join(summaries)[:SUMMARY_MAX_LEN]

            payload = {
                "secret": settings.gsheets_secret,
                "date": row.client_date,
                "client_name": row.client_name,
                "manager": manager.display_name if manager else "",
                "summary": summary,
                "session_id": row.id,
            }

            # Apps Script отвечает редиректом — follow_redirects обязателен
            async with httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT, follow_redirects=True
            ) as client:
                response = await client.post(url, json=payload)

            if response.status_code == 200:
                row.sheet_synced = 1
                await db.commit()
                logger.info("GSheets sync OK: %s", session_id)
            else:
                logger.warning(
                    "GSheets sync failed for %s: HTTP %d %s",
                    session_id,
                    response.status_code,
                    response.text[:200],
                )
    except Exception as exc:
        logger.warning("GSheets sync error for %s: %s", session_id, exc)
