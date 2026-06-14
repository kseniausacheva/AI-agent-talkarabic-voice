"""LLM сервис поверх OpenRouter (OpenAI-совместимый API).

Используем модель `minimax/minimax-m3` через OpenRouter. JSON парсится с
толерантностью к markdown-обёртке (модель иногда добавляет ```json блоки).

Для школы арабского LLM используется ТОЛЬКО для:
- analyze_round — короткое резюме раунда
- generate_checklist — финальная агрегация в структурированный чеклист

Сами вопросы фиксированные (см. app/agent/questions_template.py) — LLM их не
генерирует, потому что это специализированный шаблон.
"""
from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

from openai import OpenAI

from app.config import get_settings
from app.models.checklist import ChecklistItem, DealInfo, LeadInsights
from app.models.question import Answer
from app.agent import prompts

logger = logging.getLogger(__name__)


class LLMError(RuntimeError):
    pass


SKIPPED_ANSWER_MARK = "менеджер пропустил вопрос — данных нет"


def _answer_text(answer: Answer) -> str:
    """Текст ответа для промпта: пропущенные вопросы помечаются явно."""
    if answer.skipped:
        return f"({SKIPPED_ANSWER_MARK})"
    return answer.audio_transcript or "(пустой ответ)"


def _strip_markdown_json(raw: str) -> str:
    raw = raw.strip()
    match = re.search(r"```(?:json)?\s*(.+?)\s*```", raw, re.DOTALL)
    if match:
        return match.group(1).strip()
    return raw


def _parse_insights(raw: Any) -> LeadInsights:
    """insights от LLM → LeadInsights. Отсутствует/битый → дефолты, НЕ исключение."""
    if not isinstance(raw, dict):
        if raw is not None:
            logger.warning("LLM insights is not an object (%s), using defaults", type(raw))
        return LeadInsights()
    try:
        return LeadInsights.model_validate(raw)
    except Exception as exc:  # pragma: no cover — поля толерантны, но страхуемся
        logger.warning("Malformed insights from LLM, using defaults: %s", exc)
        return LeadInsights()


def _parse_deal(raw: Any) -> DealInfo:
    """deal от LLM → DealInfo. Отсутствует/битый → пустая сделка, НЕ исключение."""
    if not isinstance(raw, dict):
        if raw is not None:
            logger.warning("LLM deal is not an object (%s), using defaults", type(raw))
        return DealInfo()
    try:
        return DealInfo.model_validate(raw)
    except Exception as exc:  # pragma: no cover — поля толерантны, но страхуемся
        logger.warning("Malformed deal from LLM, using defaults: %s", exc)
        return DealInfo()


def _parse_json(raw: str) -> Dict[str, Any]:
    cleaned = _strip_markdown_json(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # MiniMax M3 порой возвращает объект ДВАЖДЫ ({...}{...}) или с текстом-
    # префиксом. raw_decode берёт ПЕРВЫЙ валидный объект и игнорирует хвост —
    # старый greedy-regex \{.*\} на дубле падал (склеивал оба объекта).
    start = cleaned.find("{")
    if start != -1:
        try:
            obj, _ = json.JSONDecoder().raw_decode(cleaned[start:])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            pass
    logger.error("Failed to parse LLM JSON. Raw: %s", raw[:500])
    raise LLMError("LLM returned non-JSON")


class LLMService:
    def __init__(self) -> None:
        settings = get_settings()
        self._model = settings.openrouter_model
        self._client = OpenAI(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            default_headers={
                "HTTP-Referer": settings.openrouter_app_url,
                "X-Title": settings.openrouter_app_name,
            },
        )

    def _chat_json(self, system: str, user: str, *, temperature: float = 0.5) -> Dict[str, Any]:
        completion = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
        )
        content = completion.choices[0].message.content or ""
        return _parse_json(content)

    def analyze_round(
        self,
        round_number: int,
        round_answers: List[Answer],
    ) -> str:
        user_payload_lines = [
            f"Раунд {round_number}. Вопросы и наговоренные ответы менеджера:"
        ]
        for i, a in enumerate(round_answers, start=1):
            user_payload_lines.append(f"\nВ{i}: {a.question_text}")
            user_payload_lines.append(f"О{i}: {_answer_text(a)}")
        data = self._chat_json(
            system=prompts.SYSTEM_ANALYZE_ROUND,
            user="\n".join(user_payload_lines),
            temperature=0.4,
        )
        return data.get("summary", "").strip()

    def generate_checklist(
        self,
        all_answers: List[Answer],
        round_summaries: List[str],
        client_date: str = "",
    ) -> Tuple[List[ChecklistItem], LeadInsights, DealInfo]:
        """Финальная агрегация: чеклист + аналитика лида + сделка одним вызовом."""
        user_payload = self._format_history(
            all_answers, round_summaries, client_date=client_date
        )
        data = self._chat_json(
            system=prompts.SYSTEM_GENERATE_CHECKLIST,
            user=user_payload,
            temperature=0.3,
        )
        items_raw = data.get("items", [])
        items: List[ChecklistItem] = []
        for item in items_raw:
            try:
                items.append(ChecklistItem(**item))
            except Exception as exc:
                logger.warning("Skipping malformed checklist item %s: %s", item, exc)
        if not items:
            raise LLMError("LLM returned empty checklist")
        insights = _parse_insights(data.get("insights"))
        deal = _parse_deal(data.get("deal"))
        return items, insights, deal

    @staticmethod
    def _format_history(
        answers: List[Answer],
        summaries: Optional[List[str]] = None,
        client_date: str = "",
    ) -> str:
        lines: List[str] = []
        if client_date:
            lines.append(f"Дата контакта: {client_date}")
            lines.append("")
        if summaries:
            for i, s in enumerate(summaries, start=1):
                lines.append(f"Резюме раунда {i}: {s}")
            lines.append("")
        lines.append("Все вопросы шаблона и ответы менеджера:")
        for a in answers:
            lines.append(f"\n[Раунд {a.round_number}] В: {a.question_text}")
            lines.append(f"О: {_answer_text(a)}")
        return "\n".join(lines)


@lru_cache(maxsize=1)
def get_llm_service() -> LLMService:
    return LLMService()
