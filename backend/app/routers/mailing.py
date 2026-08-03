"""Email-рассылки через Brevo: подписчики, отправка выпуска, отписка.

Отправка — транзакционным API Brevo (/v3/smtp/email) по одному письму на адрес,
чтобы у каждого была персональная ссылка отписки. Полный выпуск идёт в фоне
(asyncio), тест-письмо — синхронно. Ключ/отправитель — из env (BREVO_*).
"""
import asyncio
import logging
import pathlib
import re
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Path, Query, UploadFile
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import (
    Manager,
    ScheduledBroadcast,
    Subscriber,
    get_session as get_db_session,
    get_session_factory,
)
from app.services.auth import require_admin

router = APIRouter(prefix="/api", tags=["mailing"])
logger = logging.getLogger(__name__)

BREVO_URL = "https://api.brevo.com/v3/smtp/email"
BREVO_STATS_URL = "https://api.brevo.com/v3/smtp/statistics/aggregatedReport"
_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
_FREE_DAILY_LIMIT = 300  # бесплатный тариф Brevo; фактический берём из /v3/account


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _campaign_key(subject: str) -> str:
    """Ключ выпуска = тема письма. Одна тема = одна рассылка, разбитая на дни."""
    return " ".join((subject or "").split()).lower()[:200]


async def _brevo_today() -> dict:
    """Сколько писем Brevo уже отправил сегодня и каков дневной лимит.

    Считаем по самому Brevo, а не по своей базе: тест-письма и повторы тоже
    съедают квоту. Если API недоступен — возвращаем None-значения, UI не ломаем.
    """
    s = get_settings()
    out = {"sent_today": None, "daily_limit": _FREE_DAILY_LIMIT, "left_today": None}
    if not s.brevo_api_key:
        return out
    today = datetime.now(timezone.utc).date().isoformat()
    headers = {"api-key": s.brevo_api_key, "accept": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            stats = await client.get(
                BREVO_STATS_URL,
                headers=headers,
                params={"startDate": today, "endDate": today},
            )
            if stats.status_code < 300:
                out["sent_today"] = int(stats.json().get("requests") or 0)
            acc = await client.get("https://api.brevo.com/v3/account", headers=headers)
            if acc.status_code < 300:
                for plan in acc.json().get("plan") or []:
                    if plan.get("creditsType") == "sendLimit" and plan.get("credits"):
                        out["daily_limit"] = int(plan["credits"])
                        break
    except Exception as exc:  # noqa: BLE001 — статистика не критична
        logger.warning("Brevo statistics недоступна: %s", exc)
    if out["sent_today"] is not None:
        out["left_today"] = max(0, out["daily_limit"] - out["sent_today"])
    return out


async def _mark_sent(sub_ids: List[int], campaign: str) -> None:
    """Отметить адреса как получившие этот выпуск (чтобы завтра не повторить)."""
    if not sub_ids:
        return
    factory = get_session_factory()
    async with factory() as db:
        await db.execute(
            update(Subscriber)
            .where(Subscriber.id.in_(sub_ids))
            .values(last_campaign=campaign, last_sent_at=_now())
        )
        await db.commit()


def _build_html(text: str, unsub_url: str) -> str:
    body = (text or "").strip()
    # если это уже HTML (из редактора) — не трогаем; иначе переносы строк → <br>
    if not ("<" in body and ">" in body):
        body = body.replace("\n", "<br>")
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;'
        'color:#092127;line-height:1.6;max-width:560px;margin:0 auto">'
        f"{body}"
        '<hr style="margin:28px 0 12px;border:none;border-top:1px solid #eee">'
        '<p style="font-size:12px;color:#98a2a6">'
        "Вы получили это письмо как ученик Школы арабского. "
        f'<a href="{unsub_url}" style="color:#43abd0">Отписаться</a></p></div>'
    )


async def _send_one(
    client: httpx.AsyncClient, api_key: str, sender: dict,
    subject: str, html: str, to_email: str, to_name: str,
) -> tuple[int, str]:
    to = {"email": to_email}
    if to_name:
        to["name"] = to_name
    resp = await client.post(
        BREVO_URL,
        headers={"api-key": api_key, "content-type": "application/json",
                 "accept": "application/json"},
        json={"sender": sender, "to": [to], "subject": subject, "htmlContent": html},
    )
    return resp.status_code, resp.text


# Ход текущей отправки. В памяти, а не в базе: если контейнер перезапустят,
# отправка всё равно прервётся — хранить её след негде и незачем.
_run_state: dict = {
    "campaign": "", "subject": "", "total": 0, "sent": 0, "failed": 0,
    "running": False, "started_at": "", "finished_at": "", "errors": [],
}


def _run_reset(subject: str, total: int) -> None:
    _run_state.update({
        "campaign": _campaign_key(subject), "subject": subject, "total": total,
        "sent": 0, "failed": 0, "running": True,
        "started_at": _now(), "finished_at": "", "errors": [],
    })


async def _send_bulk(subject: str, text: str, recipients: List[tuple]) -> None:
    """Фоновая отправка выпуска. recipients: [(id, email, name, unsub_token)].

    Отправленные адреса помечаются `last_campaign` пачками по 20 — если
    контейнер перезапустят на середине, повтора почти не будет.
    """
    s = get_settings()
    sender = {"email": s.brevo_sender_email, "name": s.brevo_sender_name}
    campaign = _campaign_key(subject)
    sent = failed = 0
    pending: List[int] = []
    _run_reset(subject, len(recipients))
    async with httpx.AsyncClient(timeout=30) as client:
        for sub_id, email, name, token in recipients:
            unsub = f"{s.public_api_url.rstrip('/')}/api/unsubscribe/{token}"
            try:
                code, body = await _send_one(
                    client, s.brevo_api_key, sender, subject,
                    _build_html(text, unsub), email, name,
                )
                if code < 300:
                    sent += 1
                    pending.append(sub_id)
                else:
                    failed += 1
                    _run_state["errors"].append({"email": email, "reason": body[:180]})
                    logger.warning("Brevo %s для %s: %s", code, email, body[:150])
            except Exception as exc:
                failed += 1
                _run_state["errors"].append({"email": email, "reason": str(exc)[:180]})
                logger.warning("Ошибка отправки %s: %s", email, exc)
            _run_state["sent"], _run_state["failed"] = sent, failed
            if len(pending) >= 20:
                await _mark_sent(pending, campaign)
                pending = []
            await asyncio.sleep(0.2)  # мягкий rate-limit
    await _mark_sent(pending, campaign)
    _run_state.update({"running": False, "finished_at": _now(),
                       "sent": sent, "failed": failed})
    logger.info(
        "Выпуск «%s» разослан: отправлено=%d, ошибок=%d", subject[:60], sent, failed
    )


# ------------------------------ Картинки ------------------------------

_ALLOWED_IMG = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
_ALLOWED_VID = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-matroska": ".mkv",
}
_MAX_IMG = 5_000_000       # 5 МБ
_MAX_VID = 50_000_000      # 50 МБ

_PLAY_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
# Ступени качества GIF: (ширина, fps, секунд). Если файл вышел тяжёлым —
# берём следующую, более скромную. Тяжёлый GIF в письме грузится вечность.
# (ширина, fps, секунд, цветов). Вес важнее красоты: письмо с тяжёлым GIF
# на телефоне рисуется сверху вниз, и получатель видит обрезок вместо кадра.
_GIF_STEPS = ((400, 7, 4, 96), (360, 6, 4, 64), (300, 5, 3, 48))
_GIF_MAX_BYTES = 500_000


def _gif_filter(width: int, fps: int, colors: int) -> str:
    """fps+scale, поверх — кнопка Play, затем палитра (два прохода в одном фильтре)."""
    play = (
        f"drawtext=fontfile={_PLAY_FONT}:text=▶:fontcolor=white@0.95:"
        f"fontsize={max(28, width // 8)}:x=(w-text_w)/2:y=(h-text_h)/2-4:"
        f"box=1:boxcolor=black@0.42:boxborderw={max(14, width // 24)}"
    )
    return (
        f"fps={fps},scale={width}:-2:flags=lanczos,{play},split[a][b];"
        f"[a]palettegen=max_colors={colors}[p];"
        "[b][p]paletteuse=dither=bayer:bayer_scale=5"
    )


def _render_gif(src, dst: pathlib.Path) -> bool:
    """Сделать из видео зацикленный GIF-превью с кнопкой Play. True — получилось.

    Почта не проигрывает видео (кроме Apple Mail), но GIF крутят все клиенты —
    поэтому в письмо идёт живая нарезка, а клик по ней ведёт на полное видео.
    """
    # источником бывает и файл, и ссылка — в лог пишем что-то короткое
    label = getattr(src, "name", str(src))[-60:]
    for width, fps, seconds, colors in _GIF_STEPS:
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-t", str(seconds), "-i", str(src),
            "-map", "0:v:0",
            "-vf", _gif_filter(width, fps, colors),
            "-loop", "0", "-an", str(dst),
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=180)
        except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
            logger.warning("GIF-превью не собрано (%s): %s", label, exc)
            return False
        if proc.returncode != 0:
            logger.warning(
                "ffmpeg %s для %s: %s",
                proc.returncode, label, proc.stderr.decode("utf-8", "replace")[:300],
            )
            return False
        if dst.exists() and dst.stat().st_size <= _GIF_MAX_BYTES:
            logger.info(
                "GIF-превью %s: %dx, %d fps, %d c, %d цветов, %d КБ",
                dst.name, width, fps, seconds, colors, dst.stat().st_size // 1024,
            )
            return True
    # даже самая скромная ступень вышла тяжёлой — отдаём как есть
    return dst.exists()


@router.post("/upload/image")
async def upload_image(
    file: UploadFile = File(...),
    manager: Manager = Depends(require_admin),
):
    """Загрузка медиа для письма (admin) → публичный URL /uploads/….

    Картинки (≤5 МБ) вставляются как есть. Для видео (≤50 МБ) дополнительно
    режется GIF-превью (`preview`): его почта показывает прямо в письме,
    а клик по нему открывает полное видео со звуком."""
    ct = (file.content_type or "").lower()
    is_video = ct in _ALLOWED_VID
    if ct not in _ALLOWED_IMG and not is_video:
        raise HTTPException(
            status_code=400,
            detail="Только картинки (PNG/JPG/GIF/WEBP) или видео (MP4/WEBM/MOV/MKV).",
        )
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Пустой файл.")
    limit = _MAX_VID if is_video else _MAX_IMG
    if len(data) > limit:
        mb = limit // 1_000_000
        raise HTTPException(status_code=400, detail=f"Файл больше {mb} МБ.")
    ext = _ALLOWED_VID[ct] if is_video else _ALLOWED_IMG[ct]
    s = get_settings()
    updir = pathlib.Path(s.database_path).resolve().parent / "uploads"
    updir.mkdir(parents=True, exist_ok=True)
    stem = uuid.uuid4().hex
    name = stem + ext
    (updir / name).write_bytes(data)
    base = s.public_api_url.rstrip("/")
    out = {"url": f"{base}/uploads/{name}", "kind": "video" if is_video else "image"}
    if is_video:
        gif = updir / f"{stem}.gif"
        ok = await asyncio.to_thread(_render_gif, updir / name, gif)
        if ok:
            out["preview"] = f"{base}/uploads/{gif.name}"
        else:
            gif.unlink(missing_ok=True)
    return out


# --------------------- Видео по ссылке (Kinescope и др.) ---------------------

_KINESCOPE_RE = re.compile(
    r"kinescope\.io/(?:embed/)?(?:video/)?([0-9a-zA-Z_-]{6,})", re.I
)
_MEDIA_EXT_RE = re.compile(r"\.(mp4|webm|mov|mkv|m3u8|mpd)(\?|$)", re.I)


def _collect_media_urls(data, out: List[str]) -> None:
    """Собрать из ответа API все ссылки на видео — куда бы их ни положили.

    Обходим структуру целиком, а не по фиксированному пути: у Kinescope поля
    отличаются от видео к видео (assets / hls_link / download_link).
    """
    if isinstance(data, str):
        if data.startswith("http") and _MEDIA_EXT_RE.search(data):
            out.append(data)
    elif isinstance(data, dict):
        for value in data.values():
            _collect_media_urls(value, out)
    elif isinstance(data, list):
        for item in data:
            _collect_media_urls(item, out)


def _first_media_url(data) -> Optional[str]:
    """Лучшая ссылка для нарезки: обычный файл предпочтительнее плейлиста —
    из mp4 ffmpeg тянет только начало, а HLS приходится собирать по кускам."""
    urls: List[str] = []
    _collect_media_urls(data, urls)
    if not urls:
        return None
    files = [u for u in urls if re.search(r"\.(mp4|webm|mov|mkv)(\?|$)", u, re.I)]
    return (files or urls)[0]


async def _resolve_video_url(link: str) -> str:
    """Ссылку от пользователя → то, что сможет открыть ffmpeg.

    Прямая ссылка на файл идёт как есть. Kinescope сначала спрашиваем по API
    (нужен токен), затем пробуем публичную страницу плеера.
    """
    link = link.strip()
    if not link.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Ссылка должна начинаться с https://")
    if _MEDIA_EXT_RE.search(link) and "kinescope.io" not in link.lower():
        return link

    match = _KINESCOPE_RE.search(link)
    if not match:
        raise HTTPException(
            status_code=400,
            detail="Не узнаю эту ссылку. Подойдёт ссылка на видео в Kinescope "
            "или прямая ссылка на файл .mp4.",
        )
    video_id = match.group(1)
    s = get_settings()

    if s.kinescope_api_token:
        async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
            resp = await client.get(
                f"https://api.kinescope.io/v1/videos/{video_id}",
                headers={"Authorization": f"Bearer {s.kinescope_api_token}"},
            )
        if resp.status_code < 300:
            found = _first_media_url(resp.json())
            if found:
                return found
            logger.warning("Kinescope %s: в ответе нет ссылки на файл", video_id)
        else:
            logger.warning("Kinescope API %s: %s", resp.status_code, resp.text[:200])

    # без токена (или если API не помог) — пробуем страницу плеера
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        page = await client.get(f"https://kinescope.io/{video_id}")
    if page.status_code < 300:
        found = re.search(r'https://[^"\'\s]+?\.(?:m3u8|mp4)[^"\'\s]*', page.text)
        if found:
            return found.group(0)

    raise HTTPException(
        status_code=400,
        detail="Не удалось получить видео по этой ссылке. Если ролик в Kinescope "
        "закрытый, нужен токен доступа — скажи, добавим его в настройки.",
    )


class VideoLinkRequest(BaseModel):
    url: str


@router.post("/upload/video-link")
async def upload_video_link(
    payload: VideoLinkRequest,
    manager: Manager = Depends(require_admin),
):
    """Видео по ссылке: сервер сам нарезает GIF-превью, файл никуда не грузится.

    Обход для медленной связи — видео живёт в Kinescope, в письмо идёт живая
    нарезка, а клик ведёт на исходную ссылку.
    """
    source = await _resolve_video_url(payload.url)
    s = get_settings()
    updir = pathlib.Path(s.database_path).resolve().parent / "uploads"
    updir.mkdir(parents=True, exist_ok=True)
    gif = updir / f"{uuid.uuid4().hex}.gif"
    ok = await asyncio.to_thread(_render_gif, source, gif)
    if not ok:
        gif.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail="Видео нашлось, но нарезать превью не вышло. "
            "Попробуй другую ссылку или пришли ролик файлом.",
        )
    return {
        "url": payload.url.strip(),
        "kind": "video",
        "preview": f"{s.public_api_url.rstrip('/')}/uploads/{gif.name}",
    }


# ------------------------------ Подписчики ------------------------------

class SubscriberIn(BaseModel):
    email: str
    name: str = ""
    group: str = ""


class ImportSubsRequest(BaseModel):
    items: List[SubscriberIn]


@router.post("/subscribers/import")
async def import_subscribers(
    payload: ImportSubsRequest,
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Массовое добавление подписчиков (admin). Дедуп по email."""
    added = updated = 0
    for it in payload.items:
        email = (it.email or "").strip().lower()
        if not _EMAIL_RE.match(email):
            continue
        row = (
            await db.execute(select(Subscriber).where(Subscriber.email == email))
        ).scalar_one_or_none()
        if row:
            if it.group and not row.group_tag:
                row.group_tag = it.group
            if it.name and not row.name:
                row.name = it.name
            updated += 1
        else:
            db.add(Subscriber(
                email=email, name=it.name or "", group_tag=it.group or "",
                unsubscribed=0, unsub_token=uuid.uuid4().hex, created_at=_now(),
            ))
            added += 1
    await db.commit()
    total = (await db.execute(select(func.count()).select_from(Subscriber))).scalar_one()
    return {"ok": True, "added": added, "updated": updated, "total": total}


@router.get("/subscribers")
async def list_subscribers(
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Сводка по базе рассылки: всего, отписалось, по группам (активные)."""
    total = (await db.execute(select(func.count()).select_from(Subscriber))).scalar_one()
    unsub = (
        await db.execute(
            select(func.count()).select_from(Subscriber).where(Subscriber.unsubscribed == 1)
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(Subscriber.group_tag, func.count())
            .where(Subscriber.unsubscribed == 0)
            .group_by(Subscriber.group_tag)
        )
    ).all()
    groups = [{"group": g or "Без группы", "count": c} for g, c in rows]
    groups.sort(key=lambda x: x["count"], reverse=True)
    settings = get_settings()
    return {
        "total": total,
        "unsubscribed": unsub,
        "groups": groups,
        "configured": bool(settings.brevo_api_key and settings.brevo_sender_email),
        "sender": settings.brevo_sender_email or None,
    }


@router.get("/subscribers/list")
async def subscribers_list(
    q: str = Query(default=""),
    group: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=30, ge=1, le=200),
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Постраничный список подписчиков (admin): email, имя, группа, статус."""
    stmt = select(Subscriber)
    if group:
        stmt = stmt.where(Subscriber.group_tag == group)
    rows = (
        await db.execute(stmt.order_by(Subscriber.group_tag, Subscriber.email))
    ).scalars().all()
    qn = q.strip().lower()
    if qn:
        rows = [
            r for r in rows
            if qn in r.email.lower() or qn in (r.name or "").lower()
        ]
    total = len(rows)
    start = (page - 1) * per_page
    page_rows = rows[start : start + per_page]
    items = [
        {
            "id": r.id,
            "email": r.email,
            "name": r.name,
            "group": r.group_tag or "",
            "unsubscribed": bool(r.unsubscribed),
        }
        for r in page_rows
    ]
    return {"items": items, "total": total, "page": page, "per_page": per_page}


@router.delete("/subscribers/{sub_id}")
async def delete_subscriber(
    sub_id: int = Path(...),
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Удалить подписчика из базы рассылки (admin)."""
    row = await db.get(Subscriber, sub_id)
    if row:
        await db.delete(row)
        await db.commit()
    return {"ok": True}


# ------------------------------ Выпуск ------------------------------

class BroadcastRequest(BaseModel):
    subject: str
    text: str
    group: Optional[str] = None
    test_email: Optional[str] = None
    limit: Optional[int] = None  # сколько писем отправить сейчас (партия)


def _pending_query(campaign: str, group: Optional[str]):
    """Активные подписчики группы, которым этот выпуск ещё НЕ уходил."""
    q = select(Subscriber).where(
        Subscriber.unsubscribed == 0,
        func.coalesce(Subscriber.last_campaign, "") != campaign,
    )
    if group:
        q = q.where(Subscriber.group_tag == group)
    return q.order_by(Subscriber.id)


@router.get("/broadcast/status")
async def broadcast_status(
    subject: str = Query(default=""),
    group: str = Query(default=""),
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Сколько адресов ещё ждут этот выпуск и сколько писем Brevo можно сегодня.

    Выпуск опознаётся по теме письма: поменяешь тему — счётчик начнётся заново.
    """
    campaign = _campaign_key(subject)
    grp = group or None
    total_q = select(func.count()).select_from(Subscriber).where(
        Subscriber.unsubscribed == 0
    )
    if grp:
        total_q = total_q.where(Subscriber.group_tag == grp)
    group_total = (await db.execute(total_q)).scalar_one()

    pending = 0
    if campaign:
        pending = len(
            (await db.execute(_pending_query(campaign, grp))).scalars().all()
        )
    else:
        pending = group_total

    brevo = await _brevo_today()
    return {
        "group_total": group_total,
        "pending": pending,
        "already_sent": max(0, group_total - pending),
        "sent_today": brevo["sent_today"],
        "daily_limit": brevo["daily_limit"],
        "left_today": brevo["left_today"],
    }


@router.post("/broadcast")
async def broadcast(
    payload: BroadcastRequest,
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Отправка выпуска. test_email → одно тест-письмо (синхронно). Иначе —
    фоновая рассылка по группе (или всем активным). Ссылка отписки добавляется."""
    s = get_settings()
    if not s.brevo_api_key or not s.brevo_sender_email:
        raise HTTPException(
            status_code=400,
            detail="Рассылка не настроена: добавь BREVO_API_KEY и BREVO_SENDER_EMAIL в env и сделай Redeploy.",
        )
    if not payload.subject.strip() or not payload.text.strip():
        raise HTTPException(status_code=400, detail="Заполни тему и текст письма.")

    sender = {"email": s.brevo_sender_email, "name": s.brevo_sender_name}

    if payload.test_email:
        test_to = payload.test_email.strip().lower()
        if not _EMAIL_RE.match(test_to):
            raise HTTPException(status_code=400, detail="Неверный тестовый email.")
        unsub = f"{s.public_api_url.rstrip('/')}/api/unsubscribe/test"
        async with httpx.AsyncClient(timeout=30) as client:
            code, body = await _send_one(
                client, s.brevo_api_key, sender, payload.subject,
                _build_html(payload.text, unsub), test_to, "",
            )
        if code >= 300:
            raise HTTPException(status_code=502, detail=f"Brevo вернул {code}: {body[:200]}")
        return {"ok": True, "test": True, "sent": 1}

    campaign = _campaign_key(payload.subject)
    subs = (
        await db.execute(_pending_query(campaign, payload.group or None))
    ).scalars().all()
    if not subs:
        raise HTTPException(
            status_code=400,
            detail="Этот выпуск уже ушёл всем в группе. Смени тему письма или выбери другую группу.",
        )

    batch = subs
    if payload.limit and payload.limit > 0:
        batch = subs[: payload.limit]

    # Предохранитель: сверх дневной квоты Brevo письма просто не уходят —
    # адресат ничего не получит, а адрес у нас пометится как «отправлено».
    # Поэтому лишнее отсекаем здесь и честно говорим, сколько взяли.
    brevo = await _brevo_today()
    trimmed = False
    left = brevo.get("left_today")
    if isinstance(left, int):
        if left <= 0:
            raise HTTPException(
                status_code=400,
                detail=f"На сегодня лимит Brevo исчерпан "
                f"({brevo['sent_today']} из {brevo['daily_limit']}). "
                "Письма всё равно не уйдут — продолжи завтра с той же темой "
                "или подключи платный тариф Brevo.",
            )
        if len(batch) > left:
            batch = batch[:left]
            trimmed = True

    recipients = [(x.id, x.email, x.name, x.unsub_token) for x in batch]

    asyncio.create_task(_send_bulk(payload.subject, payload.text, recipients))
    return {
        "ok": True,
        "queued": len(recipients),
        "remaining": len(subs) - len(recipients),
        "trimmed_to_daily_limit": trimmed,
    }


@router.get("/broadcast/progress")
async def broadcast_progress(manager: Manager = Depends(require_admin)):
    """Ход текущей (или последней) отправки + что с письмами у Brevo.

    «Отправлено» — принято сервером Brevo. Доставлено ли письмо в ящик,
    видно чуть позже: это отдельные цифры ниже, они приходят от Brevo.
    """
    brevo = await _brevo_today()
    stats = {}
    s = get_settings()
    if s.brevo_api_key:
        today = datetime.now(timezone.utc).date().isoformat()
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(
                    BREVO_STATS_URL,
                    headers={"api-key": s.brevo_api_key, "accept": "application/json"},
                    params={"startDate": today, "endDate": today},
                )
                if r.status_code < 300:
                    d = r.json()
                    stats = {
                        "delivered": d.get("delivered"),
                        "hard_bounces": d.get("hardBounces"),
                        "soft_bounces": d.get("softBounces"),
                        "opens": d.get("uniqueOpens"),
                        "spam": d.get("spamReports"),
                        "blocked": d.get("blocked"),
                    }
        except Exception as exc:  # noqa: BLE001 — статистика не критична
            logger.warning("Brevo statistics: %s", exc)
    return {
        "run": {
            "subject": _run_state["subject"],
            "total": _run_state["total"],
            "sent": _run_state["sent"],
            "failed": _run_state["failed"],
            "running": _run_state["running"],
            "started_at": _run_state["started_at"],
            "finished_at": _run_state["finished_at"],
            "errors": _run_state["errors"][:20],
        },
        "sent_today": brevo["sent_today"],
        "daily_limit": brevo["daily_limit"],
        "left_today": brevo["left_today"],
        "today": stats,
    }


@router.get("/broadcast/delivery")
async def broadcast_delivery(
    days: int = Query(default=3, ge=1, le=30),
    manager: Manager = Depends(require_admin),
):
    """Адреса, до которых письмо НЕ дошло, — прямо от Brevo, по событиям.

    Жёсткий отказ (hardBounce) — такого ящика нет, адрес надо убрать из базы.
    Мягкий (softBounce) — временно: переполнен ящик, занят сервер.
    """
    s = get_settings()
    if not s.brevo_api_key:
        raise HTTPException(status_code=400, detail="Brevo не настроен.")
    since = (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    problems: dict = {}
    headers = {"api-key": s.brevo_api_key, "accept": "application/json"}
    async with httpx.AsyncClient(timeout=25) as client:
        for event in ("hardBounces", "softBounces", "spam", "blocked", "invalid"):
            try:
                r = await client.get(
                    "https://api.brevo.com/v3/smtp/statistics/events",
                    headers=headers,
                    params={"startDate": since, "endDate": today,
                            "event": event, "limit": 200},
                )
                if r.status_code >= 300:
                    continue
                for item in r.json().get("events", []):
                    email = item.get("email")
                    if email:
                        problems.setdefault(email, {"email": email, "kinds": []})
                        if event not in problems[email]["kinds"]:
                            problems[email]["kinds"].append(event)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Brevo events %s: %s", event, exc)
    return {"days": days, "total": len(problems), "items": list(problems.values())[:200]}


# --------------------------- Отложенные выпуски ---------------------------

_TZ_LABELS = {"Europe/Moscow": "МСК", "Africa/Cairo": "Каир", "UTC": "UTC"}


class ScheduleRequest(BaseModel):
    subject: str
    text: str
    group: Optional[str] = None
    limit: Optional[int] = None
    run_at_local: str          # «2026-08-02T08:00» — как набрано в поле
    tz: str = "Europe/Moscow"
    repeat_daily: bool = False


def _to_utc(local_str: str, tz_name: str) -> datetime:
    """«2026-08-02T08:00» + зона → момент в UTC."""
    try:
        naive = datetime.fromisoformat(local_str.replace("Z", "").strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Не разобрал дату и время.")
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        raise HTTPException(status_code=400, detail="Не знаю такого часового пояса.")
    if naive.tzinfo is None:
        naive = naive.replace(tzinfo=tz)
    return naive.astimezone(timezone.utc)


@router.post("/broadcast/schedule")
async def schedule_broadcast(
    payload: ScheduleRequest,
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Поставить выпуск на время. Письма уйдут сами, ничего держать открытым не надо."""
    s = get_settings()
    if not s.brevo_api_key or not s.brevo_sender_email:
        raise HTTPException(status_code=400, detail="Рассылка не настроена (нет ключей Brevo).")
    if not payload.subject.strip() or not payload.text.strip():
        raise HTTPException(status_code=400, detail="Заполни тему и текст письма.")

    run_at = _to_utc(payload.run_at_local, payload.tz)
    if run_at < datetime.now(timezone.utc) - timedelta(minutes=2):
        raise HTTPException(status_code=400, detail="Это время уже прошло.")

    row = ScheduledBroadcast(
        subject=payload.subject.strip(),
        body=payload.text,
        group_tag=payload.group or "",
        batch_limit=max(0, payload.limit or 0),
        repeat_daily=1 if payload.repeat_daily else 0,
        run_at=run_at.isoformat(),
        tz_label=_TZ_LABELS.get(payload.tz, payload.tz),
        status="pending",
        created_at=_now(),
        created_by=manager.username,
    )
    db.add(row)
    await db.commit()
    return {"ok": True, "id": row.id, "run_at": row.run_at}


@router.get("/broadcast/scheduled")
async def list_scheduled(
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Что стоит в очереди и что уже отработало (последние 20)."""
    rows = (
        await db.execute(
            select(ScheduledBroadcast).order_by(ScheduledBroadcast.run_at.desc()).limit(20)
        )
    ).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "subject": r.subject,
                "group": r.group_tag or "",
                "limit": r.batch_limit,
                "repeat_daily": bool(r.repeat_daily),
                "run_at": r.run_at,
                "tz_label": r.tz_label,
                "status": r.status,
                "sent_total": r.sent_total,
                "last_error": r.last_error,
            }
            for r in rows
        ]
    }


@router.delete("/broadcast/scheduled/{item_id}")
async def cancel_scheduled(
    item_id: int = Path(...),
    manager: Manager = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
):
    """Отменить запланированный выпуск (если ещё не ушёл)."""
    row = await db.get(ScheduledBroadcast, item_id)
    if not row:
        raise HTTPException(status_code=404, detail="Такого выпуска нет.")
    if row.status == "pending":
        row.status = "cancelled"
        await db.commit()
    return {"ok": True, "status": row.status}


async def run_due_broadcasts() -> int:
    """Разослать всё, чему настало время. Вызывается планировщиком раз в минуту.

    Возвращает число запущенных выпусков. Внутри — та же логика партий, что и
    у ручной отправки: адрес, уже получивший эту тему, второй раз не берётся.
    """
    factory = get_session_factory()
    started = 0
    now = datetime.now(timezone.utc)
    async with factory() as db:
        due = (
            await db.execute(
                select(ScheduledBroadcast)
                .where(ScheduledBroadcast.status == "pending")
                .where(ScheduledBroadcast.run_at <= now.isoformat())
            )
        ).scalars().all()
        for item in due:
            campaign = _campaign_key(item.subject)
            subs = (
                await db.execute(_pending_query(campaign, item.group_tag or None))
            ).scalars().all()
            if not subs:
                item.status = "done"
                logger.info("Отложенный выпуск #%s: получателей не осталось", item.id)
                continue
            batch = subs[: item.batch_limit] if item.batch_limit else subs
            recipients = [(x.id, x.email, x.name, x.unsub_token) for x in batch]
            asyncio.create_task(_send_bulk(item.subject, item.body, recipients))
            item.sent_total += len(recipients)
            started += 1
            remaining = len(subs) - len(recipients)
            if item.repeat_daily and remaining > 0:
                # следующая партия — завтра в то же время
                item.run_at = (
                    datetime.fromisoformat(item.run_at) + timedelta(days=1)
                ).isoformat()
                logger.info(
                    "Отложенный выпуск #%s: ушло %d, осталось %d — повтор завтра",
                    item.id, len(recipients), remaining,
                )
            else:
                item.status = "done"
                logger.info(
                    "Отложенный выпуск #%s: ушло %d писем", item.id, len(recipients)
                )
        await db.commit()
    return started


@router.get("/unsubscribe/{token}", response_class=HTMLResponse)
async def unsubscribe(
    token: str = Path(...),
    db: AsyncSession = Depends(get_db_session),
):
    """Публичная отписка по токену (без авторизации)."""
    row = (
        await db.execute(select(Subscriber).where(Subscriber.unsub_token == token))
    ).scalar_one_or_none()
    if row and not row.unsubscribed:
        row.unsubscribed = 1
        await db.commit()
    return HTMLResponse(
        "<!doctype html><html lang='ru'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Отписка</title></head>"
        "<body style='font-family:Arial,sans-serif;text-align:center;padding:64px 20px;color:#092127'>"
        "<h2>Вы отписались от рассылки</h2>"
        "<p style='color:#667'>Больше писем не придёт. Спасибо, что были с нами! 🌿</p>"
        "<p style='color:#98a2a6;font-size:13px'>Школа арабского Talkarabic</p>"
        "</body></html>"
    )
