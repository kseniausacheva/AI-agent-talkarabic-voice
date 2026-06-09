# Бесплатный деплой для проверки преподавателем

Цель: получить две публичные ссылки за 20–30 минут, без аренды серверов,
без оплаты. Преподаватель открывает frontend-ссылку, реально говорит в
микрофон, получает рабочий чеклист.

**Что используем:**
- **HuggingFace Spaces** — backend в Docker (бесплатно)
- **Vercel** — frontend (бесплатно)
- **GitHub** — связка для авто-деплоя (бесплатно)

---

## Что получится

| Сервис | Ссылка | Что там |
|---|---|---|
| Backend | `https://username-talkarabic-backend.hf.space` | FastAPI + Whisper + LLM |
| Frontend | `https://talkarabic-school.vercel.app` | UI школы арабского |

Преподаватель кликает по frontend-ссылке → проходит чеклист реальным голосом → скачивает `.md`.

---

## Шаг 0. Аккаунты (если ещё нет)

Нужны три бесплатных аккаунта. Каждый — 2 минуты на регистрацию:

- [GitHub](https://github.com/signup) — для кода
- [HuggingFace](https://huggingface.co/join) — для backend
- [Vercel](https://vercel.com/signup) — для frontend (можно войти через GitHub)

---

## Шаг 1. Залей код на GitHub

В PowerShell в корне проекта:

```powershell
cd "D:\AI agent talkarabic voice"
git init
git add .
git commit -m "школа арабского — чеклист клиента v0.1"
```

Создай новый репозиторий на <https://github.com/new>:
- **Repository name**: `talkarabic-school` (или любое)
- **Private** — рекомендую, если не хочешь чтобы код был публичным
- **БЕЗ** README, gitignore, лицензии (у нас уже есть)
- Жми **Create repository**

После создания на странице репо будут команды. Скопируй и выполни:

```powershell
git remote add origin https://github.com/ТВОЙ_ЛОГИН/talkarabic-school.git
git branch -M main
git push -u origin main
```

При первом push GitHub попросит логин/пароль или Personal Access Token.
Если не разбираешься — используй [GitHub Desktop](https://desktop.github.com/),
он сделает push в один клик.

---

## Шаг 2. Деплой Backend на HuggingFace Spaces

### 2.1. Создай Space

1. Зайди на <https://huggingface.co/new-space>
2. Параметры:
   - **Owner**: твой username
   - **Space name**: `talkarabic-backend`
   - **License**: Apache 2.0 (или любое)
   - **Select the Space SDK**: **Docker** → шаблон **Blank**
   - **Space hardware**: **CPU basic (free)** — 2 vCPU, 16 GB RAM
   - **Visibility**: Public (приватные Spaces платные)
3. Жми **Create Space**.

### 2.2. Залей backend через git

HF Space — это git-репозиторий. Залить можно прямо из нашей `backend/` папки.

В PowerShell:

```powershell
cd "D:\AI agent talkarabic voice\backend"
git init
git remote add origin https://huggingface.co/spaces/ТВОЙ_ЛОГИН/talkarabic-backend
git fetch
git checkout -b main
# README с YAML frontmatter — HF читает оттуда настройки Space
copy README.hf.md README.md
git add .
git commit -m "initial backend"
git push origin main
```

При push HF попросит токен (не пароль). Создай его здесь:
<https://huggingface.co/settings/tokens> → **New token** → Type: **Write** →
скопируй. Логин — твой username, пароль — этот токен.

### 2.3. Добавь секрет OPENROUTER_API_KEY

1. На странице Space → **Settings** (значок шестерёнки сверху)
2. Прокрути до **Variables and secrets**
3. **New secret**:
   - Name: `OPENROUTER_API_KEY`
   - Value: твой ключ от OpenRouter (`sk-or-v1-...`)
   - Жми **Save**
4. Опционально, **New variable** (не секрет — обычная env-переменная):
   - `WHISPER_LANGUAGE` = `ru`
   - `OPENROUTER_MODEL` = `minimax/minimax-m3`

### 2.4. Дождись сборки

HF автоматически начнёт сборку Docker-образа.

- Открой вкладку **Logs** (или **App** → правый верх → **Building**)
- Сборка занимает **10–15 минут** в первый раз (качается torch + Whisper).
- Когда увидишь `Uvicorn running on http://0.0.0.0:7860` — backend готов.

### 2.5. Проверь backend

URL твоего Space: `https://ТВОЙ_ЛОГИН-talkarabic-backend.hf.space`

Открой в браузере:

- `https://ТВОЙ_ЛОГИН-talkarabic-backend.hf.space/health` → должно
  вернуть `{"status":"healthy","whisper_loaded":true}`. Первый запрос может
  идти 30 сек (прогрев), последующие моментально.
- `https://ТВОЙ_ЛОГИН-talkarabic-backend.hf.space/docs` → Swagger UI

**Сохрани URL вида `https://ТВОЙ_ЛОГИН-talkarabic-backend.hf.space`** —
он понадобится во фронте.

---

## Шаг 3. Деплой Frontend на Vercel

### 3.1. Подключи репозиторий

1. Зайди на <https://vercel.com/new>
2. **Import Git Repository** → выбери `talkarabic-school`
3. На странице импорта:
   - **Project Name**: `talkarabic-school`
   - **Framework Preset**: Next.js (определится автоматически)
   - **Root Directory**: нажми **Edit** → выбери `frontend`
   - **Build and Output Settings**: оставь по умолчанию

### 3.2. Добавь переменные окружения

В разделе **Environment Variables** (на той же странице импорта):

| Имя | Значение |
|---|---|
| `NEXT_PUBLIC_USE_MOCK` | `false` |
| `NEXT_PUBLIC_API_URL` | `https://ТВОЙ_ЛОГИН-talkarabic-backend.hf.space` |

### 3.3. Жми **Deploy**

Сборка ~2 минуты. Когда закончится, Vercel покажет URL типа
`https://talkarabic-school.vercel.app` или
`https://talkarabic-school-username.vercel.app`.

**Сохрани этот URL — это и есть ссылка для преподавателя.**

---

## Шаг 4. Настрой CORS в backend

Сейчас backend разрешает запросы только с `localhost`. Добавим Vercel-домен.

### Вариант A: через HF Spaces Variables (рекомендую)

1. HF Space → **Settings → Variables and secrets**
2. **New variable**:
   - Name: `ALLOWED_ORIGINS`
   - Value: твой Vercel-URL, например
     `https://talkarabic-school.vercel.app,http://localhost:3000`
3. **Factory rebuild** → Space перезапустится с новой переменной (1 минута).

### Вариант B: захардкодить в .env

В `backend/app/config.py` поменять default:

```python
allowed_origins: str = Field(
    default="https://talkarabic-school.vercel.app,http://localhost:3000"
)
```

`git push` в backend репо → HF пересоберёт.

---

## Шаг 5. Финальная проверка

1. Открой свой Vercel URL в Chrome
2. Жми **«Новый клиент — начать»**
3. Браузер спросит разрешение на микрофон — разреши
4. Запиши тестовый ответ голосом (любой)
5. Дождись транскрипции (3–8 секунд)
6. Подтверди, ответь на остальные вопросы
7. Дойди до раунда 3 → жми **«Сформировать чеклист»**
8. Проверь что получился готовый чеклист со скачиванием `.md`

Если что-то падает — открой **DevTools (F12)** → **Network**, посмотри
какой запрос вернул ошибку:

- `CORS error` → не настроен `ALLOWED_ORIGINS` в HF
- `500 Internal Server Error` → смотри логи Space на HF
- `404` → проверь что `NEXT_PUBLIC_API_URL` в Vercel правильный
- `Microphone not allowed` → проверь разрешения в адресной строке Chrome

---

## Шаг 6. Что отправить преподавателю

Текст письма / сообщения:

> **AI-агент для школы арабского — голосовой чеклист клиента**
>
> Веб-приложение для менеджеров школы: после разговора с клиентом менеджер
> наговаривает голосом ответы на 10 вопросов, на выходе получает структурированный
> Markdown-чеклист со статусами для CRM.
>
> **Технологии:** Next.js 16 + TypeScript на фронте; Python FastAPI + LangGraph
> на бэке; локальный Whisper для транскрипции; MiniMax M3 через OpenRouter для
> структуризации.
>
> **Проверить:**
> - Веб-приложение: https://talkarabic-school.vercel.app
> - Архитектура с объяснением: https://talkarabic-school.vercel.app/architecture.html
> - API Swagger: https://ТВОЙ_ЛОГИН-talkarabic-backend.hf.space/docs
> - Исходный код: https://github.com/ТВОЙ_ЛОГИН/talkarabic-school
> - Инструкция менеджера: см. MANAGER_GUIDE.md в репозитории
>
> Чтобы пройти чеклист — нужен микрофон в браузере. Первый запрос после длительной
> паузы может занять 30 секунд (HuggingFace Spaces засыпает при неактивности,
> просыпается за минуту).

---

## Особенности и ограничения бесплатного тарифа

### HuggingFace Spaces (CPU basic free)

- ✓ Бесплатно навсегда
- ✓ Достаточно для Whisper-small + редких запросов
- ✗ **Засыпает после 48 часов без запросов** — первый запрос будит, ждать 30–90 сек
- ✗ Сессии в памяти теряются при перезагрузке Space (~раз в день автоматически)
- ✗ Одновременных пользователей — пара штук

Если преподаватель попадает на «спящий» Space, увидит сначала ошибку, потом
надо подождать минуту и повторить. Это норма для free tier.

### Vercel Hobby

- ✓ Бесплатно навсегда
- ✓ Без сна, мгновенный отклик
- ✓ Авто-деплой при `git push`
- ✗ 100 GB трафика в месяц — нам хватит с запасом

### OpenRouter (MiniMax M3)

- ✓ Один чеклист ≈ 1 рубль
- ✓ Платишь только за реально потраченные токены
- ✓ Стартовый депозит можно сделать на $5 → этого хватит на сотни сессий

---

## Если что-то пошло не так

| Проблема | Что делать |
|---|---|
| HF build падает на `pip install torch` | Подожди и нажми **Restart Space**. Иногда HF в моменте перегружен. |
| Backend на HF возвращает 503 | Space спит. Открой URL `/health` в браузере, подожди 60 сек. |
| Vercel build падает | Открой Build Logs, скорее всего проблема с `NEXT_PUBLIC_API_URL` (нет переменной). |
| Микрофон не работает на Vercel | Проверь, что URL начинается с `https://` — getUserMedia требует HTTPS, на Vercel это автоматически. |
| Транскрипция приходит как мусор | Whisper-small слаб на русском. Поменяй в HF переменную `WHISPER_MODEL=openai/whisper-medium` и сделай Factory rebuild (он будет +5 минут собираться). |

---

## Когда нужен платный прод

Этот бесплатный вариант — идеально для проверки преподавателем, демо
клиенту, presentation. Для **боевого использования менеджерами** (когда
сервис нужен 24/7 без сонных пауз):

→ см. [DEPLOY.md](DEPLOY.md) (Hetzner CX22 + Coolify, €4.5/мес).

---

*Версия: v0.1 · Школа арабского*
