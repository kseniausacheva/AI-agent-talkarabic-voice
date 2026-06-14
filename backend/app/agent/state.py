from typing import List, Optional, TypedDict

from app.models.checklist import ChecklistItem, DealInfo, LeadInsights
from app.models.question import Answer, Question


class AgentState(TypedDict, total=False):
    session_id: str
    client_date: str

    current_round: int
    max_rounds: int

    current_questions: List[Question]
    all_answers: List[Answer]

    round_summaries: List[str]

    checklist_items: List[ChecklistItem]
    insights: LeadInsights
    deal: DealInfo
    markdown_content: str

    is_complete: bool
