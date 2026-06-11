# Спецификация: Спринт 3 — аналитика лида

По итогам исследования (docs/RESEARCH-roadmap.md, корзины A и B). Контракты
строгие — backend и frontend следуют буквально.

## 1. Расширение ответа LLM (БЕЗ нового вызова)

`SYSTEM_GENERATE_CHECKLIST` в `app/agent/prompts.py` дополняется: помимо
`items`, модель возвращает блок `insights`:

```json
{
  "items": [...как сейчас...],
  "insights": {
    "lead_score": 7,
    "score_reason": "Ясная мотивация и готовность к Zoom, но бюджет не подтверждён.",
    "stage": "warm",
    "objections": [{"type": "price", "note": "сомневается, потянет ли помесячно"}],
    "next_contact_date": "2026-06-13",
    "follow_up_draft": "Здравствуйте, Анна! Спасибо за разговор...",
    "tasks": [{"title": "Отправить программу египетского с нуля", "due_date": "2026-06-11"}]
  }
}
```

Правила для промпта:
- `lead_score`: целое 1–10. В системный промпт добавить портрет идеального
  ученика школы: «ясная мотивация, готов к Zoom-занятиям, может выделить
  3+ часа в неделю, бюджет от 15 000 ₽/мес или эквивалент, есть срок цели;
  дисквалификаторы: нет времени, ожидание бесплатного, категоричное "только
  переписка"».
- `stage`: строго `new` | `warm` | `hot` | `rejected`.
- `objections[].type`: строго `price` | `time` | `tech` | `trust` | `other`;
  `note` — короткое пояснение. Пустой массив, если возражений нет.
- `next_contact_date`: YYYY-MM-DD, отсчитывать от даты контакта
  (`client_date` передаётся в промпт). Горячий лид — +1 день, тёплый —
  +2–3 дня, отказ — null.
- `follow_up_draft`: готовое сообщение клиенту в WhatsApp от имени менеджера,
  на «вы», 2–4 предложения, без эмодзи, на русском; включает конкретику из
  разговора (диалект, время, следующий шаг).
- `tasks[]`: 0–4 конкретных действия менеджера, `due_date` опционален.
- Толерантность: если модель не вернула `insights` или его часть — backend
  не падает, сохраняет что есть (валидация через Pydantic с дефолтами).

## 2. БД (миграция без потери данных)

Новые колонки таблицы `checklists`:

| Колонка | Тип | Что хранит |
|---|---|---|
| insights_json | TEXT NULL | блок insights как есть |
| completeness | INTEGER NULL | 0–100, % пунктов чеклиста со статусом != not_discussed (считается в Python при завершении) |

Миграция в `init_db()`: после `create_all` — `PRAGMA table_info(checklists)`;
отсутствующие колонки добавить `ALTER TABLE checklists ADD COLUMN ...`.
Существующие записи остаются с NULL — UI показывает «—».

## 3. Pydantic-модели (backend)

```python
class Objection(BaseModel):
    type: Literal["price","time","tech","trust","other"] = "other"
    note: str = ""

class LeadTask(BaseModel):
    title: str
    due_date: Optional[str] = None

class LeadInsights(BaseModel):
    lead_score: Optional[int] = None      # clamp 1..10
    score_reason: str = ""
    stage: Optional[Literal["new","warm","hot","rejected"]] = None
    objections: List[Objection] = []
    next_contact_date: Optional[str] = None  # валидировать YYYY-MM-DD, иначе None
    follow_up_draft: str = ""
    tasks: List[LeadTask] = []
```

## 4. API-изменения

- `GET /api/session/{id}/results` → + поле `insights: LeadInsights | null`.
- `GET /api/checklists` items → + `lead_score: int|null`, `stage: str|null`,
  `next_contact_date: str|null`, `completeness: int|null`.
- `GET /api/checklists` → новый параметр `due=today`: только completed-записи
  владельца (admin — все) с `next_contact_date <= сегодня UTC` и
  `stage != 'rejected'`, сортировка по next_contact_date asc.
- `GET /api/stats` → новые поля:
  ```
  skips_by_question: [{question_id, label, count}]   // label — первые 60 симв. вопроса; по убыванию count; все 10 вопросов
  avg_lead_score: float|null                          // по completed с lead_score
  stage_counts: {new, warm, hot, rejected}            // по completed
  ```
- Google Sheets payload (`gsheets.py`) → + `lead_score`, `stage`,
  `next_contact_date` (пустые строки если нет). `docs/GSHEETS_SETUP.md`
  обновить: appendRow получает 8 колонок.

## 5. Frontend

### /results/{id} — блок «Аналитика лида» (между шапкой и табами)

- Карточка: крупный score `7/10` с цветом (8–10 зелёный/primary, 5–7 жёлтый
  оттенок ink/muted, 1–4 красный accent) + score_reason рядом.
- Чип stage: новый/тёплый/горячий/отказ (рус. подписи).
- Чипы возражений: «цена», «время», «техника», «доверие», «другое» (+ note
  в title-тултипе).
- Строка «Следующее касание: 13.06.2026».
- follow_up_draft в блоке с кнопкой «Копировать сообщение» (navigator.clipboard,
  состояние «Скопировано ✓» на 2 сек).
- tasks списком с чекбокс-виглядом (не интерактивные, просто список).
- Если insights нет (старые записи) — блок не показывается.

### /dashboard

- Сверху блок **«Сегодня связаться»** (если есть записи из
  `/api/checklists?due=today`): компактный список «Имя · дата · score · стадия»,
  клик → /results/{id}. Если пусто — блок скрыт.
- В таблицу добавить колонки: **Score** (число или «—») и **Связаться**
  (next_contact_date или «—»). Просроченная дата (< сегодня) — текст accent-цветом.

### /stats

- Новые карточки: «Средний score» и распределение по стадиям (4 числа с чипами).
- Блок «Какие вопросы пропускают» — топ по skips_by_question
  (label + горизонтальная полоска + число), это coaching-инструмент.

### Mock-режим

mock-data расширить: insights для demo-abc123 (score 7, warm, objection price,
follow_up_draft про египетский, 2 tasks), у одной из трёх записей дашборда
next_contact_date = сегодня (попадает в «Сегодня связаться»), stats — новые поля.

## 6. Не делаем

Diff повторной надиктовки, «Ask anything», RAG, Telegram-уведомления,
интерактивные чекбоксы задач, редактирование insights.
