# Деплой: DigitalOcean + Coolify (боевой)

Актуальная схема прод-деплоя. Гибрид: frontend остаётся на Vercel (глобальная CDN,
бесплатно), на DigitalOcean droplet едет только backend (Whisper + LLM + API).

> История: изначально планировался Hetzner CX22, но Hetzner блокирует
> регистрации из Египта/MENA. У нас уже есть рабочий аккаунт DigitalOcean —
> используем его. Старая полная инструкция «всё на одном сервере» — в конце файла.

---

## Итоговая схема

```
Менеджеры (Россия, Египет, весь мир)
   │
   ├── Страницы UI ──→ Vercel CDN (уже задеплоено, $0)
   │                     ai-agent-talkarabic-voice.vercel.app
   │
   └── API: голос → Whisper → MiniMax M3
                     └──→ DigitalOcean droplet, Frankfurt ($24/мес)
                          Coolify + Docker, домен api.твойдомен
```

Почему так: Vercel раздаёт статику быстро из любой точки мира; droplet
не тратит CPU на Next.js — всё уходит Whisper'у; экономим и упрощаем.

---

## Шаг 1. Создай droplet (в существующем аккаунте DO)

1. <https://cloud.digitalocean.com> → **Create → Droplets**
2. Параметры:
   - **Region**: Frankfurt (FRA1) — центр между Россией и Египтом
   - **Image**: Ubuntu 24.04 LTS
   - **Size**: Basic → **Regular 4 GB / 2 vCPU — $24/мес**
     (или Premium AMD 4 GB ~$28 — процессор быстрее, Whisper приятнее)
   - **Authentication**: SSH Key → добавь свой ключ из
     `C:\Users\Ksenia\.ssh\id_ed25519.pub` (открыть: `notepad $env:USERPROFILE\.ssh\id_ed25519.pub`)
   - **Hostname**: `talkarabic-prod`
3. **Create Droplet** → через минуту появится **IP-адрес**. Запиши.

Бот с трипваерами, если он на этом же аккаунте, не трогаем — школе свой droplet.

## Шаг 2. Домен и DNS

Нужна одна A-запись для backend:

| Тип | Имя | Значение |
|---|---|---|
| A | `api` | IP droplet |

Frontend остаётся на Vercel — у него уже есть домен
`ai-agent-talkarabic-voice.vercel.app`. Если хочешь красивый `app.твойдомен`,
в Vercel: Project → Settings → Domains → добавь, Vercel покажет какую
CNAME-запись создать.

DNS обновляется 5–60 минут.

## Шаг 3. Установи Coolify

```powershell
ssh root@IP_DROPLET
```

(первый раз спросит «continue connecting?» — пиши `yes`)

На сервере:

```bash
apt update && apt upgrade -y
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Через 3–5 минут скрипт напишет адрес панели: `http://IP_DROPLET:8000`.
Открой его в браузере, создай аккаунт администратора (локальный для Coolify).

## Шаг 4. Подключи GitHub

1. Coolify UI → **Sources → New Source → GitHub**
2. Установи Coolify GitHub App на репозиторий `AI-agent-talkarabic-voice`

## Шаг 5. Задеплой backend

1. **+ New → Project** → имя `talkarabic`
2. **+ Resource → Public/Private Repository (Git)**:
   - Repository: `kseniausacheva/AI-agent-talkarabic-voice`, ветка `main`
   - **Build Pack: Dockerfile**
   - **Base Directory: `/backend`**
3. **Environment Variables**:

   | Имя | Значение | Тип |
   |---|---|---|
   | `OPENROUTER_API_KEY` | ключ OpenRouter | **Secret** |
   | `OPENROUTER_MODEL` | `minimax/minimax-m3` | обычная |
   | `WHISPER_LANGUAGE` | `ru` | обычная |
   | `ALLOWED_ORIGINS` | `https://ai-agent-talkarabic-voice.vercel.app,http://localhost:3000` | обычная |

4. **Domains**: `https://api.твойдомен` (если DNS уже указывает на droplet —
   SSL Let's Encrypt выпустится сам). Порт приложения: `7860`.
5. **Deploy**. Первая сборка 10–15 минут (качается torch + Whisper).
6. Включи **Auto Deploy on Push** — каждый `git push` будет обновлять прод.

## Шаг 6. Переключи Vercel на новый backend

Vercel → проект → **Settings → Environment Variables**:

- `NEXT_PUBLIC_API_URL` = `https://api.твойдомен` (вместо HF Space)

→ **Deployments → Redeploy** (пересборка ~2 мин).

## Шаг 7. Проверка

- `https://api.твойдомен/health` → `{"status":"healthy","whisper_loaded":true}`
- `https://api.твойдомен/docs` → Swagger
- Открой Vercel-сайт → пройди полную сессию с микрофоном → скачай `.md`
- Замочек https в браузере без ошибок

## Шаг 8. Прибери за этапом 1

- HF Space `Ksenia8090/talkarabic-backend` можно остановить (Settings →
  Pause) или оставить как staging для экспериментов
- Vercel остаётся — он теперь часть прод-схемы

---

## Стоимость в месяц

| Что | Сколько |
|---|---|
| Droplet DO 4 GB (Frankfurt) | $24 ≈ 2200 ₽ |
| Домен `.ru` | ≈ 17 ₽ (200 ₽/год) |
| Vercel + Coolify | 0 ₽ |
| OpenRouter (30 клиентов) | ≈ 30 ₽ |
| **Итого** | **≈ 2250 ₽/мес** |

Resize droplet (например под whisper-medium): Power Off → Resize → 8 GB →
Power On. 2 минуты, без переустановки.

---

## Если что-то сломалось

| Проблема | Решение |
|---|---|
| Build падает на `pip install torch` | Coolify → Build Settings → увеличь build timeout; droplet 4 GB обычно хватает |
| `/health` отвечает, но `whisper_loaded: false` | Подожди 1–2 мин — модель грузится в RAM при старте |
| Frontend: CORS error в консоли | Проверь `ALLOWED_ORIGINS` — должен содержать точный Vercel-URL без слеша в конце |
| SSL не выпускается | DNS ещё не докатился: `nslookup api.твойдомен` должен вернуть IP droplet |
| Деплой прошёл, но микрофон «Network Error» | В Vercel переменная `NEXT_PUBLIC_API_URL` обновлена? Был Redeploy? |

---

## Запасной вариант: всё на одном сервере

Если когда-нибудь захочется уйти с Vercel — в репозитории есть
[docker-compose.yml](docker-compose.yml) с обоими сервисами. В Coolify:
Resource → Docker Compose → этот файл; домены `app.*` и `api.*` на droplet.
Шаги совпадают с этой инструкцией, плюс переменные `FRONTEND_PUBLIC_URL` /
`BACKEND_PUBLIC_URL` из [.env.example](.env.example).

---

*Версия: v0.2 · DigitalOcean + Coolify · Школа арабского*
