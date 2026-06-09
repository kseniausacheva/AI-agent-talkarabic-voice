"""Функции-ноды LangGraph агента для шаблона Школы арабского.

Сами вопросы фиксированные (questions_template.py). Граф используется только
для: анализа раунда → следующий шаблонный раунд ИЛИ финальный чеклист.
"""
import logging
from typing import Dict, Literal

from app.agent.questions_template import questions_for_round
from app.agent.state import AgentState
from app.services.file_generator import generate_markdown
from app.services.llm import get_llm_service

logger = logging.getLogger(__name__)


def analyze_round_node(state: AgentState) -> Dict:
    llm = get_llm_service()
    current_round = state["current_round"]
    answers_this_round = [
        a for a in state["all_answers"] if a.round_number == current_round
    ]

    summary = llm.analyze_round(
        round_number=current_round, round_answers=answers_this_round
    )
    summaries = list(state.get("round_summaries", []))
    summaries.append(summary)
    logger.info("Round %d summary: %s", current_round, summary[:120])
    return {"round_summaries": summaries}


def next_questions_node(state: AgentState) -> Dict:
    """Просто отдаём шаблонные вопросы следующего раунда — без вызова LLM."""
    current_round = state["current_round"]
    next_round = current_round + 1
    questions = questions_for_round(next_round)
    return {
        "current_questions": questions,
        "current_round": next_round,
    }


def generate_checklist_node(state: AgentState) -> Dict:
    llm = get_llm_service()
    items = llm.generate_checklist(
        all_answers=state["all_answers"],
        round_summaries=state.get("round_summaries", []),
    )
    return {"checklist_items": items}


def generate_markdown_node(state: AgentState) -> Dict:
    md = generate_markdown(
        session_id=state["session_id"],
        items=state["checklist_items"],
    )
    return {
        "markdown_content": md,
        "is_complete": True,
    }


def check_rounds_condition(
    state: AgentState,
) -> Literal["next_questions", "generate_checklist"]:
    if state["current_round"] < state["max_rounds"]:
        return "next_questions"
    return "generate_checklist"
