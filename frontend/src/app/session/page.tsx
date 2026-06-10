"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { FormField } from "@/components/FormField";
import { MockBanner } from "@/components/MockBanner";
import { QuestionCard } from "@/components/QuestionCard";
import { RoundIndicator } from "@/components/RoundIndicator";
import { apiStartSession, apiSubmitRound } from "@/lib/api";
import type { AnswerPayload, Question } from "@/lib/types";

type ScreenState = "setup" | "starting" | "answering" | "submitting" | "completed";

type AnswerState = {
  transcript: string;
  skipped: boolean;
};

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

function todayLocalISO(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export default function SessionPage() {
  const router = useRouter();
  const [screen, setScreen] = useState<ScreenState>("setup");
  const [clientName, setClientName] = useState("");
  const [clientDate, setClientDate] = useState(todayLocalISO());
  const [sessionId, setSessionId] = useState<string>("");
  const [round, setRound] = useState<1 | 2 | 3>(1);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [summaries, setSummaries] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function startSession(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim()) {
      setError("Введите имя клиента.");
      return;
    }
    setScreen("starting");
    setError(null);
    try {
      const data = await apiStartSession(clientName.trim(), clientDate);
      setSessionId(data.session_id);
      setRound(data.round as 1);
      setQuestions(data.questions);
      setScreen("answering");
    } catch (e) {
      setError((e as Error).message);
      setScreen("setup");
    }
  }

  const allAnswered =
    questions.length > 0 && questions.every((q) => answers[q.id]);
  const answeredCount = Object.keys(answers).length;
  const skippedCount = Object.values(answers).filter((a) => a.skipped).length;

  function setAnswer(questionId: string, value: AnswerState | null) {
    setAnswers((prev) => {
      if (value === null) {
        const next = { ...prev };
        delete next[questionId];
        return next;
      }
      return { ...prev, [questionId]: value };
    });
  }

  async function submitRound() {
    setScreen("submitting");
    setError(null);
    try {
      const payload: AnswerPayload[] = questions.map((q) => ({
        question_id: q.id,
        transcript: answers[q.id]?.skipped
          ? ""
          : (answers[q.id]?.transcript ?? ""),
        skipped: answers[q.id]?.skipped ?? false,
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
    <AuthGuard>
      <MockBanner />
      <AppHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
          {(screen === "setup" || screen === "starting") && (
            <div className="max-w-md">
              <h1 className="text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] font-semibold tracking-[-0.03em] text-ink leading-tight mb-3">
                Новый клиент
              </h1>
              <p className="text-muted text-[0.95rem] mb-10 text-pretty">
                Укажите, о ком этот чеклист. Дальше — 10 вопросов в 3 раунда,
                голосом или текстом.
              </p>

              <form onSubmit={startSession} className="space-y-4" noValidate>
                <FormField
                  label="Имя клиента"
                  name="client_name"
                  value={clientName}
                  onChange={setClientName}
                  placeholder="Анна"
                  required
                />
                <label className="block">
                  <span className="block text-xs text-muted mb-1.5">
                    Дата контакта
                  </span>
                  <input
                    type="date"
                    name="client_date"
                    value={clientDate}
                    onChange={(e) => setClientDate(e.target.value)}
                    className="w-full h-11 rounded-lg border border-line-strong bg-bg px-4 text-[0.95rem] text-ink focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>

                {error && (
                  <p className="text-sm text-danger" role="alert">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={screen === "starting" || !clientName.trim()}
                  className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-primary text-primary-ink font-medium hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {screen === "starting" ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Готовим вопросы…
                    </>
                  ) : (
                    <>
                      Начать
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {screen !== "setup" && screen !== "starting" && (
            <>
              <header className="mb-10 flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm text-muted">
                  Клиент:{" "}
                  <span className="text-ink font-medium">{clientName}</span>
                  <span className="text-subtle"> · {clientDate}</span>
                </div>
                <RoundIndicator currentRound={round} />
              </header>

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
                    answered={Boolean(answers[q.id]) && !answers[q.id]?.skipped}
                    skipped={Boolean(answers[q.id]?.skipped)}
                    onAnswer={(transcript) =>
                      setAnswer(q.id, { transcript, skipped: false })
                    }
                    onSkip={() => setAnswer(q.id, { transcript: "", skipped: true })}
                    onUnskip={() => setAnswer(q.id, null)}
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
                  Отвечено: {answeredCount} / {questions.length}
                  {skippedCount > 0 && (
                    <span className="text-subtle">
                      {" "}
                      (пропущено: {skippedCount})
                    </span>
                  )}
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
    </AuthGuard>
  );
}
