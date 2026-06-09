from typing import Literal, Optional

from pydantic import BaseModel

ChecklistStatus = Literal["confirmed", "needs_clarification", "not_discussed"]


class ChecklistItem(BaseModel):
    category: str
    item: str
    status: ChecklistStatus
    notes: Optional[str] = None
