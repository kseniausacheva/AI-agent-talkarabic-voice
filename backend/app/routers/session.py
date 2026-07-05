"""REST API для сессий чеклиста. Все эндпоинты требуют Bearer-токен."""
import asyncio
import logging
import re
from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, Path, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Manager, get_session as get_db_session
from app.models.checklist import ClientAdvice, DealInfo
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


class FromTextRequest(BaseModel):
    """Создание чеклиста из вставленной переписки (без 10 вопросов)."""

    client_name: str = Field(min_length=1, max_length=100)
    client_date: Optional[str] = None
    conversation: str = Field(min_length=20, max_length=20000)

    @field_validator("client_name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("client_name не может быть пустым")
        return value

    @field_validator("conversation")
    @classmethod
    def _strip_conversation(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 20:
            raise ValueError("Переписка слишком короткая для анализа")
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


@router.post("/from-text")
async def create_from_text(
    payload: FromTextRequest,
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """Готовый чеклист из вставленной переписки — ИИ разбирает диалог сразу,
    без 10 вопросов. Возвращает {session_id} → фронт ведёт на /results."""
    client_date = payload.client_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    session_manager = get_session_manager()
    try:
        session_id = await session_manager.create_from_text(
            db,
            manager=manager,
            client_name=payload.client_name,
            client_date=client_date,
            conversation=payload.conversation,
        )
    except Exception as exc:
        logger.exception("create_from_text failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")
    # fire-and-forget: синк в Google Sheets, ошибки не ломают ответ
    asyncio.create_task(sync_checklist_to_sheets(session_id))
    return {"session_id": session_id}


@router.post("/extract-screenshots")
async def extract_screenshots(
    files: Annotated[List[UploadFile], File(description="скриншоты переписки")],
    manager: Manager = Depends(get_current_manager),
):
    """Распознаёт текст переписки со скриншотов (gpt-4o vision) → {text}.
    Фронт дописывает результат в поле переписки."""
    if not files:
        raise HTTPException(status_code=400, detail="Нет файлов")
    if len(files) > 8:
        raise HTTPException(status_code=400, detail="Не больше 8 скриншотов за раз")
    images: list = []
    for f in files:
        data = await f.read()
        if not data:
            continue
        if len(data) > 8_000_000:
            raise HTTPException(status_code=400, detail="Файл больше 8 МБ")
        images.append((data, f.content_type or "image/png"))
    if not images:
        raise HTTPException(status_code=400, detail="Пустые файлы")

    from app.services.llm import get_llm_service

    llm = get_llm_service()
    try:
        text = await asyncio.to_thread(llm.extract_conversation_from_images, images)
    except Exception as exc:
        logger.exception("extract_screenshots failed")
        raise HTTPException(status_code=500, detail=f"Не удалось распознать: {exc}")
    return {"text": text}


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
    conversation = payload.get("conversation") or ""
    if not isinstance(conversation, str):
        conversation = ""

    session_manager = get_session_manager()
    try:
        state, just_completed = await session_manager.submit_round(
            db, session_id, answers, manager, conversation=conversation
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


class FunnelUpdate(BaseModel):
    column: Literal["new", "warm", "hot", "rejected", "paid"]


@router.patch("/{session_id}/funnel")
async def update_funnel(
    session_id: Annotated[str, Path()],
    payload: FunnelUpdate,
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """Перемещение карточки в воронке (канбан): меняет стадию лида или
    отмечает сделку оплаченной. column ∈ new|warm|hot|rejected|paid."""
    session_manager = get_session_manager()
    try:
        result = await session_manager.update_funnel(
            db, session_id, manager, payload.column
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except Exception as exc:
        logger.exception("update_funnel failed")
        raise HTTPException(status_code=500, detail=f"Funnel update failed: {exc}")
    return result


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


class ClientUpdate(BaseModel):
    """Ручное обновление данных клиента (имя, дата контакта). Оба поля
    опциональны — приходит только то, что меняли."""

    client_name: Optional[str] = Field(default=None, max_length=100)
    client_date: Optional[str] = None

    @field_validator("client_name")
    @classmethod
    def _strip_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Имя клиента не может быть пустым")
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


@router.patch("/{session_id}/client")
async def update_client(
    session_id: Annotated[str, Path()],
    payload: ClientUpdate,
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """Ручное обновление данных клиента (имя, дата контакта). Возвращает
    актуальные {client_name, client_date}."""
    session_manager = get_session_manager()
    try:
        result = await session_manager.update_client(
            db,
            session_id,
            manager,
            client_name=payload.client_name,
            client_date=payload.client_date,
        )
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except Exception as exc:
        logger.exception("update_client failed")
        raise HTTPException(status_code=500, detail=f"Client update failed: {exc}")
    return result


@router.delete("/{session_id}")
async def delete_session(
    session_id: Annotated[str, Path()],
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """Полное удаление клиента (строки checklists) — безвозвратно.
    Доступ — общий пул (любой аутентифицированный менеджер школы)."""
    session_manager = get_session_manager()
    try:
        await session_manager.delete_session(db, session_id, manager)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessError:
        raise HTTPException(status_code=403, detail="Forbidden")
    except Exception as exc:
        logger.exception("delete_session failed")
        raise HTTPException(status_code=500, detail=f"Delete failed: {exc}")
    return {"ok": True}


@router.post("/{session_id}/advice", response_model=ClientAdvice)
async def client_advice(
    session_id: Annotated[str, Path()],
    manager: Manager = Depends(get_current_manager),
    db: AsyncSession = Depends(get_db_session),
):
    """AI-советник: план работы с этим клиентом на основе базы знаний школы —
    что уточнить, как общаться, ответы на возражения, последовательность касаний."""
    session_manager = get_session_manager()
    try:
        state = await session_manager.get_session(db, session_id, manager)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except SessionAccessError:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not state.is_complete or not state.markdown_content:
        raise HTTPException(status_code=409, detail="Session not yet complete")

    from app.routers.knowledge import get_knowledge_base

    knowledge = await get_knowledge_base(db)

    parts = [state.markdown_content or ""]
    ins = state.insights
    if ins:
        parts.append(
            f"\nСтадия лида: {ins.stage or '—'}, оценка {ins.lead_score or '—'}/10."
        )
        if ins.objections:
            parts.append(
                "Возражения клиента: "
                + "; ".join(
                    f"{o.type}: {o.note}".strip(": ") for o in ins.objections
                )
            )
    summary = "\n".join(p for p in parts if p)

    from app.services.llm import get_llm_service

    llm = get_llm_service()
    try:
        advice = await asyncio.to_thread(
            llm.generate_advice, summary, knowledge, state.client_date
        )
    except Exception as exc:
        logger.exception("client_advice failed")
        raise HTTPException(status_code=500, detail=f"Advice failed: {exc}")
    return advice


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
