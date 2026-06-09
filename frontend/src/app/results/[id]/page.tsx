"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { use } from "react";
import { Check, Copy, Download, Loader2, RotateCcw } from "lucide-react";
import { MockBanner } from "@/components/MockBanner";
import { ChecklistPreview } from "@/components/ChecklistPreview";
import { apiDownloadUrl, apiGetResults, isMock } from "@/lib/mock-api";
import type { ChecklistItem } from "@/lib/types";

export default function ResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [markdown, setMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"checklist" | "markdown">("checklist");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGetResults(id);
        if (cancelled) return;
        setItems(data.checklist);
        setMarkdown(data.markdown);
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

  function downloadMarkdown() {
    if (isMock()) {
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checklist-${id}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      window.location.href = apiDownloadUrl(id);
    }
  }

  return (
    <>
      <MockBanner />
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
                <h1 className="text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] font-semibold tracking-[-0.03em] text-ink leading-tight mb-4">
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
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-md text-sm text-ink hover:bg-surface transition-colors"
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
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-ink text-sm font-medium hover:bg-primary-hover transition-colors"
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

              <div className="mt-16 flex items-center justify-between border-t border-line pt-6">
                <p className="text-sm text-muted">
                  Сгенерировано MiniMax M3 + локальный Whisper.
                </p>
                <Link
                  href="/session"
                  className="inline-flex items-center gap-2 text-sm text-ink hover:text-primary transition-colors"
                >
                  <RotateCcw size={14} />
                  Новая сессия
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </>
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
