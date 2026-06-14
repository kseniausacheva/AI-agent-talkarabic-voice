"""Детерминированный тест бэкенда сделок (без LLM, без сервера).

Поднимает временную SQLite, прогоняет миграцию (deal_json), сеет записи и проверяет:
- список чеклистов отдаёт paid/price/product;
- /stats считает продажи за месяц (closed/revenue/avg/pending/by_product) и objection_counts;
- session_manager.update_deal: paid=true ставит дату и пересобирает markdown.

Usage (из backend/):
    .venv/Scripts/python -m scripts.test_deal_flow
"""
import asyncio
import json
import os
import sys
import tempfile
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

# Временная БД ДО импорта config/db (DATABASE_PATH читается в settings)
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DATABASE_PATH"] = _tmp.name
os.environ.setdefault("OPENROUTER_API_KEY", "test-not-used")

from datetime import datetime, timezone  # noqa: E402

from app.db import Checklist, Manager, get_session_factory, init_db  # noqa: E402
from app.routers.checklists import stats, list_checklists  # noqa: E402
from app.services.session_manager import get_session_manager  # noqa: E402


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


async def main() -> int:
    await init_db()
    factory = get_session_factory()
    month = datetime.now(timezone.utc).strftime("%Y-%m")

    async with factory() as db:
        admin = Manager(username="admin", password_hash="x", display_name="Админ",
                        role="admin", created_at=_now_iso())
        db.add(admin)
        await db.commit()

        # closed: оплачено в этом месяце, курс, 35000
        db.add(Checklist(
            id="c1", manager_id=admin.id, client_name="Анна", client_date=_today(),
            status="completed", created_at=_now_iso(), completed_at=_now_iso(),
            checklist_json="[]", insights_json=json.dumps({"stage": "hot", "objections": [{"type": "price"}]}),
            deal_json=json.dumps({"product": "course", "price": 35000, "paid": True, "paid_date": _today()}),
        ))
        # pending: цена есть, не оплачено
        db.add(Checklist(
            id="c2", manager_id=admin.id, client_name="Омар", client_date=_today(),
            status="completed", created_at=_now_iso(), completed_at=_now_iso(),
            checklist_json=json.dumps([{"category": "Бюджет", "item": "до 20000", "status": "needs_clarification"}]),
            insights_json=json.dumps({"stage": "warm", "objections": [{"type": "time"}, {"type": "price"}]}),
            deal_json=json.dumps({"product": "individual", "price": 20000, "paid": False}),
        ))
        # без сделки (старая запись)
        db.add(Checklist(
            id="c3", manager_id=admin.id, client_name="Фатима", client_date=_today(),
            status="completed", created_at=_now_iso(), completed_at=_now_iso(),
            checklist_json="[]", insights_json=None, deal_json=None,
        ))
        await db.commit()

    # --- list_checklists отдаёт поля сделки ---
    async with factory() as db:
        res = await list_checklists(q="", status=None, due=None, page=1, per_page=20,
                                    manager=admin, db=db)
    by_id = {i["id"]: i for i in res["items"]}
    assert by_id["c1"]["paid"] is True and by_id["c1"]["price"] == 35000.0
    assert by_id["c1"]["product"] == "course"
    assert by_id["c2"]["paid"] is False and by_id["c2"]["price"] == 20000.0
    assert by_id["c3"]["price"] is None and by_id["c3"]["paid"] is False
    print("OK list_checklists: поля сделки на месте (c1 оплачено/курс, c2 pending, c3 пусто)")

    # --- /stats: продажи за месяц ---
    async with factory() as db:
        s = await stats(admin=admin, db=db)
    sales = s["sales"]
    assert sales["month"] == month, sales
    assert sales["closed_count"] == 1 and sales["revenue"] == 35000.0, sales
    assert sales["avg_check"] == 35000.0, sales
    assert sales["pending_count"] == 1 and sales["pending_revenue"] == 20000.0, sales
    assert sales["by_product"]["course"] == 1, sales
    assert s["objection_counts"]["price"] == 2 and s["objection_counts"]["time"] == 1, s["objection_counts"]
    print(f"OK /stats sales: closed={sales['closed_count']} revenue={sales['revenue']} "
          f"avg={sales['avg_check']} pending={sales['pending_count']}/{sales['pending_revenue']} "
          f"objections(price)={s['objection_counts']['price']}")

    # --- update_deal: отметить оплату ---
    sm = get_session_manager()
    async with factory() as db:
        deal = await sm.update_deal(db, "c2", admin, {"paid": True})
    assert deal.paid is True and deal.paid_date == _today(), deal
    async with factory() as db:
        row = await db.get(Checklist, "c2")
        assert "сделка закрыта" in (row.markdown or ""), "markdown не пересобрался"
    print(f"OK update_deal: c2 → оплачено {deal.paid_date}, markdown пересобран")

    # после оплаты c2 — в этом месяце уже 2 закрытые сделки на 55000
    async with factory() as db:
        s2 = await stats(admin=admin, db=db)
    assert s2["sales"]["closed_count"] == 2 and s2["sales"]["revenue"] == 55000.0, s2["sales"]
    assert s2["sales"]["by_product"] == {"individual": 1, "course": 1, "undecided": 0}, s2["sales"]["by_product"]
    print(f"OK после оплаты: closed={s2['sales']['closed_count']} revenue={s2['sales']['revenue']} "
          f"by_product={s2['sales']['by_product']}")

    print("\nВСЁ ОК — миграция, агрегация продаж и ручная оплата работают.")
    return 0


if __name__ == "__main__":
    try:
        code = asyncio.run(main())
    finally:
        try:
            os.unlink(_tmp.name)
        except OSError:
            pass
    sys.exit(code)
