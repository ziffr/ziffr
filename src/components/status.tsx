import { cn } from "@/lib/utils";
import type { ActionStatus } from "@/lib/types";

export function StatusDot({ status }: { status: ActionStatus | string }) {
  const c = status === "open" ? "bg-amber-500" : status === "answered" ? "bg-primary" : "bg-muted-foreground/40";
  return <span title={status} className={`size-2 shrink-0 rounded-full ${c}`} />;
}

export function StatusBadge({ status, kind = "question" }: { status: ActionStatus; kind?: "question" | "task" }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium capitalize", status === "open" && "border-amber-500/40 bg-amber-500/10 text-amber-700", status === "answered" && "border-primary/40 bg-primary/10 text-primary", status === "closed" && "text-muted-foreground")}>
      <StatusDot status={status} /> {kind === "task" && status === "answered" ? "done" : status}
    </span>
  );
}
