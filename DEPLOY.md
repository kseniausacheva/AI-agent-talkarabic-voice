# Деплой на Hetzner CX22 + Coolify

Пошаговая инструкция для пользователя без особого опыта Linux. Всё, что
не делаешь сам — делает Coolify.

**Итого: €4.5/мес за сервер, ~30–40 минут на полный деплой.**

---

## Что получится в итоге

- Backend (FastAPI + Whisper) на поддомене `api.твойдомен.ru` с автоматическим
  SSL.
- Frontend (Next.js) на поддомене `app.твойдомен.ru` (или просто на корне).
- Бесплатные сертификаты Let's Encrypt автообновляются.
- Авто-деплой при `git push` (если хочешь).
- Логи и метрики в UI Coolify.

---

## Шаг 1. Купи сервер на Hetzner Cloud

1. Зарегистрируйся: <https://accounts.hetzner.com/signUp>
2. Войди в Hetzner Cloud Console: <https://console.hetzner.cloud/>
3. **New Project** — назови как угодно (например `talkarabic`).
4. Внутри проекта — **Add Server**.
5. Параметры:
   - **Location**: Falkenstein (Германия) или Helsinki — оба ок. Помельче ping
     до восточной Европы — Helsinki.
   - **Image**: Ubuntu 24.04
   - **Type**: **CX22** (Shared CPU x86, 2 vCPU / 4 GB RAM / 40 GB SSD,
     **€4.51/мес**). Этого хватит для Whisper-small + Next.js.
   - **Networking**: оставь public IPv4 + IPv6 включёнными.
   - **SSH keys**: добавь свой публичный ключ. Если не знаешь, что это —
     внизу можно выбрать вариант с паролем, но SSH-ключ гораздо удобнее
     и безопаснее.
     - Сгенерировать ключ на Windows: открой PowerShell и набери
       `ssh-keygen -t ed25519`. Жми Enter три раза. Потом скопируй содержимое
       файла `C:\Users\Твоё_имя\.ssh\id_ed25519.pub` — это и есть публичный
       ключ.
   - **Name**: `talkarabic-prod` или любое.
6. **Create & Buy now**. Через 30 секунд сервер готов.
7. Запиши **IP-адрес** сервера — он понадобится дальше.

---

## Шаг 2. Купи домен (если ещё нет)

Если своего домена нет — возьми любой:
- <https://www.namecheap.com/> — дёшево, удобно
- <https://reg.ru/> — если хочешь .ru

Подойдёт даже бесплатный поддомен от <https://www.duckdns.org/>, но для
профессиональной школы лучше свой нормальный.

В DNS-настройках домена создай **2 A-записи**, обе указывают на IP сервера:

| Тип | Имя | Значение |
|---|---|---|
| A | `app` | твой IP-адрес сервера |
| A | `api` | твой IP-адрес сервера |

(Префиксы `app` и `api` можешь поменять на любые — это твои поддомены.)

DNS обновляется 5–60 минут. Можно начинать ставить Coolify пока ждёшь.

---

## Шаг 3. Подключись к серверу и поставь Coolify

### 3.1. SSH в сервер

В PowerShell на Windows:

```powershell
ssh root@ТВОЙ_IP_АДРЕС
```

При первом подключении спросит «Are you sure you want to continue?» — пиши
`yes`.

### 3.2. Обнови систему

```bash
apt update && apt upgrade -y
```

(2 минуты)

### 3.3. Поставь Coolify одной командой

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Скрипт сам поставит Docker, настроит всё и через 3–5 минут напишет:

```
Your Coolify instance is ready! → http://ТВОЙ_IP:8000
```

### 3.4. Открой Coolify в браузере

Зайди на `http://ТВОЙ_IP:8000`. Создашь первый аккаунт администратора
(email + пароль). Это локальный аккаунт Coolify — отдельно от Hetzner.

---

## Шаг 4. Залей код проекта на GitHub (если ещё не залит)

Coolify умеет деплоить из приватного и публичного git-репозитория.

Если у тебя ещё нет репозитория:

```powershell
cd "D:\AI agent talkarabic voice"
git init
git add .
git commit -m "initial commit — talkarabic school checklist"
```

Создай новый репозиторий на <https://github.com/new> (можно приватный) и
загрузи:

```powershell
git remote add origin https://github.com/ТВОЙ_ЛОГИН/talkarabic.git
git branch -M main
git push -u origin main
```

(Если не хочешь GitHub — Coolify умеет работать с GitLab, Gitea, Bitbucket
тоже.)

---

## Шаг 5. Подключи репозиторий к Coolify

1. В Coolify UI: **Settings → Sources → New Source → GitHub**.
2. Coolify предложит установить **Coolify GitHub App** на твою учётку.
   Соглашайся — выбери репозиторий `talkarabic`.
3. Готово, source появится в списке.

---

## Шаг 6. Создай проект для деплоя

1. **+ New** → **Project** → назови `talkarabic`.
2. Внутри проекта: **+ Resource** → **Docker Compose**.
3. **Source**: выбери свой GitHub-репозиторий, ветка `main`.
4. **Build Pack**: Docker Compose.
5. **Compose Path**: `docker-compose.yml` (в корне репо).
6. **Configuration → Environment Variables**:

   | Имя | Значение | Тип |
   |---|---|---|
   | `OPENROUTER_API_KEY` | твой ключ от OpenRouter | **Secret** |
   | `OPENROUTER_MODEL` | `minimax/minimax-m3` | normal |
   | `BACKEND_PUBLIC_URL` | `https://api.твойдомен.ru` | normal |
   | `FRONTEND_PUBLIC_URL` | `https://app.твойдомен.ru` | normal |

   Нажми **Save**.

---

## Шаг 7. Настрой домены и SSL

В Coolify в карточке Resource:

### Для сервиса `frontend`:

- **General → Domains**: добавь `https://app.твойдомен.ru`
- Coolify сам создаст SSL через Let's Encrypt при первом запросе.

### Для сервиса `backend`:

- **General → Domains**: добавь `https://api.твойдомен.ru`
- **Port Exposes**: убедись что `7860`.

(SSL получится автоматически, если DNS уже резолвится на IP сервера.)

---

## Шаг 8. Запусти деплой

В Coolify нажми **Deploy** в правом верхнем углу.

Что произойдёт:

1. Coolify склонирует репозиторий.
2. Соберёт два Docker-образа (frontend и backend параллельно).
   - **Первый build backend идёт 10–15 минут** — качается torch (~700 МБ)
     и Whisper-модель (~500 МБ для small).
   - Frontend собирается за 1–2 минуты.
3. Запустит контейнеры.
4. Настроит Traefik как reverse-proxy с автоматическим SSL.

Следи за логами прямо в UI.

---

## Шаг 9. Проверь, что работает

В браузере открой:

- **<https://api.твойдомен.ru/health>** — должно вернуть
  `{"status":"healthy","whisper_loaded":true}` (после прогрева ~2 мин)
- **<https://api.твойдомен.ru/docs>** — интерактивный Swagger
- **<https://app.твойдомен.ru>** — landing школы арабского. Пройди один
  чеклист с реальным микрофоном, проверь что транскрипция приходит.

---

## Шаг 10. Авто-деплой при git push (опционально, но удобно)

В настройках Resource в Coolify включи **Auto Deploy on Push**.

Теперь любой `git push` в `main` будет автоматически собирать и обновлять
прод. Менеджеры обновляют контент, ты пушишь — Coolify сам обновляет.

---

## После деплоя — что ещё стоит сделать

### Whisper-medium для лучшего качества

`whisper-small` хорошо знает русский, но иногда ошибается на именах.
`whisper-medium` лучше, но +1 ГБ диска и +5 секунд на запрос.

Чтобы переключить: в `docker-compose.yml` поменяй
`WHISPER_MODEL: openai/whisper-medium` и `args: WHISPER_MODEL: openai/whisper-medium`,
сделай `git push`, Coolify пересоберёт.

### Backups сессий

Сейчас сессии хранятся в памяти процесса. Перезапуск контейнера = потеря
всех текущих сессий. Если это критично — нужно вынести на Redis. На MVP-этапе
не стоит того, но имей в виду.

### Аутентификация

Сейчас любой по ссылке может пройти чеклист. Для внутреннего инструмента
этого может быть достаточно (URL-неугадайка). Если хочешь логин — Coolify
умеет накатить **Authelia** в один клик: SSO + 2FA перед твоим
приложением.

### Мониторинг

Coolify показывает CPU/RAM/диск каждого контейнера в реальном времени. Для
алертов через Telegram — Settings → Notifications в Coolify.

---

## Цена

| Что | Сколько |
|---|---|
| Hetzner CX22 | €4.51 / месяц (~₽500) |
| Домен `.ru` | ₽200 / год |
| OpenRouter (MiniMax M3) | ~₽1 за один чеклист |
| Coolify | бесплатно (open source) |
| **Итого на старте** | **~₽550/мес фикс + ~₽30/мес на API при 30 клиентах** |

---

## Если что-то сломалось

### Build failing на `pip install torch`

Это самый частый кейс — Docker заканчивается RAM на сборке.
Решение: в Coolify → Resource → Build Settings → выбери **Build on Server**
(а не в Docker Buildkit).

### Whisper падает при первом запросе

Holland первый запрос холодный, Whisper грузит модель в RAM (~3 сек).
Healthcheck в Dockerfile стартует через 120 сек — это нормально.

### Frontend пишет «Network Error» при попытке транскрибировать

Скорее всего CORS. Проверь, что в env-переменных Backend `ALLOWED_ORIGINS`
содержит твой frontend-домен (Coolify подставит его из `FRONTEND_PUBLIC_URL`).

### Сертификат не выпускается

Подожди 5 минут. Если не появился — DNS A-запись ещё не докатилась.
Проверь: `nslookup app.твойдомен.ru` (на Windows) должен вернуть IP твоего
сервера.

---

## Команды для быстрой ссылки

```bash
# SSH в сервер
ssh root@ТВОЙ_IP

# Посмотреть статус контейнеров
docker ps

# Логи backend в реальном времени
docker logs -f talkarabic-backend

# Перезапустить backend (например после смены env)
docker restart talkarabic-backend

# Сколько места занимают образы
docker system df

# Удалить старые неиспользуемые образы
docker system prune -a
```

---

## Чек-лист первого деплоя

- [ ] Hetzner-аккаунт зарегистрирован
- [ ] CX22 куплен, IP записан
- [ ] Домен куплен (или есть)
- [ ] DNS A-записи `app.*` и `api.*` указывают на IP
- [ ] SSH подключение работает (`ssh root@IP`)
- [ ] Coolify установлен (`http://IP:8000` открывается)
- [ ] Аккаунт администратора Coolify создан
- [ ] Код в Git (GitHub/GitLab/etc.)
- [ ] GitHub App от Coolify установлено на репо
- [ ] Project в Coolify создан, source подключен
- [ ] Environment variables заполнены (включая Secret для OPENROUTER_API_KEY)
- [ ] Домены назначены frontend и backend
- [ ] Первый Deploy запущен и успешен
- [ ] `https://api.../health` → `whisper_loaded: true`
- [ ] `https://app...` открывается, можно записать голос
- [ ] Auto Deploy включён (опционально)

---

---

## Миграция с бесплатного варианта (HF Spaces + Vercel)

Если перед этим был развёрнут [DEPLOY_FREE.md](DEPLOY_FREE.md) — переход максимально простой:

1. **Код не меняется** — тот же `docker-compose.yml`, те же Dockerfile.
2. **Env-переменные переносятся**:
   - `OPENROUTER_API_KEY` — копируешь из HF Secrets в Coolify Secrets
   - `WHISPER_LANGUAGE`, `OPENROUTER_MODEL` — копируешь как есть
   - `BACKEND_PUBLIC_URL` и `FRONTEND_PUBLIC_URL` — меняешь на новые домены Hetzner
3. **DNS** — A-записи `api.твойдомен` и `app.твойдомен` переключаешь с Vercel/HF на IP Hetzner-сервера.
4. **Останавливаешь HF Space и удаляешь Vercel-проект** (или оставляешь как staging для тестов).

Никаких изменений в коде, никакой переустановки зависимостей — всё ходит на тех же контейнерах. Менеджеры даже не заметят миграции, кроме того что инструмент перестанет «засыпать».

---

*Версия: v0.1 · Школа арабского*
