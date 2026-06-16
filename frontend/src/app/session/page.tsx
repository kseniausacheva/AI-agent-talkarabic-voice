"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ImageUp, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { AuthGuard } from "@/components/AuthGuard";
import { FormField } from "@/components/FormField";
import { MockBanner } from "@/components/MockBanner";
import { QuestionCard } from "@/components/QuestionCard";
import { RoundIndicator } from "@/components/RoundIndicator";
import {
  apiAnalyzeText,
  apiExtractScreenshots,
  apiStartSession,
  apiSubmitRound,
} from "@/lib/api";
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
  const [conversation, setConversation] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [pending, setPending] = useState<null | "questions" | "paste">(null);
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
    setPending("questions");
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
      setPending(null);
    }
  }

  async function analyzeText(e?: React.SyntheticEvent) {
    e?.preventDefault();
    if (!clientName.trim()) {
      setError("Введите имя клиента.");
      return;
    }
    if (conversation.trim().length < 20) {
      setError("Вставьте переписку или загрузите скриншоты — хотя бы пару реплик.");
      return;
    }
    setPending("paste");
    setScreen("starting");
    setError(null);
    try {
      const { session_id } = await apiAnalyzeText(
        clientName.trim(),
        clientDate,
        conversation.trim(),
      );
      router.push(`/results/${session_id}`);
    } catch (e) {
      setError((e as Error).message);
      setScreen("setup");
      setPending(null);
    }
  }

  async function onScreenshots(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // сброс, чтобы тот же файл можно было выбрать снова
    if (!files.length) return;
    setExtracting(true);
    setError(null);
    try {
      const { text } = await apiExtractScreenshots(files);
      setConversation((c) => (c.trim() ? c.trim() + "\n\n" + text : text));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExtracting(false);
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
      // переписку/скриншоты учитываем в финальном чеклисте (3-й раунд)
      const res = await apiSubmitRound(
        sessionId,
        round,
        payload,
        round === 3 ? conversation.trim() : "",
      );
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
            <div className="max-w-lg">
              <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-3">
                Новый клиент
              </h1>
              <p className="text-muted text-[0.95rem] mb-8 text-pretty">
                Имя и дата — обязательны. Переписку с клиентом можно добавить
                текстом или скриншотами (необязательно) — ИИ учтёт её в чеклисте.
              </p>

              <form onSubmit={startSession} className="space-y-5" noValidate>
                <FormField
                  label="Имя клиента"
                  name="client_name"
                  value={clientName}
                  onChange={setClientName}
                  placeholder="Анна"
                  required
                />
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-muted">
                    Дата контакта
                  </span>
                  <input
                    type="date"
                    name="client_date"
                    value={clientDate}
                    onChange={(e) => setClientDate(e.target.value)}
                    className="input"
                  />
                </label>

                {/* Переписка — необязательное вложение: текст и/или скриншоты */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">
                      Переписка с клиентом{" "}
                      <span className="text-subtle">— необязательно</span>
                    </span>
                    <label className="btn btn-secondary btn-sm cursor-pointer">
                      {extracting ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <ImageUp size={15} />
                      )}
                      {extracting ? "Распознаю…" : "Скриншоты"}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={onScreenshots}
                        disabled={extracting || screen === "starting"}
                      />
                    </label>
                  </div>
                  <textarea
                    value={conversation}
                    onChange={(e) => setConversation(e.target.value)}
                    rows={8}
                    placeholder="Вставьте диалог из Instagram / WhatsApp / Telegram текстом, либо загрузите скриншоты — их текст добавится сюда…"
                    className="w-full resize-y rounded-xl border border-line-strong bg-bg px-4 py-3 text-[0.95rem] leading-relaxed focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>

                {error && (
                  <p className="text-sm text-danger" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={screen === "starting" || !clientName.trim()}
                    className="btn btn-primary"
                  >
                    {pending === "questions" ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Готовим вопросы…
                      </>
                    ) : (
                      <>
                        К вопросам
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={analyzeText}
                    disabled={
                      screen === "starting" ||
                      !clientName.trim() ||
                      conversation.trim().length < 20
                    }
                    className="btn btn-secondary"
                    title="Собрать чеклист только из переписки, без вопросов"
                  >
                    {pending === "paste" ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Анализирую…
                      </>
                    ) : (
                      "Сформировать сразу по переписке"
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted text-pretty">
                  «К вопросам» — пройти опрос (переписка учтётся в итоговом
                  чеклисте). «Сформировать сразу» — собрать чеклист только из
                  переписки, без вопросов.
                </p>
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

              <h1 className="font-display text-balance text-[clamp(1.75rem,1.5rem+1.2vw,2.25rem)] leading-tight text-ink mb-3">
                {meta.title}
              </h1>
              <p className="text-muted text-[0.95rem] mb-10 max-w-prose text-pretty">
                {meta.lead}
              </p>

              {summaries.length > 0 && (
                <details className="card mb-8 p-5">
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
                  className="btn btn-primary"
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
