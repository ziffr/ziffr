import { cn } from "@/lib/utils";
import type { ActionStatus } from "@ziffr/core/types";

const label = (status: ActionStatus | string, kind: "question" | "task" = "question") =>
  kind === "task" && status === "answered" ? "Done" : status === "answered" ? "Answered" : status === "open" ? "Open" : "Closed";

/** Status as a word, never a coloured dot. Open and answered are ink outlines;
 *  a settled outcome (closed, done) is pressed into the paper in coral (Coral § Surfaces). */
export function StatusBadge({ status, kind = "question", size = "md" }: { status: ActionStatus; kind?: "question" | "task"; size?: "sm" | "md" }) {
  const settled = status === "closed" || (kind === "task" && status === "answered");
  if (settled) return <span className={cn("pressed shrink-0", size === "sm" ? "text-xs" : "text-sm")}>{label(status, kind)}</span>;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-[var(--radius-input)] border px-1.5 font-medium",
        size === "sm" ? "text-xs" : "py-0.5 text-xs",
        status === "open" ? "border-foreground text-foreground" : "border-[var(--color-rule-2)] text-[var(--color-ink-2)]",
      )}
    >
      {label(status, kind)}
    </span>
  );
}

/** Compact form for lists. */
export function StatusDot({ status, kind }: { status: ActionStatus | string; kind?: "question" | "task" }) {
  return <StatusBadge status={status as ActionStatus} kind={kind} size="sm" />;
}
