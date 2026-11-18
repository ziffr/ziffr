// The reference calendar (spec 0022, Testing Decisions; GLOSSARY: Period, Fiscal Year, Display Period). Written
// apart from periods.ts and date-fns, as plainly as possible, so the tests compare two independent answers: a day is
// a number (days since 1 January 1970), and a span is found by walking day by day to the day that starts it.
import type { Span, YearStart } from "../../periods";

/** A calendar day as a count of days since 1970-01-01. */
export type Day = number;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Whether a calendar year has a 29 February. */
export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** How many days a month (1 to 12) of a year has. */
export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/** The day of a date written yyyy-mm-dd: the years and months before it counted out one by one. */
export function dayOf(text: string): Day {
  let n = days.get(text);
  if (n === undefined) days.set(text, (n = countIn(text)));
  return n;
}
const days = new Map<string, Day>();

function countIn(text: string): Day {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`Not a day: ${text}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`Not a day: ${text}`);
  let n = 0;
  for (let year = 1970; year < y; year++) n += isLeapYear(year) ? 366 : 365;
  for (let year = y; year < 1970; year++) n -= isLeapYear(year) ? 366 : 365;
  for (let month = 1; month < m; month++) n += daysInMonth(y, month);
  return n + d - 1;
}

// Counting out years is slow when every day of a walk asks; the answer for a day never changes, so it is kept.
const parts = new Map<Day, { y: number; m: number; d: number }>();

/** The year, month (1 to 12) and day of the month of a day. */
export function partsOf(day: Day): { y: number; m: number; d: number } {
  let p = parts.get(day);
  if (!p) parts.set(day, (p = countOut(day)));
  return p;
}

function countOut(day: Day) {
  let y = 1970;
  let n = day;
  while (n < 0) n += isLeapYear(--y) ? 366 : 365;
  while (n >= (isLeapYear(y) ? 366 : 365)) n -= isLeapYear(y++) ? 366 : 365;
  let m = 1;
  while (n >= daysInMonth(y, m)) n -= daysInMonth(y, m++);
  return { y, m, d: n + 1 };
}

/** A day written yyyy-mm-dd. */
export function textOf(day: Day): string {
  const { y, m, d } = partsOf(day);
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/** The day of the week, 0 for Monday to 6 for Sunday: 1 January 1970 was a Thursday. */
export function weekday(day: Day): number {
  return (((day + 3) % 7) + 7) % 7;
}

/** Months per span from a month up, counted from the Fiscal Year's first month. */
const MONTHS: Record<"month" | "quarter" | "half" | "year", number> = { month: 1, quarter: 3, half: 6, year: 12 };

/** Whether a day is the first day of a span: every day starts a day, a Monday a week, the 1st a month, and the 1st
 * of every third, sixth or twelfth month from the Fiscal Year's first month a quarter, half-year or year. */
export function startsSpan(day: Day, span: Span, yearStart: YearStart): boolean {
  if (span === "day") return true;
  if (span === "week") return weekday(day) === 0;
  const { m, d } = partsOf(day);
  return d === 1 && (m - yearStart + 12) % MONTHS[span] === 0;
}

/** The first day of the span a day falls in: walk back until a day starts one. */
export function spanStart(day: Day, span: Span, yearStart: YearStart): Day {
  let d = day;
  while (!startsSpan(d, span, yearStart)) d--;
  return d;
}

/** The last day of the span that starts on `start`: walk on until the next one starts. */
export function spanEnd(start: Day, span: Span, yearStart: YearStart): Day {
  let d = start + 1;
  while (!startsSpan(d, span, yearStart)) d++;
  return d - 1;
}

/** The same day of the month `n` months later, or that month's last day when it is shorter. */
export function monthsLater(day: Day, n: number): Day {
  const { y, m, d } = partsOf(day);
  const total = y * 12 + (m - 1) + n;
  const [year, month] = [Math.floor(total / 12), (total % 12) + 1];
  return dayOf(`${pad(year, 4)}-${pad(month)}-${pad(Math.min(d, daysInMonth(year, month)))}`);
}

/** The day in the span starting on `start` that sits where `day` sits in its own span: as many days in for a day or
 * a week; for longer spans the same month of the span and the same day of the month, or the month's last day when it
 * is shorter (31 May is 28 February a quarter earlier). The Comparison cut. */
export function samePoint(day: Day, start: Day, span: Span, yearStart: YearStart): Day {
  const own = spanStart(day, span, yearStart);
  if (span === "day" || span === "week") return start + (day - own);
  const a = partsOf(own);
  const at = partsOf(day);
  const monthsIn = (at.y - a.y) * 12 + (at.m - a.m);
  const s = partsOf(start);
  const total = s.m - 1 + monthsIn;
  const y = s.y + Math.floor(total / 12);
  const m = (total % 12) + 1;
  return dayOf(`${pad(y, 4)}-${pad(m)}-${pad(Math.min(at.d, daysInMonth(y, m)))}`);
}
