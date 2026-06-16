"""Сравнение моделей на нашей задаче (анализ переписки → JSON-чеклист).

Гоняет один и тот же диалог через несколько моделей OpenRouter, меряет время,
токены, парсится ли JSON и что извлеклось. Помогает выбрать модель для прода
(меняется одной env OPENROUTER_MODEL).

Usage (из backend/):
    .venv/Scripts/python -m scripts.compare_models
"""
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

from app.agent import prompts  # noqa: E402

MODELS = [
    "minimax/minimax-m3",          # текущая (baseline)
    "openai/gpt-4o-mini",          # быстрая+дешёвая
    "openai/gpt-4o",               # сильнее
    "google/gemini-2.5-flash",     # быстрая
    "anthropic/claude-3.5-sonnet", # сильная
]

CONVERSATION = """Клиент: Здравствуйте, увидела вашу рекламу в инстаграме, хочу учить арабский
Менеджер: Здравствуйте! Как вас зовут и откуда вы?
Клиент: Марина, из Москвы. Хочу читать Коран в оригинале
Менеджер: Какой у вас уровень сейчас?
Клиент: Совсем нулевой, знаю только алфавит немного
Менеджер: Готовы заниматься в Zoom вечером?
Клиент: Да, после семи. А сколько стоит?
Менеджер: Индивидуально 20000 рублей в месяц
Клиент: Мне индивидуально, в группу не хочу. Оплачу на следующей неделе, можно в рассрочку?"""


def first_json(raw: str):
    s = raw.strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s[:4].lower() == "json":
            s = s[4:]
    s = s[s.find("{"):]
    obj, _ = json.JSONDecoder().raw_decode(s)
    return obj


def main() -> int:
    client = OpenAI(
        api_key=os.getenv("OPENROUTER_API_KEY"),
        base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        default_headers={"X-Title": "talkarabic-compare"},
    )
    user = f"Дата контакта: 2026-06-16\n\nПереписка менеджера с клиентом:\n\n{CONVERSATION}"

    print(f"{'модель':<32} {'время':>7} {'compl':>6} {'items':>6} {'score':>6} {'deal.price':>11}  JSON")
    print("-" * 90)
    for model in MODELS:
        t = time.perf_counter()
        try:
            comp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": prompts.SYSTEM_ANALYZE_CONVERSATION},
                    {"role": "user", "content": user},
                ],
                temperature=0.3,
            )
            dt = time.perf_counter() - t
            content = comp.choices[0].message.content or ""
            usage = getattr(comp, "usage", None)
            ctok = usage.completion_tokens if usage else "?"
            try:
                obj = first_json(content)
                items = len(obj.get("items", []))
                score = (obj.get("insights") or {}).get("lead_score")
                price = (obj.get("deal") or {}).get("price")
                ok = "ok"
            except Exception:
                items = score = price = "-"
                ok = "BAD"
            print(f"{model:<32} {dt:6.1f}s {str(ctok):>6} {str(items):>6} {str(score):>6} {str(price):>11}  {ok}")
        except Exception as exc:
            dt = time.perf_counter() - t
            msg = str(exc)[:40]
            print(f"{model:<32} {dt:6.1f}s  —      —      —           —  ERR: {msg}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
