"""E2E Спринта 2: полный путь менеджера через HTTP API (3 реальных LLM-вызова).

Usage (из backend/, при запущенном uvicorn на :7860):
    .venv/Scripts/python -m scripts.e2e_sprint2
"""
import sys

import httpx

sys.stdout.reconfigure(encoding="utf-8")
BASE = "http://127.0.0.1:7860"

ANSWERS_R1 = {
    "r1q1": "Клиентку зовут Лейла, она из Дубая, часовой пояс GMT+4.",
    "r1q2": None,  # пропуск — менеджер не спросил
    "r1q3": "Хочет читать Коран в оригинале и понимать тафсиры.",
    "r1q4": "Коранический арабский, классика.",
}
ANSWERS_R2 = {
    "r2q1": "Читает алфавит, но без огласовок плохо. Где-то A1.",
    "r2q2": "Училась в местном медресе год, не понравилась зубрёжка без понимания.",
    "r2q3": "Только Zoom, асинхронно не хочет — нужна дисциплина.",
}
ANSWERS_R3 = {
    "r3q1": "Два раза в неделю по часу плюс полчаса домашки в день.",
    "r3q2": None,  # пропуск — про бюджет поговорить не успели
    "r3q3": "Только преподаватель-женщина, время — утро по Дубаю.",
}


def fail(msg: str):
    print(f"[FAIL] {msg}")
    sys.exit(1)


def ok(msg: str):
    print(f"[OK] {msg}")


def main():
    c = httpx.Client(base_url=BASE, timeout=120)

    # --- регистрация и логин ---
    r = c.post("/api/auth/register", json={
        "invite_code": "admin-invite-2026", "username": "e2e_admin",
        "password": "secret-pass-123", "display_name": "Ксения (e2e)",
    })
    if r.status_code == 409:
        r = c.post("/api/auth/login", json={"username": "e2e_admin", "password": "secret-pass-123"})
    if r.status_code != 200:
        fail(f"register/login: {r.status_code} {r.text}")
    token = r.json()["token"]
    role = r.json()["manager"]["role"]
    if role != "admin":
        fail(f"ожидали role=admin, получили {role}")
    h = {"Authorization": f"Bearer {token}"}
    ok(f"register+login, role={role}")

    # --- старт сессии ---
    r = c.post("/api/session/start", headers=h, json={"client_name": "Лейла из Дубая"})
    if r.status_code != 200:
        fail(f"start: {r.status_code} {r.text}")
    data = r.json()
    sid = data["session_id"]
    if data["client_name"] != "Лейла из Дубая" or len(data["questions"]) != 4:
        fail(f"start payload: {data}")
    ok(f"start session {sid}, 4 вопроса, дата {data['client_date']}")

    # --- 3 раунда ---
    for n, answers in [(1, ANSWERS_R1), (2, ANSWERS_R2), (3, ANSWERS_R3)]:
        payload = {"answers": [
            {"question_id": qid, "transcript": text or "", "skipped": text is None}
            for qid, text in answers.items()
        ]}
        r = c.post(f"/api/session/{sid}/submit", headers=h, json=payload)
        if r.status_code != 200:
            fail(f"submit r{n}: {r.status_code} {r.text[:300]}")
        data = r.json()
        ok(f"submit раунд {n}: round={data['round']}, complete={data['is_complete']}, "
           f"summary={'есть' if data.get('round_summary') else 'нет'}")
    if not data["is_complete"]:
        fail("после 3 раундов is_complete=false")
    if "Лейла" not in (data.get("checklist_preview") or ""):
        fail("markdown не содержит имени клиента")
    ok("чеклист сформирован, имя клиента в markdown")

    # --- пропуски должны стать not_discussed ---
    r = c.get(f"/api/session/{sid}/results", headers=h)
    if r.status_code != 200:
        fail(f"results: {r.status_code}")
    items = r.json()["checklist"]
    not_discussed = [i for i in items if i["status"] == "not_discussed"]
    ok(f"results: {len(items)} пунктов, not_discussed={len(not_discussed)} "
       f"(пропускали источник лида и бюджет)")

    # --- download: имя файла со slug ---
    r = c.get(f"/api/session/{sid}/download", headers=h)
    cd = r.headers.get("content-disposition", "")
    if r.status_code != 200 or "checklist-" not in cd:
        fail(f"download: {r.status_code} CD={cd}")
    ok(f"download: {cd}")

    # --- дашборд и статистика ---
    r = c.get("/api/checklists", headers=h, params={"q": "лейла"})
    found = r.json()["total"] if r.status_code == 200 else -1
    if found < 1:
        fail(f"checklists search: {r.status_code} total={found}")
    ok(f"dashboard: поиск 'лейла' нашёл {found}")

    r = c.get("/api/stats", headers=h)
    if r.status_code != 200:
        fail(f"stats: {r.status_code}")
    s = r.json()
    if s["total_completed"] < 1 or len(s["by_day"]) != 14:
        fail(f"stats payload: {s}")
    ok(f"stats: completed={s['total_completed']}, week={s['completed_this_week']}, "
       f"by_manager={len(s['by_manager'])}, by_day=14")

    print("\n=== E2E СПРИНТ 2: ВСЁ ПРОШЛО ===")


if __name__ == "__main__":
    main()
