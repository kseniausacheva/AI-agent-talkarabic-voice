import { FlaskConical } from "lucide-react";
import { isMock } from "@/lib/api";

export function MockBanner() {
  if (!isMock()) return null;
  return (
    <div className="bg-tint">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-6 py-1.5 text-xs text-teal">
        <FlaskConical size={13} className="shrink-0 text-primary-strong" />
        <span className="truncate">
          <span className="font-semibold text-ink">Demo-режим.</span> Данные
          предзаписаны, микрофон не используется — задай{" "}
          <code className="rounded bg-bg/70 px-1.5 py-0.5 font-mono text-[0.72rem]">
            NEXT_PUBLIC_USE_MOCK=false
          </code>{" "}
          для реального backend.
        </span>
      </div>
    </div>
  );
}
