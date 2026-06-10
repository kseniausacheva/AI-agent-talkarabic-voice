"""Дашборд: список чеклистов (с пагинацией и поиском) и статистика (admin)."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Checklist, Manager, get_session as get_db_session
from app.services.auth import get_current_manager, require_admin

router = APIRouter(prefix="/api", tags=["checklists"])
logger = logging.getLogger(__name__)


@router.get("/checklists")
async def list_checklists(
    q: str = Query(default="", description="Поиск по client_name (case-insensitive)"),
    status: Optional[str] = Query(default=None, description="in_progress | completed"),
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
        {
            "id": checklist.id,
            "client_name": checklist.client_name,
            "client_date": checklist.client_date,
            "status": checklist.status,
            "created_at": checklist.created_at,
            "completed_at": checklist.completed_at,
            "manager_name": display_name,
        }
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
    """Статистика для админа: итоги, ISO-неделя (с понедельника UTC), по менеджерам, по дням."""
    today = datetime.now(timezone.utc).date()
    week_start = today - timedelta(days=today.weekday())  # понедельник ISO-недели

    completed_rows = (
        await db.execute(
            select(Checklist.completed_at, Checklist.manager_id).where(
                Checklist.status == "completed"
            )
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
    for completed_at, manager_id in completed_rows:
        manager_stats = per_manager.setdefault(manager_id, {"week": 0, "total": 0})
        manager_stats["total"] += 1
        completed_date = _parse_utc_date(completed_at)
        if completed_date is None:
            continue
        if completed_date >= week_start:
            completed_this_week += 1
            manager_stats["week"] += 1
        day_counts[completed_date] = day_counts.get(completed_date, 0) + 1

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
    }
