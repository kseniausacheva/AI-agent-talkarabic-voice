"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiChecklists, apiUpdateFunnel } from "@/lib/api";
import type { ChecklistListItem, FunnelColumn } from "@/lib/types";
import { cn } from "@/lib/cn";

const COLUMNS: { key: FunnelColumn; label: string; accent: string }[] = [
  { key: "new", label: "Новый", accent: "bg-subtle" },
  { key: "warm", label: "Тёплый", accent: "bg-primary" },
  { key: "hot", label: "Горячий", accent: "bg-accent" },
  { key: "paid", label: "Оплачено", accent: "bg-success" },
  { key: "rejected", label: "Отказ", accent: "bg-danger" },
];

function columnOf(item: ChecklistListItem): FunnelColumn {
  if (item.paid) return "paid";
  return (item.stage ?? "new") as FunnelColumn;
}

function applyColumn(
  item: ChecklistListItem,
  column: FunnelColumn,
): ChecklistListItem {
  if (column === "paid") return { ...item, paid: true };
  return { ...item, paid: false, stage: column };
}

function formatRub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽";
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "2026-07-09" → "09.07". */
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}.${m}`;
}

export default function PipelinePage() {
  const router = useRouter();
  const [items, setItems] = useState<ChecklistListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<FunnelColumn | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiChecklists({ status: "completed", perPage: 100 });
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map: Record<FunnelColumn, ChecklistListItem[]> = {
      new: [],
      warm: [],
      hot: [],
      paid: [],
      rejected: [],
    };
    for (const it of items) map[columnOf(it)].push(it);
    return map;
  }, [items]);

  async function move(id: string, column: FunnelColumn) {
    const current = items.find((i) => i.id === id);
    if (!current || columnOf(current) === column) return;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? applyColumn(it, column) : it)),
    );
    try {
      await apiUpdateFunnel(id, column);
    } catch (e) {
      setError((e as Error).message);
      load(); // откатываемся к серверному состоянию
    }
  }

  const today = todayISO();

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
          <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-2">
            Воронка
          </h1>
          <p className="mb-8 text-sm text-muted">
            Перетаскивайте карточки между стадиями. «Оплачено» = сделка закрыта.
          </p>

          {error && (
            <p className="mb-6 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-3 text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
              Загружаем воронку…
            </div>
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {COLUMNS.map((col) => {
                const cards = grouped[col.key];
                const sum = cards.reduce((s, c) => s + (c.price ?? 0), 0);
                return (
                  <div
                    key={col.key}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setOverCol(col.key);
                    }}
                    onDragLeave={() => setOverCol((c) => (c === col.key ? null : c))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOverCol(null);
                      const id = e.dataTransfer.getData("text/plain") || dragId;
                      if (id) void move(id, col.key);
                    }}
                    className={cn(
                      "flex min-w-[13rem] flex-1 flex-col rounded-xl border bg-surface/60 transition-colors",
                      overCol === col.key
                        ? "border-primary bg-tint"
                        : "border-line",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                        <span className={cn("h-2 w-2 rounded-full", col.accent)} />
                        {col.label}
                      </span>
                      <span className="text-xs tabular-nums text-muted">
                        {cards.length}
                        {sum > 0 && (
                          <span className="ml-1.5 text-subtle">
                            · {formatRub(sum)}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex min-h-24 flex-col gap-2.5 p-2.5">
                      {cards.length === 0 && (
                        <p className="px-2 py-6 text-center text-xs text-subtle">
                          Пусто
                        </p>
                      )}
                      {cards.map((c) => (
                        <article
                          key={c.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", c.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDragId(c.id);
                          }}
                          onDragEnd={() => setDragId(null)}
                          onClick={() => router.push(`/results/${c.id}`)}
                          className={cn(
                            "card cursor-grab p-3 transition-shadow hover:shadow-md active:cursor-grabbing",
                            dragId === c.id && "opacity-50",
                          )}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-ink">
                              {c.client_name}
                            </span>
                            {c.lead_score !== null && (
                              <span className="shrink-0 text-xs tabular-nums text-muted">
                                {c.lead_score}/10
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                            {c.price !== null && (
                              <span className="tabular-nums text-ink">
                                {formatRub(c.price)}
                              </span>
                            )}
                            {c.next_contact_date && !c.paid && (
                              <span
                                title={`Связаться ${c.next_contact_date}`}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                                  c.next_contact_date < today
                                    ? "bg-accent/12 text-accent"
                                    : "bg-primary/10 text-primary",
                                )}
                              >
                                <Bell size={11} />
                                {shortDate(c.next_contact_date)}
                              </span>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
