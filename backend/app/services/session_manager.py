"""Менеджер сессий чеклиста Школы арабского: состояние живёт в БД (таблица checklists).

In-memory dict убран (Спринт 2): SessionManager читает/пишет строки checklists
по session_id. current_round выводится из числа сохранённых резюме раундов,
current_questions — из фиксированного шаблона (questions_template.py).

Стартовые вопросы — фиксированные, без вызова LLM. LangGraph срабатывает
только на submit: анализ раунда → следующий шаблонный раунд или финальный чеклист.
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.questions_template import questions_for_round
from app.agent.state import AgentState
from app.db import Checklist, Manager
from app.models.checklist import ChecklistItem, DealInfo, LeadInsights
from app.models.question import Answer
from app.models.session import SessionState

logger = logging.getLogger(__name__)

MAX_ROUNDS = 3


class SessionNotFoundError(KeyError):
    pass


class SessionAccessError(PermissionError):
    """Менеджер не владеет сессией и не является admin."""


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_insights_json(raw: Optional[str]) -> Optional[LeadInsights]:
    """insights_json из БД → LeadInsights; None/битый JSON → None (старые записи)."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return LeadInsights.model_validate(data)
    except Exception:
        logger.warning("Broken insights_json in DB, ignoring")
        return None


def _parse_deal_json(raw: Optional[str]) -> Optional[DealInfo]:
    """deal_json из БД → DealInfo; None/битый JSON → None (старые записи)."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return DealInfo.model_validate(data)
    except Exception:
        logger.warning("Broken deal_json in DB, ignoring")
        return None


def _completeness(items: List[ChecklistItem]) -> Optional[int]:
    """0–100: % пунктов чеклиста со статусом != not_discussed."""
    if not items:
        return None
    discussed = sum(1 for item in items if item.status != "not_discussed")
    return round(100 * discussed / len(items))


def _row_to_state(row: Checklist) -> SessionState:
    """Восстанавливает SessionState из строки таблицы checklists."""
    answers = [Answer(**a) for a in json.loads(row.answers_json or "[]")]
    summaries: List[str] = json.loads(row.summaries_json or "[]")
    checklist_items = (
        [ChecklistItem(**i) for i in json.loads(row.checklist_json)]
        if row.checklist_json
        else []
    )
    is_complete = row.status == "completed"
    current_round = min(len(summaries) + 1, MAX_ROUNDS)
    return SessionState(
        session_id=row.id,
        manager_id=row.manager_id,
        client_name=row.client_name,
        client_date=row.client_date,
        current_round=current_round,
        max_rounds=MAX_ROUNDS,
        current_questions=[] if is_complete else list(questions_for_round(current_round)),
        all_answers=answers,
        round_summaries=summaries,
        checklist_items=checklist_items,
        insights=_parse_insights_json(row.insights_json),
        deal=_parse_deal_json(row.deal_json),
        markdown_content=row.markdown,
        is_complete=is_complete,
    )


class SessionManager:
    """Stateless-обёртка над таблицей checklists (плюс per-session lock на submit)."""

    def __init__(self) -> None:
        self._locks: Dict[str, asyncio.Lock] = {}

    def _lock_for(self, session_id: str) -> asyncio.Lock:
        return self._locks.setdefault(session_id, asyncio.Lock())

    @staticmethod
    def _check_access(row: Checklist, manager: Manager) -> None:
        """Доступ: владелец сессии или admin, иначе SessionAccessError (→ 403)."""
        if manager.role != "admin" and row.manager_id != manager.id:
            raise SessionAccessError(row.id)

    @staticmethod
    async def _load_row(db: AsyncSession, session_id: str) -> Checklist:
        row = await db.get(Checklist, session_id)
        if row is None:
            raise SessionNotFoundError(session_id)
        return row

    async def start_session(
        self,
        db: AsyncSession,
        manager_id: int,
        client_name: str,
        client_date: str,
    ) -> SessionState:
        """Создаёт чеклист в БД и возвращает состояние с вопросами раунда 1."""
        session_id = uuid.uuid4().hex[:12]
        row = Checklist(
            id=session_id,
            manager_id=manager_id,
            client_name=client_name,
            client_date=client_date,
            status="in_progress",
            created_at=_utc_now_iso(),
            answers_json="[]",
            summaries_json="[]",
        )
        db.add(row)
        await db.commit()
        logger.info(
            "Started session %s for client '%s' (manager_id=%d)",
            session_id,
            client_name,
            manager_id,
        )
        return _row_to_state(row)

    async def get_session(
        self, db: AsyncSession, session_id: str, manager: Manager
    ) -> SessionState:
        row = await self._load_row(db, session_id)
        self._check_access(row, manager)
        return _row_to_state(row)

    async def submit_round(
        self,
        db: AsyncSession,
        session_id: str,
        answers_texts: List[Dict],
        manager: Manager,
    ) -> Tuple[SessionState, bool]:
        """Принимает ответы раунда, гоняет граф, сохраняет результат в БД.

        skipped=true ⇒ transcript игнорируется, audio_transcript = "" —
        пометка для LLM формируется в llm.py.

        Возвращает (state, just_completed): just_completed=True только если
        чеклист завершился именно этим вызовом (для fire-and-forget GSheets).
        """
        async with self._lock_for(session_id):
            row = await self._load_row(db, session_id)
            self._check_access(row, manager)
            state = _row_to_state(row)
            if state.is_complete:
                return state, False

            question_index = {q.id: q for q in state.current_questions}
            new_answers: List[Answer] = []
            for entry in answers_texts:
                qid = entry.get("question_id")
                skipped = bool(entry.get("skipped", False))
                transcript = "" if skipped else (entry.get("transcript") or "").strip()
                question = question_index.get(qid)
                if question is None:
                    logger.warning("Unknown question_id %s in submit", qid)
                    continue
                new_answers.append(
                    Answer(
                        question_id=question.id,
                        question_text=question.text,
                        audio_transcript=transcript,
                        round_number=question.round_number,
                        skipped=skipped,
                    )
                )

            state.all_answers.extend(new_answers)

            agent_state: AgentState = {
                "session_id": state.session_id,
                "client_date": state.client_date,
                "current_round": state.current_round,
                "max_rounds": state.max_rounds,
                "current_questions": state.current_questions,
                "all_answers": state.all_answers,
                "round_summaries": state.round_summaries,
                "checklist_items": state.checklist_items,
                "is_complete": state.is_complete,
            }

            # Ленивый импорт: langgraph/openai не нужны для старта приложения
            from app.agent.graph import get_compiled_graph

            graph = get_compiled_graph()
            result_state = await asyncio.to_thread(graph.invoke, agent_state)

            summaries = list(result_state.get("round_summaries", []))
            is_complete = bool(result_state.get("is_complete", False))

            row.answers_json = json.dumps(
                [a.model_dump() for a in state.all_answers], ensure_ascii=False
            )
            row.summaries_json = json.dumps(summaries, ensure_ascii=False)
            state.round_summaries = summaries
            state.is_complete = is_complete

            if is_complete:
                items = list(result_state.get("checklist_items", []))
                markdown = result_state.get("markdown_content")
                insights = result_state.get("insights") or LeadInsights()
                deal = result_state.get("deal") or DealInfo()
                completeness = _completeness(items)
                row.checklist_json = json.dumps(
                    [i.model_dump() for i in items], ensure_ascii=False
                )
                row.markdown = markdown
                row.insights_json = json.dumps(
                    insights.model_dump(), ensure_ascii=False
                )
                row.deal_json = json.dumps(deal.model_dump(), ensure_ascii=False)
                row.completeness = completeness
                row.status = "completed"
                row.completed_at = _utc_now_iso()
                state.checklist_items = items
                state.insights = insights
                state.deal = deal
                state.markdown_content = markdown
                state.current_questions = []
            else:
                state.current_round = result_state["current_round"]
                state.current_questions = list(
                    result_state.get("current_questions", [])
                )

            await db.commit()
            return state, is_complete

    async def update_deal(
        self,
        db: AsyncSession,
        session_id: str,
        manager: Manager,
        changes: Dict,
    ) -> DealInfo:
        """Частичное ручное обновление сделки (PATCH). Только переданные поля
        перезаписываются; остальные сохраняются. paid=True без даты ⇒ дата = сегодня.

        Доступ: владелец сессии или admin (иначе SessionAccessError → 403)."""
        async with self._lock_for(session_id):
            row = await self._load_row(db, session_id)
            self._check_access(row, manager)

            current = _parse_deal_json(row.deal_json) or DealInfo()
            data = current.model_dump()
            # накатываем только реально переданные (не None) поля
            for key, value in changes.items():
                if value is not None and key in data:
                    data[key] = value

            deal = DealInfo.model_validate(data)
            # отметили оплату, но дату не указали — ставим сегодня (для аналитики)
            if deal.paid and not deal.paid_date:
                deal.paid_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            # сняли оплату — дату оплаты обнуляем
            if not deal.paid:
                deal.paid_date = None

            row.deal_json = json.dumps(deal.model_dump(), ensure_ascii=False)

            # Пересобираем markdown, чтобы скачиваемый .md отражал актуальную
            # сделку (стоимость/оплату/«закрыта»). Импорт ленивый — без LLM-зависимостей.
            if row.checklist_json:
                from app.services.file_generator import generate_markdown

                items = [ChecklistItem(**i) for i in json.loads(row.checklist_json)]
                row.markdown = generate_markdown(row.id, items, deal=deal)

            await db.commit()
            return deal


_instance: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    global _instance
    if _instance is None:
        _instance = SessionManager()
    return _instance
