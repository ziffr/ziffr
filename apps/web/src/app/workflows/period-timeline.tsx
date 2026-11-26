// The period timeline (GLOSSARY: Period Timeline): what happened in each period of a Workflow, newest period first,
// the one running now open. The core decides what this viewer may see; this only draws it.
import Link from "next/link";
import { formatDate } from "@ziffr/core/format";
import type { PeriodTimeline } from "@ziffr/core/period-timeline";
import { cn } from "@/lib/utils";

/** A period's events grouped by day, in order. */
function byDay(t: PeriodTimeline) {
  const days: { day: string; events: PeriodTimeline["events"] }[] = [];
  for (const e of t.events) {
    const last = days.at(-1);
    if (last?.day === e.day) last.events.push(e);
    else days.push({ day: e.day, events: [e] });
  }
  return days;
}

/** The timelines of a Workflow's periods, each under its own heading with "N of M in". */
export function PeriodTimelines({ timelines }: { timelines: PeriodTimeline[] }) {
  if (!timelines.length) return null;
  return (
    <section aria-label="Period timeline" className="mt-10">
      <h2 className="text-sm font-semibold">What happened, period by period</h2>
      <div className="mt-3 space-y-3">
        {timelines.map((t, i) => (
          <details key={t.period} open={i === 0} className="stock rounded-[var(--radius-card)] p-3 text-sm">
            <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-semibold">{t.label}</span>
              <span className="text-muted-foreground">{t.of || t.checklist.of ? `${t.in + t.checklist.done} of ${t.of + t.checklist.of} in` : "No values asked for"}</span>
              {t.locked > 0 && t.locked === t.of && <span className="text-muted-foreground">locked</span>}
              {t.locked < t.of && t.published > 0 && <span className="text-muted-foreground">{t.published} published</span>}
            </summary>
            {t.events.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Nothing has happened in this period yet.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {byDay(t).map((d) => (
                  <li key={d.day}>
                    <div className="text-xs font-medium text-muted-foreground">{formatDate(d.day)}</div>
                    <ol className="relative mt-1 space-y-2 before:absolute before:top-2 before:bottom-2 before:left-[3px] before:w-px before:bg-[var(--color-rule-2)]">
                      {d.events.map((e, k) => (
                        <li key={`${e.at}-${k}`} className="relative flex gap-3 pl-4">
                          <span aria-hidden className={cn("absolute top-1.5 left-0 size-[7px] rounded-full border border-[var(--color-rule-2)] bg-card", (e.kind === "locked" || e.kind === "published") && "bg-[var(--color-ink)]")} />
                          <span className="w-11 shrink-0 text-xs tabular-nums text-muted-foreground">{e.time}</span>
                          <div className="min-w-0">
                            <p>{e.path ? <Link href={e.path} className="hover:underline max-sm:block max-sm:py-3">{e.text}</Link> : e.text}</p>
                            {e.items.length > 0 && <p className="text-xs text-muted-foreground">{e.items.join("; ")}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            )}
          </details>
        ))}
      </div>
    </section>
  );
}
