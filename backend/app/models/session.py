from typing import List, Optional

from pydantic import BaseModel

from .checklist import ChecklistItem
from .question import Answer, Question


class SessionState(BaseModel):
    """In-memory представление сессии. Используется для хранения в `sessions` dict."""

    session_id: str
    current_round: int = 1
    max_rounds: int = 3
    current_questions: List[Question] = []
    all_answers: List[Answer] = []
    round_summaries: List[str] = []
    checklist_items: List[ChecklistItem] = []
    markdown_content: Optional[str] = None
    is_complete: bool = False


class StartSessionResponse(BaseModel):
    session_id: str
    round: int
    questions: List[Question]


class TranscribeResponse(BaseModel):
    transcript: str


class SubmitRoundResponse(BaseModel):
    round: int
    is_complete: bool
    questions: List[Question] = []
    round_summary: Optional[str] = None
    checklist_preview: Optional[str] = None


class ResultsResponse(BaseModel):
    session_id: str
    checklist: List[ChecklistItem]
    markdown: str
