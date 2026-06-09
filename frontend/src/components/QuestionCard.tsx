"use client";

import { AudioRecorder } from "./AudioRecorder";
import type { Question } from "@/lib/types";

type Props = {
  question: Question;
  index: number;
  totalInRound: number;
  answered: boolean;
  onAnswer: (transcript: string) => void;
};

export function QuestionCard({
  question,
  index,
  totalInRound,
  answered,
  onAnswer,
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
      <AudioRecorder
        questionId={question.id}
        onConfirm={onAnswer}
        disabled={answered}
      />
    </article>
  );
}
