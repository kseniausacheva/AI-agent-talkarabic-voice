import { authHeaders, clearToken, getToken } from "@/lib/auth";

export const PARTNER_STATUSES = ["new", "reviewing", "approved", "declined", "paused"] as const;
export type PartnerStatus = (typeof PARTNER_STATUSES)[number];

export type PartnerRow = {
  id: string;
  reference: string;
  companyName: string;
  legalName: string;
  email: string;
  contactName: string;
  country: string;
  city: string;
  partnerType: string;
  status: PartnerStatus;
  assignedTo: string;
  nextFollowUp: string | null;
  createdAt: string;
  updatedAt: string;
  marketingOptIn: boolean;
  isDemo: boolean;
  agreementStatus: string;
};

export type PartnerEvent = {
  id: string;
  kind: string;
  actor: string;
  createdAt: string;
  data: { note?: string; changes?: Record<string, unknown>; [key: string]: unknown };
};

export type PartnerDetail = PartnerRow & {
  profile: Record<string, unknown>;
  events: PartnerEvent[];
  privacyNoticeVersion?: string | null;
  privacyAcknowledgedAt?: string | null;
  marketingConsentVersion?: string | null;
  marketingOptInAt?: string | null;
};

export type PartnerList = {
  items: PartnerRow[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
  counts: Record<PartnerStatus, number>;
};

export type PartnerConfig = {
  intakeEnabled: boolean;
  acceptanceEnabled: boolean;
  brevoConfigured: boolean;
  agreementVersion: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:7860";

/** The partner register always uses the real backend, including in school mock mode. */
async function partnerRequest(path: string, init: RequestInit = {}): Promise<Response> {
  if (!getToken()) {
    window.location.replace("/login");
    throw new Error("Войдите в систему, чтобы открыть реестр партнёров.");
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401) {
    clearToken();
    window.location.replace("/login");
    throw new Error("Сессия истекла. Войдите заново.");
  }
  if (res.status === 403) throw new Error("Реестр партнёров доступен администратору. Войдите под учётной записью с правами администратора.");
  if (!res.ok) {
    let message = res.status === 404
      ? "Реестр партнёров ещё не подключён к этому серверу или запись больше недоступна."
      : `Не удалось выполнить запрос (${res.status}).`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      if (Array.isArray(data.detail)) message = data.detail.map((e: { msg?: string }) => e.msg ?? "Ошибка поля").join("; ");
    } catch { /* Retain a useful HTTP error for non-JSON gateway responses. */ }
    throw new Error(message);
  }
  return res;
}

function listParams(search: string, status: string): URLSearchParams {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  if (status) params.set("status", status);
  return params;
}

export async function fetchPartners(search: string, status: string, page: number, signal?: AbortSignal): Promise<PartnerList> {
  const params = listParams(search, status);
  params.set("page", String(page));
  params.set("per_page", "30");
  return (await partnerRequest(`/api/partners?${params}`, { signal })).json();
}

export async function fetchPartner(id: string, signal?: AbortSignal): Promise<PartnerDetail> {
  return (await partnerRequest(`/api/partners/${encodeURIComponent(id)}`, { signal })).json();
}

export async function fetchPartnerConfig(signal?: AbortSignal): Promise<PartnerConfig> {
  return (await partnerRequest("/api/partners/config", { signal })).json();
}

export async function updatePartner(id: string, changes: { status: PartnerStatus; assignedTo: string; nextFollowUp: string | null; note?: string }): Promise<PartnerDetail> {
  return (await partnerRequest(`/api/partners/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(changes),
  })).json();
}

export async function exportPartners(search: string, status: string): Promise<void> {
  const params = listParams(search, status);
  const res = await partnerRequest(`/api/partners/export.csv?${params}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `mice-partners-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
