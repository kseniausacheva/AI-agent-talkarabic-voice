"""FastAPI entry point. Preload Whisper при старте, регистрация роутеров, CORS."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import init_db
from app.routers import auth, checklists, health, session
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
    yield


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
    return app


app = create_app()
