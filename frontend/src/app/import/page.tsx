"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, FileUp, Loader2, Upload } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiImportClients } from "@/lib/api";
import type { ImportResult } from "@/lib/types";

const FIELD_LABEL: Record<string, string> = {
  client_name: "Имя",
  phone: "Телефон",
  email: "Email",
  channel: "Мессенджер",
  note: "Заметка",
  stage: "Стадия",
  client_date: "Дата",
  city: "Город",
  product: "Продукт",
  price: "Стоимость",
};

export default function ImportPage() {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ""));
      setPreview(null);
      setResult(null);
    };
    reader.readAsText(file, "utf-8");
  }

  async function doPreview() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await apiImportClients(csv, false);
      if (!r.ok) setError(r.detail ?? "Не удалось разобрать файл.");
      setPreview(r.ok ? r : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function doImport() {
    setBusy(true);
    setError(null);
    try {
      const r = await apiImportClients(csv, true);
      if (!r.ok) {
        setError(r.detail ?? "Импорт не удался.");
      } else {
        setResult(r);
        setPreview(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
          <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-2">
            Импорт клиентов
          </h1>
          <p className="text-sm text-muted mb-8">
            Загрузи базу из любого источника (Google Таблицы, Bitrix, Excel) —
            сохрани как <b>CSV</b> и вставь сюда. Колонки распознаются
            автоматически. Дубли по email пропускаются.
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn btn-secondary btn-sm"
            >
              <FileUp size={14} />
              Выбрать CSV-файл
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
            <span className="text-xs text-subtle">
              …или вставь текст CSV в поле ниже
            </span>
          </div>

          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setPreview(null);
              setResult(null);
            }}
            rows={8}
            placeholder={"имя,телефон,email,мессенджер,стадия,заметка\nМария,+7900...,maria@mail.ru,whatsapp,тёплый,хочет курс"}
            className="w-full rounded-lg border border-line-strong bg-bg p-3 font-mono text-xs text-ink placeholder:text-subtle focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={doPreview}
              disabled={busy || !csv.trim()}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              {busy && !preview ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Upload size={14} />
              )}
              Разобрать
            </button>
            {preview && (
              <button
                type="button"
                onClick={doImport}
                disabled={busy}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary-strong px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-strong/90 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Импортировать {preview.total_rows}
              </button>
            )}
          </div>

          {error && (
            <p className="mt-4 text-sm text-danger" role="alert">
              {error}
            </p>
          )}

          {result?.ok && (
            <div className="mt-6 rounded-xl border border-success/40 bg-success/5 p-5">
              <div className="mb-1 inline-flex items-center gap-2 font-medium text-success">
                <Check size={16} strokeWidth={3} />
                Импорт завершён
              </div>
              <p className="text-sm text-ink">
                Создано клиентов:{" "}
                <b className="tabular-nums">{result.created}</b>
                {result.skipped ? (
                  <>
                    {" "}
                    · пропущено дублей:{" "}
                    <span className="tabular-nums">{result.skipped}</span>
                  </>
                ) : null}
              </p>
              <Link
                href="/dashboard"
                className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
              >
                Открыть дашборд →
              </Link>
            </div>
          )}

          {preview?.preview && (
            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-ink">
                  Найдено строк: {preview.total_rows}
                </span>
                <span className="text-subtle">·</span>
                <span className="text-muted">распознаны колонки:</span>
                {Object.entries(preview.column_mapping ?? {}).map(([col, field]) => (
                  <span
                    key={col}
                    className="inline-flex items-center gap-1 rounded-full bg-tint px-2.5 py-0.5 text-xs text-primary-strong"
                  >
                    {col} → {FIELD_LABEL[field] ?? field}
                  </span>
                ))}
              </div>
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface text-left text-xs font-medium text-muted">
                      <th className="px-3 py-2 font-medium">Имя</th>
                      <th className="px-3 py-2 font-medium">Email</th>
                      <th className="px-3 py-2 font-medium">Телефон</th>
                      <th className="px-3 py-2 font-medium">Канал</th>
                      <th className="px-3 py-2 font-medium">Стадия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.sample ?? []).map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-b-0">
                        <td className="px-3 py-2 font-medium text-ink">
                          {r.client_name}
                        </td>
                        <td className="px-3 py-2 text-muted">{r.email || "—"}</td>
                        <td className="px-3 py-2 text-muted tabular-nums">
                          {r.phone || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted">
                          {r.channel || "—"}
                        </td>
                        <td className="px-3 py-2 text-muted">{r.stage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-subtle">
                Показаны первые {preview.sample?.length ?? 0}. Проверь, что колонки
                распознаны верно, и жми «Импортировать».
              </p>
            </div>
          )}
        </div>
      </main>
    </AuthGuard>
  );
}
