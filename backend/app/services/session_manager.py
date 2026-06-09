"""In-memory менеджер сессий для шаблона Школы арабского.

Стартовые вопросы — фиксированные (questions_template.py), без вызова LLM.
LangGraph срабатывает только на submit: анализ раунда → следующий шаблонный
раунд или финальный чеклист.
"""
import asyncio
import logging
import uuid
from typing import Dict, List, Optional

from app.agent.graph import get_compiled_graph
from app.agent.questions_template import questions_for_round
from app.agent.state import AgentState
from app.models.question import Answer
from app.models.session import SessionState

logger = logging.getLogger(__name__)


class SessionNotFoundError(KeyError):
    pass


class SessionManager:
    def __init__(self) -> None:
        self._sessions: Dict[str, SessionState] = {}
        self._lock = asyncio.Lock()

    async def start_session(self) -> SessionState:
        session_id = uuid.uuid4().hex[:12]
        questions = questions_for_round(1)
        state = SessionState(
            session_id=session_id,
            current_round=1,
            current_questions=list(questions),
        )
        async with self._lock:
            self._sessions[session_id] = state
        logger.info(
            "Started session %s with %d template questions (round 1)",
            session_id,
            len(questions),
        )
        return state

    def _get_or_raise(self, session_id: str) -> SessionState:
        if session_id not in self._sessions:
            raise SessionNotFoundError(session_id)
        return self._sessions[session_id]

    async def submit_round(
        self,
        session_id: str,
        answers_texts: List[Dict[str, str]],
    ) -> SessionState:
        async with self._lock:
            state = self._get_or_raise(session_id)
            if state.is_complete:
                return state

            question_index = {q.id: q for q in state.current_questions}
            new_answers: List[Answer] = []
            for entry in answers_texts:
                qid = entry.get("question_id")
                transcript = (entry.get("transcript") or "").strip()
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
                    )
                )

            state.all_answers.extend(new_answers)

            agent_state: AgentState = {
                "session_id": state.session_id,
                "current_round": state.current_round,
                "max_rounds": state.max_rounds,
                "current_questions": state.current_questions,
                "all_answers": state.all_answers,
                "round_summaries": state.round_summaries,
                "checklist_items": state.checklist_items,
                "is_complete": state.is_complete,
            }

        graph = get_compiled_graph()
        result_state = await asyncio.to_thread(graph.invoke, agent_state)

        async with self._lock:
            state = self._get_or_raise(session_id)
            state.round_summaries = list(result_state.get("round_summaries", []))
            state.is_complete = bool(result_state.get("is_complete", False))
            if state.is_complete:
                state.checklist_items = list(result_state.get("checklist_items", []))
                state.markdown_content = result_state.get("markdown_content")
            else:
                state.current_round = result_state["current_round"]
                state.current_questions = list(
                    result_state.get("current_questions", [])
                )
            return state

    def get_session(self, session_id: str) -> SessionState:
        return self._get_or_raise(session_id)


_instance: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    global _instance
    if _instance is None:
        _instance = SessionManager()
    return _instance
