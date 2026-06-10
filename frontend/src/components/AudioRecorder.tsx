"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Mic, RotateCcw, Square } from "lucide-react";
import { apiTranscribe, isMock } from "@/lib/api";
import type { RecorderState } from "@/lib/types";
import { cn } from "@/lib/cn";

type Props = {
  questionId: string;
  onConfirm: (transcript: string) => void;
  disabled?: boolean;
};

type InputMode = "voice" | "text";

export function AudioRecorder({ questionId, onConfirm, disabled }: Props) {
  const [mode, setMode] = useState<InputMode>("voice");
  const [state, setState] = useState<RecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [textValue, setTextValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      try {
        recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
      } catch {
        /* noop */
      }
    };
  }, []);

  function stopTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function start() {
    setError(null);
    setSeconds(0);

    if (isMock()) {
      // В mock-режиме не трогаем микрофон — сразу имитируем запись 3 секунды
      setState("recording");
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => {
          if (s >= 2) {
            stopTimer();
            void handleMockStop();
            return 3;
          }
          return s + 1;
        });
      }, 1000);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setState("processing");
        try {
          const text = await apiTranscribe(blob, questionId);
          setTranscript(text);
          setState("preview");
        } catch (e) {
          setError((e as Error).message);
          setState("idle");
        }
      };
      recorderRef.current = mr;
      mr.start();
      setState("recording");
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      setError(
        (e as Error).message ||
          "Не удалось получить доступ к микрофону. Проверь права в браузере.",
      );
      setState("idle");
    }
  }

  async function handleMockStop() {
    setState("processing");
    try {
      const text = await apiTranscribe(new Blob(), questionId);
      setTranscript(text);
      setState("preview");
    } catch (e) {
      setError((e as Error).message);
      setState("idle");
    }
  }

  function stop() {
    stopTimer();
    if (isMock()) {
      void handleMockStop();
      return;
    }
    recorderRef.current?.stop();
  }

  function reset() {
    setTextValue(transcript);
    setTranscript("");
    setState("idle");
    setSeconds(0);
    setError(null);
  }

  function confirm() {
    onConfirm(transcript.trim());
    setState("submitted");
  }

  function confirmText() {
    const text = textValue.trim();
    if (!text) return;
    setTranscript(text);
    onConfirm(text);
    setState("submitted");
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;

  if (state === "submitted") {
    return (
      <div className="flex items-start gap-3 rounded-xl bg-surface-elev/60 border border-line p-4">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
          <Check size={16} strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted mb-1">Ответ записан</div>
          <p className="text-sm text-ink/80 leading-relaxed text-pretty line-clamp-3">
            {transcript}
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-xs text-muted hover:text-ink transition-colors shrink-0"
        >
          Изменить
        </button>
      </div>
    );
  }

  if (state === "preview") {
    return (
      <div className="space-y-3" aria-live="polite">
        <label className="block text-xs text-muted">
          Проверьте транскрипцию и при необходимости отредактируйте
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={4}
          className="w-full resize-y rounded-lg border border-line-strong bg-bg px-4 py-3 text-[0.95rem] leading-relaxed font-mono focus:outline-none focus:ring-2 focus:ring-accent/40"
          placeholder="Текст транскрипции…"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={!transcript.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-ink h-10 px-4 text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} />
            Подтвердить
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-md border border-line-strong bg-surface h-10 px-4 text-sm hover:bg-surface-elev transition-colors"
          >
            <RotateCcw size={16} />
            Перезаписать
          </button>
        </div>
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div
        className="flex items-center gap-3 text-muted text-sm"
        aria-live="polite"
      >
        <Loader2 size={18} className="animate-spin text-primary" />
        Транскрибируем ответ…
      </div>
    );
  }

  if (state === "recording") {
    return (
      <div className="flex items-center gap-4" aria-live="polite">
        <button
          type="button"
          onClick={stop}
          aria-label="Остановить запись"
          className={cn(
            "h-16 w-16 rounded-full bg-recording text-white",
            "flex items-center justify-center animate-recording-pulse",
            "hover:scale-[1.03] transition-transform",
          )}
        >
          <Square size={22} fill="currentColor" />
        </button>
        <div className="flex flex-col">
          <span className="text-recording text-sm font-medium">Идёт запись</span>
          <span className="font-mono text-2xl text-ink tabular-nums">
            {mmss}
          </span>
        </div>
      </div>
    );
  }

  // idle: переключатель Голос | Текст + соответствующий ввод
  return (
    <div className="flex flex-col gap-3">
      <div
        className="inline-flex self-start rounded-lg border border-line bg-surface-elev/60 p-0.5"
        role="tablist"
        aria-label="Способ ответа"
      >
        <ModeTab
          active={mode === "voice"}
          onClick={() => setMode("voice")}
          disabled={disabled}
        >
          Голос
        </ModeTab>
        <ModeTab
          active={mode === "text"}
          onClick={() => setMode("text")}
          disabled={disabled}
        >
          Текст
        </ModeTab>
      </div>

      {mode === "voice" ? (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          aria-label="Начать запись ответа"
          className={cn(
            "self-start inline-flex items-center gap-3 h-12 pl-3 pr-5 rounded-full",
            "bg-primary text-primary-ink hover:bg-primary-hover",
            "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
            <Mic size={18} />
          </span>
          <span className="font-medium">Записать ответ</span>
        </button>
      ) : (
        <div className="space-y-3">
          <textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            rows={4}
            disabled={disabled}
            className="w-full resize-y rounded-lg border border-line-strong bg-bg px-4 py-3 text-[0.95rem] leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            placeholder="Введите ответ текстом…"
          />
          <button
            type="button"
            onClick={confirmText}
            disabled={disabled || !textValue.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-ink h-10 px-4 text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} />
            Подтвердить
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-7 px-3 rounded-md text-xs font-medium transition-colors",
        active ? "bg-bg text-ink shadow-[0_1px_2px_oklch(0_0_0/0.06)]" : "text-muted hover:text-ink",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      )}
    >
      {children}
    </button>
  );
}
