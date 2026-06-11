from typing import List, Optional

from pydantic import BaseModel

from .checklist import ChecklistItem, LeadInsights
from .question import Answer, Question


class SessionState(BaseModel):
    """Представление сессии-чеклиста, восстановленное из строки БД (таблица checklists)."""

    session_id: str
    manager_id: int = 0
    client_name: str = ""
    client_date: str = ""
    current_round: int = 1
    max_rounds: int = 3
    current_questions: List[Question] = []
    all_answers: List[Answer] = []
    round_summaries: List[str] = []
    checklist_items: List[ChecklistItem] = []
    insights: Optional[LeadInsights] = None
    markdown_content: Optional[str] = None
    is_complete: bool = False


class StartSessionResponse(BaseModel):
    session_id: str
    round: int
    questions: List[Question]
    client_name: str
    client_date: str


class TranscribeResponse(BaseModel):
    transcript: str


class SubmitRoundResponse(BaseModel):
    round: int
    is_complete: bool
    questions: List[Question] = []
    round_summary: Optional[str] = None
    checklist_preview: Optional[str] = None
    client_name: str = ""


class ResultsResponse(BaseModel):
    session_id: str
    checklist: List[ChecklistItem]
    markdown: str
    client_name: str = ""
    client_date: str = ""
    insights: Optional[LeadInsights] = None  # null для старых записей
