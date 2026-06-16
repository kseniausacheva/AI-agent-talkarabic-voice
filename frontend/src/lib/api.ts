import { authHeaders, clearToken } from "./auth";
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
  mockStart,
  mockStats,
  mockSubmit,
  mockUpdateDeal,
} from "./mock-data";
import type {
  AnswerPayload,
  AuthResponse,
  ChecklistsResponse,
  ClientAdvice,
  DealInfo,
  DealUpdate,
  FunnelColumn,
  LeadStage,
  Manager,
  ResultsResponse,
  SessionStartResponse,
  StatsResponse,
  SubmitRoundResponse,
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
