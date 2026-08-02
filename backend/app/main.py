"""FastAPI entry point. Preload Whisper при старте, регистрация роутеров, CORS."""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.db import init_db


def uploads_dir() -> Path:
    """Каталог загруженных картинок (рядом с БД, на постоянном volume)."""
    return Path(get_settings().database_path).resolve().parent / "uploads"
from app.routers import (
    auth,
    checklists,
    cron,
    health,
    knowledge,
    mailing,
    session,
)
from app.routers.mailing import run_due_broadcasts
from app.services.transcription import get_transcription_service


def _configure_logging(level: str) -> None:
    logging.basicConfig(
        level=level.upper(),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    _configure_logging(settings.log_level)
    logger = logging.getLogger(__name__)
    if settings.auth_secret == "dev-secret-change-me":
        logger.warning(
            "AUTH_SECRET не задан — используется dev-секрет. "
            "Обязательно задайте AUTH_SECRET в проде!"
        )
    await init_db()
    logger.info("Preloading Whisper (%s)...", settings.whisper_model)
    try:
        get_transcription_service().preload()
    except Exception as exc:
        logger.exception("Whisper preload failed: %s", exc)

    scheduler = asyncio.create_task(_mailing_scheduler())
    try:
        yield
    finally:
        scheduler.cancel()


async def _mailing_scheduler() -> None:
    """Раз в минуту смотрит, не пора ли разослать отложенный выпуск.

    Живёт внутри приложения, а не во внешнем cron: контейнер всё равно
    работает постоянно, а состояние лежит в базе на volume — переживает
    перезапуск. Одна ошибка не должна убивать цикл, поэтому ловим всё.
    """
    logger = logging.getLogger(__name__)
    await asyncio.sleep(20)  # дать приложению встать
    while True:
        try:
            started = await run_due_broadcasts()
            if started:
                logger.info("Планировщик: запущено выпусков — %d", started)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Планировщик рассылки споткнулся: %s", exc)
        await asyncio.sleep(60)


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="AI Checklist Agent",
        description="Voice-driven checklist filler (Whisper + OpenRouter/MiniMax M3 + LangGraph)",
        version="0.2.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(session.router)
    app.include_router(checklists.router)
    app.include_router(cron.router)
    app.include_router(knowledge.router)
    app.include_router(mailing.router)

    # Статика: загруженные картинки для писем (публично, для email-клиентов)
    updir = uploads_dir()
    updir.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=str(updir)), name="uploads")
    return app


app = create_app()
