"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { ChecklistPreview } from "@/components/ChecklistPreview";
import { DealCard } from "@/components/DealCard";
import { AdviceCard } from "@/components/AdviceCard";
import { apiDeleteSession, apiDownloadChecklist, apiGetResults } from "@/lib/api";
import type {
  ChecklistItem,
  ContactInfo,
  DealInfo,
  LeadInsights,
  LeadStage,
  ObjectionType,
} from "@/lib/types";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [markdown, setMarkdown] = useState<string>("");
  const [insights, setInsights] = useState<LeadInsights | null>(null);
  const [deal, setDeal] = useState<DealInfo | null>(null);
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientDate, setClientDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"checklist" | "markdown">("checklist");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGetResults(id);
        if (cancelled) return;
        setItems(data.checklist);
        setMarkdown(data.markdown);
        setInsights(data.insights ?? null);
        setDeal(data.deal ?? null);
        setContact(data.contact ?? null);
        setClientName(data.client_name ?? "");
        setClientDate(data.client_date ?? "");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const stats = useMemo(() => {
    const confirmed = items.filter((i) => i.status === "confirmed").length;
    const partial = items.filter((i) => i.status === "needs_clarification").length;
    const missing = items.filter((i) => i.status === "not_discussed").length;
    return { confirmed, partial, missing, total: items.length };
  }, [items]);

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function deleteClient() {
    setDeleting(true);
    setError(null);
    try {
      await apiDeleteSession(id);
      router.push("/dashboard");
    } catch (e) {
      setError((e as Error).message);
      setDeleting(false);
    }
  }

  async function downloadMarkdown() {
    try {
      const { blob, filename } = await apiDownloadChecklist(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
          <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              ← На главную
            </Link>
            <span className="text-xs font-mono text-subtle tabular-nums">
              сессия {id}
            </span>
          </header>

          {loading && (
            <div className="flex items-center gap-3 text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
              Загружаем чеклист…
            </div>
          )}

          {error && (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {!loading && !error && (
            <>
              <div className="mb-12">
                <div className="inline-flex items-center gap-2 rounded-full bg-success/12 text-success px-3 py-1 text-xs font-medium mb-5">
                  <Check size={12} strokeWidth={3} />
                  Чеклист готов
                </div>
                <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-4">
                  Чеклист созвона с клиентом
                </h1>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
                  <StatPill
                    label="Подтверждено"
                    value={stats.confirmed}
                    tone="success"
                  />
                  <StatPill
                    label="Уточнить"
                    value={stats.partial}
                    tone="primary"
                  />
                  <StatPill
                    label="Не обсуждалось"
                    value={stats.missing}
                    tone="subtle"
                  />
                </div>
              </div>

              <DealCard
                sessionId={id}
                initialDeal={deal}
                initialName={clientName}
                initialDate={clientDate}
                initialContact={contact}
              />

              {insights && <LeadInsightsCard insights={insights} />}

              <AdviceCard sessionId={id} />

              <div className="mb-8 flex items-center gap-2 border-b border-line">
                <TabButton
                  active={tab === "checklist"}
                  onClick={() => setTab("checklist")}
                >
                  Чеклист
                </TabButton>
                <TabButton
                  active={tab === "markdown"}
                  onClick={() => setTab("markdown")}
                >
                  Markdown
                </TabButton>
                <div className="ml-auto flex gap-2 pb-2">
                  <button
                    type="button"
                    onClick={copyMarkdown}
                    className="btn btn-ghost btn-sm"
                  >
                    {copied ? (
                      <>
                        <Check size={14} className="text-success" />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        Копировать MD
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={downloadMarkdown}
                    className="btn btn-primary btn-sm"
                  >
                    <Download size={14} />
                    Скачать .md
                  </button>
                </div>
              </div>

              {tab === "checklist" ? (
                <ChecklistPreview items={items} />
              ) : (
                <pre className="overflow-x-auto rounded-xl border border-line bg-surface p-6 text-sm leading-relaxed font-mono text-ink whitespace-pre-wrap text-pretty">
                  {markdown}
                </pre>
              )}

              <div className="mt-16 border-t border-line pt-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <DeleteClientButton
                    deleting={deleting}
                    onConfirm={deleteClient}
                  />
                  <Link
                    href="/session"
                    className="inline-flex items-center gap-2 text-sm text-ink hover:text-primary transition-colors"
                  >
                    <RotateCcw size={14} />
                    Новая сессия
                  </Link>
                </div>
                <p className="mt-4 text-xs text-subtle">
                  Сгенерировано MiniMax M3 + локальный Whisper.
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}

function DeleteClientButton({
  deleting,
  onConfirm,
}: {
  deleting: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (deleting) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-danger">
        <Loader2 size={14} className="animate-spin" />
        Удаляю…
      </span>
    );
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-danger transition-colors"
      >
        <Trash2 size={14} />
        Удалить клиента
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3 text-sm">
      <span className="font-medium text-danger">
        Удалить клиента и весь чеклист безвозвратно?
      </span>
      <button
        type="button"
        onClick={onConfirm}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-danger px-3 text-xs font-semibold text-white transition-colors hover:bg-danger/90"
      >
        <Trash2 size={13} />
        Да, удалить
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="text-xs text-muted hover:text-ink transition-colors"
      >
        Отмена
      </button>
    </span>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-10 px-4 text-sm transition-colors ${
        active ? "text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {children}
      {active && (
        <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-primary" />
      )}
    </button>
  );
}

/* ------------------- Аналитика лида (спринт 3, спека §5) ------------------- */

const STAGE_LABELS: Record<LeadStage, string> = {
  new: "новый",
  warm: "тёплый",
  hot: "горячий",
  rejected: "отказ",
};

const STAGE_CHIP: Record<LeadStage, string> = {
  new: "bg-surface-elev text-muted",
  warm: "bg-primary/12 text-primary",
  hot: "bg-success/12 text-success",
  rejected: "bg-danger/10 text-danger",
};

const OBJECTION_LABELS: Record<ObjectionType, string> = {
  price: "цена",
  time: "время",
  tech: "техника",
  trust: "доверие",
  other: "другое",
};

/** 1–4 — danger, 5–7 — ink, 8–10 — success. */
function scoreColor(score: number): string {
  if (score >= 8) return "text-success";
  if (score >= 5) return "text-ink";
  return "text-danger";
}

/** "2026-06-13" → "13.06.2026". */
function formatDateRu(iso: string): string {
  return iso.split("-").reverse().join(".");
}

function LeadInsightsCard({ insights }: { insights: LeadInsights }) {
  const [copied, setCopied] = useState(false);

  async function copyDraft() {
    await navigator.clipboard.writeText(insights.follow_up_draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="card mb-12 p-6">
      <h2 className="mb-5 text-xs font-semibold uppercase tracking-wider text-muted">
        Аналитика лида
      </h2>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4 mb-5">
        <div className="flex items-baseline gap-1 shrink-0">
          <span
            className={`text-4xl font-semibold tracking-[-0.03em] tabular-nums ${
              insights.lead_score !== null
                ? scoreColor(insights.lead_score)
                : "text-subtle"
            }`}
          >
            {insights.lead_score ?? "—"}
          </span>
          <span className="text-sm text-subtle">/10</span>
        </div>
        <div className="flex-1 min-w-52">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {insights.stage && (
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STAGE_CHIP[insights.stage]}`}
              >
                {STAGE_LABELS[insights.stage]}
              </span>
            )}
            {insights.objections.map((o, i) => (
              <span
                key={`${o.type}-${i}`}
                title={o.note || undefined}
                className="inline-flex items-center rounded-full border border-line-strong px-2.5 py-0.5 text-xs text-muted"
              >
                {OBJECTION_LABELS[o.type]}
              </span>
            ))}
          </div>
          {insights.score_reason && (
            <p className="text-sm text-muted text-pretty">
              {insights.score_reason}
            </p>
          )}
        </div>
      </div>

      {insights.next_contact_date && (
        <p className="text-sm text-muted mb-4">
          Следующее касание:{" "}
          <span className="font-medium text-ink tabular-nums">
            {formatDateRu(insights.next_contact_date)}
          </span>
        </p>
      )}

      {insights.follow_up_draft && (
        <div className="rounded-lg border border-line bg-bg p-4 mb-4">
          <p className="text-sm leading-relaxed text-ink text-pretty mb-3">
            {insights.follow_up_draft}
          </p>
          <button
            type="button"
            onClick={copyDraft}
            className="btn btn-secondary btn-sm"
          >
            {copied ? (
              <>
                <Check size={14} className="text-success" />
                Скопировано
              </>
            ) : (
              <>
                <Copy size={14} />
                Копировать сообщение
              </>
            )}
          </button>
        </div>
      )}

      {insights.tasks.length > 0 && (
        <ul className="space-y-2">
          {insights.tasks.map((t, i) => (
            <li
              key={`${t.title}-${i}`}
              className="flex items-start gap-2.5 text-sm text-ink"
            >
              <span
                aria-hidden
                className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-line-strong bg-bg"
              />
              <span>
                {t.title}
                {t.due_date && (
                  <span className="text-muted tabular-nums">
                    {" "}
                    — до {formatDateRu(t.due_date)}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "primary" | "subtle";
}) {
  const dot = {
    success: "bg-success",
    primary: "bg-primary",
    subtle: "bg-subtle",
  }[tone];
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="tabular-nums text-ink font-medium">{value}</span>
      <span>{label}</span>
    </span>
  );
}
