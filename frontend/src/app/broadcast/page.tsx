"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Send,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import {
  apiBroadcast,
  apiDeleteSubscriber,
  apiSubscribers,
  apiSubscribersList,
} from "@/lib/api";
import type { SubscribersInfo, SubscribersListResponse } from "@/lib/types";

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

  // База подписчиков (список)
  const [subs, setSubs] = useState<SubscribersListResponse | null>(null);
  const [subsQ, setSubsQ] = useState("");
  const [subsPage, setSubsPage] = useState(1);
  const [subsLoading, setSubsLoading] = useState(true);
  const [subDeleting, setSubDeleting] = useState<number | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    setSubsLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const list = await apiSubscribersList({ q: subsQ, page: subsPage });
        if (!cancelled) setSubs(list);
      } catch {
        // список необязателен — не ломаем страницу
      } finally {
        if (!cancelled) setSubsLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [subsQ, subsPage]);

  async function removeSub(id: number) {
    setSubDeleting(id);
    try {
      await apiDeleteSubscriber(id);
      setSubs((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((s) => s.id !== id),
              total: Math.max(0, prev.total - 1),
            }
          : prev,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubDeleting(null);
    }
  }

  const subsPages = subs
    ? Math.max(1, Math.ceil(subs.total / subs.per_page))
    : 1;

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

          {/* --- База подписчиков (список) --- */}
          <section className="mt-12 border-t border-line pt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-ink">
                База подписчиков{subs ? ` · ${subs.total}` : ""}
              </h2>
              <label className="relative block w-full sm:w-64">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
                />
                <input
                  type="search"
                  value={subsQ}
                  onChange={(e) => {
                    setSubsQ(e.target.value);
                    setSubsPage(1);
                  }}
                  placeholder="Поиск по email…"
                  className="h-10 w-full rounded-lg border border-line-strong bg-bg pl-10 pr-3 text-sm text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface text-left text-xs font-medium text-muted">
                    <th className="px-4 py-2.5 font-medium">Email</th>
                    <th className="px-4 py-2.5 font-medium">Группа</th>
                    <th className="px-4 py-2.5 font-medium">Статус</th>
                    <th className="px-4 py-2.5 font-medium">
                      <span className="sr-only">Действия</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subsLoading && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted">
                        <Loader2
                          size={15}
                          className="mr-2 inline animate-spin text-primary"
                        />
                        Загружаем…
                      </td>
                    </tr>
                  )}
                  {!subsLoading && subs && subs.items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted">
                        Ничего не найдено.
                      </td>
                    </tr>
                  )}
                  {!subsLoading &&
                    subs?.items.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b border-line last:border-b-0"
                      >
                        <td className="px-4 py-2.5 text-ink">{s.email}</td>
                        <td className="px-4 py-2.5 text-muted">
                          {s.group || "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {s.unsubscribed ? (
                            <span className="text-xs text-danger">отписался</span>
                          ) : (
                            <span className="text-xs text-success">активен</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {subDeleting === s.id ? (
                            <Loader2
                              size={14}
                              className="inline animate-spin text-danger"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => removeSub(s.id)}
                              className="text-subtle transition-colors hover:text-danger"
                              title="Удалить из базы"
                              aria-label="Удалить подписчика"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {subs && subsPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs text-muted tabular-nums">
                  Всего: {subs.total}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSubsPage((p) => Math.max(1, p - 1))}
                    disabled={subsPage <= 1}
                    className="btn btn-secondary btn-sm disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                    Назад
                  </button>
                  <span className="px-1 text-xs text-muted tabular-nums">
                    Стр. {subsPage} из {subsPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSubsPage((p) => Math.min(subsPages, p + 1))
                    }
                    disabled={subsPage >= subsPages}
                    className="btn btn-secondary btn-sm disabled:opacity-40"
                  >
                    Вперёд
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </section>
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
