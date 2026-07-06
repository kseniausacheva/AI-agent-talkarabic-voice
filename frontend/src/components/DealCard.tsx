"use client";

import { useState } from "react";
import {
  CalendarClock,
  Check,
  Film,
  Loader2,
  Phone,
  Save,
  User,
  Wallet,
} from "lucide-react";
import { apiUpdateClient, apiUpdateContact, apiUpdateDeal } from "@/lib/api";
import type {
  ContactChannel,
  ContactInfo,
  DealInfo,
  PlatformStatus,
  ProductType,
} from "@/lib/types";
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
  platform_status: "not_offered",
};

const EMPTY_CONTACT: ContactInfo = {
  phone: "",
  channel: null,
  email: "",
  note: "",
  next_contact_date: null,
  next_contact_plan: "",
};

const PRODUCTS: { key: ProductType; label: string }[] = [
  { key: "individual", label: "Индивидуально" },
  { key: "course", label: "Курс · поток" },
  { key: "platform", label: "Платформа" },
  { key: "undecided", label: "Не определился" },
];

const PLATFORM_OPTIONS: { key: PlatformStatus; label: string }[] = [
  { key: "not_offered", label: "Не предлагали" },
  { key: "offered", label: "Предложили" },
  { key: "taken", label: "Оформил" },
];

const CHANNEL_OPTIONS: { key: ContactChannel; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "telegram", label: "Telegram" },
  { key: "instagram", label: "Instagram" },
  { key: "phone", label: "Телефон" },
  { key: "email", label: "Email" },
  { key: "other", label: "Другое" },
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
  platformStatus: PlatformStatus;
  phone: string;
  channel: ContactChannel | null;
  email: string;
  contactNote: string;
  nextDate: string | null;
  nextPlan: string;
};

/**
 * Единая карточка «Данные клиента и сделка» на странице результата.
 * Менеджер правит ЛЮБЫЕ поля (клиент, сделка, платформа, контакты, план
 * следующего касания) и сохраняет ОДНОЙ кнопкой «Сохранить» — буфер, не автосейв.
 */
export function DealCard({
  sessionId,
  initialDeal,
  initialName,
  initialDate,
  initialContact,
}: {
  sessionId: string;
  initialDeal: DealInfo | null;
  initialName: string;
  initialDate: string;
  initialContact: ContactInfo | null;
}) {
  const base = initialDeal ?? EMPTY_DEAL;
  const c = initialContact ?? EMPTY_CONTACT;

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
  const [platformStatus, setPlatformStatus] = useState<PlatformStatus>(
    base.platform_status ?? "not_offered",
  );

  const [phone, setPhone] = useState(c.phone);
  const [channel, setChannel] = useState<ContactChannel | null>(c.channel);
  const [email, setEmail] = useState(c.email);
  const [contactNote, setContactNote] = useState(c.note);
  const [nextDate, setNextDate] = useState<string | null>(c.next_contact_date);
  const [nextPlan, setNextPlan] = useState(c.next_contact_plan);

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
    platformStatus: base.platform_status ?? "not_offered",
    phone: c.phone,
    channel: c.channel,
    email: c.email,
    contactNote: c.note,
    nextDate: c.next_contact_date,
    nextPlan: c.next_contact_plan,
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
    platformStatus,
    phone,
    channel,
    email,
    contactNote,
    nextDate,
    nextPlan,
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
        platform_status: platformStatus,
      });
      const contact = await apiUpdateContact(sessionId, {
        phone,
        channel,
        email,
        note: contactNote,
        next_contact_date: nextDate,
        next_contact_plan: nextPlan,
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
      setPlatformStatus(deal.platform_status ?? "not_offered");
      setPhone(contact.phone);
      setChannel(contact.channel);
      setEmail(contact.email);
      setContactNote(contact.note);
      setNextDate(contact.next_contact_date);
      setNextPlan(contact.next_contact_plan);
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
        platformStatus: deal.platform_status ?? "not_offered",
        phone: contact.phone,
        channel: contact.channel,
        email: contact.email,
        contactNote: contact.note,
        nextDate: contact.next_contact_date,
        nextPlan: contact.next_contact_plan,
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
  const inputCls =
    "w-full h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40";

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
            className={inputCls}
          />
        </Field>
        <Field label="Дата контакта">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      {/* --- Контакты --- */}
      <div className="mt-6 border-t border-line pt-6">
        <h3 className="mb-4 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
          <Phone size={14} />
          Контакты
        </h3>
        <div className="space-y-5">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Field label="Телефон">
              <input
                value={phone}
                inputMode="tel"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+7 900 000-00-00"
                className={inputCls}
              />
            </Field>
            <Field label="Email">
              <input
                value={email}
                type="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Как связываемся">
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-line-strong bg-bg p-0.5">
              {CHANNEL_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setChannel(channel === opt.key ? null : opt.key)
                  }
                  className={cn(
                    "h-9 rounded-md px-3 text-sm transition-colors",
                    channel === opt.key
                      ? "bg-primary-strong font-semibold text-white shadow-sm"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Заметка о клиенте">
            <textarea
              value={contactNote}
              onChange={(e) => setContactNote(e.target.value)}
              rows={2}
              placeholder="напр. отвечает вечером, интересует египетский диалект"
              className="w-full rounded-lg border border-line-strong bg-bg px-3 py-2 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
        </div>
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
              className={inputCls}
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

      {/* --- Платформа (отдельное окошко) --- */}
      <div className="mt-6 rounded-lg border border-line-strong bg-bg/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
            <Film size={14} />
            Платформа
          </span>
          <span className="text-xs text-subtle">
            самостоятельное обучение — фильмы, песни и т.д.
          </span>
        </div>
        <Field label="Предложили клиенту?">
          <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-line-strong bg-bg p-0.5">
            {PLATFORM_OPTIONS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPlatformStatus(p.key)}
                className={cn(
                  "h-9 rounded-md px-3 text-sm transition-colors",
                  platformStatus === p.key
                    ? "bg-primary-strong font-semibold text-white shadow-sm"
                    : "text-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>
      </div>

      {/* --- Следующий контакт (отдельное окошко) --- */}
      <div className="mt-6 rounded-lg border border-line-strong bg-bg/60 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted">
            <CalendarClock size={14} />
            Следующий контакт
          </span>
          <span className="text-xs text-subtle">
            когда и с чем написать в следующий раз
          </span>
        </div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-[auto_1fr]">
          <Field label="Дата">
            <input
              type="date"
              value={nextDate ?? ""}
              onChange={(e) => setNextDate(e.target.value || null)}
              className="h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </Field>
          <Field label="Что предложить">
            <input
              value={nextPlan}
              onChange={(e) => setNextPlan(e.target.value)}
              placeholder="напр. напомнить про пробный урок, предложить рассрочку"
              className={inputCls}
            />
          </Field>
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
