// The Schedule's Timeline view (GLOSSARY: Period Timeline, Action, Workflow): what happened, newest first, grouped by day.
// The core decides what this viewer may see; this only draws it. Neutral dots; a line that needs attention or is finished
// also says so in words and a mark, never by colour alone.
import Link from "next/link";
import { Check } from "lucide-react";
import { formatDate } from "@ziffr/core/format";
import type { ActionsTimeline, TimelineItem } from "@ziffr/core/actions-overview";
import { cn } from "@/lib/utils";

/** The lines grouped by day, in the order given. */
function byDay(items: TimelineItem[]) {
  const days: { day: string; items: TimelineItem[] }[] = [];
  for (const e of items) {
    const last = days.at(-1);
    if (last?.day === e.day) last.items.push(e);
    else days.push({ day: e.day, items: [e] });
  }
  return days;
}

/** The Timeline's lines, or a sentence when there are none. */
export function TimelineList({ timeline }: { timeline: ActionsTimeline }) {
  if (!timeline.items.length) return <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4 text-sm text-muted-foreground">Nothing has happened yet that matches.</p>;
  return (
    <ol className="space-y-5">
      {byDay(timeline.items).map((d) => (
        <li key={d.day}>
          <h2 className="text-xs font-medium text-muted-foreground">{formatDate(d.day)}</h2>
          <ol className="relative mt-1.5 space-y-2.5 before:absolute before:top-2 before:bottom-2 before:left-[3px] before:w-px before:bg-[var(--color-rule-2)]">
            {d.items.map((e, k) => (
              <li key={`${e.at}-${k}`} className="relative flex gap-3 pl-4 text-sm">
                <span aria-hidden className={cn("absolute top-1.5 left-0 size-[7px] rounded-full border bg-card", e.tone === "attention" ? "border-[var(--color-error)] bg-[var(--color-error)]" : e.tone === "finished" ? "border-[var(--color-success)] bg-[var(--color-success)]" : "border-[var(--color-rule-2)]")} />
                <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{e.time}</span>
                <div className="min-w-0">
                  <p>
                    {e.path ? <Link href={e.path} className="hover:underline">{e.text}</Link> : e.text}
                    {e.tone === "attention" && <span className="ml-2 rounded-[var(--radius-input)] border border-foreground px-1.5 text-xs font-medium">Needs attention</span>}
                    {e.tone === "finished" && <Check aria-label="Finished" className="ml-1.5 inline size-3.5 text-muted-foreground" />}
                  </p>
                  {e.items.length > 0 && <p className="text-xs text-muted-foreground">{e.items.join("; ")}</p>}
                  <p className="text-xs text-muted-foreground">{[e.workflowName, e.periodLabel].filter(Boolean).join(", ")}</p>
                </div>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
