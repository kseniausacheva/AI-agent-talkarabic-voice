# Backend — AI Checklist Agent

FastAPI + LangGraph + локальный Whisper + LLM через OpenRouter (модель `minimax/minimax-m3`).

## Локальный запуск (Windows / PowerShell)

### 1. Требования

- **Python 3.11** ([скачать](https://www.python.org/downloads/release/python-3119/)). На установке поставь галку "Add to PATH".
- **ffmpeg** для конвертации webm→wav:

  ```powershell
  winget install Gyan.FFmpeg
  ```

  Или вручную: <https://www.gyan.dev/ffmpeg/builds/> → распаковать → добавить `bin` в PATH.

- **OpenRouter API key**: <https://openrouter.ai/keys>

### 2. Виртуальное окружение + зависимости

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Установка `torch` тяжёлая (~700 MB), наберись терпения.

### 3. Конфиг

```powershell
Copy-Item .env.example .env
notepad .env
```

Минимум — подставь `OPENROUTER_API_KEY`. Остальное по умолчанию работает.

Для **арабского** оставь `WHISPER_LANGUAGE=ar`. Учти, что `whisper-small` плохо знает арабский — для качества лучше `WHISPER_MODEL=openai/whisper-medium` (~1.5 GB, скачается при первом запуске).

### 4. Старт

```powershell
uvicorn app.main:app --reload --port 7860
```

При первом запуске Whisper скачается из Hugging Face (~500 MB для small, ~1.5 GB для medium). Это разово.

### 5. Проверка

- Swagger UI: <http://127.0.0.1:7860/docs>
- Health: <http://127.0.0.1:7860/health> → `{"status":"healthy","whisper_loaded":true}`

### 6. Быстрый smoke-тест без фронта

```powershell
# Старт сессии
$session = Invoke-RestMethod -Method Post http://127.0.0.1:7860/api/session/start
$session | ConvertTo-Json -Depth 5
```

Дальше — фронтенд или Postman: записать аудио, прогнать через `/api/session/transcribe`, отправить `/api/session/{id}/submit`.

## Структура

```
backend/
├── app/
│   ├── main.py              # FastAPI + lifespan (preload Whisper)
│   ├── config.py            # Settings (OpenRouter + Whisper)
│   ├── routers/
│   │   ├── session.py       # /api/session/*
│   │   └── health.py        # /health
│   ├── services/
│   │   ├── transcription.py # Whisper wrapper
│   │   ├── llm.py           # OpenRouter / MiniMax M3
│   │   ├── file_generator.py # Markdown export
│   │   └── session_manager.py # In-memory sessions
│   ├── agent/
│   │   ├── state.py         # AgentState TypedDict
│   │   ├── nodes.py         # LangGraph nodes
│   │   ├── graph.py         # Graph compilation
│   │   └── prompts.py       # System prompts (RU)
│   ├── models/              # Pydantic data models
│   └── utils/audio.py       # ffmpeg webm→wav
├── Dockerfile
├── requirements.txt
└── .env.example
```

## API

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/session/start` | Создаёт сессию + первые 3 вопроса |
| POST | `/api/session/transcribe` | Превью транскрипции одного webm |
| POST | `/api/session/{id}/submit` | Сабмит подтверждённых текстов раунда |
| GET  | `/api/session/{id}/results` | Финальный чеклист (JSON + markdown) |
| GET  | `/api/session/{id}/download` | Скачать `checklist-{id}.md` |
| GET  | `/health` | Health check |

## Деплой

- **Hugging Face Spaces** — `Dockerfile` уже под порт 7860. Залить через `huggingface-cli`. Бесплатно, но засыпает.
- **Railway** — подключить репо, выбрать `backend/Dockerfile`. Persistent volumes из коробки.
- **Hetzner CX22 + Coolify** — лучший price/performance: €4.5/мес, 2 vCPU/4 GB RAM, ставишь Coolify как UI поверх Docker.

В любом случае: `OPENROUTER_API_KEY` положить как secret + `ALLOWED_ORIGINS` указать URL фронта.

## Известные грабли

- **NumPy 2.x ломает torch 2.1** — в `requirements.txt` зафиксирован `numpy<2`.
- **Whisper не читает webm** — `app/utils/audio.py` конвертирует через ffmpeg в wav 16 kHz mono.
- **MiniMax M3 иногда оборачивает JSON в ```json блоки** — парсер в `app/services/llm.py` это переживает.
