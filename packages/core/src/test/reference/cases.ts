// The hand-made edge cases (spec 0022, "Aggregations, exhaustively"; GLOSSARY: Aggregation, Display Period): series
// for every source Period and Fiscal Year start that the edge-case tests run through every Display Period,
// Aggregation, Target Series, Snapshot and Comparison. Built with the reference calendar, never the code under test.
import type { Span, YearStart } from "../../periods";
import type { Point } from "../../types";
import { dayOf, spanEnd, spanStart, textOf } from "./calendar";
import { longer, PERIODS, periodsFrom, shuffled, YEAR_STARTS } from "./check";

/** A value per period: 1.25, 2.25, 3.25 and so on unless the case says otherwise. */
export type Case = { name: string; points: Point[]; today: string; alignTo?: string };
export type Source = (typeof PERIODS)[number];

export const at = (periods: string[], value: (i: number) => number = (i) => i + 1.25): Point[] => periods.map((period, i) => ({ period, value: value(i) }));
/** A day in the middle of a quarter, a half-year and a year, for spans that are not at an edge. */
export const MID = "2026-05-13";
/** A day after every case: every span is over. */
export const LATER = "2031-01-01";

/** A Metric period's first days by the reference calendar, from the one `from` falls in, for this Fiscal Year. */
export const starts = (from: string, p: Span, n: number, ys: YearStart) => periodsFrom(textOf(spanStart(dayOf(from), p, ys)), p, n, ys);

/** The Metric periods of the span (by `display`) that `day` falls in. */
export function periodsOfSpan(day: string, own: Span, display: Span, ys: YearStart): string[] {
  const first = spanStart(dayOf(day), display, ys);
  const last = spanEnd(first, display, ys);
  const out: string[] = [];
  for (let d = spanStart(first, own, ys); d <= last; d = spanEnd(d, own, ys) + 1) if (d >= first) out.push(textOf(d));
  return out;
}

/** The hand-made cases for one source Period and Fiscal Year start. */
export function cases(own: Source, ys: YearStart): Case[] {
  const run = starts("2025-01-01", own, { day: 420, week: 110, month: 26, quarter: 9, year: 4 }[own], ys);
  const out: Case[] = [
    { name: "an empty series", points: [], today: MID },
    { name: "one value", points: at(starts(MID, own, 1, ys)), today: LATER },
    { name: "one value, its span to date", points: at(starts(MID, own, 1, ys)), today: MID },
    { name: "a long series, every span complete", points: at(run), today: LATER },
    { name: "a long series, the current span to date", points: at(run), today: run[Math.floor(run.length * 0.7)] },
    { name: "values from the middle of a span on", points: at(starts("2026-08-17", own, { day: 200, week: 40, month: 9, quarter: 4, year: 2 }[own], ys)), today: LATER },
    { name: "a series with gaps", points: at(run).filter((_, i) => i % 3 !== 1), today: LATER },
    { name: "a Comparison point in the middle of a span", points: at(run), today: LATER, alignTo: run[Math.floor(run.length * 0.6)] },
    { name: "a Comparison point at the start", points: at(run), today: LATER, alignTo: run[0] },
    { name: "a period given twice, in no order", points: shuffled([...at(run.slice(0, 30)), { period: run[3], value: -7.5 }, { period: run[0], value: 0.1 }], 46), today: run[Math.min(20, run.length - 1)] },
    { name: "negative values and zeros", points: at(run, (i) => (i % 4) - 1.5), today: LATER },
  ];
  for (const display of longer(own)) {
    const span = periodsOfSpan(MID, own, display, ys);
    const half = Math.ceil(span.length / 2);
    out.push({ name: `exactly half of a ${display}`, points: at(span.slice(0, half)), today: LATER });
    if (half > 1) out.push({ name: `one short of half of a ${display}`, points: at(span.slice(0, half - 1)), today: LATER });
  }
  if (own === "week") {
    // 2026 has 53 ISO weeks: the week of 28 December 2026 is week 53 and starts in December. The weeks of
    // 29 September 2025, 29 December 2025 and 30 March 2026 run into the next month, quarter and year.
    out.push({ name: "week 53", points: at(starts("2026-10-05", "week", 16, ys)), today: LATER });
    out.push({ name: "weeks across a month, quarter and year", points: at(["2025-09-29", "2025-12-29", "2026-03-30", "2025-09-22", "2025-12-22", "2026-03-23"]), today: LATER });
  }
  if (own === "day") {
    out.push({ name: "29 February", points: at(starts("2027-12-01", "day", 200, ys)), today: LATER, alignTo: "2028-02-29" });
    out.push({ name: "29 February, cut at 31 May", points: at(starts("2027-01-01", "day", 600, ys)), today: LATER, alignTo: "2028-05-31" });
    out.push({ name: "29 February to date", points: at(starts("2028-01-01", "day", 60, ys)), today: "2028-02-29" });
  }
  return out;
}

/** Cases for every source Period and Fiscal Year start. */
export function* everyCase() {
  for (const own of PERIODS) for (const ys of YEAR_STARTS) for (const c of cases(own, ys)) yield { own, ys, c };
}
