"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Loader2, RefreshCw, Search, Users, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import "./partners.css";
import {
  PARTNER_STATUSES, exportPartners, fetchPartner, fetchPartnerConfig, fetchPartners, updatePartner,
  type PartnerConfig, type PartnerDetail, type PartnerEvent, type PartnerList, type PartnerStatus,
} from "@/lib/partners-api";

const STATUS_LABELS: Record<PartnerStatus, string> = {
  new: "Новая заявка", reviewing: "На проверке", approved: "Одобрен", declined: "Отклонён", paused: "Приостановлен",
};
const PROFILE_LABELS: Record<string, string> = {
  companyName: "Название компании / имя партнёра", legalName: "Юридическое наименование", registrationNumber: "Регистрационный номер",
  taxNumber: "Налоговый номер", vatNumber: "VAT number", contactName: "Контактное лицо", contactRole: "Должность", role: "Должность",
  email: "Email", phone: "Телефон", whatsapp: "WhatsApp", country: "Страна", city: "Город", address: "Адрес",
  website: "Сайт", partnerType: "Тип партнёра", services: "Услуги", languages: "Языки", destinations: "Направления",
  experience: "Опыт", yearsExperience: "Стаж, лет", capacity: "Возможности и размер групп", licenses: "Лицензии", licenceNumber: "Номер лицензии", licenseNumber: "Номер лицензии", insurance: "Страхование",
  description: "О партнёре", notes: "Комментарий из анкеты", message: "Сообщение", portfolio: "Портфолио",
  marketingOptIn: "Согласие на маркетинговые сообщения", privacyAcknowledged: "Ознакомление с уведомлением о данных",
  submittedAt: "Время отправки анкеты", source: "Источник", formVersion: "Версия анкеты",
};

function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function plainValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (Array.isArray(value)) return value.map(plainValue).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function failure(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось связаться с сервером. Повторите попытку.";
}

function StatusBadge({ status }: { status: PartnerStatus }) {
  return <span className={`partner-status partner-status--${status}`}>{STATUS_LABELS[status] ?? status}</span>;
}

export default function PartnersPage() {
  return <AuthGuard><AppHeader /><PartnersRegister /></AuthGuard>;
}

function PartnersRegister() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<PartnerList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [config, setConfig] = useState<PartnerConfig | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchPartnerConfig(controller.signal).then(setConfig).catch(() => { /* List reports connection/auth errors. */ });
    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(() => {
      fetchPartners(search, status, page, controller.signal).then((data) => {
        if (!controller.signal.aborted) setResult(data);
      }).catch((err: unknown) => {
        if (!controller.signal.aborted) setError(failure(err));
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [search, status, page, reload]);

  async function download() {
    setExporting(true);
    setExportError("");
    try { await exportPartners(search, status); }
    catch (err) { setExportError(failure(err)); }
    finally { setExporting(false); }
  }

  return (
    <main className="partners-brand flex-1">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <a href="https://www.royaleventandmice.com/en" className="partners-wordmark-link" aria-label="La Royal Event — основной сайт"><img src="/partners-brand/logo-horizontal.png" alt="La Royal Event" width="1400" height="197" className="partners-wordmark" /></a>
            <p className="partners-eyebrow">MICE · Реестр поставщиков</p>
            <h1 className="font-display text-3xl text-ink sm:text-4xl">Партнёры</h1>
            <p className="mt-2 max-w-2xl text-base text-muted">Заявки поставщиков, проверка профиля и история работы с партнёром.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/broadcast?brand=mice" className="btn btn-secondary">Рассылка MICE</Link>
            <button type="button" className="btn btn-secondary" onClick={download} disabled={exporting || loading || !!error || !result?.total}>
              {exporting ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />} CSV
            </button>
          </div>
        </div>

        {config && !config.intakeEnabled && <p className="partner-notice mb-5">Приём новых анкет сейчас выключен. Сохранённые заявки доступны для работы.</p>}
        {exportError && <p role="alert" className="mb-5 text-sm text-danger">{exportError}</p>}

        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3" aria-label="Статусы партнёров">
          {PARTNER_STATUSES.map((key) => (
            <button type="button" key={key} onClick={() => { setStatus(status === key ? "" : key); setPage(1); }} aria-pressed={status === key}
              className={`rounded-xl border p-4 text-left transition-colors ${status === key ? "border-primary bg-tint" : "border-line bg-bg hover:border-primary"}`}>
              <span className="block text-sm text-muted">{STATUS_LABELS[key]}</span>
              <span className="mt-1 block text-2xl font-semibold tabular-nums text-ink">{loading || error ? "—" : result?.counts[key] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="mb-5 flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 basis-64">
            <span className="mb-1.5 block text-sm font-medium text-muted">Поиск</span>
            <span className="relative block"><Search size={18} className="pointer-events-none absolute left-3 top-3.5 text-muted" />
              <input className="input pl-10" type="search" value={search} maxLength={150} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Компания, контакт, email или номер заявки" />
            </span>
          </label>
          <label className="w-full sm:w-48">
            <span className="mb-1.5 block text-sm font-medium text-muted">Статус</span>
            <select className="input" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">Все статусы</option>{PARTNER_STATUSES.map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => setReload((r) => r + 1)} disabled={loading}><RefreshCw size={17} />Обновить</button>
        </div>

        <div className={`grid items-start gap-5 ${selectedId ? "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]" : ""}`}>
          <section className="min-w-0" aria-label="Реестр партнёров" aria-busy={loading}>
            <div className="card overflow-hidden">
              {loading ? <div className="flex items-center justify-center gap-2 p-12 text-muted" role="status"><Loader2 size={20} className="animate-spin" />Загружаем партнёров…</div>
                : error ? <div className="p-6"><p className="text-danger" role="alert">{error}</p><button className="btn btn-secondary mt-4" onClick={() => setReload((r) => r + 1)}>Повторить запрос</button></div>
                : !result?.items.length ? <div className="px-6 py-14 text-center"><Users size={30} className="mx-auto mb-3 text-muted" /><h2 className="text-lg font-semibold">{search || status ? "Партнёры не найдены" : "Пока нет заявок"}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted">{search || status ? "Измените поиск или выберите другой статус." : "Здесь появятся анкеты, отправленные через партнёрскую страницу. Выберите заявку, чтобы проверить сведения и назначить следующий шаг."}</p></div>
                : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-surface"><tr><th className="px-4 py-3 font-medium text-muted">Партнёр</th><th className="px-4 py-3 font-medium text-muted">Статус</th><th className="px-4 py-3 font-medium text-muted">Следующий контакт</th></tr></thead>
                  <tbody>{result.items.map((partner) => <tr key={partner.id} className={`border-b border-line last:border-0 ${selectedId === partner.id ? "bg-tint/60" : "hover:bg-surface/60"}`}>
                    <td className="max-w-80 px-4 py-4 align-top"><button type="button" onClick={() => setSelectedId(partner.id)} aria-expanded={selectedId === partner.id} aria-controls="partner-detail" className="text-left font-semibold text-primary-strong underline-offset-4 hover:underline">{partner.companyName || partner.legalName || partner.contactName || partner.reference}</button><p className="mt-1 break-words text-muted">{partner.contactName}{partner.contactName && partner.email ? " · " : ""}{partner.email}</p><p className="mt-1 text-muted">{[partner.city, partner.country].filter(Boolean).join(", ") || "Место не указано"}</p><p className="mt-1 text-xs text-muted">{partner.reference}{partner.isDemo ? " · Демонстрационная запись" : ""}</p></td>
                    <td className="px-4 py-4 align-top"><StatusBadge status={partner.status} /></td>
                    <td className="px-4 py-4 align-top text-muted"><p>{partner.nextFollowUp ? new Date(`${partner.nextFollowUp}T12:00:00`).toLocaleDateString("ru-RU") : "Не назначен"}</p><p className="mt-1">{partner.assignedTo || "Без ответственного"}</p></td>
                  </tr>)}</tbody>
                </table></div>}
            </div>
            {!loading && !error && !!result?.total && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><p>Найдено: {result.total}</p><div className="flex items-center gap-2"><button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Предыдущая страница"><ChevronLeft size={16} /></button><span>Страница {page} из {Math.max(1, result.pages)}</span><button className="btn btn-secondary btn-sm" disabled={page >= result.pages} onClick={() => setPage((p) => p + 1)} aria-label="Следующая страница"><ChevronRight size={16} /></button></div></div>}
          </section>
          {selectedId && <PartnerPanel key={selectedId} id={selectedId} onClose={() => setSelectedId(null)} onSaved={() => setReload((r) => r + 1)} />}
        </div>
      </div>
    </main>
  );
}

function PartnerPanel({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [status, setStatus] = useState<PartnerStatus>("new");
  const [assignedTo, setAssignedTo] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const hasChanges = !!detail && (status !== detail.status || assignedTo.trim() !== (detail.assignedTo ?? "") || nextFollowUp !== (detail.nextFollowUp ?? "") || !!note.trim());

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetchPartner(id, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      setDetail(data); setStatus(data.status); setAssignedTo(data.assignedTo ?? ""); setNextFollowUp(data.nextFollowUp ?? "");
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(failure(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, reload]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasChanges || saving) return;
    setSaving(true); setSaved(false); setSaveError("");
    try {
      const updated = await updatePartner(id, { status, assignedTo: assignedTo.trim(), nextFollowUp: nextFollowUp || null, ...(note.trim() ? { note: note.trim() } : {}) });
      setDetail(updated); setStatus(updated.status); setAssignedTo(updated.assignedTo ?? ""); setNextFollowUp(updated.nextFollowUp ?? "");
      setNote(""); setSaved(true); onSaved();
    } catch (err) { setSaveError(failure(err)); }
    finally { setSaving(false); }
  }

  return <aside id="partner-detail" className="card min-w-0 overflow-hidden" aria-label="Карточка партнёра" aria-busy={loading}>
    <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4"><h2 className="text-lg font-semibold">Карточка партнёра</h2><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface" aria-label="Закрыть карточку"><X size={20} /></button></div>
    {loading ? <div className="flex items-center gap-2 p-6 text-muted" role="status"><Loader2 size={18} className="animate-spin" />Загружаем карточку…</div>
      : error ? <div className="p-5"><p className="text-danger" role="alert">{error}</p><button className="btn btn-secondary mt-4" onClick={() => setReload((r) => r + 1)}>Повторить запрос</button></div>
      : detail && <>
        <div className="border-b border-line p-5"><p className="text-sm text-muted">{detail.reference}{detail.isDemo ? " · Демонстрационная запись" : ""}</p><h3 className="mt-1 break-words text-xl font-semibold">{detail.companyName || detail.legalName || detail.contactName}</h3><p className="mt-2 text-sm text-muted">Получена {dateTime(detail.createdAt)}</p><div className="mt-4 flex flex-wrap gap-2"><StatusBadge status={detail.status} /><span className="rounded-full bg-surface px-2.5 py-1 text-sm text-muted">{detail.agreementStatus === "not_accepted" ? "Соглашение не принято" : "Статус соглашения требует проверки"}</span></div><p className="mt-3 text-sm text-muted">Одобрение профиля не означает принятие соглашения.</p></div>
        <form onSubmit={save} onChange={() => setSaved(false)} className="space-y-4 border-b border-line p-5">
          <h3 className="font-semibold">Следующий шаг</h3>
          <label className="block"><span className="mb-1.5 block text-sm text-muted">Статус проверки</span><select value={status} onChange={(e) => setStatus(e.target.value as PartnerStatus)} className="input" disabled={saving}>{PARTNER_STATUSES.map((key) => <option key={key} value={key}>{STATUS_LABELS[key]}</option>)}</select></label>
          <label className="block"><span className="mb-1.5 block text-sm text-muted">Ответственный</span><input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="input" placeholder="Имя менеджера" maxLength={150} disabled={saving} /></label>
          <label className="block"><span className="mb-1.5 block text-sm text-muted">Дата следующего контакта</span><input type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} className="input" disabled={saving} /></label>
          <label className="block"><span className="mb-1.5 block text-sm text-muted">Новая заметка в историю</span><textarea value={note} onChange={(e) => setNote(e.target.value)} className="input min-h-28 py-3" rows={4} placeholder="Что проверили и что нужно сделать дальше" maxLength={4000} disabled={saving} /></label>
          <button type="submit" className="btn btn-primary" disabled={saving || !hasChanges}>{saving && <Loader2 size={17} className="animate-spin" />}Сохранить</button>
          {saved && <p className="text-sm text-success" role="status">Изменения сохранены на сервере.</p>}{saveError && <p className="text-sm text-danger" role="alert">{saveError}</p>}
        </form>
        <section className="border-b border-line p-5" aria-label="Данные анкеты"><h3 className="mb-4 font-semibold">Анкета партнёра</h3><dl className="space-y-4">{Object.entries(detail.profile).map(([key, value]) => <div key={key}><dt className="text-sm text-muted">{PROFILE_LABELS[key] ?? key}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-ink">{plainValue(value)}</dd></div>)}</dl><p className="mt-5 text-sm text-muted">Маркетинговые сообщения: {detail.marketingOptIn ? "согласие указано в анкете" : "согласие не предоставлено"}.</p></section>
        <section className="border-b border-line p-5" aria-label="Записи уведомления и согласия"><h3 className="mb-3 font-semibold">Уведомление о данных</h3><dl className="space-y-3 text-sm"><div><dt className="text-muted">Версия уведомления</dt><dd className="mt-1">{detail.privacyNoticeVersion || "Не зафиксирована"}</dd></div><div><dt className="text-muted">Отметка об ознакомлении</dt><dd className="mt-1">{dateTime(detail.privacyAcknowledgedAt)}</dd></div>{detail.marketingOptIn && <><div><dt className="text-muted">Версия маркетингового согласия</dt><dd className="mt-1">{detail.marketingConsentVersion || "Не зафиксирована"}</dd></div><div><dt className="text-muted">Время согласия на сообщения</dt><dd className="mt-1">{dateTime(detail.marketingOptInAt)}</dd></div></>}</dl></section>
        <section className="p-5" aria-label="История изменений"><h3 className="mb-4 font-semibold">История</h3>{detail.events.length ? <ol className="space-y-5">{detail.events.map((event) => <HistoryEvent key={event.id} event={event} />)}</ol> : <p className="text-sm text-muted">В истории пока нет событий.</p>}</section>
      </>}
  </aside>;
}

function HistoryEvent({ event }: { event: PartnerEvent }) {
  const title: Record<string, string> = { created: "Получена анкета", submitted: "Получена анкета", application_received: "Получена анкета", demo_created: "Создана демонстрационная запись", updated: "Обновлена карточка", note: "Заметка", status_changed: "Изменён статус" };
  const labels: Record<string, string> = { status: "Статус", assignedTo: "Ответственный", nextFollowUp: "Следующий контакт" };
  const actor = event.actor === "Partner application" ? "Партнёрская анкета" : event.actor;
  return <li className="border-l-2 border-line pl-4"><p className="text-sm font-medium">{title[event.kind] ?? event.kind}</p><p className="mt-1 text-xs text-muted">{dateTime(event.createdAt)}{actor ? ` · ${actor}` : ""}</p>{event.data.note && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{event.data.note}</p>}{event.data.changes && <dl className="mt-2 space-y-2">{Object.entries(event.data.changes).map(([key, value]) => <div key={key} className="text-sm"><dt className="text-muted">{labels[key] ?? key}</dt><dd className="whitespace-pre-wrap break-words">{changeValue(key, value)}</dd></div>)}</dl>}</li>;
}

function changeValue(key: string, value: unknown): string {
  const label = (v: unknown) => key === "status" && typeof v === "string" && v in STATUS_LABELS ? STATUS_LABELS[v as PartnerStatus] : plainValue(v);
  if (value && typeof value === "object" && "from" in value && "to" in value) return `${label(value.from)} → ${label(value.to)}`;
  return label(value);
}
