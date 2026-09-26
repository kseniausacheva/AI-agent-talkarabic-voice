"""Асинхронный слой БД: SQLAlchemy 2.0 + aiosqlite.

Таблицы:
- managers — менеджеры школы (auth);
- checklists — сессии-чеклисты клиентов (id = session_id, uuid hex 12).

Файл БД: env DATABASE_PATH, по умолчанию data/app.db. Директория создаётся
в init_db() (вызывается в lifespan FastAPI).
"""
import logging
from pathlib import Path
from typing import AsyncGenerator, Optional

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    pass


class Manager(Base):
    """Менеджер школы. role: 'manager' или 'admin'."""

    __tablename__ = "managers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="manager")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    # Telegram chat_id для уведомлений «сегодня связаться» (None = не привязан)
    telegram_chat_id: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)


class Checklist(Base):
    """Сессия-чеклист клиента. status: 'in_progress' или 'completed'."""

    __tablename__ = "checklists"

    id: Mapped[str] = mapped_column(String(12), primary_key=True)
    manager_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("managers.id"), nullable=False, index=True
    )
    client_name: Mapped[str] = mapped_column(Text, nullable=False)
    client_date: Mapped[str] = mapped_column(String(10), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="in_progress", index=True
    )
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    completed_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    answers_json: Mapped[str] = mapped_column(
        Text, nullable=False, default="[]", server_default="[]"
    )
    summaries_json: Mapped[str] = mapped_column(
        Text, nullable=False, default="[]", server_default="[]"
    )
    checklist_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    markdown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sheet_synced: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # Спринт 3: аналитика лида
    insights_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    completeness: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Учёт продаж: продукт, стоимость, статус оплаты (DealInfo)
    deal_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Контакты клиента + план следующего касания (ContactInfo)
    contact_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class AppSetting(Base):
    """Школьные настройки key→value (напр. база скриптов 'knowledge_base')."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)


class Subscriber(Base):
    """Подписчик email-рассылки (база для newsletter). unsubscribed=1 — отписан."""

    __tablename__ = "subscribers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    group_tag: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    # Фирма контакта — для деловых баз (MICE и т.п.), у учеников пусто.
    company: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    unsubscribed: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    unsub_token: Mapped[str] = mapped_column(String(40), nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    # Какой выпуск этому адресу уже ушёл (ключ = тема письма) и когда.
    # Нужно, чтобы бить большую базу на дни и не слать одному дважды.
    last_campaign: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_sent_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)


class ScheduledBroadcast(Base):
    """Выпуск, поставленный на время. Разбирает планировщик в app.main."""

    __tablename__ = "scheduled_broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    group_tag: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    # сколько писем за один запуск (0 = всем, кто ещё не получил)
    batch_limit: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    # повторять каждый день, пока выпуск не уйдёт всей группе
    repeat_daily: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    run_at: Mapped[str] = mapped_column(String(40), nullable=False)  # UTC ISO
    tz_label: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )
    # От кого (email из списка отправителей; пусто = основной) и вложения
    sender_email: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    attachments_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]", server_default="[]")
    # pending | done | cancelled | failed
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending", server_default="pending"
    )
    sent_total: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    created_by: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=""
    )


# Миграции: колонка → DDL (добавляется, если PRAGMA её не видит)
_CHECKLIST_MIGRATIONS = {
    "insights_json": "ALTER TABLE checklists ADD COLUMN insights_json TEXT",
    "completeness": "ALTER TABLE checklists ADD COLUMN completeness INTEGER",
    "deal_json": "ALTER TABLE checklists ADD COLUMN deal_json TEXT",
    "contact_json": "ALTER TABLE checklists ADD COLUMN contact_json TEXT",
}
_MANAGER_MIGRATIONS = {
    "telegram_chat_id": "ALTER TABLE managers ADD COLUMN telegram_chat_id TEXT",
}
_SUBSCRIBER_MIGRATIONS = {
    "last_campaign": "ALTER TABLE subscribers ADD COLUMN last_campaign TEXT",
    "last_sent_at": "ALTER TABLE subscribers ADD COLUMN last_sent_at TEXT",
    "company": "ALTER TABLE subscribers ADD COLUMN company TEXT NOT NULL DEFAULT ''",
}
_SCHEDULED_MIGRATIONS = {
    "sender_email": "ALTER TABLE scheduled_broadcasts ADD COLUMN sender_email TEXT NOT NULL DEFAULT ''",
    "attachments_json": "ALTER TABLE scheduled_broadcasts ADD COLUMN attachments_json TEXT NOT NULL DEFAULT '[]'",
}


_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def _database_url() -> str:
    db_path = Path(get_settings().database_path)
    return f"sqlite+aiosqlite:///{db_path.as_posix()}"


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(_database_url(), echo=False)
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def init_db() -> None:
    """Создаёт директорию БД и таблицы, добивает недостающие колонки (миграция).

    Миграция без потери данных: после create_all смотрим PRAGMA table_info
    (checklists) и добавляем отсутствующие колонки через ALTER TABLE.
    Существующие записи остаются с NULL в новых колонках.
    """
    db_path = Path(get_settings().database_path)
    if str(db_path.parent) not in ("", "."):
        db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for table, migrations in (
            ("checklists", _CHECKLIST_MIGRATIONS),
            ("managers", _MANAGER_MIGRATIONS),
            ("subscribers", _SUBSCRIBER_MIGRATIONS),
            ("scheduled_broadcasts", _SCHEDULED_MIGRATIONS),
        ):
            result = await conn.exec_driver_sql(f"PRAGMA table_info({table})")
            existing_columns = {row[1] for row in result.fetchall()}
            for column, ddl in migrations.items():
                if column not in existing_columns:
                    await conn.exec_driver_sql(ddl)
                    logger.info("Migration: added column %s.%s", table, column)
    logger.info("Database ready: %s", db_path)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: одна AsyncSession на запрос."""
    factory = get_session_factory()
    async with factory() as session:
        yield session
