import re
from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, field_validator

ChecklistStatus = Literal["confirmed", "needs_clarification", "not_discussed"]

LeadStage = Literal["new", "warm", "hot", "rejected"]
ObjectionType = Literal["price", "time", "tech", "trust", "other"]

_STAGES = ("new", "warm", "hot", "rejected")
_OBJECTION_TYPES = ("price", "time", "tech", "trust", "other")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ChecklistItem(BaseModel):
    category: str
    item: str
    status: ChecklistStatus
    notes: Optional[str] = None


def _valid_date_or_none(value: Any) -> Optional[str]:
    """YYYY-MM-DD и реально существующая дата — иначе None (толерантность к LLM)."""
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not _DATE_RE.fullmatch(value):
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None
    return value


def _str_or_empty(value: Any) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


class Objection(BaseModel):
    """Возражение клиента. Неизвестный type → 'other'."""

    type: ObjectionType = "other"
    note: str = ""

    @field_validator("type", mode="before")
    @classmethod
    def _tolerant_type(cls, value: Any) -> str:
        if isinstance(value, str) and value.strip().lower() in _OBJECTION_TYPES:
            return value.strip().lower()
        return "other"

    @field_validator("note", mode="before")
    @classmethod
    def _tolerant_note(cls, value: Any) -> str:
        return _str_or_empty(value)


class LeadTask(BaseModel):
    """Задача менеджера из insights. Невалидная due_date → None."""

    title: str
    due_date: Optional[str] = None

    @field_validator("title", mode="before")
    @classmethod
    def _tolerant_title(cls, value: Any) -> str:
        return _str_or_empty(value)

    @field_validator("due_date", mode="before")
    @classmethod
    def _tolerant_due_date(cls, value: Any) -> Optional[str]:
        return _valid_date_or_none(value)


class LeadInsights(BaseModel):
    """Аналитика лида от LLM (Спринт 3). Валидация толерантная: битые
    значения превращаются в дефолты, а не роняют запрос."""

    lead_score: Optional[int] = None  # clamp 1..10
    score_reason: str = ""
    stage: Optional[LeadStage] = None
    objections: List[Objection] = []
    next_contact_date: Optional[str] = None  # YYYY-MM-DD, иначе None
    follow_up_draft: str = ""
    tasks: List[LeadTask] = []

    @field_validator("lead_score", mode="before")
    @classmethod
    def _clamp_score(cls, value: Any) -> Optional[int]:
        if value is None or isinstance(value, bool):
            return None
        try:
            score = int(value)
        except (TypeError, ValueError):
            return None
        return max(1, min(10, score))

    @field_validator("stage", mode="before")
    @classmethod
    def _tolerant_stage(cls, value: Any) -> Optional[str]:
        if isinstance(value, str) and value.strip().lower() in _STAGES:
            return value.strip().lower()
        return None

    @field_validator("next_contact_date", mode="before")
    @classmethod
    def _tolerant_date(cls, value: Any) -> Optional[str]:
        return _valid_date_or_none(value)

    @field_validator("score_reason", "follow_up_draft", mode="before")
    @classmethod
    def _tolerant_text(cls, value: Any) -> str:
        return _str_or_empty(value)

    @field_validator("objections", mode="before")
    @classmethod
    def _tolerant_objections(cls, value: Any) -> List[Objection]:
        if not isinstance(value, list):
            return []
        result: List[Objection] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            try:
                result.append(Objection(**item))
            except Exception:
                continue
        return result

    @field_validator("tasks", mode="before")
    @classmethod
    def _tolerant_tasks(cls, value: Any) -> List[LeadTask]:
        if not isinstance(value, list):
            return []
        result: List[LeadTask] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            try:
                task = LeadTask(**item)
            except Exception:
                continue
            if task.title.strip():
                result.append(task)
        return result
