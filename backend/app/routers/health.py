from fastapi import APIRouter

from app.services.transcription import get_transcription_service

router = APIRouter(tags=["system"])


@router.get("/health")
async def health():
    transcription = get_transcription_service()
    return {
        "status": "healthy",
        "whisper_loaded": transcription.is_loaded,
    }
