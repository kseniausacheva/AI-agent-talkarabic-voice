---
title: Talkarabic Backend
emoji: 🎙
colorFrom: blue
colorTo: red
sdk: docker
app_port: 7860
pinned: false
short_description: Чеклист клиента школы арабского — backend (Whisper + MiniMax M3)
---

# Talkarabic Backend

Backend для голосового чеклиста клиента Школы арабского.

- FastAPI + LangGraph
- Локальный Whisper для транскрипции (русский)
- MiniMax M3 через OpenRouter для генерации чеклиста

## Секреты, которые нужно добавить в Space Settings

- `OPENROUTER_API_KEY` — ключ от OpenRouter (Secret)

## Переменные окружения (опционально)

- `WHISPER_MODEL` — по умолчанию `openai/whisper-small`
- `WHISPER_LANGUAGE` — по умолчанию `ru`
- `ALLOWED_ORIGINS` — URL фронтенда (для CORS)
- `OPENROUTER_MODEL` — по умолчанию `minimax/minimax-m3`

## API endpoints

- `POST /api/session/start` — старт сессии
- `POST /api/session/transcribe` — транскрипция одного аудио
- `POST /api/session/{id}/submit` — сабмит раунда
- `GET /api/session/{id}/results` — чеклист
- `GET /api/session/{id}/download` — скачать MD
- `GET /health` — health check
- `GET /docs` — Swagger UI
