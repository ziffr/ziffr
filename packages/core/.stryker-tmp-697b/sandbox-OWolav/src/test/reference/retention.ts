// @ts-nocheck
// The reference for Retention (spec 0033, ticket #379; GLOSSARY: Retention, Condensed Value), written apart from
// retention-rules.ts and sharing no code with it: it walks calendar days and holds every value as an exact fraction.
//
// The rules, in words:
// - A period is older than the Retention when its last day lies before the day `keep` months before today (the same
//   day of the month, or the month's last day when that is shorter).
// - Delete mode deletes the older periods, but not those held back by open work.
// - Condense mode makes one Condensed Value of a span (by the period condensed into) when every Metric period that
//   starts in it is older, none of the periods held is held back, and every longer Display Period sees all of the
//   span's Metric periods in one span (otherwise a week across two months would be counted whole in one month).
// - A Condensed Value holds how many periods had a value, how many the span has, the exact sum, and the last value.
import type { Span, YearStart } from "../../periods";
import type { Point } from "../../types";
import { dayOf, monthsLater, spanEnd, spanStart, startsSpan, textOf } from "./calendar";
import { DISPLAYS } from "./check";
import { latestOfEach } from "./combine";
import { exactOf, sumOf, type Exact } from "./exact";

const RANK: Record<Span, number> = { day: 0, week: 1, month: 2, quarter: 3, half: 4, year: 5 };

/** The first day kept. */
export function referenceKeptFrom(today: string, keep: number): string {
  return textOf(monthsLater(dayOf(today), -keep));
}

/** Where a Retention reaches, as period starts, each list oldest first. */
export type ReferencePlan = { delete: string[]; deletedLocked: number; condense: { period: string; periods: string[]; locked: boolean }[]; heldBack: string[]; uneven: string[] };

/** What a Retention does to the stored periods on a day, by the rules above. */
export function referencePlan(then: "delete" | "condense", into: Span | null, own: Span, stored: { period: string; locked?: boolean; heldBack?: boolean }[], today: string, keep: number, ys: YearStart): ReferencePlan {
  const cutoff = dayOf(referenceKeptFrom(today, keep));
  const older = stored.filter((s) => spanEnd(dayOf(s.period), own, ys) < cutoff).sort((a, b) => dayOf(a.period) - dayOf(b.period));
  const out: ReferencePlan = { delete: [], deletedLocked: 0, condense: [], heldBack: [], uneven: [] };
  if (then === "delete") {
    for (const s of older) {
      if (s.heldBack) out.heldBack.push(s.period);
      else {
        out.delete.push(s.period);
        if (s.locked) out.deletedLocked++;
      }
    }
    return out;
  }
  const starts = [...new Set(older.map((s) => spanStart(dayOf(s.period), into!, ys)))].sort((a, b) => a - b);
  for (const start of starts) {
    // Every Metric period that starts in the span, found day by day.
    const periods: number[] = [];
    for (let d = start; d <= spanEnd(start, into!, ys); d++) if (startsSpan(d, own, ys)) periods.push(d);
    if (spanEnd(periods[periods.length - 1], own, ys) >= cutoff) continue;
    const members = older.filter((s) => spanStart(dayOf(s.period), into!, ys) === start);
    const names = members.map((m) => m.period);
    if (members.some((m) => m.heldBack)) out.heldBack.push(...names);
    else if (DISPLAYS.some((d) => RANK[d] > RANK[into!] && new Set(periods.map((p) => spanStart(p, d, ys))).size > 1)) out.uneven.push(...names);
    else out.condense.push({ period: textOf(start), periods: names, locked: members.every((m) => m.locked) });
  }
  return out;
}

/** The Condensed Value of a span as the reference works it out: exact sum, count, last value. */
export type ReferenceCondensed = { held: number; of: number; sum: Exact; last: { value: Exact; day: string } };

/** The values in the span starting on `start` (by `into`), condensed: the latest value of each period counted once. */
export function referenceCondensed(values: readonly Point[], own: Span, into: Span, start: string, ys: YearStart): ReferenceCondensed | null {
  const [from, to] = [dayOf(start), spanEnd(dayOf(start), into, ys)];
  const held = latestOfEach(values).filter((v) => v.day >= from && v.day <= to);
  if (!held.length) return null;
  let of = 0;
  for (let d = from; d <= to; d++) if (startsSpan(d, own, ys)) of++;
  const newest = held[held.length - 1];
  return { held: held.length, of, sum: sumOf(held.map((v) => v.value)), last: { value: newest.value, day: textOf(newest.day) } };
}

/** A decimal text as an exact value (what a Condensed Value's sum says it is). */
export const exactOfText = (text: string): Exact => exactOf(text);
