"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
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
import { RichEditor } from "@/components/RichEditor";
import {
  apiBroadcast,
  apiBroadcastProgress,
  apiBroadcastStatus,
  apiCancelScheduled,
  apiDeleteSubscriber,
  apiScheduleBroadcast,
  apiScheduledList,
  apiSubscribers,
  apiSubscribersList,
} from "@/lib/api";
import type {
  BroadcastProgress,
  BroadcastStatus,
  ScheduledBroadcast,
  SubscribersInfo,
  SubscribersListResponse,
} from "@/lib/types";

/** «2026-08-02T05:00:00+00:00» → «завтра, 2 августа, 08:00» — во времени
 *  того, кто смотрит: браузер сам переведёт UTC в местное. */
function fmtRunAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BroadcastPage() {
  const [info, setInfo] = useState<SubscribersInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [group, setGroup] = useState<string>(""); // "" = все активные
  const [testEmail, setTestEmail] = useState("");
  const [busy, setBusy] = useState<"test" | "send" | "schedule" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Партии: сколько писем отправить сейчас (Brevo free = 300/день)
  const [status, setStatus] = useState<BroadcastStatus | null>(null);
  const [batch, setBatch] = useState("");
  const [batchTouched, setBatchTouched] = useState(false);

  // Отложенная отправка
  const [runAt, setRunAt] = useState("");
  const [tz, setTz] = useState("Europe/Moscow");
  const [repeatDaily, setRepeatDaily] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledBroadcast[]>([]);
  const [progress, setProgress] = useState<BroadcastProgress | null>(null);

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

  // Ход выпуска (по теме письма) + остаток дневного лимита Brevo
  const refreshStatus = useMemo(
    () => async (subj: string, grp: string) => {
      try {
        return await apiBroadcastStatus({ subject: subj, group: grp || null });
      } catch {
        return null; // статус необязателен — не ломаем отправку
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      const st = await refreshStatus(subject, group);
      if (!cancelled && st) setStatus(st);
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [subject, group, refreshStatus]);

  // Пока не трогали поле руками — предлагаем максимум, что влезет сегодня
  const suggestedBatch = useMemo(() => {
    if (!status) return 0;
    const roomToday = status.left_today ?? status.daily_limit;
    return Math.max(0, Math.min(status.pending, roomToday));
  }, [status]);

  useEffect(() => {
    if (!batchTouched) setBatch(suggestedBatch ? String(suggestedBatch) : "");
  }, [suggestedBatch, batchTouched]);

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

  const hasBody =
    /<img/i.test(text) ||
    text
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim().length > 0;
  const canSend = subject.trim() && hasBody && !busy;

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

  // Живой прогресс: пока идёт отправка — раз в 3 секунды, потом раз в 30,
  // чтобы подтянуть отчёт о доставке (он приходит от сервиса с задержкой).
  useEffect(() => {
    let stop = false;
    let timer: number;
    const tick = async () => {
      try {
        const p = await apiBroadcastProgress();
        if (stop) return;
        setProgress(p);
        timer = window.setTimeout(tick, p.run.running ? 3000 : 30000);
      } catch {
        if (!stop) timer = window.setTimeout(tick, 30000);
      }
    };
    tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, []);

  async function refreshScheduled() {
    try {
      const { items } = await apiScheduledList();
      setScheduled(items);
    } catch {
      // список необязателен — не ломаем страницу
    }
  }

  useEffect(() => {
    refreshScheduled();
  }, []);

  async function schedule() {
    setBusy("schedule");
    setError(null);
    setMsg(null);
    try {
      const r = await apiScheduleBroadcast({
        subject,
        text,
        group: group || null,
        limit: Number(batch) > 0 ? Number(batch) : null,
        run_at_local: runAt,
        tz,
        repeat_daily: repeatDaily,
      });
      if (r.ok) {
        setMsg(
          `Запланировано на ${fmtRunAt(r.run_at ?? runAt)}. ` +
            (repeatDaily
              ? "Дальше будет повторяться каждый день, пока не уйдёт всем."
              : "Письма уйдут сами, держать вкладку открытой не нужно."),
        );
        await refreshScheduled();
      } else setError(r.detail ?? "Не удалось запланировать.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function cancelScheduled(id: number) {
    try {
      await apiCancelScheduled(id);
      await refreshScheduled();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function sendAll() {
    setBusy("send");
    setError(null);
    setMsg(null);
    try {
      const limit = Number(batch) > 0 ? Number(batch) : null;
      const r = await apiBroadcast({ subject, text, group: group || null, limit });
      if (r.ok) {
        const tail =
          r.remaining && r.remaining > 0
            ? ` Осталось на следующие дни: ${r.remaining}.`
            : " Это была последняя партия — выпуск ушёл всей группе.";
        setMsg(
          `Отправка запущена: ${r.queued} писем${group ? ` (группа «${group}»)` : ""}.${tail}`,
        );
        // счётчики подтянутся, когда фон отработает — обновим через паузу
        window.setTimeout(async () => {
          const st = await refreshStatus(subject, group);
          if (st) setStatus(st);
        }, 4000);
      } else setError(r.detail ?? "Не удалось запустить рассылку.");
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

              <div className="mb-5">
                <span className="mb-1.5 block text-xs text-muted">Текст письма</span>
                <RichEditor onChange={setText} disabled={busy !== null} />
                <span className="mt-1.5 block text-xs text-subtle">
                  Выделяй жирным/курсивом, добавляй заголовки, списки, ссылки и
                  картинки. Ссылка «Отписаться» добавится автоматически.
                </span>
              </div>

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

              <div className="mb-4 rounded-xl border border-line bg-surface/50 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="w-40">
                    <span className="mb-1.5 block text-xs text-muted">
                      Отправить сейчас, писем
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={status?.pending || recipients}
                      value={batch}
                      onChange={(e) => {
                        setBatch(e.target.value);
                        setBatchTouched(true);
                      }}
                      placeholder="все"
                      className="h-10 w-full rounded-lg border border-line-strong bg-bg px-3 text-sm tabular-nums text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                  <p className="flex-1 min-w-[14rem] text-xs leading-relaxed text-muted">
                    {!subject.trim() ? (
                      <>
                        <b className="text-ink">Впиши тему письма</b> — и я
                        посчитаю, кому оно ещё не уходило. Пока темы нет,
                        считать не от чего.
                        <br />
                        {status?.sent_today !== null && status ? (
                          <>
                            Brevo сегодня: {status.sent_today} из{" "}
                            {status.daily_limit} — можно ещё{" "}
                            <b className="text-ink tabular-nums">
                              {status.left_today}
                            </b>
                          </>
                        ) : null}
                      </>
                    ) : status ? (
                      <>
                        Ждут этого письма:{" "}
                        <b className="text-ink tabular-nums">{status.pending}</b>
                        {status.already_sent > 0 && (
                          <> · уже получили {status.already_sent}</>
                        )}
                        <br />
                        {status.sent_today !== null ? (
                          <>
                            Brevo сегодня: {status.sent_today} из{" "}
                            {status.daily_limit} — можно ещё{" "}
                            <b className="text-ink tabular-nums">
                              {status.left_today}
                            </b>
                          </>
                        ) : (
                          <>Дневной лимит Brevo — {status.daily_limit} писем</>
                        )}
                      </>
                    ) : (
                      "Считаем остаток…"
                    )}
                  </p>
                </div>
                <p className="mt-2.5 text-xs text-subtle">
                  Кому письмо уже ушло — запоминается по теме. Завтра нажми
                  «Отправить» ещё раз с той же темой: продолжит с того места,
                  повторов не будет.
                </p>
              </div>

              <div className="mb-4 rounded-xl border border-line bg-surface/50 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
                  <CalendarClock size={16} className="text-primary" />
                  Отправить не сейчас, а по расписанию
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label>
                    <span className="mb-1.5 block text-xs text-muted">Когда</span>
                    <input
                      type="datetime-local"
                      value={runAt}
                      onChange={(e) => setRunAt(e.target.value)}
                      className="h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </label>
                  <label>
                    <span className="mb-1.5 block text-xs text-muted">Время</span>
                    <select
                      value={tz}
                      onChange={(e) => setTz(e.target.value)}
                      className="h-10 rounded-lg border border-line-strong bg-bg px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <option value="Europe/Moscow">московское</option>
                      <option value="Africa/Cairo">каирское</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={schedule}
                    disabled={!canSend || !runAt}
                    className="btn btn-secondary btn-sm h-10 disabled:opacity-50"
                  >
                    {busy === "schedule" ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <CalendarClock size={14} />
                    )}
                    Запланировать
                  </button>
                </div>
                <label className="mt-3 flex items-start gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={repeatDaily}
                    onChange={(e) => setRepeatDaily(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    Повторять каждый день в это же время, пока письмо не уйдёт
                    всем. Так вся база ({activeTotal}) разойдётся сама за
                    несколько дней, не упираясь в дневной лимит.
                  </span>
                </label>
              </div>

              {scheduled.length > 0 && (
                <div className="mb-5 rounded-xl border border-line bg-bg p-1">
                  {scheduled.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-3 border-b border-line px-3 py-2.5 last:border-b-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-ink">{s.subject}</div>
                        <div className="text-xs text-muted">
                          {fmtRunAt(s.run_at)}
                          {s.repeat_daily && " · повтор ежедневно"}
                          {s.limit > 0 && ` · по ${s.limit} писем`}
                          {s.sent_total > 0 && ` · ушло ${s.sent_total}`}
                        </div>
                      </div>
                      {s.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => cancelScheduled(s.id)}
                          className="shrink-0 text-xs text-subtle transition-colors hover:text-danger"
                        >
                          отменить
                        </button>
                      ) : (
                        <span className="shrink-0 text-xs text-subtle">
                          {s.status === "done"
                            ? "отправлено"
                            : s.status === "cancelled"
                              ? "отменено"
                              : "ошибка"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={sendAll}
                disabled={!canSend || status?.pending === 0}
                className="inline-flex h-12 items-center gap-2 rounded-lg bg-accent px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "send" ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {!subject.trim()
                  ? "Отправить"
                  : `Отправить ${
                      Number(batch) > 0
                        ? Number(batch)
                        : (status?.pending ?? recipients)
                    } получателям`}
              </button>

              {progress && (progress.run.running || progress.run.total > 0) && (
                <div className="mt-5 rounded-xl border border-line bg-surface/50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-ink">
                      {progress.run.running ? "Идёт отправка" : "Последняя отправка"}
                    </span>
                    <span className="tabular-nums text-muted">
                      {progress.run.sent} из {progress.run.total}
                      {progress.run.failed > 0 && (
                        <span className="text-danger"> · ошибок {progress.run.failed}</span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-line">
                    <div
                      className={cnBar(progress.run.running)}
                      style={{
                        width: `${progress.run.total ? Math.round((progress.run.sent / progress.run.total) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-4">
                    <Fact label="дошло" value={progress.today.delivered} good />
                    <Fact label="открыли" value={progress.today.opens} good />
                    <Fact label="адрес не найден" value={progress.today.hard_bounces} />
                    <Fact label="временный отказ" value={progress.today.soft_bounces} />
                  </div>
                  {progress.run.errors.length > 0 && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-danger">
                        Не приняты сервером: {progress.run.errors.length}
                      </summary>
                      <ul className="mt-1.5 space-y-1">
                        {progress.run.errors.map((e) => (
                          <li key={e.email} className="text-xs text-muted">
                            <b className="text-ink">{e.email}</b> — {e.reason.slice(0, 90)}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <p className="mt-3 text-xs text-subtle">
                    «Отправлено» — принято почтовым сервисом. «Дошло» и отказы
                    приходят от него позже, обычно в течение пары минут.
                  </p>
                </div>
              )}

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

function cnBar(running: boolean) {
  return `h-full rounded-full transition-all duration-500 ${
    running ? "bg-primary" : "bg-success"
  }`;
}

function Fact({
  label,
  value,
  good,
}: {
  label: string;
  value?: number | null;
  good?: boolean;
}) {
  if (value === null || value === undefined) return null;
  return (
    <span>
      <b className={good ? "text-success" : value > 0 ? "text-danger" : "text-ink"}>
        {value}
      </b>{" "}
      {label}
    </span>
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
