import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "bg-surface border border-line rounded-2xl p-6 transition-colors",
        className,
      )}
      {...rest}
    />
  );
}
