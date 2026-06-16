"use client";

import { useEffect, useState } from "react";
import { BookOpen, Check, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { MockBanner } from "@/components/MockBanner";
import { apiGetKnowledge, apiMe, apiSaveKnowledge } from "@/lib/api";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function KnowledgePage() {
  const [text, setText] = useState("");
  const [savedText, setSavedText] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await apiMe();
        if (cancelled) return;
        if (me.role !== "admin") {
          setForbidden(true);
          return;
        }
        const kb = await apiGetKnowledge();
        if (cancelled) return;
        setText(kb.text);
        setSavedText(kb.text);
        setUpdatedAt(kb.updated_at);
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

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await apiSaveKnowledge(text);
      setSavedText(res.text);
      setUpdatedAt(res.updated_at);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const dirty = text !== savedText;

  return (
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
          <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-2">
            База знаний школы
          </h1>
          <p className="mb-8 max-w-prose text-sm text-muted text-pretty">
            Скрипты, ответы на возражения, описания и цены программ, тон общения.
            ИИ опирается на эту базу, когда советует «План работы с клиентом» на
            странице результата — рекомендации будут вашими словами.
          </p>

          {loading && (
            <div className="flex items-center gap-3 text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
              Загружаем…
            </div>
          )}

          {forbidden && (
            <p className="text-sm text-muted" role="alert">
              Раздел доступен только администратору.
            </p>
          )}

          {!loading && !forbidden && (
            <section className="card p-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                <BookOpen size={16} className="text-primary-strong" />
                Текст базы
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={18}
                placeholder={
                  "Например:\n\nПрограммы: индивидуально 20000 ₽/мес, поток 12000 ₽/мес. Рассрочка на 3 месяца.\nВозражение «дорого»: …\nВозражение «нет времени»: …\nТон: тёплый, на «вы», всегда предлагаем бесплатный пробный урок."
                }
                className="w-full resize-y rounded-xl border border-line-strong bg-bg px-4 py-3 text-[0.95rem] leading-relaxed focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving || !dirty}
                  className="btn btn-primary btn-sm"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                  Сохранить базу
                </button>
                {justSaved && (
                  <span className="inline-flex items-center gap-1 text-sm text-success">
                    <Check size={14} />
                    Сохранено
                  </span>
                )}
                <span className="ml-auto text-xs text-muted">
                  Обновлено: {formatDateTime(updatedAt)} · {text.length} симв.
                </span>
              </div>
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
