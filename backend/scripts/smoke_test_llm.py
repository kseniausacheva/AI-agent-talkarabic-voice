"""Быстрая проверка OpenRouter + minimax/minimax-m3.

Запускает только LLM-часть — без torch/whisper. Полезно убедиться, что ключ
рабочий и модель отвечает корректным JSON, перед тем как качать тяжёлые ML-зависимости.

Usage (из backend/):
    python -m scripts.smoke_test_llm
"""
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# Force UTF-8 stdout/stderr on Windows (default cp1252 can't print Arabic/Russian)
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Load .env from backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def main() -> int:
    api_key = os.getenv("OPENROUTER_API_KEY")
    model = os.getenv("OPENROUTER_MODEL", "minimax/minimax-m3")
    base_url = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

    if not api_key:
        print("[FAIL] OPENROUTER_API_KEY не задан в .env", file=sys.stderr)
        return 1

    print(f"[INFO] Model: {model}")
    print(f"[INFO] Base URL: {base_url}")

    client = OpenAI(
        api_key=api_key,
        base_url=base_url,
        default_headers={
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "talkarabic-smoke",
        },
    )

    system = (
        "Ты — AI-ассистент. Верни СТРОГО валидный JSON без markdown и комментариев:\n"
        '{"questions": [{"text": "..."}, {"text": "..."}, {"text": "..."}]}\n'
        "Сгенерируй 3 коротких приветственных вопроса для клиента."
    )
    user = "Сгенерируй 3 вводных вопроса."

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
        )
    except Exception as exc:
        print(f"[FAIL] API call failed: {exc}", file=sys.stderr)
        return 2

    content = completion.choices[0].message.content or ""
    print("\n[RAW RESPONSE]")
    print(content)

    # Strip ```json wrap if any
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        print(f"\n[FAIL] Response is not valid JSON: {exc}", file=sys.stderr)
        return 3

    questions = data.get("questions")
    if not isinstance(questions, list) or len(questions) != 3:
        print(f"\n[FAIL] Expected 3 questions, got: {questions}", file=sys.stderr)
        return 4

    print("\n[OK] OpenRouter + MiniMax M3 работают, JSON корректный.")
    for i, q in enumerate(questions, 1):
        print(f"  {i}. {q.get('text')}")

    usage = getattr(completion, "usage", None)
    if usage:
        print(f"\n[USAGE] prompt={usage.prompt_tokens} completion={usage.completion_tokens} total={usage.total_tokens}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
