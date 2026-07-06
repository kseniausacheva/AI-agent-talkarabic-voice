"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Send, TriangleAlert } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiBroadcast, apiSubscribers } from "@/lib/api";
import type { SubscribersInfo } from "@/lib/types";

export default function BroadcastPage() {
  const [info, setInfo] = useState<SubscribersInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [group, setGroup] = useState<string>(""); // "" = все активные
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<"test" | "send" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const i = await apiSubscribers();
        if (!cancelled) setInfo(i);
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

  const activeTotal = useMemo(
    () => (info ? info.groups.reduce((s, g) => s + g.count, 0) : 0),
    [info],
  );
  const recipients = useMemo(() => {
    if (!info) return 0;
    if (!group) return activeTotal;
    return info.groups.find((g) => g.group === group)?.count ?? 0;
  }, [info, group, activeTotal]);

  const canSend = subject.trim() && text.trim() && !busy;

  async function sendTest() {
    if (!testEmail.trim()) {
      setError("Укажи email для теста.");
      return;
    }
    setBusy("test");
    setError(null);
    setMsg(null);
    try {
      const r = await apiBroadcast({ subject, text, test_email: testEmail.trim() });
      if (r.ok) setMsg(`Тест-письмо отправлено на ${testEmail.trim()}. Проверь ящик (в т.ч. спам).`);
      else setError(r.detail ?? "Не удалось отправить тест.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function sendAll() {
    setBusy("send");
    setError(null);
    setMsg(null);
    try {
      const r = await apiBroadcast({ subject, text, group: group || null });
      if (r.ok) setMsg(`Отправка запущена: ${r.queued} писем${group ? ` (группа «${group}»)` : ""}. Идёт в фоне.`);
      else setError(r.detail ?? "Не удалось запустить рассылку.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
          <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-2">
            Рассылка
          </h1>
          <p className="text-sm text-muted mb-8">
            Письмо ученикам по базе. Внизу каждого письма — ссылка «Отписаться».
          </p>

          {loading && (
            <div className="flex items-center gap-3 text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
              Загружаем базу…
            </div>
          )}

          {info && !info.configured && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm">
              <TriangleAlert size={18} className="mt-0.5 shrink-0 text-accent" />
              <div>
                <b className="text-ink">Отправка ещё не подключена.</b> Добавь в
                Coolify переменные <code className="text-xs">BREVO_API_KEY</code>,{" "}
                <code className="text-xs">BREVO_SENDER_EMAIL</code> и сделай
                Redeploy. База и текст письма при этом уже доступны.
              </div>
            </div>
          )}

          {info && (
            <>
              <div className="mb-6 grid grid-cols-3 gap-3">
                <Stat label="Всего в базе" value={info.total} />
                <Stat label="Активных" value={activeTotal} />
                <Stat label="Отписалось" value={info.unsubscribed} />
              </div>

              <label className="mb-4 block">
                <span className="mb-1.5 block text-xs text-muted">Кому</span>
                <select
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  className="h-11 w-full rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">Все активные ({activeTotal})</option>
                  {info.groups.map((g) => (
                    <option key={g.group} value={g.group}>
                      {g.group} ({g.count})
                    </option>
                  ))}
                </select>
              </label>

              <label className="mb-4 block">
                <span className="mb-1.5 block text-xs text-muted">Тема письма</span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="напр. Новый поток египетского диалекта — старт 1 августа"
                  className="h-11 w-full rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              <label className="mb-5 block">
                <span className="mb-1.5 block text-xs text-muted">Текст письма</span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={9}
                  placeholder={"Здравствуйте!\n\nРады сообщить, что открыт набор на новый поток…"}
                  className="w-full rounded-lg border border-line-strong bg-bg p-3 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="mt-1 block text-xs text-subtle">
                  Переносы строк сохранятся. Ссылка отписки добавится
                  автоматически.
                </span>
              </label>

              <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface/50 p-4">
                <label className="flex-1 min-w-[12rem]">
                  <span className="mb-1.5 block text-xs text-muted">
                    Сначала проверь на себе
                  </span>
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    placeholder="твой@email.ru"
                    className="h-10 w-full rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={!canSend || !testEmail.trim()}
                  className="btn btn-secondary btn-sm h-10 disabled:opacity-50"
                >
                  {busy === "test" ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                  Тест-письмо
                </button>
              </div>

              <button
                type="button"
                onClick={sendAll}
                disabled={!canSend}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "send" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                Отправить {recipients} получателям
              </button>

              {msg && (
                <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-success">
                  <Check size={15} strokeWidth={3} />
                  {msg}
                </p>
              )}
              {error && (
                <p className="mt-4 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface/50 p-4">
      <div className="font-display text-2xl tabular-nums text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}
