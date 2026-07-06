"""Генерация Markdown-чеклиста клиента Школы арабского из ChecklistItem."""
from collections import defaultdict
from datetime import datetime
from typing import List, Optional

from app.models.checklist import ChecklistItem, ContactInfo, DealInfo

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

_PRODUCT_LABEL = {
    "individual": "индивидуальные занятия",
    "course": "курс / поток",
    "platform": "платформа (самостоятельное обучение)",
    "undecided": "не определился",
}

_PLATFORM_STATUS_LABEL = {
    "not_offered": "не предлагали",
    "offered": "предложили",
    "taken": "оформил",
}

_CONTACT_CHANNEL_LABEL = {
    "whatsapp": "WhatsApp",
    "telegram": "Telegram",
    "instagram": "Instagram",
    "phone": "телефон",
    "email": "email",
    "other": "другое",
}


def _contact_section(contact: Optional[ContactInfo]) -> List[str]:
    """Секция «Контакты» + план следующего касания — только при наличии данных."""
    if contact is None:
        return []
    has_data = bool(
        contact.phone
        or contact.email
        or contact.note
        or contact.channel
        or contact.next_contact_date
        or contact.next_contact_plan
    )
    if not has_data:
        return []
    lines = ["## Контакты", ""]
    if contact.phone:
        lines.append(f"- **Телефон:** {contact.phone}")
    if contact.channel:
        channel = _CONTACT_CHANNEL_LABEL.get(contact.channel, contact.channel)
        lines.append(f"- **Связь:** {channel}")
    if contact.email:
        lines.append(f"- **Email:** {contact.email}")
    if contact.note:
        lines.append(f"- **Заметка:** {contact.note}")
    if contact.next_contact_date or contact.next_contact_plan:
        when = contact.next_contact_date or "—"
        plan = f" — {contact.next_contact_plan}" if contact.next_contact_plan else ""
        lines.append(f"- **Следующий контакт:** {when}{plan}")
    lines.append("")
    return lines


def _format_price(deal: DealInfo) -> str:
    if deal.price is None:
        return "не обсуждалась"
    amount = f"{deal.price:,.0f}".replace(",", " ")
    symbol = "₽" if deal.currency in ("RUB", "") else deal.currency
    return f"{amount} {symbol}"


def _format_payment(deal: DealInfo) -> str:
    if deal.paid:
        when = f" {deal.paid_date}" if deal.paid_date else ""
        return f"оплачено{when} — ✅ сделка закрыта"
    parts = []
    if deal.price is not None:
        parts.append("ожидает оплаты")
    else:
        parts.append("не обсуждалась")
    if deal.installment:
        parts.append("рассрочка")
    if deal.planned_payment_date:
        parts.append(f"план {deal.planned_payment_date}")
    return ", ".join(parts)


def _deal_section(deal: Optional[DealInfo]) -> List[str]:
    """Секция «Сделка» — рендерим, только если есть осмысленные данные."""
    if deal is None:
        return []
    platform_shown = getattr(deal, "platform_status", "not_offered") != "not_offered"
    has_data = bool(
        deal.product
        or deal.price is not None
        or deal.paid
        or deal.product_note
        or platform_shown
    )
    if not has_data:
        return []
    lines = ["## Сделка", ""]
    if deal.product:
        product = _PRODUCT_LABEL.get(deal.product, deal.product)
        note = f" — {deal.product_note}" if deal.product_note else ""
        lines.append(f"- **Продукт:** {product}{note}")
    elif deal.product_note:
        lines.append(f"- **Продукт:** {deal.product_note}")
    lines.append(f"- **Стоимость:** {_format_price(deal)}")
    lines.append(f"- **Оплата:** {_format_payment(deal)}")
    if platform_shown:
        label = _PLATFORM_STATUS_LABEL.get(deal.platform_status, deal.platform_status)
        lines.append(f"- **Платформа:** {label}")
    lines.append("")
    return lines


def generate_markdown(
    session_id: str,
    items: List[ChecklistItem],
    deal: Optional[DealInfo] = None,
    contact: Optional[ContactInfo] = None,
) -> str:
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

    lines.extend(_deal_section(deal))
    lines.extend(_contact_section(contact))

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
