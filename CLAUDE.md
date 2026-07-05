# CLAUDE.md — база знаний проекта talkarabic voice

> Этот файл читается автоматически при открытии проекта. Он даёт новому
> контекстному окну (или новому разработчику) полную картину: что за продукт,
> как устроен, что уже сделано, что в работе, как запускать и деплоить.
> Секреты (ключи, инвайт-коды, пароли) здесь НЕ хранятся — репозиторий
> публичный. Операционные секреты — в приватной памяти Claude и в Coolify env.

---

## 1. Что это за продукт

**Внутренний инструмент Школы арабского языка** (talkarabicnow.online) для
менеджеров по продажам. Это **не** учебный проект — реальный продукт в эксплуатации.

**Сценарий:** менеджер пообщался с клиентом в Telegram / WhatsApp / по телефону.
После разговора открывает инструмент и **наговаривает голосом** (или вписывает
текстом) ответы на 10 фиксированных вопросов о клиенте. Система:
1. транскрибирует речь (локальный Whisper, язык — русский),
2. структурирует ответы в чеклист по 6 категориям (MiniMax M3 через OpenRouter),
3. добавляет аналитику лида (оценка 1–10, стадия, возражения, черновик
   follow-up, задачи, дата следующего касания),
4. сохраняет в базу, отдаёт `.md`, показывает на дашборде, шлёт строку в Google Sheets.

**Важно:** это пост-разговорный конспект, который менеджер делает ОДИН. Клиента
не записывают, вопросы вслух ему не задают — менеджер пересказывает итоги.

**Язык:** только русский (несмотря на название «talkarabic»). Диалект арабского —
это лишь одно из полей анкеты, сам интерфейс и транскрипция на русском.

**LLM:** через OpenRouter. Прод на `openai/gpt-4o` (с 2026-06-16; раньше был
`minimax/minimax-m3`, но он ~100с медленный — заменён). Смена модели — одна env.

### 10 вопросов (3 раунда: 4 + 3 + 3)
- **Раунд 1 (знакомство):** имя+локация, источник лида, мотивация, диалект
- **Раунд 2 (опыт/формат):** уровень, опыт онлайн-курсов, готовность к Zoom
- **Раунд 3 (условия):** часы в неделю, бюджет, пожелания (пол преподавателя и т.д.)

Вопросы фиксированные (`backend/app/agent/questions_template.py`), LLM их НЕ
генерирует — только анализирует ответы и собирает чеклист.

---

## 2. Архитектура

```
Менеджеры (Египет, Россия, мир)
   ├── UI ─────────→ Vercel CDN  (Next.js, бесплатно, глобально быстро)
   │                  ai-agent-talkarabic-voice.vercel.app
   └── API/голос ──→ DigitalOcean droplet (Coolify + Docker)
                      https://api.talkarabicnow.online
                      ├── FastAPI + LangGraph
                      ├── Whisper (локально, ffmpeg webm→wav)
                      ├── SQLite на постоянном диске
                      └── → OpenRouter (MiniMax M3)
```

Гибрид: фронт на Vercel (CDN, $0), бэкенд на своём сервере (постоянная база,
не засыпает). Фронт ходит на бэкенд по `NEXT_PUBLIC_API_URL`.

### Стек
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind 4
  (токены OKLCH в `globals.css`), lucide-react, Inter + JetBrains Mono.
- **Backend:** Python 3.11, FastAPI, LangGraph 0.2, Pydantic 2,
  SQLAlchemy 2 async + aiosqlite, PyJWT, httpx.
- **Speech-to-text:** Whisper small (`openai/whisper-small`) через
  `transformers pipeline`, ffmpeg для конвертации webm→wav 16 kHz.
- **LLM:** OpenRouter (OpenAI SDK + base_url), модель `openai/gpt-4o` (env `OPENROUTER_MODEL`).
- **Хранение:** SQLite (таблицы `managers`, `checklists`).
- **Auth:** JWT (HS256), пароли pbkdf2, регистрация по инвайт-кодам, роли
  `manager` / `admin`.

---

## 3. Состояние продакшена (живёт с 2026-06-14)

| Компонент | Где | Статус |
|---|---|---|
| Frontend | https://ai-agent-talkarabic-voice.vercel.app | ✅ работает |
| Backend | https://api.talkarabicnow.online | ✅ работает, HTTPS |
| Сервер | DigitalOcean droplet, Frankfurt, Ubuntu 24.04, 2 vCPU / 4 GB + 4 GB swap | ✅ |
| Панель Coolify | http://IP:8000 | ✅ |
| База | SQLite на volume `talkarabic-data` → `/app/data/app.db` | ✅ переживает редеплои |
| Домен | `api.talkarabicnow.online` (A-запись на reg.ru → IP droplet) | ✅ |
| GitHub | github.com/kseniausacheva/AI-agent-talkarabic-voice (public) | ✅ авто-деплой Vercel |

- **Деплой бэкенда:** Coolify собирает из `backend/Dockerfile` (Build Pack:
  Dockerfile, Base Directory: `/backend`, порт 7860), Traefik даёт SSL.
- **Env-переменные бэкенда** заданы в Coolify (НЕ в .env на проде):
  `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `AUTH_SECRET`, `INVITE_CODE`,
  `ADMIN_INVITE_CODE`, `WHISPER_LANGUAGE=ru`, `ALLOWED_ORIGINS`,
  `DATABASE_PATH=/app/data/app.db`. Опционально (Спринт 6, Telegram):
  `TELEGRAM_BOT_TOKEN`, `CRON_SECRET`. (Конкретные значения — в приватной памяти.)
- **Vercel env:** `NEXT_PUBLIC_API_URL=https://api.talkarabicnow.online`,
  `NEXT_PUBLIC_USE_MOCK=false`.
- Конкретные секреты, IP, инвайт-коды, имя контейнера — в приватной памяти
  Claude (`~/.claude/.../memory/project_deploy_roadmap.md`), не в репозитории.

**Легаси:** раньше бэкенд жил на HuggingFace Space `Ksenia8090/talkarabic-backend`
(эфемерная база — поэтому ушли на DO). Клон для пуша на HF: `D:\hf-talkarabic-backend`.
Можно остановить/удалить.

---

## 4. Что сделано (спринты)

- **Спринт 1 (MVP):** голос → 10 вопросов в 3 раунда → финальный чеклист `.md`,
  превью транскрипции, скачивание.
- **Спринт 2:** SQLite-база, JWT-auth с инвайт-кодами (роли manager/admin),
  Google Sheets вебхук, имя клиента + дата перед стартом, пропуск вопроса,
  текстовый ввод (альтернатива голосу), дашборд чеклистов, статистика для admin.
  Спека: `docs/SPEC-sprint2.md`.
- **Спринт 3 (аналитика лида):** MiniMax дополнительно возвращает `insights`
  (lead_score 1–10, стадия new/warm/hot/rejected, возражения, follow_up_draft,
  задачи, next_contact_date) — без лишнего вызова LLM. Блок «Аналитика лида» на
  странице результата, «Сегодня связаться» на дашборде, coaching-статистика
  «какие вопросы пропускают». Спека: `docs/SPEC-sprint3.md`.
- **Спринт 4 (скорость + сделки/продажи, 2026-06-14):**
  - *Скорость финала:* ~46s → ~27s (−40%). Убран лишний `analyze_round(3)` из
    ожидания (граф: финал идёт сразу в генерацию), вывод сокращён 25→14-16
    пунктов, починен краш `_parse_json` на дублированном JSON M3 (`{...}{...}`).
    Замер до/после: `backend/scripts/measure_latency.py`.
  - *Учёт сделок:* модель `DealInfo` (продукт individual/course/undecided,
    стоимость, рассрочка, плановая дата оплаты, `paid`=сделка закрыта) + колонка
    `checklists.deal_json` (авто-миграция). ИИ предлагает поля сделки из разговора
    (блок `deal` в `generate_checklist`), менеджер правит руками на `/results`
    (`PATCH /api/session/{id}/deal`; оплата приходит позже → пересобирается `.md`).
    Месячная аналитика продаж (выручка/закрыто/средний чек/ожидают/по продуктам) и
    «Что не получилось» (возражения, отказы) на `/stats`. Тест:
    `backend/scripts/test_deal_flow.py`.
- **Спринт 5 (премиум-редизайн под бренд, 2026-06-14):** светлая премиум-тема
  ВСЕГДА — убран `@media (prefers-color-scheme: dark)` из `globals.css` (он форсил
  тёмную тему при тёмной ОС, что и не подошло). Точные бренд-цвета (голубой
  `#43abd0` идентичность, красный `#fb3501` CTA/запись, ink `#092127`), шрифты
  Oswald (заголовки, `.font-display`) + Inter (body), фирменный `HeroCanvas`
  (звуковые волны на лендинге, лёгкий Canvas2D), компонент-классы `.btn*/.card/
  .input`, мягкие тени, эквалайзер при записи. Дизайн-система — `globals.css` +
  `DESIGN.md`. Все 7 экранов перерисованы, `next build` проходит, контраст и
  адаптив проверены.
- **Спринт 6 (новые инструменты — мини-CRM, 2026-06-15):** свой инструментарий
  вместо внешней CRM (пользователь: «зачем Bitrix24, сделаем сами лучше»).
  - **F1. Анализ переписки:** менеджер вставляет диалог из Instagram/WhatsApp/
    Telegram (вы общаетесь с клиентами ТЕКСТОМ, не голосом) → ИИ строит чеклист +
    сделку + аналитику сразу, без 10 вопросов. `POST /api/session/from-text`,
    `llm.analyze_conversation`, `SYSTEM_ANALYZE_CONVERSATION`, режим на `/session`.
    (Скриншоты-OCR — на будущее: M3 текстовая, картинки не читает.)
  - **F2. Telegram-уведомления «сегодня связаться»:** `POST /api/cron/notify-due`
    (защита `X-Cron-Secret`) шлёт менеджеру список due-контактов; колонка
    `managers.telegram_chat_id` (привязка на `/settings`), сервис `telegram.py`.
    Включается env `TELEGRAM_BOT_TOKEN`+`CRON_SECRET` + Coolify Scheduled Task
    (cron) на эндпоинт. Менеджер: написать боту `/start`, взять chat_id у
    `@userinfobot`, вставить на `/settings`.
  - **F3. Канбан-воронка `/pipeline`:** колонки Новый/Тёплый/Горячий/Оплачено/
    Отказ, drag-drop (нативный HTML5, без либ), `PATCH /api/session/{id}/funnel`.
- **Спринт 7 (советник, база, общий доступ, gpt-4o, 2026-06-16):**
  - **Переход на `openai/gpt-4o`** (через OpenRouter) — M3 был ~100с, gpt-4o ~6с
    (бенчмарк `backend/scripts/compare_models.py`). Это разблокировало vision.
  - **Скриншоты переписки = текст:** `POST /api/session/extract-screenshots`
    (gpt-4o vision) → распознаёт диалог. На `/session` переписка теперь
    НЕ «или вопросы / или текст», а опциональное вложение (текст и/или скриншоты),
    которое учитывается ВМЕСТЕ с ответами в финальном чеклисте.
  - **AI-советник «План работы с клиентом»** на `/results`: `POST /api/session/{id}/advice`
    (`llm.generate_advice`, `SYSTEM_CLIENT_ADVICE`) — как общаться, что уточнить,
    ответы на возражения СЛОВАМИ ИЗ БАЗЫ, план касаний. Кнопка → on-demand.
  - **База скриптов школы:** таблица `app_settings` (`AppSetting`), роутер
    `knowledge.py` (`GET/PUT /api/knowledge`, admin), страница `/knowledge`.
    Загружается в прод (см. приватную память; правится на `/knowledge` или по SSH).
    gpt-4o берёт её как контекст для советника.
  - **Общий пул клиентов:** вся команда видит и ведёт ВСЕХ клиентов (снят фильтр
    `manager_id` в `list_checklists` и ограничение владельца в `_check_access`).
    Регистрация менеджера — инвайт `talkarabic-team-2026` (admin — `...-boss-2026`).
- **Спринт 8 (правка/удаление клиента + платформа, 2026-07-05):**
  - **Редактирование всех данных клиента** на `/results`: блок «Данные клиента и
    сделка» стал буферным (правишь любые поля → ОДНА кнопка «Сохранить», не
    автосейв). Имя и дата контакта теперь редактируются: `PATCH /api/session/{id}/client`
    (`ClientUpdate`, `SessionManager.update_client`). Причина: пользователю было
    непонятно старое автосохранение сделки «без кнопки».
  - **Удаление клиента** (безвозвратно): `DELETE /api/session/{id}`
    (`SessionManager.delete_session`, общий пул). Кнопка с двухшаговым
    подтверждением на `/results` (→ редирект на дашборд) и иконка-корзина в
    строке дашборда (инлайн-подтверждение).
  - **Платформа самообучения** (фильмы/песни): `ProductType += "platform"` +
    отдельное поле `DealInfo.platform_status` (not_offered|offered|taken) —
    трекер «предложили ли платформу клиенту», независимо от основного продукта.
    Отдельное окошко «Платформа» в карточке сделки; статус идёт и в `.md`.
    Поле в `deal_json` авто-совместимо (дефолт not_offered) — миграция БД НЕ нужна.
  - *Грабли деплоя:* второй Redeploy подряд в Coolify — быстрый (~1.5 мин, тёплый
    Docker-кэш слоёв torch), а не 13 мин как первый после долгого простоя.

Исследование рынка и приоритеты дальнейших фич: `docs/RESEARCH-roadmap.md`.

---

## 5. В работе / не доделано

> ⭐ **Приоритетные задачи от пользователя (2026-06-14) — см. `docs/NEXT-STEPS.md`:**
> 1. ✅ **Ускорить формирование чеклиста** — СДЕЛАНО (Спринт 4, −40%).
> 2. ✅ **Учёт сделок/продаж** — СДЕЛАНО (Спринт 4): блок «Сделка», месячная аналитика.
> 3. ✅ **Премиум-редизайн под бренд** — СДЕЛАНО (Спринт 5): светлая тема всегда
>    (убран форс dark), точные цвета (#43abd0 / #fb3501 / #092127), Oswald+Inter,
>    hero-canvas (звуковые волны), премиум-компоненты. Источник истины —
>    `frontend/src/app/globals.css` + `DESIGN.md`. Прод-сборка проходит.


- **Google Sheets интеграция** — backend готов (`backend/app/services/gsheets.py`),
  но Apps Script на стороне Google ещё настраивается. Две проблемы всплыли при
  настройке: (1) доступ веб-приложения должен быть «Все/Anyone», (2) скрипт
  получился standalone, поэтому в коде нужен `SpreadsheetApp.openById('<ID>')`
  вместо `getActiveSpreadsheet()`. Инструкция: `docs/GSHEETS_SETUP.md`.
  **НЕ блокер** — прод работает без Sheets (чеклисты в базе, `.md`, дашборд).
- **Vercel billing** — было предупреждение «Payment failed», нужно разобрать
  в Settings → Billing, иначе фронт могут приостановить.
- **Ротация `OPENROUTER_API_KEY`** — ключ светился в переписке, стоит перевыпустить
  на openrouter.ai и обновить в Coolify.
- **Опционально:** `app.talkarabicnow.online` как красивый домен фронта;
  whisper-medium для лучшего распознавания имён; Redis вместо in-memory локов;
  встраивание в CRM (Kommo/Bitrix24) — см. RESEARCH-roadmap.

---

## 6. Структура репозитория

```
backend/
  app/
    main.py              # FastAPI + lifespan (init_db + preload Whisper)
    config.py            # Settings (env): OpenRouter, Whisper, auth, gsheets, db
    db.py                # SQLAlchemy async, модели Manager/Checklist, миграции
    routers/
      auth.py            # /api/auth/register, /login, /me
      session.py         # /api/session/start, /transcribe, /{id}/submit, /results, /download
      checklists.py      # /api/checklists (дашборд, due=today), /api/stats
      health.py          # /health
    services/
      transcription.py   # Whisper + ffmpeg (ленивый импорт transformers)
      llm.py             # OpenRouter MiniMax M3: analyze_round, generate_checklist(+insights)
      session_manager.py # сессии в БД, completeness, доступ владелец/admin
      file_generator.py  # Markdown-чеклист
      gsheets.py         # fire-and-forget вебхук в Google Sheets
      auth.py            # pbkdf2 + JWT, get_current_manager, require_admin
    agent/
      questions_template.py  # 10 фиксированных вопросов
      prompts.py, nodes.py, graph.py, state.py  # LangGraph
    models/              # Pydantic: question, session, checklist (+LeadInsights)
  Dockerfile             # универсальный (DO/Coolify/HF), non-root user 1000, mkdir /app/data
  requirements.txt
  scripts/
    smoke_test_llm.py    # быстрая проверка OpenRouter
    e2e_sprint2.py       # полный e2e против локального/прод бэкенда

frontend/
  src/app/               # / (landing), /login, /register, /session, /results/[id],
                         # /dashboard, /stats  (+ AuthGuard, AppHeader)
  src/components/        # AudioRecorder (голос/текст), QuestionCard (+пропуск),
                         # RoundIndicator, ChecklistPreview, MockBanner
  src/lib/
    api.ts               # все запросы (Bearer; mock-режим NEXT_PUBLIC_USE_MOCK)
    auth.ts              # токен в localStorage
    types.ts, mock-data.ts, cn.ts
  public/architecture.html  # копия визуализации архитектуры

docs/
  SPEC-sprint2.md, SPEC-sprint3.md   # контракты backend↔frontend
  RESEARCH-roadmap.md                # исследование: фичи, граница с CRM, встраивание
  GSHEETS_SETUP.md                   # настройка Google Sheets (Apps Script)

DEPLOY.md            # боевой деплой: DigitalOcean + Coolify (актуальный)
DEPLOY_FREE.md       # бесплатный демо: HF Spaces + Vercel (легаси)
MANAGER_GUIDE.md     # инструкция для менеджеров (v0.2)
PRODUCT.md, DESIGN.md  # impeccable-контекст (регистр, бренд, токены)
architecture-preview.html  # визуализация работы системы (Mermaid + моки экранов)
presentation/        # PPTX + PDF инструкция-презентация
checklist-agent-architecture.md  # исходный архитектурный план (устарел: там Claude Haiku)
```

---

## 7. Как запускать локально

**Frontend (mock-режим, без бэкенда):**
```
cd frontend
npm install
npm run dev          # http://localhost:3000
```
`frontend/.env.local`: `NEXT_PUBLIC_USE_MOCK=true` — UI работает на предзаписанных
данных, без логина и микрофона. `false` — ходит на `NEXT_PUBLIC_API_URL`.

**Backend (нужны Python 3.11+, ffmpeg, ~3 ГБ под torch+whisper):**
```
cd backend
.venv/Scripts/python -m uvicorn app.main:app --port 7860
```
Whisper грузится при старте; без torch стартует, но `/transcribe` не работает
(ленивый импорт). Для проверки LLM без torch: `python -m scripts.smoke_test_llm`.
Полный e2e против прода/локалки: `python -m scripts.e2e_sprint2`
(внутри указан BASE и тестовые ответы; правит при необходимости).

**Whisper на локальной машине пользователя НЕ установлен** — голос локально
не транскрибируется. Для тенка с реальным микрофоном используется прод-бэкенд
(`NEXT_PUBLIC_USE_MOCK=false` + `NEXT_PUBLIC_API_URL=https://api.talkarabicnow.online`).

---

## 8. Деплой и обслуживание

- **Обновить прод:** `git push` в `main` → Vercel пересобирает фронт автоматически.
  **Бэкенд авто-деплой ВЫКЛЮЧЕН** (проверено 2026-06-15: push новый код не выкатил).
  После push в `main` НУЖНО вручную нажать **Redeploy** в Coolify (ресурс
  `api.talkarabicnow.online`, ~12-15 мин из-за torch). ⚠ **Смена env-переменных
  (напр. `OPENROUTER_MODEL`) применяется ТОЛЬКО через Redeploy** — кнопка
  **Restart** в этом Coolify контейнер НЕ пересоздаёт и новые env НЕ подхватывает
  (проверено 2026-06-16). Колонки-миграции
  (`deal_json`, `telegram_chat_id` и т.п.) накатываются автоматически в `init_db()`
  при старте контейнера. *(Можно включить авто-деплой: Coolify → приложение →
  toggle «Automatic Deployment» + GitHub-webhook — тогда push будет деплоить сам.)*
- **Поменять env бэкенда:** Coolify → ресурс → Environment Variables →
  Developer view → сохранить → **Restart**.
- **База:** `/app/data/app.db` в Docker-volume `talkarabic-data`. Доступ для
  обслуживания: `docker exec <container> python -c "import sqlite3; ..."`.
- **SSH на сервер:** работает с локального ключа `~/.ssh/id_ed25519`.
- Полная инструкция деплоя с нуля: `DEPLOY.md`.

---

## 9. Контекст и грабли (важно помнить)

- **Пользователь в Египте**, не в России (несмотря на русский язык контента).
  НЕ предлагать RU-хостинги. Hetzner блокирует регистрации из MENA — поэтому
  выбран DigitalOcean (у пользователя есть рабочий аккаунт).
- **LLM — `openai/gpt-4o` через OpenRouter** (с 2026-06-16). Требование «только
  MiniMax M3» снято самой пользовательницей после бенчмарка (M3 ~100с медленный).
  Через OpenRouter доступны любые модели сменой `OPENROUTER_MODEL` — отдельный
  OpenAI-аккаунт не нужен. Бенчмарк моделей: `backend/scripts/compare_models.py`.
- **Стиль работы:** пользователь предпочитает действия вопросам, краткие
  практичные ответы. Делать разумные дефолты, проговаривать их одной строкой.
- **Git на Windows:** предупреждения LF→CRLF при коммите — норма, игнорировать.
- **D:\arablearn** — ДРУГОЙ проект пользователя (YouTube-тренажёр арабского),
  иногда редактируется параллельной сессией. Не трогать без явной просьбы.
- **Frontend на Next.js 16** — у него свой `frontend/AGENTS.md`: API могут
  отличаться от привычных, при правках фронта свериться с доками в node_modules.
- Бренд-цвета школы (точные, с сайта talkarabicnow.online): красный `#fb3501`,
  голубой `#43abd0`, ink `#092127`, светло-голубой `#cbf6fd`. В текущем UI
  голосового агента использованы OKLCH-приближения (голубой primary, красный
  accent) — при желании можно подогнать под точные.

---

*Обновлено: 2026-06-14. При существенных изменениях — поддерживай этот файл в актуальном виде.*
