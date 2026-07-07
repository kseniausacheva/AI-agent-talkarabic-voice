"""Дашборд: список чеклистов (с пагинацией и поиском) и статистика (admin)."""
import csv as _csv
import io as _io
import json
import logging
import re
import uuid as _uuid
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.questions_template import questions_for_round
from app.db import Checklist, Manager, get_session as get_db_session
from app.models.checklist import ContactInfo, DealInfo, LeadInsights
from app.services.auth import get_current_manager, require_admin

router = APIRouter(prefix="/api", tags=["checklists"])
logger = logging.getLogger(__name__)

SKIP_LABEL_MAX_LEN = 60

# Все 10 вопросов шаблона (для skips_by_question)
_ALL_QUESTIONS = [q for r in (1, 2, 3) for q in questions_for_round(r)]

_STAGES = ("new", "warm", "hot", "rejected")
_PRODUCT_TYPES = ("individual", "course", "platform", "undecided")
_OBJECTION_TYPES = ("price", "time", "tech", "trust", "other")


def _deal_fields(row: Checklist) -> dict:
    """paid / price / product из deal_json (дефолты у старых записей)."""
    fields = {"paid": False, "price": None, "product": None}
    if not getattr(row, "deal_json", None):
        return fields
    try:
        data = json.loads(row.deal_json)
    except ValueError:
        return fields
    if not isinstance(data, dict):
        return fields
    fields["paid"] = bool(data.get("paid"))
    price = data.get("price")
    if isinstance(price, (int, float)) and not isinstance(price, bool):
        fields["price"] = float(price)
    product = data.get("product")
    if product in _PRODUCT_TYPES:
        fields["product"] = product
    return fields


def _insights_fields(row: Checklist) -> dict:
    """lead_score / stage / next_contact_date из insights_json (None у старых записей)."""
    fields = {"lead_score": None, "stage": None, "next_contact_date": None}
    if not row.insights_json:
        return fields
    try:
        data = json.loads(row.insights_json)
    except ValueError:
        return fields
    if not isinstance(data, dict):
        return fields
    score = data.get("lead_score")
    if isinstance(score, int) and not isinstance(score, bool):
        fields["lead_score"] = score
    stage = data.get("stage")
    if stage in _STAGES:
        fields["stage"] = stage
    ncd = data.get("next_contact_date")
    if isinstance(ncd, str) and ncd:
        fields["next_contact_date"] = ncd
    return fields


def _contact_next_date(row: Checklist) -> Optional[str]:
    """next_contact_date из contact_json (ручной ввод менеджера имеет приоритет
    над AI-датой из insights); None если не задано."""
    raw = getattr(row, "contact_json", None)
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    ncd = data.get("next_contact_date")
    return ncd if isinstance(ncd, str) and ncd else None


def _checklist_item(checklist: Checklist, display_name: str, fields: dict) -> dict:
    deal = _deal_fields(checklist)
    return {
        "id": checklist.id,
        "client_name": checklist.client_name,
        "client_date": checklist.client_date,
        "status": checklist.status,
        "created_at": checklist.created_at,
        "completed_at": checklist.completed_at,
        "manager_name": display_name,
        "lead_score": fields["lead_score"],
        "stage": fields["stage"],
        "next_contact_date": _contact_next_date(checklist) or fields["next_contact_date"],
        "completeness": checklist.completeness,
        "paid": deal["paid"],
        "price": deal["price"],
        "product": deal["product"],
    }


@router.get("/checklists")
async def list_checklists(
    q: str = Query(default="", description="Поиск по client_name (case-insensitive)"),
    status: Optional[str] = Query(default=None, description="in_progress | completed"),
    due: Optional[str] = Query(
        default=None,
        description="today — completed-записи с next_contact_date <= сегодня (UTC), без отказов",
    ),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """Список чеклистов: manager видит только свои, admin — все."""
    # Общий пул: вся команда видит всех клиентов (совместная работа).
    stmt = select(Checklist, Manager.display_name).join(
        Manager, Checklist.manager_id == Manager.id
    )

    if due == "today":
        # «Сегодня связаться»: completed, next_contact_date <= сегодня UTC,
        # stage != rejected; сортировка по next_contact_date asc.
        # next_contact_date живёт в insights_json — фильтруем в Python
        # (объёмы данных школы небольшие).
        stmt = stmt.where(Checklist.status == "completed")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        due_rows = []
        for checklist, display_name in (await db.execute(stmt)).all():
            # оплаченные (закрытые) сделки — не напоминаем, продажа состоялась
            if _deal_fields(checklist)["paid"]:
                continue
            fields = _insights_fields(checklist)
            # ручная дата из contact_json приоритетнее AI-даты из insights
            ncd = _contact_next_date(checklist) or fields["next_contact_date"]
            fields["next_contact_date"] = ncd
            if not ncd or ncd > today or fields["stage"] == "rejected":
                continue
            due_rows.append((checklist, display_name, fields))
        due_rows.sort(key=lambda entry: entry[2]["next_contact_date"])
        total = len(due_rows)
        page_rows = due_rows[(page - 1) * per_page : (page - 1) * per_page + per_page]
        items = [_checklist_item(c, name, f) for c, name, f in page_rows]
        return {"items": items, "total": total, "page": page, "per_page": per_page}

    if status in ("in_progress", "completed"):
        stmt = stmt.where(Checklist.status == status)
    stmt = stmt.order_by(Checklist.created_at.desc())

    q_norm = q.strip().lower()
    if q_norm:
        # SQLite LIKE/lower() регистронезависимы только для ASCII —
        # для кириллицы фильтруем в Python (объёмы данных школы небольшие)
        all_rows = (await db.execute(stmt)).all()
        filtered = [
            row for row in all_rows if q_norm in row[0].client_name.lower()
        ]
        total = len(filtered)
        rows = filtered[(page - 1) * per_page : (page - 1) * per_page + per_page]
    else:
        total = (
            await db.scalar(select(func.count()).select_from(stmt.subquery()))
        ) or 0
        rows = (
            await db.execute(stmt.offset((page - 1) * per_page).limit(per_page))
        ).all()

    items = [
        _checklist_item(checklist, display_name, _insights_fields(checklist))
        for checklist, display_name in rows
    ]
    return {"items": items, "total": total, "page": page, "per_page": per_page}


def _parse_utc_date(iso_value: Optional[str]):
    """ISO 8601 строка → date в UTC (None при ошибке парсинга)."""
    if not iso_value:
        return None
    try:
        parsed = datetime.fromisoformat(iso_value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).date()


def _month_bounds(month: Optional[str]) -> tuple[date, date, str]:
    """(начало, конец-исключительно, 'YYYY-MM') для месяца. Период — с 1-го числа
    месяца по 1-е следующего. По умолчанию (или битый month) — текущий месяц UTC."""
    today = datetime.now(timezone.utc).date()
    if month and re.fullmatch(r"\d{4}-\d{2}", month):
        year, mon = int(month[:4]), int(month[5:7])
        if not 1 <= mon <= 12:
            year, mon = today.year, today.month
    else:
        year, mon = today.year, today.month
    start = date(year, mon, 1)
    end = date(year + 1, 1, 1) if mon == 12 else date(year, mon + 1, 1)
    return start, end, f"{year:04d}-{mon:02d}"


@router.get("/stats")
async def stats(
    admin: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Статистика для админа: итоги, ISO-неделя (с понедельника UTC), по менеджерам,
    по дням, плюс продажи за текущий месяц и причины отказов."""
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())  # понедельник ISO-недели
    month_start = today.replace(day=1)

    completed_rows = (
        await db.execute(
            select(
                Checklist.completed_at,
                Checklist.manager_id,
                Checklist.insights_json,
                Checklist.deal_json,
            ).where(Checklist.status == "completed")
        )
    ).all()
    total_completed = len(completed_rows)

    in_progress = (
        await db.scalar(
            select(func.count())
            .select_from(Checklist)
            .where(Checklist.status == "in_progress")
        )
    ) or 0

    manager_names = {
        m.id: m.display_name for m in (await db.scalars(select(Manager))).all()
    }

    completed_this_week = 0
    per_manager: dict = {}
    day_counts: dict = {}
    lead_scores: list = []
    stage_counts = {stage: 0 for stage in _STAGES}
    objection_counts = {t: 0 for t in _OBJECTION_TYPES}
    # Продажи: closed = оплачено в текущем месяце; pending = есть цена, не оплачено
    revenue = 0.0
    closed_count = 0
    pending_revenue = 0.0
    pending_count = 0
    product_counts = {p: 0 for p in _PRODUCT_TYPES}
    for completed_at, manager_id, insights_json, deal_json in completed_rows:
        manager_stats = per_manager.setdefault(manager_id, {"week": 0, "total": 0})
        manager_stats["total"] += 1

        insights = {}
        if insights_json:
            try:
                parsed = json.loads(insights_json)
                if isinstance(parsed, dict):
                    insights = parsed
            except ValueError:
                pass
        score = insights.get("lead_score")
        if isinstance(score, int) and not isinstance(score, bool):
            lead_scores.append(score)
        stage = insights.get("stage")
        if stage in stage_counts:
            stage_counts[stage] += 1
        for objection in insights.get("objections", []) or []:
            if isinstance(objection, dict) and objection.get("type") in objection_counts:
                objection_counts[objection["type"]] += 1

        # Сделка: выручка за месяц + воронка
        deal = {}
        if deal_json:
            try:
                parsed_deal = json.loads(deal_json)
                if isinstance(parsed_deal, dict):
                    deal = parsed_deal
            except ValueError:
                pass
        price = deal.get("price")
        has_price = isinstance(price, (int, float)) and not isinstance(price, bool) and price > 0
        if has_price:
            if deal.get("paid"):
                # дата оплаты: paid_date, иначе дата завершения чеклиста
                paid_on = _parse_utc_date(deal.get("paid_date")) or _parse_utc_date(completed_at)
                if paid_on is not None and paid_on >= month_start:
                    revenue += float(price)
                    closed_count += 1
                    product = deal.get("product")
                    if product in product_counts:
                        product_counts[product] += 1
            else:
                pending_revenue += float(price)
                pending_count += 1

        completed_date = _parse_utc_date(completed_at)
        if completed_date is None:
            continue
        if completed_date >= week_start:
            completed_this_week += 1
            manager_stats["week"] += 1
        day_counts[completed_date] = day_counts.get(completed_date, 0) + 1

    avg_lead_score = (
        round(sum(lead_scores) / len(lead_scores), 1) if lead_scores else None
    )
    sales = {
        "month": month_start.strftime("%Y-%m"),
        "closed_count": closed_count,
        "revenue": round(revenue, 2),
        "avg_check": round(revenue / closed_count, 2) if closed_count else None,
        "pending_count": pending_count,
        "pending_revenue": round(pending_revenue, 2),
        "by_product": product_counts,
    }

    # Пропуски по вопросам: skipped=true во всех answers_json (любой статус сессии).
    # Все 10 вопросов шаблона, label — первые 60 символов текста, сорт. по count desc.
    skip_counts = {question.id: 0 for question in _ALL_QUESTIONS}
    answers_rows = (await db.execute(select(Checklist.answers_json))).all()
    for (answers_json,) in answers_rows:
        try:
            answers = json.loads(answers_json or "[]")
        except ValueError:
            continue
        if not isinstance(answers, list):
            continue
        for answer in answers:
            if not isinstance(answer, dict):
                continue
            qid = answer.get("question_id")
            if answer.get("skipped") and qid in skip_counts:
                skip_counts[qid] += 1
    skips_by_question = sorted(
        (
            {
                "question_id": question.id,
                "label": question.text[:SKIP_LABEL_MAX_LEN],
                "count": skip_counts[question.id],
            }
            for question in _ALL_QUESTIONS
        ),
        key=lambda entry: -entry["count"],
    )

    by_manager = sorted(
        (
            {
                "display_name": manager_names.get(mid, f"id={mid}"),
                "week": values["week"],
                "total": values["total"],
            }
            for mid, values in per_manager.items()
        ),
        key=lambda item: (-item["week"], -item["total"]),
    )

    days = [today - timedelta(days=offset) for offset in range(13, -1, -1)]
    by_day = [
        {"date": day.isoformat(), "count": day_counts.get(day, 0)} for day in days
    ]

    return {
        "total_completed": total_completed,
        "completed_this_week": completed_this_week,
        "in_progress": in_progress,
        "by_manager": by_manager,
        "by_day": by_day,
        "skips_by_question": skips_by_question,
        "avg_lead_score": avg_lead_score,
        "stage_counts": stage_counts,
        "sales": sales,
        "objection_counts": objection_counts,
    }


@router.get("/sales")
async def sales_report(
    month: Optional[str] = Query(
        default=None, description="YYYY-MM; по умолчанию текущий месяц (UTC)"
    ),
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """Отчёт по деньгам за период (1-е число месяца → 1-е следующего):
    заработано (оплачено в периоде), закрытые сделки, средний чек, по продуктам,
    ожидающие оплаты. Общий пул — доступно любому менеджеру школы.

    available_months — месяцы, где были закрытые сделки (для селектора)."""
    start, end, ym = _month_bounds(month)
    rows = (
        await db.execute(
            select(
                Checklist.client_name,
                Checklist.completed_at,
                Checklist.deal_json,
            ).where(Checklist.status == "completed")
        )
    ).all()

    revenue = 0.0
    closed_count = 0
    pending_revenue = 0.0
    pending_count = 0
    by_product = {p: 0 for p in _PRODUCT_TYPES}
    months: set[str] = set()
    deals: list[dict] = []  # закрытые сделки периода — для разбивки комиссии

    for client_name, completed_at, deal_json in rows:
        if not deal_json:
            continue
        try:
            deal = json.loads(deal_json)
        except ValueError:
            continue
        if not isinstance(deal, dict):
            continue
        price = deal.get("price")
        has_price = (
            isinstance(price, (int, float))
            and not isinstance(price, bool)
            and price > 0
        )
        if not has_price:
            continue
        if deal.get("paid"):
            paid_on = _parse_utc_date(deal.get("paid_date")) or _parse_utc_date(
                completed_at
            )
            if paid_on is None:
                continue
            months.add(f"{paid_on.year:04d}-{paid_on.month:02d}")
            if start <= paid_on < end:
                revenue += float(price)
                closed_count += 1
                product = deal.get("product")
                if product in by_product:
                    by_product[product] += 1
                deals.append(
                    {
                        "client_name": client_name or "—",
                        "price": float(price),
                        "product": product if product in by_product else None,
                        "paid_date": paid_on.isoformat(),
                    }
                )
        else:
            pending_revenue += float(price)
            pending_count += 1

    deals.sort(key=lambda d: d["paid_date"], reverse=True)
    available_months = sorted(months | {ym}, reverse=True)
    return {
        "month": ym,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "revenue": round(revenue, 2),
        "closed_count": closed_count,
        "avg_check": round(revenue / closed_count, 2) if closed_count else None,
        "pending_count": pending_count,
        "pending_revenue": round(pending_revenue, 2),
        "by_product": by_product,
        "deals": deals,
        "available_months": available_months,
    }


# --------------------- Импорт клиентов из CSV ---------------------

_IMPORT_HEADER_MAP = {
    "client_name": ["имя", "фио", "name", "клиент", "client", "контакт", "contact"],
    "phone": ["телефон", "phone", "тел", "номер", "mobile", "моб"],
    "email": ["email", "почта", "mail", "e-mail", "эл.почта", "эл почта"],
    "channel": ["мессенджер", "канал", "channel", "messenger", "связь"],
    "note": ["заметка", "комментарий", "note", "примечание", "comment", "коммент", "описание"],
    "stage": ["стадия", "stage", "статус", "status"],
    "client_date": ["дата", "date", "создан", "created"],
    "city": ["город", "city"],
    "product": ["продукт", "product", "тариф"],
    "price": ["стоимость", "цена", "price", "сумма", "amount"],
}
_IMPORT_STAGE_WORDS = {
    "новый": "new", "new": "new", "тёплый": "warm", "теплый": "warm", "warm": "warm",
    "горячий": "hot", "hot": "hot", "отказ": "rejected", "rejected": "rejected",
}
_IMPORT_PRODUCT_WORDS = {
    "индивид": "individual", "individual": "individual", "курс": "course",
    "поток": "course", "course": "course", "платформ": "platform", "platform": "platform",
}
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")


def _import_channel(*texts: str) -> Optional[str]:
    t = " ".join(x for x in texts if x).lower()
    if any(w in t for w in ("whatsapp", "вотсап", "ватсап", "вацап", "wa ")):
        return "whatsapp"
    if any(w in t for w in ("telegram", "телеграм", " тг", "@")):
        return "telegram"
    if any(w in t for w in ("instagram", "инстаграм", "инст")):
        return "instagram"
    return None


def _import_date(s: str) -> str:
    s = (s or "").strip().split(" ")[0].split("T")[0]
    m = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})$", s)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})$", s)  # M/D/YYYY
    if m:
        return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
    m = re.match(r"(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)  # D.M.YYYY
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return ""


def _parse_import_csv(text: str):
    """CSV-текст → (записи, {заголовок: поле}). Автоопределение колонок."""
    sample = text[:4000]
    delim = ";" if sample.count(";") > sample.count(",") else ","
    reader = _csv.reader(_io.StringIO(text), delimiter=delim)
    rows = [r for r in reader if any((c or "").strip() for c in r)]
    if len(rows) < 2:
        return [], {}
    headers = rows[0]
    mapping: dict[int, str] = {}
    used: set[str] = set()
    for i, h in enumerate(headers):
        hn = (h or "").strip().lower()
        for field, kws in _IMPORT_HEADER_MAP.items():
            if field in used:
                continue
            if any(kw in hn for kw in kws):
                mapping[i] = field
                used.add(field)
                break
    out = []
    for r in rows[1:]:
        rec = {mapping[i]: (r[i].strip() if i < len(r) else "") for i in mapping}
        em = ""
        if rec.get("email"):
            mm = _EMAIL_RE.search(rec["email"])
            em = mm.group(0).lower() if mm else ""
        phone = rec.get("phone", "").strip()
        name = (
            rec.get("client_name", "").strip()
            or (em.split("@")[0] if em else "")
            or phone
            or "Клиент из импорта"
        )
        channel = _import_channel(rec.get("channel", "")) or _import_channel(
            rec.get("note", ""), rec.get("phone", "")
        )
        note = rec.get("note", "").strip()
        if rec.get("city"):
            note = (note + " · " if note else "") + "Город: " + rec["city"].strip()
        stage = _IMPORT_STAGE_WORDS.get(rec.get("stage", "").strip().lower(), "new")
        price = None
        if rec.get("price"):
            digits = re.sub(r"[^\d.]", "", rec["price"])
            try:
                price = float(digits) if digits else None
            except ValueError:
                price = None
        product = None
        pw = rec.get("product", "").strip().lower()
        for k, v in _IMPORT_PRODUCT_WORDS.items():
            if k in pw:
                product = v
                break
        out.append({
            "client_name": name, "email": em, "phone": phone, "channel": channel,
            "note": note, "stage": stage, "client_date": _import_date(rec.get("client_date", "")),
            "price": price, "product": product,
        })
    return out, {headers[i]: f for i, f in mapping.items()}


class ImportRequest(BaseModel):
    csv: str
    commit: bool = False


@router.post("/import/clients")
async def import_clients(
    payload: ImportRequest,
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Импорт клиентов из CSV (admin). commit=false → превью (разбор без записи);
    commit=true → создаёт карточки клиентов. Дедуп по email."""
    records, colmap = _parse_import_csv(payload.csv)
    if not records:
        return {
            "ok": False,
            "detail": "Не распознал строки. Нужна строка заголовков и хотя бы одна строка данных.",
            "column_mapping": colmap,
        }
    if not payload.commit:
        return {
            "ok": True,
            "preview": True,
            "total_rows": len(records),
            "column_mapping": colmap,
            "sample": records[:8],
        }

    existing: set[str] = set()
    res = await db.execute(
        select(Checklist.contact_json).where(Checklist.contact_json.isnot(None))
    )
    for (cj,) in res.all():
        try:
            e = (json.loads(cj).get("email") or "").lower().strip()
            if e:
                existing.add(e)
        except Exception:
            pass

    now = datetime.now(timezone.utc).isoformat()
    created = 0
    skipped = 0
    for rec in records:
        em = rec["email"]
        if em and em in existing:
            skipped += 1
            continue
        ci = ContactInfo(
            phone=rec["phone"], channel=rec["channel"], email=em,
            note=rec["note"], next_contact_date=None, next_contact_plan="",
        )
        li = LeadInsights(stage=rec["stage"])
        deal = None
        if rec["price"] is not None or rec["product"]:
            deal = DealInfo(product=rec["product"], price=rec["price"])
        cdate = rec["client_date"] or now[:10]
        name = rec["client_name"]
        md = (
            "# Импортированный клиент\n\n"
            f"- **Клиент:** {name}\n- **Дата:** {cdate}\n\n"
            "_Загружено через импорт CSV._\n"
        )
        db.add(Checklist(
            id=_uuid.uuid4().hex[:12], manager_id=manager.id, client_name=name,
            client_date=cdate, status="completed", created_at=now, completed_at=now,
            answers_json="[]", summaries_json="[]", checklist_json="[]", markdown=md,
            insights_json=li.model_dump_json(),
            deal_json=(deal.model_dump_json() if deal else None),
            contact_json=ci.model_dump_json(),
        ))
        if em:
            existing.add(em)
        created += 1
    await db.commit()
    return {"ok": True, "created": created, "skipped": skipped, "total_rows": len(records)}
