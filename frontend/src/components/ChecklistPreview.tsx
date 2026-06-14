import { Check, CircleDashed, AlertCircle } from "lucide-react";
import type { ChecklistItem } from "@/lib/types";
import { cn } from "@/lib/cn";

type Props = {
  items: ChecklistItem[];
};

function groupByCategory(items: ChecklistItem[]) {
  return items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    acc[item.category] ??= [];
    acc[item.category].push(item);
    return acc;
  }, {});
}

const statusMeta = {
  confirmed: {
    icon: Check,
    iconClass: "text-success bg-success/12",
    label: "Подтверждено",
  },
  needs_clarification: {
    icon: AlertCircle,
    iconClass: "text-primary bg-primary/12",
    label: "Требует уточнения",
  },
  not_discussed: {
    icon: CircleDashed,
    iconClass: "text-subtle bg-surface-elev",
    label: "Не обсуждалось",
  },
} as const;

export function ChecklistPreview({ items }: Props) {
  const grouped = groupByCategory(items);

  return (
    <div className="space-y-10">
      {Object.entries(grouped).map(([category, group]) => (
        <section key={category}>
          <h3 className="mb-4 flex items-baseline gap-3 text-base font-semibold text-ink">
            {category}
            <span className="text-xs font-normal tabular-nums text-muted">
              {group.filter((i) => i.status === "confirmed").length}/{group.length}
            </span>
          </h3>
          <ul className="space-y-2.5">
            {group.map((item, i) => {
              const meta = statusMeta[item.status];
              const Icon = meta.icon;
              return (
                <li
                  key={`${category}-${i}`}
                  className="flex items-start gap-3 py-1"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                      meta.iconClass,
                    )}
                  >
                    <Icon size={12} strokeWidth={2.5} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-pretty text-[0.95rem] leading-relaxed",
                        item.status === "not_discussed"
                          ? "text-muted"
                          : "text-ink",
                      )}
                    >
                      {item.item}
                    </p>
                    {item.notes && (
                      <p className="mt-1 text-sm text-muted leading-relaxed text-pretty">
                        {item.notes}
                      </p>
                    )}
                  </div>
                  <span className="sr-only">{meta.label}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
