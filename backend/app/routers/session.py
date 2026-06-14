"""REST API для сессий чеклиста. Все эндпоинты требуют Bearer-токен."""
import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, Path, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Manager, get_session as get_db_session
from app.models.checklist import DealInfo
from app.models.session import (
    DealUpdate,
    ResultsResponse,
    StartSessionResponse,
    SubmitRoundResponse,
    TranscribeResponse,
)
from app.services.auth import get_current_manager
from app.services.gsheets import sync_checklist_to_sheets
from app.services.session_manager import (
    SessionAccessError,
    SessionNotFoundError,
    get_session_manager,
)
from app.services.transcription import get_transcription_service

router = APIRouter(prefix="/api/session", tags=["session"])
logger = logging.getLogger(__name__)

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Транслитерация кириллицы для slug имени файла (латиница+цифры+дефисы)
_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def client_slug(name: str) -> str:
    """Slug имени клиента: латиница+цифры+дефисы (кириллица транслитерируется)."""
    parts = []
    for ch in name.lower():
        if ch in _TRANSLIT:
            parts.append(_TRANSLIT[ch])
        elif ch.isascii() and ch.isalnum():
            parts.append(ch)
        else:
            parts.append("-")
    slug = re.sub(r"-{2,}", "-", "".join(parts)).strip("-")
    return slug or "client"


class StartSessionRequest(BaseModel):
    client_name: str = Field(min_length=1, max_length=100)
    client_date: Optional[str] = None

    @field_validator("client_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("client_name не может быть пустым")
        return value

    @field_validator("client_date")
    @classmethod
    def _validate_date(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        if not _DATE_RE.fullmatch(value):
            raise ValueError("client_date должен быть в формате YYYY-MM-DD")
        try:
            datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            raise ValueError("client_date — несуществующая дата")
        return value


@router.post("/start", response_model=StartSessionResponse)
async def start_session(
    payload: StartSessionRequest,
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    client_date = payload.client_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    session_manager = get_session_manager()
    try:
        state = await session_manager.start_session(
            db,
            manager_id=manager.id,
            client_name=payload.client_name,
            client_date=client_date,
        )
    except Exception as exc:
        logger.exception("Failed to start session")
        raise HTTPException(status_code=500, detail=f"Failed to start session: {exc}")
    return StartSessionResponse(
        session_id=state.session_id,
        round=state.current_round,
        questions=state.current_questions,
        client_name=state.client_name,
        client_date=state.client_date,
    )


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    audio_file: Annotated[UploadFile, File(description="webm audio chunk")],
    manager: Manager = Depends(get_current_manager),
):
    """Preview-транскрипция одного аудио. Используется для подтверждения текста перед submit."""
    audio_bytes = await audio_file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio")
    transcription = get_transcription_service()
    try:
        text = await asyncio.to_thread(transcription.transcribe_bytes, audio_bytes)
    except Exception as exc:
        logger.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}")
    return TranscribeResponse(transcript=text)


@router.post("/{session_id}/submit", response_model=SubmitRoundResponse)
async def submit_round(
    session_id: Annotated[str, Path()],
    payload: Annotated[
        dict,
        Body(description='{"answers": [{"question_id":..., "transcript":..., "skipped":...}]}'),
    ],
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """Принимает подтверждённые транскрипты ответов раунда (skipped=true ⇒ вопрос
    пропущен — данных нет) и возвращает следующие вопросы или итог."""
    answers = payload.get("answers")
    if not isinstance(answers, list) or not answers:
        raise HTTPException(status_code=400, detail="answers must be a non-empty list")

    session_manager = get_session_manager()
    try:
        state, just_completed = await session_manager.submit_round(
            db, session_id, answers, manager
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except Exception as exc:
        logger.exception("submit_round failed")
        raise HTTPException(status_code=500, detail=f"Round processing failed: {exc}")

    if just_completed:
        # fire-and-forget: ошибки Sheets не ломают ответ пользователю
        asyncio.create_task(sync_checklist_to_sheets(session_id))

    summary = state.round_summaries[-1] if state.round_summaries else None
    return SubmitRoundResponse(
        round=state.current_round,
        is_complete=state.is_complete,
        questions=state.current_questions if not state.is_complete else [],
        round_summary=summary,
        checklist_preview=state.markdown_content if state.is_complete else None,
        client_name=state.client_name,
    )


@router.get("/{session_id}/results", response_model=ResultsResponse)
async def get_results(
    session_id: Annotated[str, Path()],
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    session_manager = get_session_manager()
    try:
        state = await session_manager.get_session(db, session_id, manager)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessError:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not state.is_complete or not state.markdown_content:
        raise HTTPException(status_code=409, detail="Session not yet complete")
    return ResultsResponse(
        session_id=state.session_id,
        checklist=state.checklist_items,
        markdown=state.markdown_content,
        client_name=state.client_name,
        client_date=state.client_date,
        insights=state.insights,
        deal=state.deal,
    )


@router.patch("/{session_id}/deal", response_model=DealInfo)
async def update_deal(
    session_id: Annotated[str, Path()],
    payload: DealUpdate,
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """Ручное обновление сделки менеджером (продукт, стоимость, оплата).
    Приходят только изменённые поля. paid=true без даты ⇒ дата оплаты = сегодня."""
    session_manager = get_session_manager()
    try:
        deal = await session_manager.update_deal(
            db, session_id, manager, payload.model_dump(exclude_unset=True)
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except Exception as exc:
        logger.exception("update_deal failed")
        raise HTTPException(status_code=500, detail=f"Deal update failed: {exc}")
    return deal


@router.get("/{session_id}/download")
async def download_markdown(
    session_id: Annotated[str, Path()],
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    session_manager = get_session_manager()
    try:
        state = await session_manager.get_session(db, session_id, manager)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessError:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not state.is_complete or not state.markdown_content:
        raise HTTPException(status_code=409, detail="Session not yet complete")
    filename = f"checklist-{client_slug(state.client_name)}-{state.client_date}.md"
    return Response(
        content=state.markdown_content.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
