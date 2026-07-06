"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiMe, apiSales, apiStats } from "@/lib/api";
import type { ObjectionCounts, SalesReport, StatsResponse } from "@/lib/types";

export default function StatsPage() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function changeMonth(m: string) {
    try {
      setSales(await apiSales(m));
    } catch (e) {
      setError((e as Error).message);
    }
  }

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
        // Защита на время поэтапного деплоя: старый backend может не вернуть
        // sales/objection_counts — подставляем дефолты, чтобы страница не падала.
        if (!cancelled)
          setStats({
            ...data,
            sales: data.sales ?? {
              month: "",
              closed_count: 0,
              revenue: 0,
              avg_check: null,
              pending_count: 0,
              pending_revenue: 0,
              by_product: { individual: 0, course: 0, undecided: 0 },
            },
            objection_counts: data.objection_counts ?? {
              price: 0,
              time: 0,
              tech: 0,
              trust: 0,
              other: 0,
            },
          });
        try {
          const salesData = await apiSales();
          if (!cancelled) setSales(salesData);
        } catch {
          // отчёт по деньгам необязателен — если backend старый, просто скрыт
        }
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

  const maxSkip = stats
    ? Math.max(1, ...stats.skips_by_question.map((s) => s.count))
    : 1;

  const maxObjection = stats
    ? Math.max(1, ...Object.values(stats.objection_counts))
    : 1;

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
          <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-2">
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
              <div className="grid gap-px bg-line rounded-2xl overflow-hidden border border-line sm:grid-cols-3 mb-6">
                <BigNumber label="За эту неделю" value={stats.completed_this_week} />
                <BigNumber label="Всего завершено" value={stats.total_completed} />
                <BigNumber label="В работе" value={stats.in_progress} />
              </div>

              <div className="grid gap-px bg-line rounded-2xl overflow-hidden border border-line sm:grid-cols-2 mb-12">
                <BigNumber
                  label="Средний score лида"
                  value={
                    stats.avg_lead_score !== null
                      ? stats.avg_lead_score.toFixed(1)
                      : "—"
                  }
                />
                <div className="bg-bg p-6 sm:p-7">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2.5">
                    {STAGES.map((s) => (
                      <span
                        key={s.key}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.chip}`}
                        >
                          {s.label}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-ink">
                          {stats.stage_counts[s.key]}
                        </span>
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-muted">
                    Стадии лидов (завершённые)
                  </div>
                </div>
              </div>

              {sales && (
                <section className="mb-12">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-ink mb-1">
                        Деньги за {monthLabel(sales.month)}
                      </h2>
                      <p className="text-xs text-muted">
                        Период {rangeLabel(sales.period_start, sales.period_end)}
                        . «Заработано» — сделки, оплаченные в этом периоде.
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-muted">
                      Месяц
                      <select
                        value={sales.month}
                        onChange={(e) => changeMonth(e.target.value)}
                        className="h-9 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        {sales.available_months.map((m) => (
                          <option key={m} value={m}>
                            {monthLabel(m)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-px bg-line rounded-2xl overflow-hidden border border-line sm:grid-cols-3 mb-px">
                    <BigNumber label="Заработано" value={formatRub(sales.revenue)} />
                    <BigNumber
                      label="Закрыто сделок"
                      value={sales.closed_count}
                    />
                    <BigNumber
                      label="Средний чек"
                      value={
                        sales.avg_check !== null
                          ? formatRub(sales.avg_check)
                          : "—"
                      }
                    />
                  </div>
                  <div className="grid gap-px bg-line rounded-2xl overflow-hidden border border-line sm:grid-cols-2">
                    <div className="bg-bg p-6 sm:p-7">
                      <div className="text-sm text-ink mb-1">
                        <span className="font-semibold tabular-nums">
                          {sales.pending_count}
                        </span>{" "}
                        сделок ждут оплаты на{" "}
                        <span className="font-semibold tabular-nums">
                          {formatRub(sales.pending_revenue)}
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        Потенциал: цена названа, оплата не подтверждена
                      </div>
                    </div>
                    <div className="bg-bg p-6 sm:p-7">
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-1 text-sm text-ink">
                        <span>
                          Индивид.{" "}
                          <span className="font-semibold tabular-nums">
                            {sales.by_product.individual}
                          </span>
                        </span>
                        <span>
                          Курс{" "}
                          <span className="font-semibold tabular-nums">
                            {sales.by_product.course}
                          </span>
                        </span>
                        <span>
                          Платформа{" "}
                          <span className="font-semibold tabular-nums">
                            {sales.by_product.platform}
                          </span>
                        </span>
                      </div>
                      <div className="text-xs text-muted">
                        Закрытые сделки по продукту
                      </div>
                    </div>
                  </div>
                </section>
              )}

              <section className="mb-12">
                <h2 className="text-base font-semibold text-ink mb-1">
                  Что не получилось
                </h2>
                <p className="text-xs text-muted mb-4">
                  Отказов:{" "}
                  <span className="font-medium text-ink tabular-nums">
                    {stats.stage_counts.rejected}
                  </span>
                  . Самые частые возражения клиентов — где терять меньше.
                </p>
                <div className="card p-5 space-y-2.5">
                  {objectionRows(stats.objection_counts).map((o) => (
                    <div key={o.key} className="flex items-center gap-3">
                      <span className="w-20 shrink-0 text-xs text-muted">
                        {o.label}
                      </span>
                      <div className="flex-1 h-2.5 rounded-full bg-surface-elev overflow-hidden">
                        <div
                          className="h-full rounded-full bg-accent transition-[width] duration-300"
                          style={{
                            width: `${(o.count / maxObjection) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink">
                        {o.count}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="mb-12">
                <h2 className="text-base font-semibold text-ink mb-4">
                  По менеджерам
                </h2>
                <div className="card overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line bg-surface text-left text-xs font-medium text-muted">
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

              <section className="mb-12">
                <h2 className="text-base font-semibold text-ink mb-1">
                  Какие вопросы пропускают
                </h2>
                <p className="text-xs text-muted mb-4">
                  Сколько раз менеджеры нажимали «Пропустить» — подсказка для
                  коучинга.
                </p>
                <div className="card p-5 space-y-2.5">
                  {stats.skips_by_question.map((s) => (
                    <div key={s.question_id} className="flex items-center gap-3">
                      <span className="flex-1 min-w-0 truncate text-xs text-muted">
                        {s.label}
                      </span>
                      <div className="w-28 sm:w-44 shrink-0 h-2.5 rounded-full bg-surface-elev overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300"
                          style={{ width: `${(s.count / maxSkip) * 100}%` }}
                        />
                      </div>
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-ink">
                        {s.count}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-base font-semibold text-ink mb-4">
                  Последние 14 дней
                </h2>
                <div className="card p-5 space-y-1.5">
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

const STAGES = [
  { key: "new", label: "новый", chip: "bg-surface-elev text-muted" },
  { key: "warm", label: "тёплый", chip: "bg-primary/12 text-primary" },
  { key: "hot", label: "горячий", chip: "bg-success/12 text-success" },
  { key: "rejected", label: "отказ", chip: "bg-danger/10 text-danger" },
] as const;

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

function monthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTHS[Number(month) - 1] ?? ym} ${year}`;
}

const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** "2026-07-01" → "1 июля". */
function dayMonth(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)} ${MONTHS_GEN[Number(month) - 1] ?? month}`;
}

/** period_start/end → "1 июля — 1 августа". */
function rangeLabel(start: string, end: string): string {
  return `${dayMonth(start)} — ${dayMonth(end)}`;
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

const OBJECTION_LABELS: Record<keyof ObjectionCounts, string> = {
  price: "цена",
  time: "время",
  tech: "техника",
  trust: "доверие",
  other: "другое",
};

function objectionRows(counts: ObjectionCounts) {
  return (Object.keys(OBJECTION_LABELS) as (keyof ObjectionCounts)[])
    .map((key) => ({ key, label: OBJECTION_LABELS[key], count: counts[key] }))
    .sort((a, b) => b.count - a.count);
}

function BigNumber({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-bg p-6 sm:p-7">
      <div className="font-display mb-1.5 text-[2.5rem] leading-none tabular-nums text-ink">
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
