"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiMe, apiSetTelegram } from "@/lib/api";

export default function SettingsPage() {
  const [chatId, setChatId] = useState("");
  const [linked, setLinked] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiMe();
        if (cancelled) return;
        setLinked(me.telegram_chat_id ?? null);
        setChatId(me.telegram_chat_id ?? "");
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

  async function save(value: string | null) {
    setSaving(true);
    setError(null);
    try {
      const me = await apiSetTelegram(value);
      setLinked(me.telegram_chat_id ?? null);
      setChatId(me.telegram_chat_id ?? "");
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-6 py-10 sm:py-14">
          <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-2">
            Настройки
          </h1>
          <p className="mb-8 text-sm text-muted">
            Уведомления в Telegram: бот напомнит, с кем сегодня связаться.
          </p>

          {loading ? (
            <div className="flex items-center gap-3 text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
              Загружаем…
            </div>
          ) : (
            <section className="card p-6">
              <div className="mb-5 flex items-center justify-between gap-3">
                <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
                  <Send size={16} className="text-primary-strong" />
                  Telegram-уведомления
                </h2>
                {linked ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/12 px-2.5 py-0.5 text-xs font-medium text-success">
                    <Check size={12} strokeWidth={3} />
                    Привязан
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-elev px-2.5 py-0.5 text-xs font-medium text-muted">
                    Не привязан
                  </span>
                )}
              </div>

              <ol className="mb-5 space-y-2 text-sm text-muted">
                <li>
                  <span className="font-medium text-ink">1.</span> Напишите боту
                  школы (его выдаёт администратор) команду{" "}
                  <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
                    /start
                  </code>
                  .
                </li>
                <li>
                  <span className="font-medium text-ink">2.</span> Узнайте свой
                  числовой ID у бота{" "}
                  <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
                    @userinfobot
                  </code>{" "}
                  (он пришлёт «Id: 123456789»).
                </li>
                <li>
                  <span className="font-medium text-ink">3.</span> Вставьте этот ID
                  сюда и сохраните.
                </li>
              </ol>

              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">
                  Ваш Telegram chat_id
                </span>
                <div className="flex flex-wrap gap-2">
                  <input
                    value={chatId}
                    inputMode="numeric"
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="напр. 123456789"
                    className="input max-w-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => save(chatId.trim() || null)}
                    disabled={saving || chatId.trim() === (linked ?? "")}
                    className="btn btn-primary btn-sm"
                  >
                    {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                    Сохранить
                  </button>
                  {linked && (
                    <button
                      type="button"
                      onClick={() => save(null)}
                      disabled={saving}
                      className="btn btn-ghost btn-sm"
                    >
                      Отвязать
                    </button>
                  )}
                </div>
              </label>

              {saved && (
                <p className="mt-3 inline-flex items-center gap-1 text-sm text-success">
                  <Check size={14} />
                  Сохранено
                </p>
              )}
              {error && (
                <p className="mt-3 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
            </section>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
