import { authHeaders, clearToken } from "./auth";
import {
  MOCK_MANAGER,
  MOCK_MARKDOWN,
  MOCK_TOKEN,
  MOCK_TRANSCRIPTS,
  mockChecklists,
  mockResults,
  mockStart,
  mockStats,
  mockSubmit,
} from "./mock-data";
import type {
  AnswerPayload,
  AuthResponse,
  ChecklistsResponse,
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
): Promise<SubmitRoundResponse> {
  if (USE_MOCK) {
    await wait(1600);
    return mockSubmit(round);
  }
  const res = await request(`/api/session/${sessionId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
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

/* ----------------------- Дашборд и статистика ----------------------- */

export async function apiChecklists(opts: {
  q?: string;
  page?: number;
  perPage?: number;
  /** due=today — completed-записи с next_contact_date <= сегодня (спека §4). */
  due?: "today";
}): Promise<ChecklistsResponse> {
  const { q = "", page = 1, perPage = 20, due } = opts;
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
  const res = await request(`/api/checklists?${params.toString()}`);
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
