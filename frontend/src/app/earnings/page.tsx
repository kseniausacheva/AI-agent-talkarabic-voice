"use client";

import { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiSales } from "@/lib/api";
import type { ProductType, SalesReport } from "@/lib/types";

/** Ставка комиссии менеджера по продажам. */
const RATE = 0.1;

const PRODUCT_LABEL: Record<ProductType, string> = {
  individual: "индивидуально",
  course: "курс · поток",
  platform: "платформа",
  undecided: "не определён",
};

const MONTHS = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];
const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function monthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  return `${MONTHS[Number(month) - 1] ?? ym} ${year}`;
}

function dayMonth(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)} ${MONTHS_GEN[Number(month) - 1] ?? month}`;
}

function rangeLabel(start: string, end: string): string {
  return `${dayMonth(start)} — ${dayMonth(end)}`;
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function EarningsPage() {
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiSales();
        if (!cancelled) setSales(s);
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

  async function changeMonth(m: string) {
    try {
      setSales(await apiSales(m));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const commission = sales ? Math.round(sales.revenue * RATE) : 0;

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
          <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-2">
            Моя комиссия
          </h1>
          <p className="text-sm text-muted mb-8">
            10% с каждой закрытой (оплаченной) сделки школы. Считается
            автоматически.
          </p>

          {loading && (
            <div className="flex items-center gap-3 text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
              Считаем…
            </div>
          )}

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {sales && (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Период {rangeLabel(sales.period_start, sales.period_end)}
                </p>
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

              <section className="mb-10 rounded-2xl border border-primary/25 bg-tint/50 p-6 sm:p-8">
                <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary-strong mb-2">
                  <Wallet size={14} />
                  Комиссия за {monthLabel(sales.month)}
                </div>
                <div className="font-display text-[2.75rem] sm:text-[3.25rem] leading-none tabular-nums text-ink">
                  {formatRub(commission)}
                </div>
                <div className="mt-2 text-sm text-muted">
                  10% от выручки{" "}
                  <span className="font-medium text-ink tabular-nums">
                    {formatRub(sales.revenue)}
                  </span>{" "}
                  ·{" "}
                  <span className="tabular-nums">{sales.closed_count}</span>{" "}
                  {sales.closed_count === 1 ? "сделка" : "сделок"}
                </div>
              </section>

              <h2 className="text-base font-semibold text-ink mb-3">
                Из чего складывается
              </h2>
              {sales.deals.length === 0 ? (
                <p className="text-sm text-muted">
                  В этом периоде ещё нет закрытых сделок.
                </p>
              ) : (
                <div className="card divide-y divide-line overflow-hidden">
                  {sales.deals.map((d, i) => (
                    <div
                      key={`${d.client_name}-${d.paid_date}-${i}`}
                      className="flex items-center justify-between gap-4 px-4 py-3.5 sm:px-5"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">
                          {d.client_name}
                        </div>
                        <div className="text-xs text-muted tabular-nums">
                          {d.paid_date}
                          {d.product ? ` · ${PRODUCT_LABEL[d.product]}` : ""} ·{" "}
                          {formatRub(d.price)}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold tabular-nums text-success">
                          +{formatRub(Math.round(d.price * RATE))}
                        </div>
                        <div className="text-[0.7rem] text-subtle">10%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
