import {
  MOCK_TRANSCRIPTS,
  mockResults,
  mockStart,
  mockSubmit,
} from "./mock-data";
import type {
  ResultsResponse,
  SessionStartResponse,
  SubmitRoundResponse,
} from "./types";

/**
 * MOCK-режим включён по умолчанию для разработки UI без бэкенда.
 * Переключи NEXT_PUBLIC_USE_MOCK=false и подними backend, чтобы работать с реальным API.
 */
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:7860";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const isMock = () => USE_MOCK;

export async function apiStartSession(): Promise<SessionStartResponse> {
  if (USE_MOCK) {
    await wait(900);
    return mockStart();
  }
  const res = await fetch(`${API_BASE}/api/session/start`, { method: "POST" });
  if (!res.ok) throw new Error(`start failed: ${res.status}`);
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
  const res = await fetch(`${API_BASE}/api/session/transcribe`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(`transcribe failed: ${res.status}`);
  const data = await res.json();
  return data.transcript as string;
}

export async function apiSubmitRound(
  sessionId: string,
  round: number,
  answers: { question_id: string; transcript: string }[],
): Promise<SubmitRoundResponse> {
  if (USE_MOCK) {
    await wait(1600);
    return mockSubmit(round);
  }
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answers }),
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status}`);
  return res.json();
}

export async function apiGetResults(
  sessionId: string,
): Promise<ResultsResponse> {
  if (USE_MOCK) {
    await wait(500);
    return mockResults();
  }
  const res = await fetch(`${API_BASE}/api/session/${sessionId}/results`);
  if (!res.ok) throw new Error(`results failed: ${res.status}`);
  return res.json();
}

export function apiDownloadUrl(sessionId: string): string {
  if (USE_MOCK) {
    return "#mock-download";
  }
  return `${API_BASE}/api/session/${sessionId}/download`;
}
