"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Search,
  Trash2,
  Wallet,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiChecklists, apiDeleteSession, apiSales } from "@/lib/api";
import type {
  ChecklistListItem,
  ChecklistsResponse,
  SalesReport,
} from "@/lib/types";
import { cn } from "@/lib/cn";

const PER_PAGE = 20;

const STAGE_LABELS: Record<string, string> = {
  new: "новый",
  warm: "тёплый",
  hot: "горячий",
  rejected: "отказ",
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const MONTHS_NOM = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** "2026-07" → "июль 2026". */
function monthTitle(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTHS_NOM[Number(month) - 1] ?? ym} ${year}`;
}

/** "2026-07-01" → "1 июля". */
function dayMonth(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)} ${MONTHS_GEN[Number(month) - 1] ?? month}`;
}

/** period_start/end → "1 июля — 1 августа". */
function rangeLabel(start: string, end: string): string {
  return `${dayMonth(start)} — ${dayMonth(end)}`;
}

function Metric({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "tabular-nums text-ink",
          strong
            ? "font-display text-[1.6rem] sm:text-[2rem] leading-none"
            : "text-xl font-semibold",
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU").replace(/ /g, " ") + " ₽";
}

function DealCell({ item }: { item: ChecklistListItem }) {
  if (item.paid) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-medium text-success">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        Оплачено
        {item.price != null && (
          <span className="tabular-nums">· {formatRub(item.price)}</span>
        )}
      </span>
    );
  }
  if (item.price != null) {
    return (
      <span className="tabular-nums text-muted">{formatRub(item.price)}</span>
    );
  }
  return <span className="text-subtle">—</span>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ChecklistsResponse | null>(null);
  const [dueItems, setDueItems] = useState<ChecklistListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);

  async function handleDelete(itemId: string) {
    setDeletingId(itemId);
    setError(null);
    try {
      await apiDeleteSession(itemId);
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((i) => i.id !== itemId),
              total: Math.max(0, prev.total - 1),
            }
          : prev,
      );
      setDueItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiChecklists({ q, page, perPage: PER_PAGE });
        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [q, page]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiChecklists({ due: "today" });
        if (!cancelled) setDueItems(res.items);
      } catch {
        // Блок «Сегодня связаться» необязателен — ошибку не показываем.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiSales();
        if (!cancelled) setSales(s);
      } catch {
        // Сводка по деньгам необязательна на дашборде.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;
  const today = todayISO();

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-2">
                Чеклисты
              </h1>
              <p className="text-sm text-muted">
                Все клиенты, по которым заполнялся чеклист.
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <label className="relative block w-full sm:w-64">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Поиск по имени клиента…"
                  className="h-11 w-full rounded-md border border-line-strong bg-bg pl-10 pr-4 text-sm text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                />
              </label>
              <Link
                href="/session"
                className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary-strong px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-strong/90"
              >
                <Plus size={16} strokeWidth={2.5} />
                Новый клиент
              </Link>
            </div>
          </div>

          {sales && (
            <section className="mb-8 rounded-2xl border border-line bg-surface/50 p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <Wallet size={14} />
                  Деньги · {monthTitle(sales.month)}
                </h2>
                <Link
                  href="/stats"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Подробный отчёт →
                </Link>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:gap-6">
                <Metric label="Заработано" value={formatRub(sales.revenue)} strong />
                <Metric
                  label="Закрыто сделок"
                  value={String(sales.closed_count)}
                />
                <Metric
                  label="Средний чек"
                  value={
                    sales.avg_check !== null ? formatRub(sales.avg_check) : "—"
                  }
                />
              </div>
              <p className="mt-4 text-xs text-subtle">
                Период {rangeLabel(sales.period_start, sales.period_end)} · ждут
                оплаты:{" "}
                <span className="tabular-nums">{sales.pending_count}</span> на{" "}
                <span className="tabular-nums">
                  {formatRub(sales.pending_revenue)}
                </span>
              </p>
            </section>
          )}

          {error && (
            <p className="text-sm text-danger mb-6" role="alert">
              {error}
            </p>
          )}

          {dueItems.length > 0 && (
            <section className="card mb-8 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Сегодня связаться
              </h2>
              <ul className="divide-y divide-line">
                {dueItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => router.push(`/results/${item.id}`)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left text-sm hover:bg-surface-elev rounded-md px-2 -mx-2 transition-colors"
                    >
                      <span className="font-medium text-ink">
                        {item.client_name}
                      </span>
                      <span className="text-subtle">·</span>
                      <span
                        className={cn(
                          "font-mono text-xs tabular-nums",
                          item.next_contact_date && item.next_contact_date < today
                            ? "text-accent"
                            : "text-muted",
                        )}
                      >
                        {item.next_contact_date ?? "—"}
                      </span>
                      <span className="text-subtle">·</span>
                      <span className="tabular-nums text-ink">
                        {item.lead_score ?? "—"}
                      </span>
                      {item.stage && (
                        <>
                          <span className="text-subtle">·</span>
                          <span className="text-muted">
                            {STAGE_LABELS[item.stage] ?? item.stage}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left text-xs font-medium text-muted">
                  <th className="px-4 py-3 font-medium">Дата</th>
                  <th className="px-4 py-3 font-medium">Клиент</th>
                  <th className="px-4 py-3 font-medium">Менеджер</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Связаться</th>
                  <th className="px-4 py-3 font-medium">Сделка</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                  <th className="px-4 py-3 font-medium sticky right-0 z-10 bg-surface">
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10">
                      <span className="flex items-center justify-center gap-3 text-muted">
                        <Loader2 size={16} className="animate-spin text-primary" />
                        Загружаем…
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted">
                      {q.trim()
                        ? "Ничего не найдено по запросу."
                        : "Чеклистов пока нет."}
                    </td>
                  </tr>
                )}
                {!loading &&
                  data?.items.map((item) => {
                    const completed = item.status === "completed";
                    return (
                      <tr
                        key={item.id}
                        onClick={() => {
                          if (completed) router.push(`/results/${item.id}`);
                        }}
                        className={cn(
                          "border-b border-line last:border-b-0 transition-colors",
                          completed
                            ? "cursor-pointer hover:bg-surface"
                            : "opacity-70",
                        )}
                      >
                        <td className="px-4 py-3.5 font-mono text-xs text-muted tabular-nums whitespace-nowrap">
                          {item.client_date}
                        </td>
                        <td className="px-4 py-3.5 font-medium text-ink">
                          {item.client_name}
                        </td>
                        <td className="px-4 py-3.5 text-muted">
                          {item.manager_name}
                        </td>
                        <td className="px-4 py-3.5 tabular-nums text-ink">
                          {item.lead_score ?? "—"}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {item.next_contact_date && !item.paid ? (
                            <span
                              title={`Связаться ${item.next_contact_date}`}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
                                item.next_contact_date < today
                                  ? "bg-accent/12 text-accent"
                                  : "bg-primary/10 text-primary",
                              )}
                            >
                              <Bell size={12} />
                              {item.next_contact_date}
                            </span>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <DealCell item={item} />
                        </td>
                        <td className="px-4 py-3.5">
                          {completed ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 text-success px-2.5 py-0.5 text-xs font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-success" />
                              Готов
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-elev text-muted px-2.5 py-0.5 text-xs font-medium">
                              <span className="h-1.5 w-1.5 rounded-full bg-subtle" />
                              В работе
                            </span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3.5 text-right whitespace-nowrap sticky right-0 z-10 bg-bg border-l border-line"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {deletingId === item.id ? (
                            <Loader2
                              size={15}
                              className="inline animate-spin text-danger"
                            />
                          ) : confirmId === item.id ? (
                            <span className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                className="text-xs font-semibold text-danger hover:underline"
                              >
                                Удалить
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmId(null)}
                                className="text-xs text-muted hover:text-ink"
                              >
                                Отмена
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmId(item.id)}
                              className="text-muted transition-colors hover:text-danger"
                              title="Удалить клиента"
                              aria-label="Удалить клиента"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <span className="text-xs text-muted tabular-nums">
              {data ? `Всего: ${data.total}` : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="btn btn-secondary btn-sm disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                Назад
              </button>
              <span className="text-xs text-muted tabular-nums px-1">
                Стр. {page} из {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="btn btn-secondary btn-sm disabled:opacity-40"
              >
                Вперёд
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
