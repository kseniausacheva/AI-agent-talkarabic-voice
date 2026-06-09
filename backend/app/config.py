from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # OpenRouter / LLM
    openrouter_api_key: str = Field(..., description="OpenRouter API key (sk-or-v1-...)")
    openrouter_model: str = Field(default="minimax/minimax-m3")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1")
    openrouter_app_name: str = Field(default="talkarabic-voice")
    openrouter_app_url: str = Field(default="http://localhost:3000")

    # Whisper
    whisper_model: str = Field(default="openai/whisper-small")
    whisper_language: str = Field(default="ar")
    whisper_device: str = Field(default="cpu")

    # App
    environment: str = Field(default="development")
    max_audio_duration_seconds: int = Field(default=120)
    log_level: str = Field(default="INFO")

    # CORS
    allowed_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000"
    )

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
