"""Генерация Markdown-чеклиста клиента Школы арабского из ChecklistItem."""
from collections import defaultdict
from datetime import datetime
from typing import List

from app.models.checklist import ChecklistItem

_STATUS_BOX = {
    "confirmed": "[x]",
    "needs_clarification": "[~]",
    "not_discussed": "[ ]",
}

_STATUS_LABEL = {
    "confirmed": "подтверждено",
    "needs_clarification": "требует уточнения",
    "not_discussed": "не обсуждалось",
}


def generate_markdown(session_id: str, items: List[ChecklistItem]) -> str:
    grouped: dict[str, list[ChecklistItem]] = defaultdict(list)
    for item in items:
        grouped[item.category].append(item)

    lines: List[str] = []
    lines.append("# Чеклист клиента — Школа арабского")
    lines.append("")
    lines.append(f"**Дата:** {datetime.utcnow().strftime('%Y-%m-%d')}")
    lines.append(f"**Сессия:** {session_id}")
    lines.append("")
    lines.append("---")
    lines.append("")

    for category, group_items in grouped.items():
        lines.append(f"## {category}")
        lines.append("")
        for item in group_items:
            box = _STATUS_BOX.get(item.status, "[ ]")
            line = f"- {box} {item.item}"
            if item.status != "confirmed":
                line += f" _({_STATUS_LABEL.get(item.status, item.status)})_"
            lines.append(line)
            if item.notes:
                lines.append(f"  - 📝 {item.notes}")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("*Сгенерировано AI Checklist Agent для Школы арабского (MiniMax M3 + Whisper).*")
    return "\n".join(lines)
