"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { MockBanner } from "@/components/MockBanner";
import { QuestionCard } from "@/components/QuestionCard";
import { RoundIndicator } from "@/components/RoundIndicator";
import { apiStartSession, apiSubmitRound } from "@/lib/mock-api";
import type { Question } from "@/lib/types";

type ScreenState = "loading" | "answering" | "submitting" | "completed";

const ROUND_META: Record<
  1 | 2 | 3,
  { title: string; lead: string }
> = {
  1: {
    title: "Знакомство и мотивация",
    lead:
      "Кто клиент, откуда узнал о школе, какой диалект и зачем. Отвечайте свободно — потом можно отредактировать транскрипт.",
  },
  2: {
    title: "Опыт и формат",
    lead:
      "Текущий уровень, опыт онлайн-курсов и готовность к Zoom. Это поможет менеджеру подобрать программу.",
  },
  3: {
    title: "Условия и пожелания",
    lead:
      "Сколько часов клиент готов выделять, бюджет и личные предпочтения. Финальный раунд.",
  },
};

export default function SessionPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<ScreenState>("loading");
  const [sessionId, setSessionId] = useState<string>("");
  const [round, setRound] = useState<1 | 2 | 3>(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [summaries, setSummaries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiStartSession();
        if (cancelled) return;
        setSessionId(data.session_id);
        setRound(data.round as 1);
        setQuestions(data.questions);
        setScreen("answering");
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allAnswered =
    questions.length > 0 && questions.every((q) => answers[q.id]);

  async function submitRound() {
    setScreen("submitting");
    setError(null);
    try {
      const payload = questions.map((q) => ({
        question_id: q.id,
        transcript: answers[q.id] ?? "",
      }));
      const res = await apiSubmitRound(sessionId, round, payload);
      if (res.round_summary) {
        setSummaries((s) => [...s, res.round_summary!]);
      }
      if (res.is_complete) {
        setScreen("completed");
        router.push(`/results/${sessionId}`);
        return;
      }
      setRound(res.round as 1 | 2 | 3);
      setQuestions(res.questions);
      setAnswers({});
      setScreen("answering");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError((e as Error).message);
      setScreen("answering");
    }
  }

  const meta = ROUND_META[round];

  return (
    <>
      <MockBanner />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
          <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
            <Link
              href="/"
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              ← На главную
            </Link>
            {sessionId && <RoundIndicator currentRound={round} />}
          </header>

          {screen === "loading" && (
            <div className="flex items-center gap-3 text-muted">
              <Loader2 size={18} className="animate-spin text-primary" />
              Готовим первые вопросы…
            </div>
          )}

          {screen !== "loading" && (
            <>
              <h1 className="text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] font-semibold tracking-[-0.03em] text-ink leading-tight mb-3">
                {meta.title}
              </h1>
              <p className="text-muted text-[0.95rem] mb-10 max-w-prose text-pretty">
                {meta.lead}
              </p>

              {summaries.length > 0 && (
                <details className="mb-8 rounded-xl border border-line bg-surface p-5">
                  <summary className="cursor-pointer text-sm font-medium text-ink select-none">
                    Резюме предыдущих раундов ({summaries.length})
                  </summary>
                  <div className="mt-3 space-y-3">
                    {summaries.map((s, i) => (
                      <div key={i} className="text-sm text-muted leading-relaxed">
                        <span className="text-subtle text-xs">Раунд {i + 1}.</span>{" "}
                        {s}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="space-y-5">
                {questions.map((q, i) => (
                  <QuestionCard
                    key={q.id}
                    question={q}
                    index={i}
                    totalInRound={questions.length}
                    answered={Boolean(answers[q.id])}
                    onAnswer={(transcript) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: transcript }))
                    }
                  />
                ))}
              </div>

              {error && (
                <p className="mt-6 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}

              <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
                <span className="text-sm text-muted tabular-nums">
                  Отвечено: {Object.keys(answers).length} / {questions.length}
                </span>
                <button
                  type="button"
                  onClick={submitRound}
                  disabled={!allAnswered || screen === "submitting"}
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-primary text-primary-ink font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {screen === "submitting" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {round < 3 ? "Сохраняем раунд…" : "Формируем чеклист…"}
                    </>
                  ) : (
                    <>
                      {round < 3 ? "Дальше" : "Сформировать чеклист"}
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
