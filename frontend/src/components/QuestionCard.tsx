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
      className="animate-fade-up bg-surface border border-line rounded-2xl p-6 sm:p-7"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <header className="mb-5">
        <div className="text-xs text-muted mb-2 tabular-nums">
          Вопрос {index + 1} из {totalInRound}
        </div>
        <h3 className="text-lg sm:text-xl font-medium text-ink text-balance leading-snug">
          {question.text}
        </h3>
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
