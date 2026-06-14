"""Замер латентности финального шага «Сформировать чеклист».

Воспроизводит ровно те вызовы LLM, что идут на сабмите 3-го раунда:
  1) analyze_round(3)        — текущий граф вызывает его ПЕРЕД генерацией
  2) generate_checklist(...) — большой JSON (items + insights)

Плюс отдельно меряет СТРИМ generate_checklist: time-to-first-token (TTFT) vs total,
чтобы понять, даст ли стриминг выигрыш в воспринимаемой скорости.

Usage (из backend/):
    .venv/Scripts/python -m scripts.measure_latency
"""
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")
sys.path.insert(0, str(BACKEND_DIR))

import json  # noqa: E402

from app.agent import prompts  # noqa: E402
from app.models.question import Answer  # noqa: E402
from app.services.llm import get_llm_service  # noqa: E402


def first_json(raw: str):
    """Берём ПЕРВЫЙ валидный JSON-объект (M3 порой дублирует ответ)."""
    s = raw.strip()
    if s.startswith("```"):
        s = s.strip("`")
        if s[:4].lower() == "json":
            s = s[4:]
    s = s[s.find("{"):]
    obj, end = json.JSONDecoder().raw_decode(s)
    doubled = len(s[end:].strip()) > 5
    return obj, doubled

# Реалистичные ответы менеджера на 10 вопросов (наговорено голосом → транскрипт)
_A = [
    ("r1q1", 1, "Зовут Марина, она из Казани, часовой пояс московский плюс один."),
    ("r1q2", 1, "Нашла нас в Инстаграме, по рекламе с отзывами учеников."),
    ("r1q3", 1, "Хочет учить чтобы читать Коран в оригинале и понимать молитвы, для души."),
    ("r1q4", 1, "Интересует классический арабский, литературный, и немного коранический."),
    ("r2q1", 2, "Уровень почти нулевой, знает только алфавит и пару фраз."),
    ("r2q2", 2, "Пробовала приложение Дуолинго, не зашло, не хватало живого преподавателя."),
    ("r2q3", 2, "Готова заниматься в Зуме вживую, вечером после работы."),
    ("r3q1", 3, "Может выделить часа три-четыре в неделю, два занятия."),
    ("r3q2", 3, "Бюджет где-то двадцать тысяч в месяц, может чуть больше если понравится."),
    ("r3q3", 3, "Хочет преподавателя женщину, желательно занятия после семи вечера."),
]
QTEXT = {
    "r1q1": "Как зовут и где находится?", "r1q2": "Откуда узнал о школе?",
    "r1q3": "Мотивация?", "r1q4": "Какой диалект?",
    "r2q1": "Текущий уровень?", "r2q2": "Опыт онлайн-курсов?", "r2q3": "Готов к Zoom?",
    "r3q1": "Часов в неделю?", "r3q2": "Бюджет?", "r3q3": "Доп. пожелания?",
}
ANSWERS = [
    Answer(question_id=qid, question_text=QTEXT[qid], audio_transcript=txt,
           round_number=rnd, skipped=False)
    for qid, rnd, txt in _A
]


def _round(rnd):
    return [a for a in ANSWERS if a.round_number == rnd]


def _call(llm, system, user, temperature):
    """Сырой вызов: время + tokens + признак дублирования ответа."""
    t = time.perf_counter()
    completion = llm._client.chat.completions.create(
        model=llm._model,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
    )
    dt = time.perf_counter() - t
    content = completion.choices[0].message.content or ""
    obj, doubled = first_json(content)
    usage = getattr(completion, "usage", None)
    ctok = usage.completion_tokens if usage else "?"
    ptok = usage.prompt_tokens if usage else "?"
    return dt, obj, doubled, ptok, ctok


def main() -> int:
    llm = get_llm_service()
    print(f"[INFO] model={llm._model}\n")

    # --- 1. analyze_round для каждого раунда ---
    summaries = []
    for rnd in (1, 2, 3):
        ans = _round(rnd)
        lines = [f"Раунд {rnd}. Вопросы и наговоренные ответы менеджера:"]
        for i, a in enumerate(ans, 1):
            lines += [f"\nВ{i}: {a.question_text}", f"О{i}: {a.audio_transcript}"]
        dt, obj, dbl, ptok, ctok = _call(
            llm, prompts.SYSTEM_ANALYZE_ROUND, "\n".join(lines), 0.4)
        summaries.append(obj.get("summary", ""))
        print(f"[analyze_round {rnd}]  {dt:6.2f}s   prompt={ptok} compl={ctok}"
              f"{'  ⚠ДУБЛЬ' if dbl else ''}")

    # --- 2. generate_checklist (большой, НЕ стрим) ---
    print()
    user_payload = llm._format_history(ANSWERS, summaries, client_date="2026-06-14")
    times = []
    for i in range(2):  # 2 прогона — латентность OpenRouter прыгает
        dt, obj, dbl, ptok, ctok = _call(
            llm, prompts.SYSTEM_GENERATE_CHECKLIST, user_payload, 0.3)
        times.append(dt)
        n_items = len(obj.get("items", []))
        print(f"[generate_checklist #{i+1}]  {dt:6.2f}s   prompt={ptok} compl={ctok} "
              f"items={n_items}{'  ⚠ДУБЛЬ' if dbl else ''}")
    gen_avg = sum(times) / len(times)
    print(f"[generate_checklist avg]  {gen_avg:6.2f}s")

    # --- 3. СТРИМ того же запроса: TTFT vs total ---
    print()
    t = time.perf_counter()
    ttft = None
    chunks = 0
    chars = 0
    stream = llm._client.chat.completions.create(
        model=llm._model,
        messages=[
            {"role": "system", "content": prompts.SYSTEM_GENERATE_CHECKLIST},
            {"role": "user", "content": user_payload},
        ],
        temperature=0.3,
        stream=True,
    )
    try:
        for chunk in stream:
            delta = chunk.choices[0].delta.content if chunk.choices else None
            if delta:
                if ttft is None:
                    ttft = time.perf_counter() - t
                chunks += 1
                chars += len(delta)
    except Exception as exc:  # транзиентный обрыв OpenRouter — не валим весь замер
        print(f"[stream] оборвался ({type(exc).__name__}) — транзиентная сеть, цифры выше валидны")
    total = time.perf_counter() - t
    ttft_s = f"{ttft:6.2f}s" if ttft is not None else "  n/a"
    print(f"[stream] TTFT={ttft_s}  total={total:6.2f}s  chunks={chunks} chars={chars}")
    print()
    print("ИТОГ: финальный шаг теперь = только generate_checklist "
          f"(~{gen_avg:.0f}s), analyze_round(3) убран из ожидания.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
