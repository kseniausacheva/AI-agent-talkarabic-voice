"use client";

import { CircleSlash, RotateCcw } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import type { Question } from "@/lib/types";

type Props = {
  question: Question;
  index: number;
  totalInRound: number;
  answered: boolean;
  skipped: boolean;
  onAnswer: (transcript: string) => void;
  onSkip: () => void;
  onUnskip: () => void;
};

export function QuestionCard({
  question,
  index,
  totalInRound,
  answered,
  skipped,
  onAnswer,
  onSkip,
  onUnskip,
}: Props) {
  return (
    <article
      className="card animate-fade-up p-6 transition-shadow duration-300 hover:shadow-md sm:p-7"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <header className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-tint font-display text-sm tabular-nums text-primary-strong">
          {index + 1}
        </span>
        <div>
          <div className="mb-1 text-xs tabular-nums text-muted">
            Вопрос {index + 1} из {totalInRound}
          </div>
          <h3 className="text-balance text-lg font-semibold leading-snug text-ink sm:text-xl">
            {question.text}
          </h3>
        </div>
      </header>

      {skipped ? (
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-surface-elev text-muted text-sm">
            <CircleSlash size={14} className="text-subtle" />
            Пропущено
          </span>
          <button
            type="button"
            onClick={onUnskip}
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors"
          >
            <RotateCcw size={13} />
            Вернуть
          </button>
        </div>
      ) : (
        <>
          <AudioRecorder
            questionId={question.id}
            onConfirm={onAnswer}
            disabled={answered}
          />
          {!answered && (
            <button
              type="button"
              onClick={onSkip}
              className="mt-4 text-xs text-muted hover:text-ink underline underline-offset-4 decoration-line-strong transition-colors"
            >
              Пропустить — нет данных
            </button>
          )}
        </>
      )}
    </article>
  );
}
