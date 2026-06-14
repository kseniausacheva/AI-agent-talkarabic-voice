"""Сборка LangGraph workflow.

Граф обрабатывает ОДИН раунд: получает state с already-сохранёнными answers,
делает analyze → решает: следующие вопросы или итоговый чеклист.

Старт сессии (initial questions) делается напрямую SessionManager-ом — нет смысла
гонять граф для одного вызова LLM.
"""
from functools import lru_cache

from langgraph.graph import END, START, StateGraph

from app.agent.nodes import (
    analyze_round_node,
    check_rounds_condition,
    generate_checklist_node,
    generate_markdown_node,
    next_questions_node,
)
from app.agent.state import AgentState


def build_graph():
    graph = StateGraph(AgentState)

    graph.add_node("analyze_round", analyze_round_node)
    graph.add_node("next_questions", next_questions_node)
    graph.add_node("generate_checklist", generate_checklist_node)
    graph.add_node("generate_markdown", generate_markdown_node)

    # Маршрут решаем на входе: для НЕ-финального раунда — analyze_round (резюме
    # для менеджера) → следующие вопросы; для финального — СРАЗУ generate_checklist.
    # Так финальный шаг не платит за лишний analyze_round(3): большой промпт
    # всё равно видит все 10 ответов, а резюме 3-го раунда нигде не показывается.
    graph.add_conditional_edges(
        START,
        check_rounds_condition,
        {
            "next_questions": "analyze_round",
            "generate_checklist": "generate_checklist",
        },
    )
    graph.add_edge("analyze_round", "next_questions")
    graph.add_edge("next_questions", END)
    graph.add_edge("generate_checklist", "generate_markdown")
    graph.add_edge("generate_markdown", END)

    return graph.compile()


@lru_cache(maxsize=1)
def get_compiled_graph():
    return build_graph()
