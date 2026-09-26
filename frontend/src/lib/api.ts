import { authHeaders, clearToken, getToken } from "./auth";
import {
  MOCK_ADVICE,
  MOCK_DEMO_SESSION_ID,
  MOCK_MANAGER,
  MOCK_MARKDOWN,
  MOCK_TOKEN,
  MOCK_TRANSCRIPTS,
  mockChecklists,
  mockKnowledgeState,
  mockResults,
  mockSales,
  mockStart,
  mockStats,
  mockSubmit,
  mockUpdateClient,
  mockUpdateContact,
  mockUpdateDeal,
} from "./mock-data";
import type {
  AnswerPayload,
  AuthResponse,
  ChecklistsResponse,
  ClientAdvice,
  ClientUpdate,
  ContactInfo,
  ContactUpdate,
  BroadcastProgress,
  BroadcastResult,
  BroadcastStatus,
  ScheduledBroadcast,
  DealInfo,
  DealUpdate,
  FunnelColumn,
  ImportResult,
  SubscribersInfo,
  LeadStage,
  Manager,
  ResultsResponse,
  SalesReport,
  SessionStartResponse,
  StatsResponse,
  SubmitRoundResponse,
  SubscriberRow,
  SubscribersImportResult,
  AttachmentItem,
  ExcludeResult,
  SubscribersListResponse,
} from "./types";

/**
 * MOCK-режим включён по умолчанию для разработки UI без бэкенда.
 * Переключи NEXT_PUBLIC_USE_MOCK=false и подними backend, чтобы работать с реальным API.
 * В mock-режиме весь UI работает БЕЗ логина (спека §5).
 */
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:7860";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const isMock = () => USE_MOCK;

function parseDetail(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) =>
          d && typeof d === "object" && "msg" in d
            ? String((d as { msg: unknown }).msg)
            : "",
        )
        .filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
  }
  return fallback;
}

async function toApiError(res: Response): Promise<Error> {
  const fallback = `Ошибка запроса (${res.status})`;
  try {
    return new Error(parseDetail(await res.json(), fallback));
  } catch {
    return new Error(fallback);
  }
}

function redirectToLogin(): void {
  clearToken();
  if (typeof window !== "undefined") {
    window.location.replace("/login");
  }
}

/**
 * Общий запрос к защищённым эндпоинтам: шлёт Authorization,
 * при 401 чистит токен и уводит на /login.
 */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (res.status === 401) {
    redirectToLogin();
    throw new Error("Сессия истекла. Войдите заново.");
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

/* ----------------------------- Auth ----------------------------- */

export async function apiRegister(payload: {
  invite_code: string;
  username: string;
  password: string;
  display_name: string;
}): Promise<AuthResponse> {
  if (USE_MOCK) {
    await wait(500);
    return {
      token: MOCK_TOKEN,
      manager: { ...MOCK_MANAGER, display_name: payload.display_name },
    };
  }
  // Без request(): 401/403 здесь — ошибка формы, а не просроченный токен.
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiLogin(
  username: string,
  password: string,
): Promise<AuthResponse> {
  if (USE_MOCK) {
    await wait(500);
    return { token: MOCK_TOKEN, manager: MOCK_MANAGER };
  }
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (res.status === 401) throw new Error("Неверный логин или пароль.");
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export async function apiMe(): Promise<Manager> {
  if (USE_MOCK) {
    await wait(150);
    return MOCK_MANAGER;
  }
  const res = await request("/api/auth/me");
  return res.json();
}

/** Привязать/отвязать Telegram chat_id (null = отвязать). */
export async function apiSetTelegram(
  chatId: string | null,
): Promise<Manager> {
  if (USE_MOCK) {
    await wait(300);
    return { ...MOCK_MANAGER, telegram_chat_id: chatId };
  }
  const res = await request("/api/auth/telegram", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegram_chat_id: chatId }),
  });
  return res.json();
}

/* ---------------------------- Session ---------------------------- */

export async function apiStartSession(
  clientName: string,
  clientDate: string,
): Promise<SessionStartResponse> {
  if (USE_MOCK) {
    await wait(900);
    return mockStart(clientName, clientDate);
  }
  const res = await request("/api/session/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: clientName, client_date: clientDate }),
  });
  return res.json();
}

export async function apiTranscribe(
  audio: Blob,
  questionId: string,
): Promise<string> {
  if (USE_MOCK) {
    await wait(1200);
    return MOCK_TRANSCRIPTS[questionId] ?? "Тестовая транскрипция (mock).";
  }
  const form = new FormData();
  form.append("audio_file", audio, "answer.webm");
  const res = await request("/api/session/transcribe", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  return data.transcript as string;
}

export async function apiSubmitRound(
  sessionId: string,
  round: number,
  answers: AnswerPayload[],
  conversation = "",
): Promise<SubmitRoundResponse> {
  if (USE_MOCK) {
    await wait(1600);
    return mockSubmit(round);
  }
  const res = await request(`/api/session/${sessionId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers, conversation }),
  });
  return res.json();
}

/** Распознать переписку со скриншотов (gpt-4o vision) → текст для поля переписки. */
export async function apiExtractScreenshots(
  files: File[],
): Promise<{ text: string }> {
  if (USE_MOCK) {
    await wait(1500);
    return {
      text:
        "Клиент: Здравствуйте, хочу узнать про курсы арабского (распознано из скриншота, demo)\n" +
        "Менеджер: Здравствуйте! Подскажите ваше имя и город?",
    };
  }
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const res = await request("/api/session/extract-screenshots", {
    method: "POST",
    body: form,
  });
  return res.json();
}

/**
 * Анализ вставленной переписки: ИИ строит готовый чеклист сразу.
 * Возвращает session_id → ведём на /results.
 */
export async function apiAnalyzeText(
  clientName: string,
  clientDate: string,
  conversation: string,
): Promise<{ session_id: string }> {
  if (USE_MOCK) {
    await wait(1600);
    return { session_id: MOCK_DEMO_SESSION_ID };
  }
  const res = await request("/api/session/from-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: clientName,
      client_date: clientDate,
      conversation,
    }),
  });
  return res.json();
}

export async function apiGetResults(
  sessionId: string,
): Promise<ResultsResponse> {
  if (USE_MOCK) {
    await wait(500);
    return mockResults();
  }
  const res = await request(`/api/session/${sessionId}/results`);
  return res.json();
}

/**
 * Скачивание .md через fetch с Bearer (обычная навигация не передаст токен).
 * Имя файла берём из Content-Disposition, фолбэк — checklist-{id}.md.
 */
export async function apiDownloadChecklist(
  sessionId: string,
): Promise<{ blob: Blob; filename: string }> {
  if (USE_MOCK) {
    await wait(200);
    return {
      blob: new Blob([MOCK_MARKDOWN], { type: "text/markdown;charset=utf-8" }),
      filename: `checklist-${sessionId}.md`,
    };
  }
  const res = await request(`/api/session/${sessionId}/download`);
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return {
    blob: await res.blob(),
    filename: match?.[1] ?? `checklist-${sessionId}.md`,
  };
}

/**
 * Ручное обновление сделки (продукт, стоимость, оплата). Шлём только
 * изменённые поля. Возвращает актуальный DealInfo.
 */
export async function apiUpdateDeal(
  sessionId: string,
  changes: DealUpdate,
): Promise<DealInfo> {
  if (USE_MOCK) {
    await wait(300);
    return mockUpdateDeal(changes);
  }
  const res = await request(`/api/session/${sessionId}/deal`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  return res.json();
}

/**
 * Обновление данных клиента (имя, дата контакта). Возвращает актуальные
 * client_name/client_date.
 */
export async function apiUpdateClient(
  sessionId: string,
  changes: ClientUpdate,
): Promise<{ client_name: string; client_date: string }> {
  if (USE_MOCK) {
    await wait(250);
    return mockUpdateClient(changes);
  }
  const res = await request(`/api/session/${sessionId}/client`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  return res.json();
}

/**
 * Обновление контактов клиента (телефон, канал, email, заметка) и плана
 * следующего касания (дата + что предложить). Возвращает актуальный ContactInfo.
 */
export async function apiUpdateContact(
  sessionId: string,
  changes: ContactUpdate,
): Promise<ContactInfo> {
  if (USE_MOCK) {
    await wait(250);
    return mockUpdateContact(changes);
  }
  const res = await request(`/api/session/${sessionId}/contact`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  });
  return res.json();
}

/** Полное удаление клиента (чеклиста) — безвозвратно. */
export async function apiDeleteSession(sessionId: string): Promise<void> {
  if (USE_MOCK) {
    await wait(300);
    return;
  }
  await request(`/api/session/${sessionId}`, { method: "DELETE" });
}

/**
 * Импорт клиентов из CSV (admin). commit=false → превью (разбор без записи),
 * commit=true → создаёт карточки. Дедуп по email.
 */
export async function apiImportClients(
  csv: string,
  commit: boolean,
): Promise<ImportResult> {
  if (USE_MOCK) {
    await wait(600);
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    const dataRows = Math.max(0, lines.length - 1);
    if (!commit) {
      const sample = lines.slice(1, 6).map((l) => {
        const c = l.split(/[,;]/);
        return {
          client_name: (c[0] || "—").trim(),
          email: (c[1] || "").trim(),
          phone: (c[2] || "").trim(),
          channel: null,
          note: "",
          stage: "new",
          client_date: "",
          price: null,
          product: null,
        };
      });
      return {
        ok: true,
        preview: true,
        total_rows: dataRows,
        column_mapping: { "колонка 1": "client_name", "колонка 2": "email" },
        sample,
      };
    }
    return { ok: true, created: dataRows, skipped: 0, total_rows: dataRows };
  }
  const res = await request("/api/import/clients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ csv, commit }),
  });
  return res.json();
}

/* ----------------------- Email-рассылка ----------------------- */

/** Сводка по базе рассылки (admin). */
export async function apiSubscribers(): Promise<SubscribersInfo> {
  if (USE_MOCK) {
    await wait(300);
    return {
      total: 128,
      unsubscribed: 2,
      groups: [
        { group: "Египетский диалект", count: 106 },
        { group: "Халиджи", count: 14 },
        { group: "Курс 2 (Египетский)", count: 8 },
      ],
      configured: true,
      sender: "info@talkarabicnow.online",
      senders: [
        { email: "info@talkarabicnow.online", name: "Школа арабского Talkarabic" },
        { email: "sale@royaleventandmice.ru", name: "La Royal Event" },
      ],
    };
  }
  const res = await request("/api/subscribers");
  return res.json();
}

/** Ход выпуска по теме письма + дневной лимит Brevo. */
export async function apiBroadcastStatus(opts: {
  subject: string;
  group?: string | null;
}): Promise<BroadcastStatus> {
  if (USE_MOCK) {
    await wait(200);
    return {
      group_total: 126,
      pending: 126,
      already_sent: 0,
      sent_today: 12,
      daily_limit: 300,
      left_today: 288,
    };
  }
  const params = new URLSearchParams({ subject: opts.subject });
  if (opts.group) params.set("group", opts.group);
  const res = await request(`/api/broadcast/status?${params.toString()}`);
  return res.json();
}

/** Отправить выпуск. test_email → тест-письмо; иначе партия по группе. */
export async function apiBroadcast(payload: {
  subject: string;
  text: string;
  group?: string | null;
  test_email?: string | null;
  limit?: number | null;
  sender_email?: string | null;
  attachments?: AttachmentItem[];
}): Promise<BroadcastResult> {
  if (USE_MOCK) {
    await wait(700);
    if (payload.test_email) return { ok: true, test: true, sent: 1 };
    const queued = payload.limit ?? 106;
    return { ok: true, queued, remaining: Math.max(0, 126 - queued) };
  }
  const res = await request("/api/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/** Постраничный список подписчиков (admin). */
export async function apiSubscribersList(opts: {
  q?: string;
  group?: string;
  page?: number;
}): Promise<SubscribersListResponse> {
  const { q = "", group = "", page = 1 } = opts;
  if (USE_MOCK) {
    await wait(300);
    const groups = ["Египетский диалект", "Халиджи", "Курс 2 (Египетский)"];
    const all: SubscriberRow[] = Array.from({ length: 128 }, (_, i) => ({
      id: i + 1,
      email: `client${i + 1}@example.com`,
      name: "",
      group: groups[i % 3],
      unsubscribed: i % 40 === 0,
    }));
    const filtered = all.filter(
      (s) =>
        (!group || s.group === group) &&
        (!q.trim() || s.email.includes(q.trim().toLowerCase())),
    );
    const per = 30;
    return {
      items: filtered.slice((page - 1) * per, (page - 1) * per + per),
      total: filtered.length,
      page,
      per_page: per,
    };
  }
  const params = new URLSearchParams({ page: String(page), per_page: "30" });
  if (q.trim()) params.set("q", q.trim());
  if (group) params.set("group", group);
  const res = await request(`/api/subscribers/list?${params.toString()}`);
  return res.json();
}

/** Загрузить медиа для письма (admin) → публичный URL.
 *  Для видео дополнительно приходит `preview` — GIF-нарезка для вставки в письмо. */
export async function apiUploadImage(
  file: File,
): Promise<{ url: string; kind?: "image" | "video"; preview?: string }> {
  if (USE_MOCK) {
    await wait(400);
    return { url: URL.createObjectURL(file) };
  }
  const form = new FormData();
  form.append("file", file);
  const res = await request("/api/upload/image", { method: "POST", body: form });
  return res.json();
}

/** Ход текущей отправки + что Brevo сделал с письмами сегодня. */
export async function apiBroadcastProgress(): Promise<BroadcastProgress> {
  if (USE_MOCK) {
    await wait(150);
    return {
      run: {
        subject: "Новый поток", total: 300, sent: 187, failed: 2,
        running: true, started_at: "", finished_at: "",
        errors: [{ email: "bad@nowhere.zz", reason: "invalid recipient" }],
      },
      sent_today: 187, daily_limit: 300, left_today: 113,
      today: { delivered: 180, hard_bounces: 2, soft_bounces: 1, opens: 12, spam: 0, blocked: 0 },
    };
  }
  const res = await request("/api/broadcast/progress");
  return res.json();
}

/** Адреса, до которых письмо не дошло (по данным Brevo). */
export async function apiBroadcastDelivery(days = 3): Promise<{
  days: number;
  total: number;
  items: { email: string; kinds: string[] }[];
}> {
  if (USE_MOCK) {
    await wait(300);
    return { days, total: 1, items: [{ email: "bad@nowhere.zz", kinds: ["hardBounces"] }] };
  }
  const res = await request(`/api/broadcast/delivery?days=${days}`);
  return res.json();
}

/** Поставить выпуск на время. run_at_local — как набрано в поле («2026-08-02T08:00»). */
export async function apiScheduleBroadcast(payload: {
  subject: string;
  text: string;
  group?: string | null;
  limit?: number | null;
  run_at_local: string;
  tz: string;
  repeat_daily: boolean;
  sender_email?: string | null;
  attachments?: AttachmentItem[];
}): Promise<{ ok: boolean; id?: number; run_at?: string; detail?: string }> {
  if (USE_MOCK) {
    await wait(400);
    return { ok: true, id: 1, run_at: payload.run_at_local };
  }
  const res = await request("/api/broadcast/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/** Что стоит в очереди на отправку. */
export async function apiScheduledList(): Promise<{ items: ScheduledBroadcast[] }> {
  if (USE_MOCK) {
    await wait(250);
    return {
      items: [
        {
          id: 1,
          subject: "Новый поток египетского",
          group: "",
          limit: 300,
          repeat_daily: true,
          run_at: "2026-08-02T05:00:00+00:00",
          tz_label: "МСК",
          status: "pending",
          sent_total: 0,
          last_error: null,
        },
      ],
    };
  }
  const res = await request("/api/broadcast/scheduled");
  return res.json();
}

/** Отменить запланированный выпуск. */
export async function apiCancelScheduled(id: number): Promise<void> {
  if (USE_MOCK) {
    await wait(200);
    return;
  }
  await request(`/api/broadcast/scheduled/${id}`, { method: "DELETE" });
}

/** Видео по ссылке (Kinescope или прямая ссылка на файл): сервер сам нарежет
 *  GIF-превью, файл никуда не загружается. */
export async function apiVideoByLink(
  url: string,
): Promise<{ url: string; kind?: "video"; preview?: string }> {
  if (USE_MOCK) {
    await wait(1200);
    return { url, kind: "video", preview: "https://placehold.co/480x270.gif" };
  }
  const res = await request("/api/upload/video-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return res.json();
}

/** Загрузка медиа с отображением процента (fetch процент отдавать не умеет,
 *  поэтому XHR). onProgress(-1) — процент неизвестен. */
export function apiUploadMediaProgress(
  file: File,
  onProgress: (percent: number) => void,
): Promise<{ url: string; kind?: "image" | "video"; preview?: string }> {
  if (USE_MOCK) {
    return new Promise((resolve) => {
      let p = 0;
      const timer = window.setInterval(() => {
        p += 20;
        onProgress(Math.min(100, p));
        if (p >= 100) {
          window.clearInterval(timer);
          resolve({ url: URL.createObjectURL(file), kind: "video" });
        }
      }, 200);
    });
  }
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/upload/image`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      onProgress(e.lengthComputable ? Math.round((e.loaded / e.total) * 100) : -1);
    };
    // тело ушло целиком — дальше сервер режет превью, это может занять минуту
    xhr.upload.onload = () => onProgress(100);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Сервер ответил неожиданным образом."));
        }
        return;
      }
      let detail = `Сервер ответил ${xhr.status}.`;
      try {
        detail = JSON.parse(xhr.responseText).detail || detail;
      } catch {
        /* тело не JSON — оставляем код ответа */
      }
      reject(new Error(detail));
    };
    xhr.onerror = () =>
      reject(new Error("Связь с сервером оборвалась во время загрузки."));
    xhr.ontimeout = () => reject(new Error("Загрузка не уложилась во время."));
    xhr.onabort = () => reject(new Error("Загрузка отменена."));
    xhr.send(form);
  });
}

/** Загрузить базу из Excel/CSV в группу (admin). Колонки сервер узнаёт сам. */
export async function apiImportSubscribersFile(
  file: File,
  group: string,
): Promise<SubscribersImportResult> {
  if (USE_MOCK) {
    await wait(600);
    return { ok: true, group, found: 186, added: 183, already: 3, in_group: 183 };
  }
  const form = new FormData();
  form.append("file", file);
  form.append("group", group);
  const res = await request("/api/subscribers/import-file", {
    method: "POST",
    body: form,
  });
  return res.json();
}

/** Файл-вложение письма (admin): PDF/PPTX/DOCX/XLSX/ZIP ≤ 10 МБ → ссылка + имя. */
export async function apiUploadFile(file: File): Promise<AttachmentItem> {
  if (USE_MOCK) {
    await wait(500);
    return { url: URL.createObjectURL(file), name: file.name, size: file.size };
  }
  const form = new FormData();
  form.append("file", file);
  const res = await request("/api/upload/file", { method: "POST", body: form });
  return res.json();
}

/** Кому этот выпуск не слать: email или название фирмы, по строке. */
export async function apiExcludeFromBroadcast(payload: {
  subject: string;
  group?: string | null;
  lines: string[];
}): Promise<ExcludeResult> {
  if (USE_MOCK) {
    await wait(400);
    const lines = payload.lines.filter((l) => l.trim());
    return {
      ok: true,
      excluded: Math.max(0, lines.length - 1),
      matched: lines.slice(0, -1).map((l) => `${l.toLowerCase()}@example.com · ${l}`),
      unmatched: lines.slice(-1),
    };
  }
  const res = await request("/api/broadcast/exclude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/** Удалить подписчика из базы рассылки (admin). */
export async function apiDeleteSubscriber(id: number): Promise<void> {
  if (USE_MOCK) {
    await wait(200);
    return;
  }
  await request(`/api/subscribers/${id}`, { method: "DELETE" });
}

/* ----------------- База знаний и AI-советник ----------------- */

/** Сгенерировать план работы с клиентом (на основе базы школы). */
export async function apiGetAdvice(sessionId: string): Promise<ClientAdvice> {
  if (USE_MOCK) {
    await wait(1300);
    return MOCK_ADVICE;
  }
  const res = await request(`/api/session/${sessionId}/advice`, {
    method: "POST",
  });
  return res.json();
}

/** База знаний школы — чтение (admin). */
export async function apiGetKnowledge(): Promise<{
  text: string;
  updated_at: string | null;
}> {
  if (USE_MOCK) {
    await wait(200);
    return { text: mockKnowledgeState.text, updated_at: null };
  }
  const res = await request("/api/knowledge");
  return res.json();
}

/** База знаний школы — сохранить (admin). */
export async function apiSaveKnowledge(
  text: string,
): Promise<{ text: string; updated_at: string }> {
  if (USE_MOCK) {
    await wait(300);
    mockKnowledgeState.text = text;
    return { text, updated_at: new Date().toISOString() };
  }
  const res = await request("/api/knowledge", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

/* ----------------------- Дашборд и статистика ----------------------- */

export async function apiChecklists(opts: {
  q?: string;
  page?: number;
  perPage?: number;
  /** due=today — completed-записи с next_contact_date <= сегодня (спека §4). */
  due?: "today";
  status?: "in_progress" | "completed";
}): Promise<ChecklistsResponse> {
  const { q = "", page = 1, perPage = 20, due, status } = opts;
  if (USE_MOCK) {
    await wait(400);
    return mockChecklists(q, page, perPage, due);
  }
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (q.trim()) params.set("q", q.trim());
  if (due) params.set("due", due);
  if (status) params.set("status", status);
  const res = await request(`/api/checklists?${params.toString()}`);
  return res.json();
}

/** Перемещение карточки в воронке (канбан): меняет стадию или отмечает оплату. */
export async function apiUpdateFunnel(
  sessionId: string,
  column: FunnelColumn,
): Promise<{ stage: LeadStage | null; paid: boolean }> {
  if (USE_MOCK) {
    await wait(200);
    return {
      stage: column === "paid" ? null : (column as LeadStage),
      paid: column === "paid",
    };
  }
  const res = await request(`/api/session/${sessionId}/funnel`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ column }),
  });
  return res.json();
}

export async function apiStats(): Promise<StatsResponse> {
  if (USE_MOCK) {
    await wait(400);
    return mockStats();
  }
  const res = await request("/api/stats");
  return res.json();
}

/**
 * Отчёт по деньгам за период (1-е → 1-е). month = YYYY-MM (по умолчанию текущий).
 * Доступно всей команде (общий пул).
 */
export async function apiSales(month?: string): Promise<SalesReport> {
  if (USE_MOCK) {
    await wait(350);
    return mockSales(month);
  }
  const path = month
    ? `/api/sales?month=${encodeURIComponent(month)}`
    : "/api/sales";
  const res = await request(path);
  return res.json();
}
