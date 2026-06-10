"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiMe, apiStats } from "@/lib/api";
import type { StatsResponse } from "@/lib/types";

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiMe();
        if (cancelled) return;
        if (me.role !== "admin") {
          setForbidden(true);
          return;
        }
        const data = await apiStats();
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxDay = stats
    ? Math.max(1, ...stats.by_day.map((d) => d.count))
    : 1;

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
          <h1 className="text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] font-semibold tracking-[-0.03em] text-ink leading-tight mb-2">
            Статистика
          </h1>
          <p className="text-sm text-muted mb-10">
            Завершённые чеклисты по команде. Доступно администратору.
          </p>

          {loading && (
            <div className="flex items-center gap-3 text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
              Считаем…
            </div>
          )}

          {forbidden && (
            <p className="text-sm text-muted" role="alert">
              Раздел доступен только администратору.
            </p>
          )}

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {stats && (
            <>
              <div className="grid gap-px bg-line rounded-2xl overflow-hidden border border-line sm:grid-cols-3 mb-12">
                <BigNumber label="За эту неделю" value={stats.completed_this_week} />
                <BigNumber label="Всего завершено" value={stats.total_completed} />
                <BigNumber label="В работе" value={stats.in_progress} />
              </div>

              <section className="mb-12">
                <h2 className="text-base font-medium text-ink mb-4">
                  По менеджерам
                </h2>
                <div className="overflow-x-auto rounded-xl border border-line">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-surface text-left text-xs text-muted">
                        <th className="px-4 py-3 font-medium">Менеджер</th>
                        <th className="px-4 py-3 font-medium text-right">
                          За неделю
                        </th>
                        <th className="px-4 py-3 font-medium text-right">Всего</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.by_manager.length === 0 && (
                        <tr>
                          <td
                            colSpan={3}
                            className="px-4 py-8 text-center text-muted"
                          >
                            Пока нет данных.
                          </td>
                        </tr>
                      )}
                      {stats.by_manager.map((m) => (
                        <tr
                          key={m.display_name}
                          className="border-b border-line last:border-b-0"
                        >
                          <td className="px-4 py-3 font-medium text-ink">
                            {m.display_name}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-ink">
                            {m.week}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted">
                            {m.total}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="text-base font-medium text-ink mb-4">
                  Последние 14 дней
                </h2>
                <div className="rounded-xl border border-line bg-surface p-5 space-y-1.5">
                  {stats.by_day.map((d) => (
                    <div key={d.date} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 font-mono text-xs text-muted tabular-nums">
                        {d.date.slice(5)}
                      </span>
                      <div className="flex-1 h-2.5 rounded-full bg-surface-elev overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${(d.count / maxDay) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink">
                        {d.count}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}

function BigNumber({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg p-6 sm:p-7">
      <div className="text-4xl font-semibold tracking-[-0.03em] text-ink tabular-nums mb-1.5">
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
