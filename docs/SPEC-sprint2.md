# Спецификация: Спринт 2 — БД, auth, Sheets, дашборд

Контракты между backend и frontend. Оба исполнителя следуют этому документу
буквально — расхождение имён полей недопустимо.

## 1. База данных (SQLite + SQLAlchemy 2.0 async + aiosqlite)

Файл БД: `data/app.db` относительно рабочей директории backend (создавать
директорию при старте). Путь переопределяется env `DATABASE_PATH`.

### Таблица `managers`

| Колонка | Тип | Примечание |
|---|---|---|
| id | INTEGER PK autoincrement | |
| username | TEXT UNIQUE NOT NULL | нижний регистр, 3–32 символа `[a-z0-9_]` |
| password_hash | TEXT NOT NULL | формат `pbkdf2$<iterations>$<salt_hex>$<hash_hex>` |
| display_name | TEXT NOT NULL | как показывать в UI |
| role | TEXT NOT NULL | `manager` или `admin` |
| created_at | TEXT NOT NULL | ISO 8601 UTC |

### Таблица `checklists`

| Колонка | Тип | Примечание |
|---|---|---|
| id | TEXT PK | session_id (uuid hex 12) |
| manager_id | INTEGER NOT NULL FK managers.id | |
| client_name | TEXT NOT NULL | |
| client_date | TEXT NOT NULL | дата контакта, `YYYY-MM-DD` |
| status | TEXT NOT NULL | `in_progress` или `completed` |
| created_at | TEXT NOT NULL | ISO 8601 UTC |
| completed_at | TEXT NULL | ISO 8601 UTC |
| answers_json | TEXT NOT NULL DEFAULT '[]' | список Answer |
| summaries_json | TEXT NOT NULL DEFAULT '[]' | список строк |
| checklist_json | TEXT NULL | список ChecklistItem |
| markdown | TEXT NULL | |
| sheet_synced | INTEGER NOT NULL DEFAULT 0 | 0/1 |

Активные сессии живут в БД (НЕ в памяти): SessionManager читает/пишет
checklists по id. In-memory dict удалить.

## 2. Auth

- Пароли: stdlib `hashlib.pbkdf2_hmac('sha256', password, salt, 200_000)`.
- Токены: PyJWT, HS256, payload `{sub: manager_id, username, role, exp}`,
  срок 30 дней. Секрет — env `AUTH_SECRET` (обязателен в проде, дефолт
  `dev-secret-change-me` с warning в логе).
- Инвайт-коды при регистрации: env `INVITE_CODE` (роль manager),
  `ADMIN_INVITE_CODE` (роль admin). Если код не совпал ни с одним — 403.
- Зависимость FastAPI `get_current_manager` читает `Authorization: Bearer <jwt>`;
  401 при отсутствии/просрочке.
- Новые зависимости в requirements.txt: `PyJWT==2.10.1`,
  `SQLAlchemy==2.0.36`, `aiosqlite==0.20.0`, `greenlet`.

## 3. REST API

Все session/checklist/stats эндпоинты требуют Bearer (кроме /health).
Ошибки: `{detail: string}` со стандартными кодами.

### Auth

```
POST /api/auth/register
  {invite_code, username, password, display_name}
  → 200 {token, manager: {id, username, display_name, role}}
  409 если username занят; 403 если invite_code неверный;
  422 если username/password не проходят валидацию (пароль ≥ 8 симв.)

POST /api/auth/login
  {username, password}
  → 200 {token, manager}  | 401 при неверной паре

GET /api/auth/me  → {id, username, display_name, role}
```

### Сессии (изменения против v1)

```
POST /api/session/start
  {client_name: string (1..100), client_date?: "YYYY-MM-DD" (default сегодня UTC)}
  → {session_id, round: 1, questions: [...], client_name, client_date}

POST /api/session/transcribe — без изменений (+Bearer)

POST /api/session/{id}/submit
  {answers: [{question_id, transcript, skipped?: boolean}]}
  — skipped=true ⇒ transcript игнорируется, в Answer пишется
    audio_transcript = "" и skipped-вопрос помечается в промпте LLM как
    «менеджер пропустил вопрос — данных нет» (статус пункта в чеклисте
    должен выйти not_discussed).
  — доступ: только менеджер-владелец сессии (или admin), иначе 403.
  — при is_complete: сохранить checklist/markdown в БД,
    status='completed', completed_at=now, затем fire-and-forget вызов
    Google Sheets вебхука (см. §4).
  → как v1 + {client_name}

GET /api/session/{id}/results — + Bearer, владелец или admin
GET /api/session/{id}/download — + Bearer; имя файла:
  checklist-{client_name-slug}-{client_date}.md (латиница+цифры+дефисы)
```

### Дашборд и статистика

```
GET /api/checklists?q=&status=&page=1&per_page=20
  manager видит только свои; admin — все.
  q ищет по client_name (LIKE, case-insensitive).
  → {items: [{id, client_name, client_date, status, created_at,
              completed_at, manager_name}], total, page, per_page}

GET /api/stats   (только admin, иначе 403)
  → {
      total_completed: int,
      completed_this_week: int,        // ISO-неделя, с понедельника UTC
      in_progress: int,
      by_manager: [{display_name, week: int, total: int}],  // сорт. по week desc
      by_day: [{date: "YYYY-MM-DD", count: int}]            // последние 14 дней
    }
```

## 4. Google Sheets (вебхук Apps Script)

- env `GSHEETS_WEBHOOK_URL` (опционален; пусто ⇒ интеграция выключена).
- При завершении чеклиста backend делает POST JSON (httpx, timeout 10s,
  ошибки только логируются — НЕ ломают ответ пользователю):

```json
{
  "secret": "<env GSHEETS_SECRET, опционально>",
  "date": "2026-06-10",
  "client_name": "Анна",
  "manager": "Ксения",
  "summary": "<round_summaries через ' · ', максимум 500 символов>",
  "session_id": "abc123def456"
}
```

- При успехе (HTTP 200) выставить sheet_synced=1.
- Файл `docs/GSHEETS_SETUP.md`: готовый код Apps Script (doPost: проверка
  secret, appendRow [date, client_name, manager, summary, session_id])
  и пошаговая инструкция: таблица → Расширения → Apps Script → вставить →
  Deploy → Web app → доступ "Anyone" → URL в env.

## 5. Frontend

### Auth-слой

- `src/lib/auth.ts`: хранение токена в localStorage (`talkarabic_token`),
  `getToken/setToken/clearToken`, `authHeaders()`.
- `src/lib/api.ts` (бывший mock-api.ts): все запросы шлют Authorization.
  При 401 — редирект на /login. Mock-режим (`NEXT_PUBLIC_USE_MOCK=true`)
  сохраняет ВСЮ прежнюю работоспособность без логина: фиктивный manager
  {display_name: "Демо-менеджер", role: "admin"}, фиктивные ответы новых
  эндпоинтов (checklists — 3 записи, stats — правдоподобные числа).
- `src/components/AuthGuard.tsx`: клиентский гард для страниц (кроме
  /login и /register): нет токена и не mock ⇒ replace('/login').

### Страницы

- `/login` — username+password, ошибки инлайн, ссылка на /register
- `/register` — invite_code, display_name, username, password
- `/` (главная) — если залогинен: имя менеджера в шапке + кнопка
  «Мои чеклисты»; CTA ведёт на /session
- `/session` — ПЕРЕД первым вопросом шаг «Новый клиент»: поле «Имя
  клиента» (обязательное) + дата (date input, default сегодня) + кнопка
  «Начать». Только после этого создаётся сессия.
- `/dashboard` — таблица чеклистов: Дата | Клиент | Менеджер (для admin) |
  Статус | →. Поиск по имени. Клик по завершённому → /results/{id}.
- `/stats` — только admin: 3 крупные цифры (за неделю / всего / в работе),
  таблица по менеджерам, мини-список по дням (14 дней, текстовые bar'ы).
- Шапка на внутренних страницах: имя менеджера, ссылки Дашборд/Статистика
  (stats — только admin), «Выйти».

### Изменения в сессии

- `QuestionCard`: рядом с рекордером кнопка-ссылка «Пропустить — нет
  данных»: помечает вопрос отвеченным со skipped=true, серый чип
  «Пропущено» + возможность «Вернуть».
- `AudioRecorder`: вкладки/переключатель «Голос | Текст». Режим «Текст»:
  textarea + «Подтвердить» (минуя транскрипцию). Голосовой путь не меняется.
- При submit ответы шлются как {question_id, transcript, skipped}.

### Дизайн

Токены и стиль текущего UI (бело-голубой + красный recording, Inter).
Никаких новых библиотек. Таблицы — простые, бордеры --color-line.

## 6. Не делаем в этом спринте

- Telegram-отправку, PDF-экспорт, редактирование чеклиста, смену пароля,
  восстановление пароля, refresh-токены, rate limiting.
