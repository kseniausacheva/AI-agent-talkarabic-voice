"""Отправка сообщений в Telegram через Bot API (для уведомлений «сегодня связаться»).

Бот создаётся через @BotFather, токен кладётся в env TELEGRAM_BOT_TOKEN.
chat_id менеджера хранится в managers.telegram_chat_id (менеджер привязывает сам).
"""
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


async def send_telegram(chat_id: str, text: str) -> bool:
    """Отправляет текст в Telegram. Возвращает True при успехе, иначе False
    (ошибки логируются, не пробрасываются — уведомления не критичны)."""
    settings = get_settings()
    token = settings.telegram_bot_token
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN не задан — уведомление не отправлено")
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                url,
                json={
                    "chat_id": chat_id,
                    "text": text,
                    "parse_mode": "HTML",
                    "disable_web_page_preview": True,
                },
            )
        if resp.status_code != 200:
            logger.warning(
                "Telegram send failed (%s): %s", resp.status_code, resp.text[:200]
            )
            return False
        return True
    except Exception as exc:  # сеть/таймаут — не роняем вызывающий код
        logger.warning("Telegram send error: %s", exc)
        return False
