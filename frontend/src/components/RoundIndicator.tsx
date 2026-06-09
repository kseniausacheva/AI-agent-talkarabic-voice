import { cn } from "@/lib/cn";

type Props = {
  currentRound: 1 | 2 | 3;
  totalRounds?: number;
};

export function RoundIndicator({ currentRound, totalRounds = 3 }: Props) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-3">
      <div className="text-sm text-muted">
        Раунд <span className="text-ink font-medium">{currentRound}</span> из{" "}
        {totalRounds}
      </div>
      <div className="flex gap-1.5">
        {rounds.map((r) => {
          const state =
            r < currentRound ? "done" : r === currentRound ? "active" : "future";
          return (
            <span
              key={r}
              aria-label={`Раунд ${r} — ${
                state === "done" ? "пройден" : state === "active" ? "активен" : "впереди"
              }`}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                state === "active" && "w-10 bg-primary",
                state === "done" && "w-6 bg-muted",
                state === "future" && "w-6 bg-line",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
