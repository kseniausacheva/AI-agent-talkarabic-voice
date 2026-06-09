import logging
import os
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)


class FFmpegError(RuntimeError):
    pass


def webm_to_wav(audio_bytes: bytes, sample_rate: int = 16000) -> str:
    """Конвертирует webm/Opus аудио в wav 16kHz mono через ffmpeg.

    Возвращает путь к временному wav-файлу. Вызывающий код обязан удалить файл.
    """
    tmp_webm: Optional[str] = None
    tmp_wav: Optional[str] = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_bytes)
            tmp_webm = f.name

        tmp_wav = tmp_webm.replace(".webm", ".wav")

        process = subprocess.run(
            [
                "ffmpeg",
                "-i", tmp_webm,
                "-ar", str(sample_rate),
                "-ac", "1",
                "-f", "wav",
                "-y",
                tmp_wav,
            ],
            capture_output=True,
        )
        if process.returncode != 0:
            stderr = process.stderr.decode(errors="ignore")
            raise FFmpegError(f"ffmpeg failed: {stderr}")

        return tmp_wav
    finally:
        if tmp_webm and os.path.exists(tmp_webm):
            try:
                os.unlink(tmp_webm)
            except OSError:
                logger.warning("Failed to remove temp webm: %s", tmp_webm)


def cleanup_temp(path: Optional[str]) -> None:
    if path and os.path.exists(path):
        try:
            os.unlink(path)
        except OSError:
            logger.warning("Failed to remove temp file: %s", path)
