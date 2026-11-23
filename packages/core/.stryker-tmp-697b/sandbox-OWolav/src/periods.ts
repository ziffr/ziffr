// @ts-nocheck
// Periods (spec 0017; GLOSSARY: Period, Fiscal Year): the one place that knows where a day, week, month, quarter,
// half-year or year starts and ends, how to step between them and what each is called. Pure. Weeks are ISO weeks;
// quarters, half-years and years start from the workspace's year start, January unless it sets another month.
import { addDays, addMonths, differenceInCalendarDays, differenceInCalendarISOWeeks, differenceInCalendarMonths, format, isValid, parseISO, startOfISOWeek } from "date-fns";
import { writePeriod } from "@ziffr/figures";
import type { Period, YearStart } from "./types";

export type { YearStart };

/** A length of time Ziffr counts in: a Metric's Period, or a longer span that Comparisons and Snapshots use. */
export type Span = Period | "quarter" | "half" | "year";

/** The calendar year's start, which a workspace has unless it sets another. */
export const JANUARY: YearStart = 1;

/** Whether a value is a month a year can start in. */
export function isYearStart(v: unknown): v is YearStart {
  // Number.isInteger is false for anything that is not a number, so it is the type check too.
  return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 12;
}

/** A stored or sent year start as one, January when it is not a month (an old row, a missing field). */
export function toYearStart(v: unknown): YearStart {
  const n = typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : v;
  return isYearStart(n) ? n : JANUARY;
}

/** A month's name, such as "April", for the month a year starts in. */
export function monthName(m: YearStart): string {
  return format(new Date(2026, m - 1, 1), "MMMM");
}

/** How each Period is named. */
export const PERIOD_LABEL: Record<Period, string> = { day: "Daily", week: "Weekly", month: "Monthly", quarter: "Quarterly", year: "Yearly" };

/** How the period that is running now is called in a question: "What's the number for Revenue this quarter?" */
export const CURRENT_PERIOD: Record<Period, string> = { day: "today", week: "this week", month: "this month", quarter: "this quarter", year: "this year" };

// Months per span from a quarter up; a day, week or month is not counted in months.
const MONTHS: Partial<Record<Span, number>> = { month: 1, quarter: 3, half: 6, year: 12 };

const iso = (d: Date) => format(d, "yyyy-MM-dd");
// A yyyy-mm-dd is read as a local calendar day, as date-fns does everywhere else in Ziffr.
const toDate = (d: Date | string) => (typeof d === "string" ? parseISO(d) : d);

/** The first day (yyyy-mm-dd) of the span a day falls in. */
export function periodStart(date: Date | string, span: Span, yearStart: YearStart): string {
  const d = toDate(date);
  if (span === "day") return iso(d);
  if (span === "week") return iso(startOfISOWeek(d));
  const len = MONTHS[span]!;
  // Months since the year started, so a quarter or half begins on a multiple of its length from the year start.
  const intoYear = (d.getMonth() - (yearStart - 1) + 12) % 12;
  return iso(new Date(d.getFullYear(), d.getMonth() - (intoYear % len), 1));
}

/** Whether a day (yyyy-mm-dd) is the first day of a span; false for anything that is not a day. */
export function isPeriodStart(start: unknown, span: Span, yearStart: YearStart): start is string {
  // No pattern check is needed: a span's first day is written yyyy-mm-dd, so anything else (a time, no dashes) is not
  // equal to it; an invalid day is caught before periodStart could fail on it.
  if (typeof start !== "string" || !isValid(parseISO(start))) return false;
  return periodStart(start, span, yearStart) === start;
}

/** The first day of the span `n` spans after the one starting on `start` (negative: before). Needs no year start:
 * `start` already says where its span begins. */
export function shiftPeriod(start: string, span: Span, n: number): string {
  const d = parseISO(start);
  if (span === "day") return iso(addDays(d, n));
  if (span === "week") return iso(addDays(d, 7 * n));
  return iso(addMonths(d, MONTHS[span]! * n));
}

/** The last day of the span starting on `start`. */
export function periodEnd(start: string, span: Span): string {
  return iso(addDays(parseISO(shiftPeriod(start, span, 1)), -1));
}

/** How many spans lie between two span starts: 0 for the same one, negative when `to` is earlier. */
export function periodsBetween(from: string, to: string, span: Span): number {
  const a = parseISO(from);
  const b = parseISO(to);
  if (span === "day") return differenceInCalendarDays(b, a);
  if (span === "week") return differenceInCalendarISOWeeks(b, a);
  return Math.trunc(differenceInCalendarMonths(b, a) / MONTHS[span]!);
}

/** The starts of the spans that lie wholly between two days (inclusive), oldest first: a quarter's three months, the
 * weeks that begin and end in it, its days. A span that starts before `from` or ends after `to` is not one. */
export function periodStartsIn(span: Span, from: string, to: string, yearStart: YearStart): string[] {
  const out: string[] = [];
  for (let start = periodStart(from, span, yearStart); start <= to; start = shiftPeriod(start, span, 1)) {
    if (start >= from && periodEnd(start, span) <= to) out.push(start);
  }
  return out;
}

/** A span's name, long ("October 2026", "Q3 2026", "FY 2026/27") or short ("Oct 26", "Q3 26", "FY26/27"), from its
 * first day. Months, weeks and days keep their calendar names; quarters, halves and years follow the year start. The
 * words come from @ziffr/figures, which the MCP views and the emails write with too. */
export function periodLabel(start: string, span: Span, yearStart: YearStart, short = false): string {
  return writePeriod(start, span, yearStart, short);
}
