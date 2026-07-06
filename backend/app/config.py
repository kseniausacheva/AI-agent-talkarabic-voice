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

    # Auth (Спринт 2)
    auth_secret: str = Field(
        default="dev-secret-change-me",
        description="Секрет для подписи JWT. ОБЯЗАТЕЛЬНО переопределить в проде.",
    )
    invite_code: str = Field(
        default="", description="Инвайт-код для регистрации менеджера (пусто = выключено)"
    )
    admin_invite_code: str = Field(
        default="", description="Инвайт-код для регистрации админа (пусто = выключено)"
    )

    # База данных (SQLite)
    database_path: str = Field(default="data/app.db")

    # Google Sheets (вебхук Apps Script)
    gsheets_webhook_url: str = Field(
        default="", description="URL вебхука Apps Script (пусто = интеграция выключена)"
    )
    gsheets_secret: str = Field(default="")

    # Telegram-уведомления «сегодня связаться»
    telegram_bot_token: str = Field(
        default="", description="Токен бота от @BotFather (пусто = выключено)"
    )
    cron_secret: str = Field(
        default="", description="Секрет для POST /api/cron/* (пусто = cron выключен)"
    )

    # Email-рассылки (Brevo)
    brevo_api_key: str = Field(
        default="", description="Brevo API key (xkeysib-...); пусто = рассылка выключена"
    )
    brevo_sender_email: str = Field(
        default="", description="Email отправителя (должен быть verified в Brevo)"
    )
    brevo_sender_name: str = Field(default="Школа арабского Talkarabic")
    public_api_url: str = Field(
        default="https://api.talkarabicnow.online",
        description="Базовый URL бэкенда — для ссылок отписки в письмах",
    )

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
