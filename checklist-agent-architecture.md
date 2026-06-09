# 🎯 Архитектура: AI Checklist Agent

## Обзор проекта

**Цель:** AI агент для заполнения чеклиста созвона с клиентом через голосовые ответы

**Ключевые особенности:**
- 3 раунда по 3 вопроса (максимум 9 вопросов)
- Голосовой ввод → транскрипция → анализ
- Превью транскрипции перед подтверждением ответа
- Адаптивные вопросы на основе предыдущих ответов
- Генерация MD файла с результатами

---

## 🏗️ Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                         Vercel (Next.js 15)                             │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   Landing    │  │   Question   │  │    Audio     │  │   Results   │ │
│  │    Page      │  │   Display    │  │   Recorder   │  │   & Export  │ │
│  │              │  │  (Shadcn)    │  │  (Shadcn)    │  │    (.md)    │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                                         │
│  Tech: Next.js 15 + React 19 + TypeScript + Tailwind + Shadcn-style UI │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 │ REST API (HTTPS)
                                 │ • POST /api/session/start
                                 │ • POST /api/session/transcribe
                                 │ • POST /api/session/{id}/submit
                                 │ • GET  /api/session/{id}/results
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                     │
│                    Hugging Face Spaces (Docker)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      FastAPI Application                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │   │
│  │  │   Router    │  │   Session   │  │     File Generator      │  │   │
│  │  │  Endpoints  │  │   Manager   │  │    (MD Export)          │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                 │                                       │
│                                 ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    LangGraph Agent                               │   │
│  │                                                                  │   │
│  │   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │   │
│  │   │  START   │───▶│ ROUND 1  │───▶│ ROUND 2  │───▶│ ROUND 3  │  │   │
│  │   │          │    │ Questions│    │ Questions│    │ Questions│  │   │
│  │   └──────────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘  │   │
│  │                        │               │               │        │   │
│  │                        ▼               ▼               ▼        │   │
│  │                   ┌────────────────────────────────────────┐    │   │
│  │                   │         ANALYZE & GENERATE             │    │   │
│  │                   │      (Claude Haiku 4.5 API)            │    │   │
│  │                   └────────────────────────────────────────┘    │   │
│  │                                    │                            │   │
│  │                                    ▼                            │   │
│  │                            ┌──────────────┐                     │   │
│  │                            │   COMPLETE   │                     │   │
│  │                            │  (Generate   │                     │   │
│  │                            │   Checklist) │                     │   │
│  │                            └──────────────┘                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                 │                                       │
│                                 ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                  Whisper Model (Local)                          │   │
│  │              openai/whisper-small (HuggingFace)                 │   │
│  │                                                                  │   │
│  │  • Audio transcription                                          │   │
│  │  • Загружается при старте приложения                            │   │
│  │  • ~500MB RAM для whisper-small                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Tech: Python 3.11 + FastAPI + LangGraph + Transformers + Anthropic    │
└─────────────────────────────────────────────────────────────────────────┘
                                 │
                                 │ API Call
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL SERVICES                                │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Anthropic API                                 │   │
│  │                  Claude Haiku 4.5                                │   │
│  │                                                                  │   │
│  │  • Генерация вопросов                                           │   │
│  │  • Анализ ответов                                               │   │
│  │  • Создание итогового чеклиста                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Структура проекта

### Frontend (Vercel)

```
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                    # Landing page
│   ├── session/
│   │   └── [id]/
│   │       └── page.tsx            # Main interview page
│   └── results/
│       └── [id]/
│           └── page.tsx            # Results & download page
├── components/
│   ├── ui/                         # Shadcn UI components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── progress.tsx
│   │   └── ...
│   ├── audio-recorder.tsx          # Audio recording component
│   ├── question-card.tsx           # Question display
│   ├── round-indicator.tsx         # Progress indicator (1/3, 2/3, 3/3)
│   └── checklist-preview.tsx       # MD preview component
├── lib/
│   ├── api.ts                      # API client functions
│   ├── audio-utils.ts              # Audio processing utilities
│   └── types.ts                    # TypeScript interfaces
├── hooks/
│   ├── use-audio-recorder.ts       # Custom hook for recording
│   └── use-session.ts              # Session state management
├── public/
├── next.config.js
├── tailwind.config.ts
├── components.json                 # Shadcn config
└── package.json
```

### Backend (Hugging Face Spaces)

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                     # FastAPI entry point
│   ├── config.py                   # Environment configuration
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── session.py              # Session endpoints
│   │   └── health.py               # Health check endpoint
│   ├── services/
│   │   ├── __init__.py
│   │   ├── transcription.py        # Whisper transcription service
│   │   ├── llm.py                  # Claude Haiku integration
│   │   └── file_generator.py       # MD file generation
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── state.py                # LangGraph state definition
│   │   ├── nodes.py                # Graph nodes (question generation, analysis)
│   │   ├── graph.py                # LangGraph workflow compilation
│   │   └── prompts.py              # System prompts for Claude
│   ├── models/
│   │   ├── __init__.py
│   │   ├── session.py              # Session data models
│   │   ├── question.py             # Question/Answer models
│   │   └── checklist.py            # Checklist item models
│   └── utils/
│       ├── __init__.py
│       └── audio.py                # Audio file handling
├── Dockerfile
├── requirements.txt
└── README.md
```

---

## 🔄 LangGraph Agent Flow

### State Definition

```python
from typing import TypedDict, List, Optional
from pydantic import BaseModel

class Answer(BaseModel):
    question_id: str
    question_text: str
    audio_transcript: str
    round_number: int

class ChecklistItem(BaseModel):
    category: str
    item: str
    status: str  # "confirmed" | "needs_clarification" | "not_discussed"
    notes: Optional[str]

class AgentState(TypedDict):
    # Session info
    session_id: str
    
    # Round tracking
    current_round: int  # 1, 2, or 3
    max_rounds: int     # 3
    
    # Questions & Answers
    current_questions: List[str]  # 3 questions per round
    all_answers: List[Answer]
    
    # Analysis
    round_summaries: List[str]  # Summary after each round
    
    # Final output
    checklist_items: List[ChecklistItem]
    markdown_content: str
    
    # Control flow
    is_complete: bool
```

### Graph Nodes

```
┌─────────────────────────────────────────────────────────────────┐
│                     LangGraph Workflow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────────┐                                         │
│   │  generate_initial│  → Генерирует первые 3 вопроса          │
│   │    _questions    │    (базовые вводные)                    │
│   └────────┬─────────┘                                         │
│            │                                                    │
│            ▼                                                    │
│   ┌──────────────────┐                                         │
│   │  wait_for_       │  → Ожидает аудио-ответы                 │
│   │    answers       │    (3 ответа на 3 вопроса)              │
│   └────────┬─────────┘                                         │
│            │                                                    │
│            ▼                                                    │
│   ┌──────────────────┐                                         │
│   │  transcribe_     │  → Whisper транскрибирует аудио         │
│   │    audio         │                                         │
│   └────────┬─────────┘                                         │
│            │                                                    │
│            ▼                                                    │
│   ┌──────────────────┐                                         │
│   │  analyze_round   │  → Claude анализирует ответы раунда     │
│   │                  │    и создает summary                    │
│   └────────┬─────────┘                                         │
│            │                                                    │
│            ▼                                                    │
│   ┌──────────────────┐     ┌─────────────────────────────┐    │
│   │  check_rounds    │────▶│ round < 3: generate_next    │    │
│   │  (conditional)   │     │            _questions       │    │
│   └────────┬─────────┘     └─────────────────────────────┘    │
│            │                                                    │
│            │ round == 3                                        │
│            ▼                                                    │
│   ┌──────────────────┐                                         │
│   │  generate_       │  → Claude создает финальный чеклист     │
│   │    checklist     │    на основе всех ответов               │
│   └────────┬─────────┘                                         │
│            │                                                    │
│            ▼                                                    │
│   ┌──────────────────┐                                         │
│   │  generate_       │  → Форматирует в Markdown               │
│   │    markdown      │                                         │
│   └────────┬─────────┘                                         │
│            │                                                    │
│            ▼                                                    │
│        [END]                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔌 API Endpoints

### Backend (FastAPI)

```yaml
POST /api/session/start
  Description: Создает новую сессию и возвращает первые 3 вопроса
  Request: {}
  Response:
    session_id: string
    round: 1
    questions: 
      - id: string
        text: string

POST /api/session/transcribe
  Description: Транскрибирует одно аудио и возвращает текст (для превью)
  Request:
    Content-Type: multipart/form-data
    audio_file: File (webm)
  Response:
    transcript: string

POST /api/session/{session_id}/submit
  Description: Отправляет аудио-ответы и получает следующие вопросы или результат
  Request:
    Content-Type: multipart/form-data
    audio_files: File[] (3 webm files)
    question_ids: string (comma-separated)
  Response (if round < 3):
    round: number (2 or 3)
    questions:
      - id: string
        text: string
    round_summary: string
    is_complete: false
  Response (if round == 3):
    round: 3
    is_complete: true
    checklist_preview: string (markdown)
    round_summary: string

GET /api/session/{session_id}/results
  Description: Получает финальный чеклист
  Response:
    session_id: string
    checklist: ChecklistItem[]
    markdown: string

GET /api/session/{session_id}/download
  Description: Скачивает MD файл
  Response: File (checklist.md)
  Headers:
    Content-Disposition: attachment; filename=checklist-{id}.md

GET /health
  Description: Health check для HuggingFace
  Response:
    status: "healthy"
    whisper_loaded: boolean
```

---

## 🎨 Frontend Components

### Основные компоненты (Shadcn UI)

```typescript
// components/audio-recorder.tsx
interface AudioRecorderProps {
  questionId: string;
  onRecordingComplete: (audioBlob: Blob) => void;
  maxDuration?: number; // seconds, default 120
}

// components/question-card.tsx
interface QuestionCardProps {
  question: {
    id: string;
    text: string;
  };
  index: number;
  isAnswered: boolean;
  onAnswer: (audioBlob: Blob) => void;
}

// components/round-indicator.tsx
interface RoundIndicatorProps {
  currentRound: number;
  totalRounds: number;
  roundSummaries: string[];
}

// components/checklist-preview.tsx
interface ChecklistPreviewProps {
  markdown: string;
  onDownload: () => void;
}
```

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [1. LANDING PAGE]                                              │
│   ┌──────────────────────────────────────────────────┐         │
│   │  "Заполните чеклист созвона с клиентом"          │         │
│   │                                                   │         │
│   │  Описание процесса:                              │         │
│   │  • 3 раунда по 3 вопроса                         │         │
│   │  • Отвечайте голосом                             │         │
│   │  • ~5 минут на заполнение                        │         │
│   │                                                   │         │
│   │  [Начать сессию] ←─── Button (Shadcn)            │         │
│   └──────────────────────────────────────────────────┘         │
│                          │                                      │
│                          ▼                                      │
│  [2. QUESTION PAGE - ROUND 1]                                   │
│   ┌──────────────────────────────────────────────────┐         │
│   │  Progress: ████░░░░░░░░ Round 1/3                │         │
│   │                                                   │         │
│   │  ┌─────────────────────────────────────────┐    │         │
│   │  │ Вопрос 1: "Расскажите о вашем проекте"  │    │         │
│   │  │                                          │    │         │
│   │  │  [🎤 Записать ответ]  [▶️ Прослушать]   │    │         │
│   │  │   ✅ Записано (0:45)                     │    │         │
│   │  └─────────────────────────────────────────┘    │         │
│   │                                                   │         │
│   │  ┌─────────────────────────────────────────┐    │         │
│   │  │ Вопрос 2: "Какие сроки реализации?"     │    │         │
│   │  │  [🎤 Записать ответ]                     │    │         │
│   │  └─────────────────────────────────────────┘    │         │
│   │                                                   │         │
│   │  ┌─────────────────────────────────────────┐    │         │
│   │  │ Вопрос 3: "Какой бюджет?"               │    │         │
│   │  │  [🎤 Записать ответ]                     │    │         │
│   │  └─────────────────────────────────────────┘    │         │
│   │                                                   │         │
│   │  [Отправить ответы →]                            │         │
│   └──────────────────────────────────────────────────┘         │
│                          │                                      │
│                          ▼                                      │
│  [3. PROCESSING]                                                │
│   ┌──────────────────────────────────────────────────┐         │
│   │  🔄 Анализируем ваши ответы...                   │         │
│   │                                                   │         │
│   │  • Транскрибируем аудио                          │         │
│   │  • Анализируем содержание                        │         │
│   │  • Генерируем уточняющие вопросы                 │         │
│   └──────────────────────────────────────────────────┘         │
│                          │                                      │
│                          ▼                                      │
│  [4. ROUNDS 2-3] (аналогично Round 1)                          │
│                          │                                      │
│                          ▼                                      │
│  [5. RESULTS PAGE]                                              │
│   ┌──────────────────────────────────────────────────┐         │
│   │  ✅ Чеклист заполнен!                            │         │
│   │                                                   │         │
│   │  ┌─────────────────────────────────────────┐    │         │
│   │  │ ## Чеклист созвона                      │    │         │
│   │  │                                          │    │         │
│   │  │ ### Информация о проекте                │    │         │
│   │  │ - [x] Название: "AI Assistant"          │    │         │
│   │  │ - [x] Сроки: Q1 2025                    │    │         │
│   │  │ - [ ] Бюджет: требует уточнения         │    │         │
│   │  │                                          │    │         │
│   │  │ ### Технические требования              │    │         │
│   │  │ - [x] Интеграция с CRM                  │    │         │
│   │  │ ...                                      │    │         │
│   │  └─────────────────────────────────────────┘    │         │
│   │                                                   │         │
│   │  [📥 Скачать .md]  [🔄 Начать заново]           │         │
│   └──────────────────────────────────────────────────┘         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🐳 Docker Configuration (HuggingFace Spaces)

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (ffmpeg REQUIRED for audio conversion!)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Force rebuild: v2 (change this comment to invalidate Docker cache)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download Whisper model during build (faster startup)
RUN python -c "from transformers import pipeline; pipeline('automatic-speech-recognition', model='openai/whisper-small')"

# Copy application code
COPY ./app /app/app

# HuggingFace Spaces uses port 7860
EXPOSE 7860

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
```

> 💡 **Tip:** Если изменения в requirements.txt не применяются, измените комментарий "Force rebuild" чтобы сбросить Docker cache.

### requirements.txt

```
# FastAPI & Server
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-multipart==0.0.9

# LangGraph & LLM
langgraph==0.2.60
langchain-anthropic==0.3.0
langchain-core==0.3.29

# Whisper & Audio
transformers==4.44.0
torch==2.1.0
librosa==0.10.1
soundfile==0.12.1
accelerate==0.27.0

# CRITICAL: numpy<2 required for torch compatibility!
numpy<2

# Utilities
pydantic==2.9.0
pydantic-settings==2.5.0
python-dotenv==1.0.0
aiofiles==24.1.0
```

> ⚠️ **ВАЖНО:** `numpy<2` обязателен! PyTorch 2.1.0 скомпилирован с NumPy 1.x и несовместим с NumPy 2.x. Без этого ограничения транскрипция будет падать с ошибкой "Numpy is not available".

---

## 🔐 Environment Variables

### Backend (.env)

```bash
# Anthropic API
ANTHROPIC_API_KEY=sk-ant-...

# App settings
ENVIRONMENT=production
MAX_AUDIO_DURATION_SECONDS=120
WHISPER_MODEL=openai/whisper-small

# CORS
ALLOWED_ORIGINS=https://your-app.vercel.app
```

### Frontend (.env.local)

```bash
# API URL
NEXT_PUBLIC_API_URL=https://your-space.hf.space

# Optional analytics
NEXT_PUBLIC_ANALYTICS_ID=...
```

---

## 📊 Session Storage

Для MVP используем in-memory storage (dict). Для production — Redis или SQLite.

```python
# Simple in-memory store (MVP)
sessions: Dict[str, AgentState] = {}

# Production: Redis
import redis
redis_client = redis.Redis(host='localhost', port=6379, db=0)
```

---

## ⚡ Performance Considerations

### Whisper Model Loading

```python
# Load model once at startup (not per request)
from transformers import pipeline
from functools import lru_cache

@lru_cache(maxsize=1)
def get_whisper_pipeline():
    return pipeline(
        "automatic-speech-recognition",
        model="openai/whisper-small",  # лучше качество для русского
        device="cpu"  # HF Spaces free tier = CPU only
    )

# In FastAPI lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load on startup
    get_whisper_pipeline()
    yield
    # Cleanup on shutdown
```

### Audio Processing

> ⚠️ **ВАЖНО:** Браузер записывает аудио в формате webm (Opus codec). Whisper pipeline не может напрямую читать webm - нужно конвертировать в wav через ffmpeg!

```python
import subprocess
import tempfile
import os

async def transcribe(self, audio_bytes: bytes) -> str:
    """Transcribe audio using local Whisper model with ffmpeg conversion"""
    tmp_webm = None
    tmp_wav = None
    
    try:
        # Save webm to temp file
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(audio_bytes)
            tmp_webm = f.name
        
        # Convert webm to wav using ffmpeg (REQUIRED!)
        tmp_wav = tmp_webm.replace(".webm", ".wav")
        process = subprocess.run([
            "ffmpeg", "-i", tmp_webm,
            "-ar", "16000",  # 16kHz sample rate for Whisper
            "-ac", "1",      # mono
            "-f", "wav",     # force wav format
            "-y",            # overwrite
            tmp_wav
        ], capture_output=True)
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {process.stderr.decode()}")
        
        # Pass file path directly to pipeline
        result = self._pipeline(tmp_wav)
        return result["text"].strip()
        
    finally:
        # Clean up temp files
        for path in [tmp_webm, tmp_wav]:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except:
                    pass
```

**Ключевые моменты:**
1. Браузерный MediaRecorder создает webm (Opus) - не wav!
2. ffmpeg конвертирует в wav с правильным sample rate (16kHz)
3. Pipeline принимает путь к файлу - это самый надежный способ
4. Обязательно удаляем temp файлы после обработки

---

## 🚀 Deployment Steps

### 1. Backend (Hugging Face Spaces)

```bash
# Create new Space
# Settings:
#   - SDK: Docker
#   - Hardware: CPU basic (free)
#   - Visibility: Public

# Add secrets in Space settings:
#   - ANTHROPIC_API_KEY
```

### 2. Frontend (Vercel)

```bash
# Deploy from GitHub
vercel --prod

# Add environment variable:
#   - NEXT_PUBLIC_API_URL=https://username-spacename.hf.space
```

---

## 📋 Checklist Template (что будет генерироваться)

```markdown
# Чеклист созвона с клиентом

**Дата:** 2025-01-15
**Клиент:** [Имя клиента]
**Сессия:** abc123

---

## 📋 Общая информация
- [x] Название проекта: AI Assistant для поддержки
- [x] Контактное лицо: Иван Петров
- [ ] Email: требует уточнения

## 🎯 Цели и задачи
- [x] Основная цель: Автоматизация поддержки клиентов
- [x] Ключевые метрики: Снижение времени ответа на 50%
- [x] Ожидаемый результат: Обработка 80% типовых запросов

## ⏰ Сроки и бюджет
- [x] Желаемый срок запуска: Q1 2025
- [ ] Бюджет: требует уточнения
- [x] Приоритет: Высокий

## 🔧 Технические требования
- [x] Интеграция: CRM Bitrix24
- [x] Платформа: Web + Telegram
- [ ] API документация: ожидается от клиента

## 📝 Дополнительные заметки
- Клиент упомянул возможность расширения на другие каналы
- Важна поддержка русского языка
- Есть существующая база знаний в Notion

---

*Сгенерировано автоматически с помощью AI Checklist Agent*
```

---

## 🔄 Sequence Diagram

```
┌──────┐          ┌──────────┐          ┌─────────┐          ┌───────┐
│Client│          │ Frontend │          │ Backend │          │Claude │
└──┬───┘          └────┬─────┘          └────┬────┘          └───┬───┘
   │                   │                     │                   │
   │  Open app         │                     │                   │
   │──────────────────>│                     │                   │
   │                   │                     │                   │
   │  Click "Start"    │                     │                   │
   │──────────────────>│                     │                   │
   │                   │  POST /start        │                   │
   │                   │────────────────────>│                   │
   │                   │                     │  Generate Q1-3    │
   │                   │                     │──────────────────>│
   │                   │                     │<──────────────────│
   │                   │  {questions: [...]} │                   │
   │                   │<────────────────────│                   │
   │  Show questions   │                     │                   │
   │<──────────────────│                     │                   │
   │                   │                     │                   │
   │  Record audio x3  │                     │                   │
   │──────────────────>│                     │                   │
   │                   │  POST /submit       │                   │
   │                   │  (3 audio files)    │                   │
   │                   │────────────────────>│                   │
   │                   │                     │  Whisper          │
   │                   │                     │  transcribe       │
   │                   │                     │                   │
   │                   │                     │  Analyze +        │
   │                   │                     │  Generate Q4-6    │
   │                   │                     │──────────────────>│
   │                   │                     │<──────────────────│
   │                   │  {round: 2, ...}    │                   │
   │                   │<────────────────────│                   │
   │                   │                     │                   │
   │  [Repeat for rounds 2-3]               │                   │
   │                   │                     │                   │
   │                   │  GET /results       │                   │
   │                   │────────────────────>│                   │
   │                   │                     │  Generate MD      │
   │                   │                     │──────────────────>│
   │                   │                     │<──────────────────│
   │                   │  {markdown: "..."}  │                   │
   │                   │<────────────────────│                   │
   │  Show & download  │                     │                   │
   │<──────────────────│                     │                   │
   │                   │                     │                   │
```

---

## 💰 Cost Estimation

| Service | Free Tier | Est. Monthly Cost |
|---------|-----------|-------------------|
| **Vercel** | 100GB bandwidth | $0 |
| **HuggingFace Spaces** | 2 vCPU, 16GB RAM | $0 |
| **Whisper** | Local model | $0 |
| **Claude Haiku 4.5** | Per token | ~$1-5* |

*Расчет для Claude Haiku 4.5:
- ~1000 токенов на сессию
- 100 сессий/месяц
- $0.25/1M input + $1.25/1M output
- Итого: ~$1-5/месяц

---

## ✅ Next Steps

1. **Phase 1:** Настроить базовый backend с Whisper
2. **Phase 2:** Реализовать LangGraph workflow
3. **Phase 3:** Создать frontend с Shadcn UI
4. **Phase 4:** Интеграция и тестирование
5. **Phase 5:** Deploy на Vercel + HuggingFace

---

## 🐛 Known Issues & Solutions

### 1. NumPy 2.x Incompatibility
**Проблема:** `RuntimeError: Numpy is not available` при транскрипции
**Причина:** PyTorch 2.1.0 скомпилирован с NumPy 1.x
**Решение:** Добавить `numpy<2` в requirements.txt

### 2. WebM Audio Format
**Проблема:** Whisper pipeline не может напрямую обработать webm аудио
**Причина:** Браузерный MediaRecorder записывает в webm (Opus codec)
**Решение:** Конвертировать через ffmpeg в wav перед транскрипцией

### 3. FastAPI Form Fields
**Проблема:** 422 Validation Error при отправке формы
**Причина:** `question_ids` не был помечен как `Form()` field
**Решение:** Использовать `Annotated[str, Form()]` для form fields

### 4. Docker Cache
**Проблема:** Изменения в requirements.txt не применяются
**Причина:** Docker layer caching на HuggingFace Spaces
**Решение:** Изменить Dockerfile (добавить комментарий) чтобы invalidate cache

---

## 🛠️ CLI Commands Reference

### HuggingFace CLI
```bash
# Login
huggingface-cli login

# Create Space
hf repo create username/space-name --repo-type space --space-sdk docker

# Upload files
hf upload username/space-name . --repo-type space

# Add secret (Python)
python -c "
from huggingface_hub import HfApi
api = HfApi()
api.add_space_secret('username/space-name', 'KEY', 'value')
"
```

### Vercel CLI
```bash
# Login
vercel login

# Deploy to production
vercel --prod

# Add environment variable
vercel env add NEXT_PUBLIC_API_URL production
```
