import { FlaskConical } from "lucide-react";
import { isMock } from "@/lib/api";

export function MockBanner() {
  if (!isMock()) return null;
  return (
    <div className="border-b border-line bg-surface/60 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-6 py-2 flex items-center gap-2 text-xs text-muted">
        <FlaskConical size={14} className="text-primary" />
        <span>
          <span className="text-ink font-medium">Demo-режим.</span> Данные
          предзаписаны, микрофон не используется. Чтобы переключить на реальный
          backend — задай{" "}
          <code className="font-mono text-[0.72rem] bg-surface-elev px-1.5 py-0.5 rounded">
            NEXT_PUBLIC_USE_MOCK=false
          </code>{" "}
          в{" "}
          <code className="font-mono text-[0.72rem] bg-surface-elev px-1.5 py-0.5 rounded">
            .env.local
          </code>
          .
        </span>
      </div>
    </div>
  );
}
