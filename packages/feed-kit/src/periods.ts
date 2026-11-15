// Periods for a Feed (GLOSSARY: Period, Feed): stepping back from the current period Ziffr names, in plain calendar
// days, so a Feed running in another time zone asks for exactly the periods Ziffr counts. Pure, no dependencies.

/** How often a Metric has a value. */
export type Period = "day" | "week" | "month";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The first day of the period `n` periods after `start` (negative: before), as YYYY-MM-DD. */
export function shiftPeriod(start: string, period: Period, n: number): string {
  if (!DAY.test(start)) throw new Error(`Not a period's first day: ${start}`);
  const [y, m, d] = start.split("-").map(Number);
  // Calendar arithmetic in UTC: no local clock, no daylight saving, the same everywhere.
  const date = period === "month" ? new Date(Date.UTC(y, m - 1 + n, 1)) : new Date(Date.UTC(y, m - 1, d + n * (period === "week" ? 7 : 1)));
  return date.toISOString().slice(0, 10);
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
