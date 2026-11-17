// Periods for a Feed (GLOSSARY: Period, Feed, Fiscal Year): stepping back from the current period Ziffr names, in
// plain calendar days, so a Feed running in another time zone asks for exactly the periods Ziffr counts. Weeks are ISO
// weeks; quarters and years start from the workspace's year start (`year_start_month` in GET /feed). Pure, no
// dependencies.

/** How often a Metric has a value. */
export type Period = "day" | "week" | "month" | "quarter" | "year";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
// Months per period from a month up.
const MONTHS: Partial<Record<Period, number>> = { month: 1, quarter: 3, year: 12 };

function parts(day: string): [number, number, number] {
  if (!DAY.test(day)) throw new Error(`Not a day as YYYY-MM-DD: ${day}`);
  return day.split("-").map(Number) as [number, number, number];
}
// Calendar arithmetic in UTC: no local clock, no daylight saving, the same everywhere.
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The first day of the period `n` periods after `start` (negative: before), as YYYY-MM-DD. Needs no year start:
 * `start` already is a period's first day. */
export function shiftPeriod(start: string, period: Period, n: number): string {
  if (!DAY.test(start)) throw new Error(`Not a period's first day: ${start}`);
  const [y, m, d] = parts(start);
  const months = MONTHS[period];
  const date = months ? new Date(Date.UTC(y, m - 1 + n * months, 1)) : new Date(Date.UTC(y, m - 1, d + n * (period === "week" ? 7 : 1)));
  return iso(date);
}

/** The first day of the period a day falls in, as Ziffr counts it: a Monday for a week, and for a quarter or year a
 * month counted from `yearStartMonth` (1 is January, the default; GET /feed says the workspace's). */
export function periodStart(day: string, period: Period, yearStartMonth = 1): string {
  const [y, m, d] = parts(day);
  if (period === "day") return iso(new Date(Date.UTC(y, m - 1, d)));
  if (period === "week") {
    const date = new Date(Date.UTC(y, m - 1, d));
    return iso(new Date(Date.UTC(y, m - 1, d - ((date.getUTCDay() + 6) % 7))));
  }
  const len = MONTHS[period]!;
  const start = Number.isInteger(yearStartMonth) && yearStartMonth >= 1 && yearStartMonth <= 12 ? yearStartMonth : 1;
  const intoYear = (m - start + 12) % 12;
  return iso(new Date(Date.UTC(y, m - 1 - (intoYear % len), 1)));
}

/** The day after a period ends: a query's exclusive upper bound, such as `created_at < :period_end`. */
export function periodEnd(start: string, period: Period): string {
  return shiftPeriod(start, period, 1);
}

/** The current period and the `back` periods before it, oldest first. */
export function recentPeriods(current: string, period: Period, back: number): string[] {
  const n = Math.max(0, Math.trunc(back) || 0);
  return Array.from({ length: n + 1 }, (_, i) => shiftPeriod(current, period, i - n));
}
