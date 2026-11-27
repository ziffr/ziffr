// How close a Method is to having enough history (GLOSSARY: Analysis Canvas, Method, Metric): in place of "not now", the picker says
// how many periods there are of how many it needs, in the Metric's own period, and names a day only where that day is certain. Pure: it
// reads only what it is given, which the caller took from the Metrics the person sees.
import { periodCountLabel } from "./correlation";
import type { PickerEntry } from "./method-picker";
import { looksAtOne, type CanvasFact, type PeriodsShort } from "./method-picker-fit";
import { JANUARY, periodEnd, periodLabel, periodsBetween, periodStart, shiftPeriod, type Span, type YearStart } from "./periods";

/** What is known of a Metric's history besides how long it is. */
export type History = { /** The first days of the periods that hold a value, oldest first. */ starts: string[]; /** Whether a formula works its values out, so nobody adds them. */ derived: boolean };

/**
 * The day by which a Metric has `need` periods with a value, if one is added for each period from now on; null where that cannot be said:
 * a period without a value between those that have one or since the latest (the Methods refuse too many gaps, so more values may not be
 * enough), or a value ahead of the current period. A value can be recorded for the running period, so a day is ready on that day, and a
 * longer period at the latest on its last day.
 */
export function readyDay(starts: string[], need: number, span: Span, yearStart: YearStart, today: string): string | null {
  const missing = need - starts.length;
  if (missing <= 0) return null;
  const ys = span === "quarter" || span === "half" || span === "year" ? yearStart : JANUARY;
  const current = periodStart(today, span, ys);
  const latest = starts.at(-1);
  if (latest !== undefined) {
    const unbroken = periodsBetween(starts[0], latest, span) + 1 === starts.length;
    if (!unbroken || (latest !== current && latest !== shiftPeriod(current, span, -1))) return null;
  }
  const next = latest === current ? shiftPeriod(current, span, 1) : current;
  const last = shiftPeriod(next, span, missing - 1);
  return span === "day" ? last : periodEnd(last, span);
}

/** Whether a day may be named at all for this entry: it looks at one Metric whose values someone adds, and nothing but a plain count of periods is missing. */
function datable(entry: PickerEntry, fact: CanvasFact, history: History): boolean {
  // The two sides of a date are counted apart, so a total of periods does not make it ready.
  if (!looksAtOne(entry) || entry.id === "after-date" || history.derived) return false;
  if (entry.needs.includes("target-range") && !fact.hasTarget) return false;
  return !entry.needs.includes("breakdown");
}

/** The line in place of "not now", as in "1 of 4 days. Ready on 30 Nov 2026 if you add one each day." The Metric is named where the canvas holds several. */
export function shortWords(entry: PickerEntry, short: PeriodsShort, canvas: CanvasFact[], history: History, yearStart: YearStart, today: string): string {
  const fact = canvas.find((m) => m.id === short.metric)!;
  const count = `${short.have} of ${periodCountLabel(short.span, short.need)}`;
  const lead = canvas.length > 1 ? `${fact.name} has ${count}.` : `${count}.`;
  const day = datable(entry, fact, history) ? readyDay(history.starts, short.need, short.span, yearStart, today) : null;
  if (day === null) return `${lead} ${short.need - short.have} more needed.`;
  const each = periodCountLabel(short.span, 1).replace("1 ", "");
  return `${lead} Ready ${short.span === "day" ? "on" : "by"} ${periodLabel(day, "day", JANUARY)} if you add one each ${each}.`;
}
