"use client";

import { useState } from "react";
import { Check, Loader2, Save, User, Wallet } from "lucide-react";
import { apiUpdateClient, apiUpdateDeal } from "@/lib/api";
import type { DealInfo, ProductType } from "@/lib/types";
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

function parsePrice(text: string): number | null {
  const raw = text.replace(/[^\d.]/g, "");
  if (raw === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

type Snapshot = {
  name: string;
  date: string;
  product: ProductType | null;
  note: string;
  price: number | null;
  installment: boolean;
  plannedDate: string | null;
  paid: boolean;
  paidDate: string | null;
};

/**
 * Единая карточка «Данные клиента и сделка» на странице результата.
 * ИИ заранее заполняет продукт/стоимость/намерение из разговора; менеджер
 * правит ЛЮБЫЕ поля (включая имя и дату контакта) и сохраняет ОДНОЙ кнопкой
 * «Сохранить». До нажатия ничего не отправляется — это буфер, а не автосейв.
 */
export function DealCard({
  sessionId,
  initialDeal,
  initialName,
  initialDate,
}: {
  sessionId: string;
  initialDeal: DealInfo | null;
  initialName: string;
  initialDate: string;
}) {
  const base = initialDeal ?? EMPTY_DEAL;
  const [name, setName] = useState(initialName);
  const [date, setDate] = useState(initialDate);
  const [product, setProduct] = useState<ProductType | null>(base.product);
  const [note, setNote] = useState(base.product_note);
  const [priceText, setPriceText] = useState(priceToText(base.price));
  const [installment, setInstallment] = useState(base.installment);
  const [plannedDate, setPlannedDate] = useState<string | null>(
    base.planned_payment_date,
  );
  const [paid, setPaid] = useState(base.paid);
  const [paidDate, setPaidDate] = useState<string | null>(base.paid_date);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSnap, setSavedSnap] = useState<Snapshot>(() => ({
    name: initialName.trim(),
    date: initialDate,
    product: base.product,
    note: base.product_note,
    price: base.price,
    installment: base.installment,
    plannedDate: base.planned_payment_date,
    paid: base.paid,
    paidDate: base.paid_date,
  }));

  const current: Snapshot = {
    name: name.trim(),
    date,
    product,
    note,
    price: parsePrice(priceText),
    installment,
    plannedDate,
    paid,
    paidDate,
  };
  const dirty = JSON.stringify(current) !== JSON.stringify(savedSnap);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Введите имя клиента");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    const price = parsePrice(priceText);
    try {
      const client = await apiUpdateClient(sessionId, {
        client_name: trimmed,
        client_date: date || null,
      });
      const deal = await apiUpdateDeal(sessionId, {
        product,
        product_note: note,
        price,
        installment,
        planned_payment_date: plannedDate,
        paid,
        paid_date: paidDate,
      });
      // синхронизируем поля с тем, что реально сохранил бэкенд
      setName(client.client_name);
      setDate(client.client_date);
      setProduct(deal.product);
      setNote(deal.product_note);
      setPriceText(priceToText(deal.price));
      setInstallment(deal.installment);
      setPlannedDate(deal.planned_payment_date);
      setPaid(deal.paid);
      setPaidDate(deal.paid_date);
      setSavedSnap({
        name: client.client_name.trim(),
        date: client.client_date,
        product: deal.product,
        note: deal.product_note,
        price: deal.price,
        installment: deal.installment,
        plannedDate: deal.planned_payment_date,
        paid: deal.paid,
        paidDate: deal.paid_date,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const closed = paid;

  return (
    <section
      className={cn(
        "mb-12 rounded-xl border p-6 transition-colors",
        closed ? "border-success/40 bg-success/5" : "border-line bg-surface",
      )}
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
          <User size={14} />
          Данные клиента и сделка
        </h2>
        {closed && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-medium text-success">
            <Check size={12} strokeWidth={3} />
            Сделка закрыта
          </span>
        )}
      </div>

      {/* --- Клиент --- */}
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field label="Имя клиента">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="напр. Анна"
            className="w-full h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>
        <Field label="Дата контакта">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-10 w-full rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </Field>
      </div>

      {/* --- Сделка --- */}
      <div className="mt-6 border-t border-line pt-6">
        <h3 className="mb-4 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
          <Wallet size={14} />
          Сделка
        </h3>

        <div className="space-y-5">
          <Field label="Что покупает">
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-line-strong bg-bg p-0.5">
              {PRODUCTS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setProduct(p.key)}
                  className={cn(
                    "h-9 rounded-md px-3 text-sm transition-colors",
                    product === p.key
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
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
            checked={installment}
            onChange={setInstallment}
          />
          <ToggleRow
            label="Оплачено — сделка закрыта"
            checked={paid}
            onChange={setPaid}
            tone="success"
          />

          <Field label="Когда планирует оплатить" compact>
            <input
              type="date"
              value={plannedDate ?? ""}
              onChange={(e) => setPlannedDate(e.target.value || null)}
              className="h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>

          {paid && (
            <Field label="Дата оплаты" compact>
              <input
                type="date"
                value={paidDate ?? ""}
                onChange={(e) => setPaidDate(e.target.value || null)}
                className="h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </Field>
          )}
        </div>
      </div>

      {/* --- Сохранение --- */}
      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line pt-5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold transition-colors",
            "bg-primary-strong text-white shadow-sm hover:bg-primary-strong/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Сохраняю…
            </>
          ) : (
            <>
              <Save size={16} />
              Сохранить
            </>
          )}
        </button>

        {saved && !saving && (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
            <Check size={15} strokeWidth={3} />
            Сохранено
          </span>
        )}
        {dirty && !saving && !saved && (
          <span className="text-sm text-subtle">Есть несохранённые изменения</span>
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
        className={cn("block text-xs text-muted", compact ? "mb-1.5" : "mb-2")}
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
