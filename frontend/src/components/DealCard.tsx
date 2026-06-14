"use client";

import { useState } from "react";
import { Check, Loader2, Wallet } from "lucide-react";
import { apiUpdateDeal } from "@/lib/api";
import type { DealInfo, DealUpdate, ProductType } from "@/lib/types";
import { cn } from "@/lib/cn";

const EMPTY_DEAL: DealInfo = {
  product: null,
  product_note: "",
  price: null,
  currency: "RUB",
  installment: false,
  planned_payment_date: null,
  paid: false,
  paid_date: null,
};

const PRODUCTS: { key: ProductType; label: string }[] = [
  { key: "individual", label: "Индивидуально" },
  { key: "course", label: "Курс · поток" },
  { key: "undecided", label: "Не определился" },
];

function priceToText(n: number | null): string {
  return n === null ? "" : String(n);
}

/**
 * Карточка сделки на странице результата. ИИ заранее заполняет продукт,
 * стоимость и намерение из разговора; менеджер правит руками и отмечает
 * оплату (paid → сделка закрыта). Сохранение пофайлово через PATCH.
 */
export function DealCard({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: DealInfo | null;
}) {
  const base = initial ?? EMPTY_DEAL;
  const [deal, setDeal] = useState<DealInfo>(base);
  const [priceText, setPriceText] = useState<string>(priceToText(base.price));
  const [noteText, setNoteText] = useState<string>(base.product_note);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(changes: DealUpdate) {
    setSaving(true);
    setError(null);
    setDeal((d) => ({ ...d, ...changes })); // оптимистично
    try {
      const updated = await apiUpdateDeal(sessionId, changes);
      setDeal(updated);
      setPriceText(priceToText(updated.price));
      setNoteText(updated.product_note);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function savePrice() {
    const raw = priceText.replace(/[^\d.]/g, "");
    const num = raw === "" ? null : Number(raw);
    const value = num !== null && Number.isFinite(num) && num > 0 ? num : null;
    if (value !== deal.price) save({ price: value });
  }

  function saveNote() {
    if (noteText !== deal.product_note) save({ product_note: noteText });
  }

  const closed = deal.paid;

  return (
    <section
      className={cn(
        "mb-12 rounded-xl border p-6 transition-colors",
        closed ? "border-success/40 bg-success/5" : "border-line bg-surface",
      )}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
          <Wallet size={14} />
          Сделка
        </h2>
        <div className="flex items-center gap-3 text-xs">
          {saving && (
            <span className="inline-flex items-center gap-1 text-subtle">
              <Loader2 size={12} className="animate-spin" />
              Сохраняю…
            </span>
          )}
          {saved && !saving && (
            <span className="inline-flex items-center gap-1 text-success">
              <Check size={12} />
              Сохранено
            </span>
          )}
          {closed && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-0.5 font-medium text-success">
              <Check size={12} strokeWidth={3} />
              Сделка закрыта
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5">
        <Field label="Что покупает">
          <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-line-strong bg-bg p-0.5">
            {PRODUCTS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => save({ product: p.key })}
                className={cn(
                  "h-9 rounded-md px-3 text-sm transition-colors",
                  deal.product === p.key
                    ? "bg-primary-strong font-semibold text-white shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Заметка о формате">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onBlur={saveNote}
            placeholder="напр. хочет в следующий поток / только индивидуально"
            className="w-full h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        <Field label="Стоимость">
          <div className="relative w-44">
            <input
              value={priceText}
              inputMode="numeric"
              onChange={(e) => setPriceText(e.target.value)}
              onBlur={savePrice}
              onKeyDown={(e) =>
                e.key === "Enter" && (e.target as HTMLInputElement).blur()
              }
              placeholder="0"
              className="w-full h-10 rounded-lg border border-line-strong bg-bg pl-3 pr-8 text-sm tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-subtle">
              ₽
            </span>
          </div>
        </Field>
      </div>

      <div className="mt-5 grid gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-2">
        <ToggleRow
          label="Рассрочка"
          checked={deal.installment}
          onChange={(v) => save({ installment: v })}
        />
        <ToggleRow
          label="Оплачено — сделка закрыта"
          checked={deal.paid}
          onChange={(v) => save({ paid: v })}
          tone="success"
        />

        <Field label="Когда планирует оплатить" compact>
          <input
            type="date"
            value={deal.planned_payment_date ?? ""}
            onChange={(e) => save({ planned_payment_date: e.target.value || null })}
            className="h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>

        {deal.paid && (
          <Field label="Дата оплаты" compact>
            <input
              type="date"
              value={deal.paid_date ?? ""}
              onChange={(e) => save({ paid_date: e.target.value || null })}
              className="h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
        )}
      </div>

      {error && (
        <p className="mt-4 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function Field({
  label,
  children,
  compact = false,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span
        className={cn(
          "block text-xs text-muted",
          compact ? "mb-1.5" : "mb-2",
        )}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
  tone = "primary",
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  tone?: "primary" | "success";
}) {
  const onBg = tone === "success" ? "bg-success" : "bg-primary";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 text-left"
    >
      <span className={cn("text-sm", checked ? "text-ink font-medium" : "text-muted")}>
        {label}
      </span>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? onBg : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-bg shadow-sm transition-transform",
            checked ? "translate-x-[1.125rem]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}
