"""Сервис транскрипции на базе локального Whisper.

Whisper загружается лениво при первом обращении (или в lifespan FastAPI).
Webm от MediaRecorder конвертируется в wav через ffmpeg, иначе pipeline не читает.
"""
import logging
from functools import lru_cache
from typing import Optional

from app.config import get_settings
from app.utils.audio import cleanup_temp, webm_to_wav

logger = logging.getLogger(__name__)


class TranscriptionService:
    def __init__(self) -> None:
        self._pipeline = None
        self._settings = get_settings()

    def _ensure_loaded(self) -> None:
        if self._pipeline is not None:
            return
        logger.info(
            "Loading Whisper model: %s on %s",
            self._settings.whisper_model,
            self._settings.whisper_device,
        )
        from transformers import pipeline as hf_pipeline

        self._pipeline = hf_pipeline(
            "automatic-speech-recognition",
            model=self._settings.whisper_model,
            device=self._settings.whisper_device,
        )
        logger.info("Whisper model loaded")

    def preload(self) -> None:
        """Вызывается в lifespan FastAPI чтобы не платить latency на первом запросе."""
        self._ensure_loaded()

    @property
    def is_loaded(self) -> bool:
        return self._pipeline is not None

    def transcribe_bytes(self, audio_bytes: bytes) -> str:
        """Транскрибирует webm/Opus аудио (как пишет MediaRecorder в браузере)."""
        self._ensure_loaded()
        wav_path: Optional[str] = None
        try:
            wav_path = webm_to_wav(audio_bytes)
            language = self._settings.whisper_language
            generate_kwargs = {}
            if language and language.lower() != "auto":
                generate_kwargs["language"] = language
                generate_kwargs["task"] = "transcribe"

            result = self._pipeline(
                wav_path,
                generate_kwargs=generate_kwargs or None,
            )
            text = (result.get("text") or "").strip()
            return text
        finally:
            cleanup_temp(wav_path)


@lru_cache(maxsize=1)
def get_transcription_service() -> TranscriptionService:
    return TranscriptionService()
