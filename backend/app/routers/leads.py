"""Приём заявок извне: директ инстаграма (через BotHelp), формы, что угодно.

Внешний сервис шлёт POST /api/leads/inbound с заголовком X-Lead-Secret —
и заявка сразу становится карточкой клиента в воронке, стадия «новый».
Секрет задаётся в env LEADS_SECRET; пусто — приём выключен (403).

Почему отдельный вход, а не логин менеджера: у BotHelp нет наших паролей,
а раздавать им учётку менеджера нельзя. Секрет можно сменить в любой момент,
не трогая людей.
"""
import json
import logging
import re
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import Checklist, Manager, get_session as get_db_session
from app.models.checklist import ContactInfo, LeadInsights

router = APIRouter(prefix="/api/leads", tags=["leads"])
logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


class InboundLead(BaseModel):
    """Поля необязательные: у разных источников приходит разное."""

    name: str = ""
    username: str = ""        # ник в инстаграме/телеграме
    phone: str = ""
    email: str = ""
    text: str = ""            # что человек написал
    source: str = "Instagram"  # откуда пришёл


# Как называют одно и то же разные сервисы. BotHelp шлёт свой формат и НЕ даёт
# ни задать заголовок, ни собрать тело — поэтому разбираем что пришло.
_FIELD_ALIASES = {
    "name": ("name", "full_name", "fullname", "client_name", "title"),
    "first": ("first_name", "firstname", "first"),
    "last": ("last_name", "lastname", "last"),
    "username": ("username", "user_name", "nickname", "nick", "login", "instagram"),
    "phone": ("phone", "telephone", "tel", "mobile", "whatsapp"),
    "email": ("email", "e_mail", "mail"),
    "text": ("text", "message", "last_message", "message_text", "comment", "question"),
    "source": ("source", "channel", "platform", "messenger", "utm_source"),
}


def _flatten(data, out: dict, depth: int = 0) -> None:
    """Собрать все скалярные поля из вложенного JSON в один плоский словарь."""
    if depth > 4 or not isinstance(data, (dict, list)):
        return
    items = data.items() if isinstance(data, dict) else enumerate(data)
    for key, value in items:
        if isinstance(value, (dict, list)):
            _flatten(value, out, depth + 1)
        elif value not in (None, "") and isinstance(key, str):
            out.setdefault(key.strip().lower(), str(value))


def _pick(flat: dict, kind: str) -> str:
    for alias in _FIELD_ALIASES[kind]:
        if flat.get(alias):
            return flat[alias]
    return ""


def _lead_from_any(raw: dict) -> InboundLead:
    """Чужой JSON → наша заявка. Незнакомые поля просто игнорируем."""
    flat: dict = {}
    _flatten(raw, flat)
    name = _pick(flat, "name")
    if not name:
        name = " ".join(x for x in (_pick(flat, "first"), _pick(flat, "last")) if x).strip()
    return InboundLead(
        name=name,
        username=_pick(flat, "username"),
        phone=_pick(flat, "phone"),
        email=_pick(flat, "email"),
        text=_pick(flat, "text"),
        source=_pick(flat, "source") or "Instagram",
    )


def _norm_username(value: str) -> str:
    return value.strip().lstrip("@").lower()


def _contact_keys(contact_json: Optional[str]) -> set[str]:
    """Ключи, по которым узнаём того же человека: email, телефон, ник."""
    if not contact_json:
        return set()
    try:
        data = json.loads(contact_json)
    except ValueError:
        return set()
    keys = set()
    email = (data.get("email") or "").strip().lower()
    if email:
        keys.add("email:" + email)
    phone = re.sub(r"\D", "", data.get("phone") or "")
    if len(phone) >= 10:
        keys.add("phone:" + phone[-10:])
    note = data.get("note") or ""
    for found in re.findall(r"@([A-Za-z0-9._]+)", note):
        keys.add("user:" + found.lower())
    return keys


@router.get("/inbound")
async def inbound_check(key: str = Query(default=""), x_lead_secret: str = Header(default="")):
    """Проверка адреса: сервисы часто дёргают ссылку обычным открытием."""
    settings = get_settings()
    if not settings.leads_secret:
        raise HTTPException(status_code=403, detail="Приём заявок выключен.")
    if settings.leads_secret not in (x_lead_secret, key):
        raise HTTPException(status_code=403, detail="Неверный секрет.")
    return {"ok": True, "ready": True, "hint": "Шли сюда POST с JSON — заявка попадёт в воронку."}


@router.post("/inbound")
async def inbound_lead(
    request: Request,
    key: str = Query(default=""),
    x_lead_secret: str = Header(default=""),
    db: AsyncSession = Depends(get_db_session),
):
    """Заявка снаружи → карточка клиента в воронке (стадия «новый»).

    Секрет принимаем и заголовком, и параметром ссылки (?key=…): у BotHelp в
    настройках есть только поле адреса, заголовок туда не вписать.

    Тело разбираем свободно — сервисы шлют поля как хотят. Повторная заявка от
    того же человека новую карточку НЕ создаёт: иначе после каждого сообщения
    в директ воронка забивалась бы дублями.
    """
    settings = get_settings()
    if not settings.leads_secret:
        raise HTTPException(
            status_code=403,
            detail="Приём заявок выключен: не задан LEADS_SECRET.",
        )
    if settings.leads_secret not in (x_lead_secret, key):
        logger.warning("Заявка с неверным секретом от %s", request.client.host if request.client else "?")
        raise HTTPException(status_code=403, detail="Неверный секрет.")

    try:
        raw = await request.json()
    except Exception:
        raw = None
    if not isinstance(raw, dict):
        # BotHelp и подобные проверяют адрес пустым запросом перед сохранением:
        # ответим спокойно, иначе они посчитают адрес нерабочим и не сохранят.
        logger.info("Проверочный запрос без данных — отвечаем ok")
        return {"ok": True, "created": False, "skipped": "проверочный запрос"}

    # Пока настраиваем связку — пишем что пришло, чтобы разобрать поля источника
    logger.info("Входящая заявка, сырое тело: %s", json.dumps(raw, ensure_ascii=False)[:800])
    payload = _lead_from_any(raw)
    if not any((payload.name.strip(), payload.username.strip(),
                payload.phone.strip(), payload.email.strip())):
        logger.info("Событие без контактов — карточку не создаём")
        return {"ok": True, "created": False, "skipped": "нет ни имени, ни контактов"}

    username = _norm_username(payload.username)
    email = payload.email.strip().lower()
    if email and not _EMAIL_RE.match(email):
        email = ""
    phone_digits = re.sub(r"\D", "", payload.phone)

    name = payload.name.strip() or (f"@{username}" if username else "") or "Заявка без имени"

    incoming = set()
    if email:
        incoming.add("email:" + email)
    if len(phone_digits) >= 10:
        incoming.add("phone:" + phone_digits[-10:])
    if username:
        incoming.add("user:" + username)

    if incoming:
        rows = (
            await db.execute(
                select(Checklist.id, Checklist.contact_json).where(
                    Checklist.contact_json.isnot(None)
                )
            )
        ).all()
        for row_id, cj in rows:
            if _contact_keys(cj) & incoming:
                logger.info("Заявка от %s уже есть — карточка %s", name, row_id)
                return {"ok": True, "created": False, "id": row_id, "duplicate": True}

    owner = (
        await db.execute(select(Manager).where(Manager.role == "admin").order_by(Manager.id))
    ).scalars().first()
    if owner is None:
        raise HTTPException(status_code=500, detail="Некому назначить заявку: нет админа.")

    now = datetime.now(timezone.utc).isoformat()
    note_bits = []
    if username:
        note_bits.append(f"@{username}")
    if payload.text.strip():
        note_bits.append(payload.text.strip()[:500])
    contact = ContactInfo(
        phone=payload.phone.strip(), channel=payload.source.strip() or "Instagram",
        email=email, note=" · ".join(note_bits),
        next_contact_date=None, next_contact_plan="Ответить на заявку",
    )
    markdown = (
        f"# Заявка из {payload.source.strip() or 'Instagram'}\n\n"
        f"- **Клиент:** {name}\n"
        + (f"- **Ник:** @{username}\n" if username else "")
        + f"- **Дата:** {now[:10]}\n\n"
        + (f"**Написал(а):**\n\n> {payload.text.strip()}\n" if payload.text.strip() else "")
    )
    card_id = _uuid.uuid4().hex[:12]
    db.add(Checklist(
        id=card_id, manager_id=owner.id, client_name=name, client_date=now[:10],
        status="completed", created_at=now, completed_at=now,
        answers_json="[]", summaries_json="[]", checklist_json="[]", markdown=markdown,
        insights_json=LeadInsights(stage="new").model_dump_json(),
        deal_json=None, contact_json=contact.model_dump_json(),
    ))
    await db.commit()
    logger.info("Новая заявка из %s: %s → карточка %s", payload.source, name, card_id)
    return {"ok": True, "created": True, "id": card_id}
