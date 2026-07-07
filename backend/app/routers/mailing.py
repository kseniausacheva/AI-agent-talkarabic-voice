"""Email-рассылки через Brevo: подписчики, отправка выпуска, отписка.

Отправка — транзакционным API Brevo (/v3/smtp/email) по одному письму на адрес,
чтобы у каждого была персональная ссылка отписки. Полный выпуск идёт в фоне
(asyncio), тест-письмо — синхронно. Ключ/отправитель — из env (BREVO_*).
"""
import asyncio
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import Manager, Subscriber, get_session as get_db_session
from app.services.auth import require_admin

router = APIRouter(prefix="/api", tags=["mailing"])
logger = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _build_html(text: str, unsub_url: str) -> str:
    body = (text or "").strip().replace("\n", "<br>")
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;'
        'color:#092127;line-height:1.6;max-width:560px;margin:0 auto">'
        f"{body}"
        '<hr style="margin:28px 0 12px;border:none;border-top:1px solid #eee">'
        '<p style="font-size:12px;color:#98a2a6">'
        "Вы получили это письмо как ученик Школы арабского. "
        f'<a href="{unsub_url}" style="color:#43abd0">Отписаться</a></p></div>'
    )


async def _send_one(
    client: httpx.AsyncClient, api_key: str, sender: dict,
    subject: str, html: str, to_email: str, to_name: str,
) -> tuple[int, str]:
    to = {"email": to_email}
    if to_name:
        to["name"] = to_name
    resp = await client.post(
        BREVO_URL,
        headers={"api-key": api_key, "content-type": "application/json",
                 "accept": "application/json"},
        json={"sender": sender, "to": [to], "subject": subject, "htmlContent": html},
    )
    return resp.status_code, resp.text


async def _send_bulk(subject: str, text: str, recipients: List[tuple]) -> None:
    """Фоновая отправка выпуска. recipients: [(email, name, unsub_token)]."""
    s = get_settings()
    sender = {"email": s.brevo_sender_email, "name": s.brevo_sender_name}
    sent = failed = 0
    async with httpx.AsyncClient(timeout=30) as client:
        for email, name, token in recipients:
            unsub = f"{s.public_api_url.rstrip('/')}/api/unsubscribe/{token}"
            try:
                code, body = await _send_one(
                    client, s.brevo_api_key, sender, subject,
                    _build_html(text, unsub), email, name,
                )
                if code < 300:
                    sent += 1
                else:
                    failed += 1
                    logger.warning("Brevo %s для %s: %s", code, email, body[:150])
            except Exception as exc:
                failed += 1
                logger.warning("Ошибка отправки %s: %s", email, exc)
            await asyncio.sleep(0.2)  # мягкий rate-limit
    logger.info("Выпуск разослан: отправлено=%d, ошибок=%d", sent, failed)


# ------------------------------ Подписчики ------------------------------

class SubscriberIn(BaseModel):
    email: str
    name: str = ""
    group: str = ""


class ImportSubsRequest(BaseModel):
    items: List[SubscriberIn]


@router.post("/subscribers/import")
async def import_subscribers(
    payload: ImportSubsRequest,
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Массовое добавление подписчиков (admin). Дедуп по email."""
    added = updated = 0
    for it in payload.items:
        email = (it.email or "").strip().lower()
        if not _EMAIL_RE.match(email):
            continue
        row = (
            await db.execute(select(Subscriber).where(Subscriber.email == email))
        ).scalar_one_or_none()
        if row:
            if it.group and not row.group_tag:
                row.group_tag = it.group
            if it.name and not row.name:
                row.name = it.name
            updated += 1
        else:
            db.add(Subscriber(
                email=email, name=it.name or "", group_tag=it.group or "",
                unsubscribed=0, unsub_token=uuid.uuid4().hex, created_at=_now(),
            ))
            added += 1
    await db.commit()
    total = (await db.execute(select(func.count()).select_from(Subscriber))).scalar_one()
    return {"ok": True, "added": added, "updated": updated, "total": total}


@router.get("/subscribers")
async def list_subscribers(
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Сводка по базе рассылки: всего, отписалось, по группам (активные)."""
    total = (await db.execute(select(func.count()).select_from(Subscriber))).scalar_one()
    unsub = (
        await db.execute(
            select(func.count()).select_from(Subscriber).where(Subscriber.unsubscribed == 1)
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(Subscriber.group_tag, func.count())
            .where(Subscriber.unsubscribed == 0)
            .group_by(Subscriber.group_tag)
        )
    ).all()
    groups = [{"group": g or "Без группы", "count": c} for g, c in rows]
    groups.sort(key=lambda x: x["count"], reverse=True)
    settings = get_settings()
    return {
        "total": total,
        "unsubscribed": unsub,
        "groups": groups,
        "configured": bool(settings.brevo_api_key and settings.brevo_sender_email),
        "sender": settings.brevo_sender_email or None,
    }


@router.get("/subscribers/list")
async def subscribers_list(
    q: str = Query(default=""),
    group: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=30, ge=1, le=200),
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Постраничный список подписчиков (admin): email, имя, группа, статус."""
    stmt = select(Subscriber)
    if group:
        stmt = stmt.where(Subscriber.group_tag == group)
    rows = (
        await db.execute(stmt.order_by(Subscriber.group_tag, Subscriber.email))
    ).scalars().all()
    qn = q.strip().lower()
    if qn:
        rows = [
            r for r in rows
            if qn in r.email.lower() or qn in (r.name or "").lower()
        ]
    total = len(rows)
    start = (page - 1) * per_page
    page_rows = rows[start : start + per_page]
    items = [
        {
            "id": r.id,
            "email": r.email,
            "name": r.name,
            "group": r.group_tag or "",
            "unsubscribed": bool(r.unsubscribed),
        }
        for r in page_rows
    ]
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.delete("/subscribers/{sub_id}")
async def delete_subscriber(
    sub_id: int = Path(...),
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Удалить подписчика из базы рассылки (admin)."""
    row = await db.get(Subscriber, sub_id)
    if row:
        await db.delete(row)
        await db.commit()
    return {"ok": True}


# ------------------------------ Выпуск ------------------------------

class BroadcastRequest(BaseModel):
    subject: str
    text: str
    group: Optional[str] = None
    test_email: Optional[str] = None


@router.post("/broadcast")
async def broadcast(
    payload: BroadcastRequest,
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Отправка выпуска. test_email → одно тест-письмо (синхронно). Иначе —
    фоновая рассылка по группе (или всем активным). Ссылка отписки добавляется."""
    s = get_settings()
    if not s.brevo_api_key or not s.brevo_sender_email:
        raise HTTPException(
            status_code=400,
            detail="Рассылка не настроена: добавь BREVO_API_KEY и BREVO_SENDER_EMAIL в env и сделай Redeploy.",
        )
    if not payload.subject.strip() or not payload.text.strip():
        raise HTTPException(status_code=400, detail="Заполни тему и текст письма.")

    sender = {"email": s.brevo_sender_email, "name": s.brevo_sender_name}

    if payload.test_email:
        test_to = payload.test_email.strip().lower()
        if not _EMAIL_RE.match(test_to):
            raise HTTPException(status_code=400, detail="Неверный тестовый email.")
        unsub = f"{s.public_api_url.rstrip('/')}/api/unsubscribe/test"
        async with httpx.AsyncClient(timeout=30) as client:
            code, body = await _send_one(
                client, s.brevo_api_key, sender, payload.subject,
                _build_html(payload.text, unsub), test_to, "",
            )
        if code >= 300:
            raise HTTPException(status_code=502, detail=f"Brevo вернул {code}: {body[:200]}")
        return {"ok": True, "test": True, "sent": 1}

    q = select(Subscriber).where(Subscriber.unsubscribed == 0)
    if payload.group:
        q = q.where(Subscriber.group_tag == payload.group)
    subs = (await db.execute(q)).scalars().all()
    recipients = [(x.email, x.name, x.unsub_token) for x in subs]
    if not recipients:
        raise HTTPException(status_code=400, detail="Нет активных получателей в этой группе.")

    asyncio.create_task(_send_bulk(payload.subject, payload.text, recipients))
    return {"ok": True, "queued": len(recipients)}


@router.get("/unsubscribe/{token}", response_class=HTMLResponse)
async def unsubscribe(
    token: str = Path(...),
    db: AsyncSession = Depends(get_db_session),
):
    """Публичная отписка по токену (без авторизации)."""
    row = (
        await db.execute(select(Subscriber).where(Subscriber.unsub_token == token))
    ).scalar_one_or_none()
    if row and not row.unsubscribed:
        row.unsubscribed = 1
        await db.commit()
    return HTMLResponse(
        "<!doctype html><html lang='ru'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Отписка</title></head>"
        "<body style='font-family:Arial,sans-serif;text-align:center;padding:64px 20px;color:#092127'>"
        "<h2>Вы отписались от рассылки</h2>"
        "<p style='color:#667'>Больше писем не придёт. Спасибо, что были с нами! 🌿</p>"
        "<p style='color:#98a2a6;font-size:13px'>Школа арабского Talkarabic</p>"
        "</body></html>"
    )
