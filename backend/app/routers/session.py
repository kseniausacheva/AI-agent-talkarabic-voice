"""REST API для сессий чеклиста."""
import asyncio
import logging
from typing import Annotated, List

from fastapi import APIRouter, Body, File, HTTPException, Path, UploadFile
from fastapi.responses import Response

from app.models.session import (
    ResultsResponse,
    StartSessionResponse,
    SubmitRoundResponse,
    TranscribeResponse,
)
from app.services.session_manager import SessionNotFoundError, get_session_manager
from app.services.transcription import get_transcription_service

router = APIRouter(prefix="/api/session", tags=["session"])
logger = logging.getLogger(__name__)


@router.post("/start", response_model=StartSessionResponse)
async def start_session():
    manager = get_session_manager()
    try:
        state = await manager.start_session()
    except Exception as exc:
        logger.exception("Failed to start session")
        raise HTTPException(status_code=500, detail=f"Failed to start session: {exc}")
    return StartSessionResponse(
        session_id=state.session_id,
        round=state.current_round,
        questions=state.current_questions,
    )


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(audio_file: Annotated[UploadFile, File(description="webm audio chunk")]):
    """Преview-транскрипция одного аудио. Используется для подтверждения текста перед submit."""
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
    payload: Annotated[dict, Body(description='{"answers": [{"question_id":..., "transcript":...}]}')],
):
    """Принимает подтверждённые транскрипты ответов раунда и возвращает следующие вопросы или итог."""
    answers = payload.get("answers")
    if not isinstance(answers, list) or not answers:
        raise HTTPException(status_code=400, detail="answers must be a non-empty list")

    manager = get_session_manager()
    try:
        state = await manager.submit_round(session_id, answers)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as exc:
        logger.exception("submit_round failed")
        raise HTTPException(status_code=500, detail=f"Round processing failed: {exc}")

    summary = state.round_summaries[-1] if state.round_summaries else None
    return SubmitRoundResponse(
        round=state.current_round,
        is_complete=state.is_complete,
        questions=state.current_questions if not state.is_complete else [],
        round_summary=summary,
        checklist_preview=state.markdown_content if state.is_complete else None,
    )


@router.get("/{session_id}/results", response_model=ResultsResponse)
async def get_results(session_id: Annotated[str, Path()]):
    manager = get_session_manager()
    try:
        state = manager.get_session(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    if not state.is_complete or not state.markdown_content:
        raise HTTPException(status_code=409, detail="Session not yet complete")
    return ResultsResponse(
        session_id=state.session_id,
        checklist=state.checklist_items,
        markdown=state.markdown_content,
    )


@router.get("/{session_id}/download")
async def download_markdown(session_id: Annotated[str, Path()]):
    manager = get_session_manager()
    try:
        state = manager.get_session(session_id)
    except SessionNotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    if not state.is_complete or not state.markdown_content:
        raise HTTPException(status_code=409, detail="Session not yet complete")
    filename = f"checklist-{session_id}.md"
    return Response(
        content=state.markdown_content.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
