"use client";

import { useState } from "react";
import {
  Check,
  Compass,
  Copy,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
} from "lucide-react";
import { apiGetAdvice } from "@/lib/api";
import type { ClientAdvice } from "@/lib/types";

/**
 * AI-советник: план работы с клиентом на основе базы скриптов школы.
 * On-demand (по кнопке), результат можно перегенерировать.
 */
export function AdviceCard({ sessionId }: { sessionId: string }) {
  const [advice, setAdvice] = useState<ClientAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      setAdvice(await apiGetAdvice(sessionId));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card mb-12 p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
          <Compass size={14} className="text-primary-strong" />
          План работы с клиентом
        </h2>
        {advice && (
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="btn btn-ghost btn-sm"
          >
            Обновить
          </button>
        )}
      </div>

      {!advice && !loading && (
        <div className="pt-2">
          <p className="mb-4 max-w-prose text-sm text-muted text-pretty">
            ИИ подскажет, как вести этого клиента: что уточнить, как общаться,
            ответы на возражения и план касаний — на основе вашей базы скриптов.
          </p>
          <button
            type="button"
            onClick={generate}
            className="btn btn-primary btn-sm"
          >
            <Compass size={15} />
            Сгенерировать план
          </button>
        </div>
      )}

      {loading && (
        <div
          className="flex items-center gap-2.5 pt-2 text-sm text-muted"
          aria-live="polite"
        >
          <Loader2 size={18} className="animate-spin text-primary" />
          Продумываю стратегию по клиенту…
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {advice && !loading && (
        <div className="mt-4 space-y-7">
          {advice.approach && (
            <Block icon={<Compass size={15} />} title="Как общаться">
              <p className="text-pretty text-[0.95rem] leading-relaxed text-ink">
                {advice.approach}
              </p>
            </Block>
          )}

          {advice.ask_next.length > 0 && (
            <Block icon={<HelpCircle size={15} />} title="Что уточнить">
              <ul className="space-y-1.5">
                {advice.ask_next.map((q, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-[0.95rem] text-ink"
                  >
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {q}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {advice.objections.length > 0 && (
            <Block icon={<MessageSquare size={15} />} title="Ответы на возражения">
              <div className="space-y-3">
                {advice.objections.map((o, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface p-4">
                    <div className="mb-1.5 text-sm font-medium text-ink">
                      «{o.point}»
                    </div>
                    <p className="text-pretty text-sm leading-relaxed text-muted">
                      {o.response}
                    </p>
                    <CopyButton text={o.response} className="mt-2.5" />
                  </div>
                ))}
              </div>
            </Block>
          )}

          {advice.touchpoints.length > 0 && (
            <Block icon={<Send size={15} />} title="План касаний">
              <ol className="space-y-3">
                {advice.touchpoints.map((t, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-line bg-bg p-4"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="grid h-5 w-5 place-items-center rounded-full bg-primary-strong text-[0.7rem] font-semibold text-white">
                        {i + 1}
                      </span>
                      <span className="font-medium text-ink">{t.when}</span>
                      {t.channel && (
                        <span className="rounded-full bg-tint px-2 py-0.5 text-primary-strong">
                          {t.channel}
                        </span>
                      )}
                    </div>
                    <p className="text-pretty text-sm leading-relaxed text-ink">
                      {t.message}
                    </p>
                    <CopyButton text={t.message} className="mt-2.5" />
                  </li>
                ))}
              </ol>
            </Block>
          )}
        </div>
      )}
    </section>
  );
}

function Block({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2.5 inline-flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="text-primary-strong">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={
        "inline-flex items-center gap-1.5 text-xs font-medium text-primary-strong transition-colors hover:text-ink " +
        (className ?? "")
      }
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Скопировано" : "Копировать"}
    </button>
  );
}
