import re
from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel, field_validator

ChecklistStatus = Literal["confirmed", "needs_clarification", "not_discussed"]

LeadStage = Literal["new", "warm", "hot", "rejected"]
ObjectionType = Literal["price", "time", "tech", "trust", "other"]

# Сделка: какой продукт хочет клиент
ProductType = Literal["individual", "course", "undecided"]

_STAGES = ("new", "warm", "hot", "rejected")
_OBJECTION_TYPES = ("price", "time", "tech", "trust", "other")
_PRODUCT_TYPES = ("individual", "course", "undecided")
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


def _positive_float_or_none(value: Any) -> Optional[float]:
    """Стоимость: число (в т.ч. строка «20000»/«20 000 ₽») → float; иначе None."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None
    if isinstance(value, str):
        digits = re.sub(r"[^\d.,]", "", value).replace(",", ".")
        # если несколько точек (тысячные разделители) — оставляем только цифры
        if digits.count(".") > 1:
            digits = digits.replace(".", "")
        try:
            num = float(digits)
        except ValueError:
            return None
        return num if num > 0 else None
    return None


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


class DealInfo(BaseModel):
    """Сделка по клиенту: что покупает, за сколько, статус оплаты.

    Часть полей (product/product_note/price/installment/planned_payment_date)
    ИИ предлагает из разговора; оплату (paid/paid_date) менеджер проставляет
    руками позже — деньги приходят не сразу. paid=True ⇒ сделка закрыта.
    Валидация толерантная: битые значения → дефолты, запрос не падает.
    """

    product: Optional[ProductType] = None     # individual | course | undecided
    product_note: str = ""                      # «в следующий поток» / «только индивидуально»
    price: Optional[float] = None               # Стоимость
    currency: str = "RUB"
    installment: bool = False                    # рассрочка
    planned_payment_date: Optional[str] = None   # когда планирует оплатить
    paid: bool = False                          # оплачено = сделка закрыта
    paid_date: Optional[str] = None             # дата фактической оплаты (для аналитики)

    @field_validator("product", mode="before")
    @classmethod
    def _tolerant_product(cls, value: Any) -> Optional[str]:
        if isinstance(value, str) and value.strip().lower() in _PRODUCT_TYPES:
            return value.strip().lower()
        return None

    @field_validator("product_note", mode="before")
    @classmethod
    def _tolerant_text(cls, value: Any) -> str:
        return _str_or_empty(value)

    @field_validator("currency", mode="before")
    @classmethod
    def _tolerant_currency(cls, value: Any) -> str:
        return _str_or_empty(value).strip().upper() or "RUB"

    @field_validator("price", mode="before")
    @classmethod
    def _tolerant_price(cls, value: Any) -> Optional[float]:
        return _positive_float_or_none(value)

    @field_validator("installment", "paid", mode="before")
    @classmethod
    def _tolerant_bool(cls, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in ("true", "1", "yes", "да", "оплачено")
        return bool(value)

    @field_validator("planned_payment_date", "paid_date", mode="before")
    @classmethod
    def _tolerant_date(cls, value: Any) -> Optional[str]:
        return _valid_date_or_none(value)

    def is_closed(self) -> bool:
        return self.paid
