"""Дашборд: список чеклистов (с пагинацией и поиском) и статистика (admin)."""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.questions_template import questions_for_round
from app.db import Checklist, Manager, get_session as get_db_session
from app.services.auth import get_current_manager, require_admin

router = APIRouter(prefix="/api", tags=["checklists"])
logger = logging.getLogger(__name__)

SKIP_LABEL_MAX_LEN = 60

# Все 10 вопросов шаблона (для skips_by_question)
_ALL_QUESTIONS = [q for r in (1, 2, 3) for q in questions_for_round(r)]

_STAGES = ("new", "warm", "hot", "rejected")
_PRODUCT_TYPES = ("individual", "course", "undecided")
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
        "next_contact_date": fields["next_contact_date"],
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
    stmt = select(Checklist, Manager.display_name).join(
        Manager, Checklist.manager_id == Manager.id
    )
    if manager.role != "admin":
        stmt = stmt.where(Checklist.manager_id == manager.id)

    if due == "today":
        # «Сегодня связаться»: completed, next_contact_date <= сегодня UTC,
        # stage != rejected; сортировка по next_contact_date asc.
        # next_contact_date живёт в insights_json — фильтруем в Python
        # (объёмы данных школы небольшие).
        stmt = stmt.where(Checklist.status == "completed")
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        due_rows = []
        for checklist, display_name in (await db.execute(stmt)).all():
            fields = _insights_fields(checklist)
            ncd = fields["next_contact_date"]
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
