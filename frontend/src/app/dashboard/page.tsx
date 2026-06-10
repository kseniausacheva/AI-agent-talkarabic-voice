"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiChecklists } from "@/lib/api";
import type { ChecklistsResponse } from "@/lib/types";
import { cn } from "@/lib/cn";

const PER_PAGE = 20;

export default function DashboardPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ChecklistsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiChecklists(q, page, PER_PAGE);
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

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] font-semibold tracking-[-0.03em] text-ink leading-tight mb-2">
                Чеклисты
              </h1>
              <p className="text-sm text-muted">
                Все клиенты, по которым заполнялся чеклист.
              </p>
            </div>
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
                className="w-full h-10 rounded-lg border border-line-strong bg-bg pl-10 pr-4 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          {error && (
            <p className="text-sm text-danger mb-6" role="alert">
              {error}
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface text-left text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Дата</th>
                  <th className="px-4 py-3 font-medium">Клиент</th>
                  <th className="px-4 py-3 font-medium">Менеджер</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10">
                      <span className="flex items-center justify-center gap-3 text-muted">
                        <Loader2 size={16} className="animate-spin text-primary" />
                        Загружаем…
                      </span>
                    </td>
                  </tr>
                )}
                {!loading && data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted">
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
                className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-line-strong bg-surface text-sm hover:bg-surface-elev transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="inline-flex items-center gap-1 h-9 px-3 rounded-md border border-line-strong bg-surface text-sm hover:bg-surface-elev transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
