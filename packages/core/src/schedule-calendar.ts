// The calendar views of My schedule (spec 0027, ticket #507; GLOSSARY: Schedule, Due Date): which days a week or a
// month shows, where each duty sits, and how arrow keys move between days. Pure: no database, no clock, so the page's
// client component can import it. Days are calendar days (YYYY-MM-DD) worked on with UTC arithmetic, so a clock
// change never moves or repeats a day.

/** The first day of the week: 1 is Monday (the default), 0 is Sunday. */
export type WeekStart = 0 | 1;

/** How many days one fetch of the Schedule covers for the calendar views (the core's longest span). */
export const CALENDAR_SPAN_DAYS = 90;

const MS = 86_400_000;
const toNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / MS;
const fromNumber = (n: number) => new Date(n * MS).toISOString().slice(0, 10);

/** A day some days later (or earlier, when negative). */
export function addDays(day: string, n: number): string {
  return fromNumber(toNumber(day) + n);
}

/** Which day of the week a day is, counted from the week's first day: 0 to 6. */
export function weekdayIndex(day: string, weekStart: WeekStart = 1): number {
  return (new Date(`${day}T00:00:00Z`).getUTCDay() - weekStart + 7) % 7;
}

/** The first day of the week a day falls in. */
export function weekStartOf(day: string, weekStart: WeekStart = 1): string {
  return addDays(day, -weekdayIndex(day, weekStart));
}

/** The seven days of the week a day falls in. */
export function weekDays(day: string, weekStart: WeekStart = 1): string[] {
  const first = weekStartOf(day, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** The first day of the month a day falls in. */
export function monthStartOf(day: string): string {
  return `${day.slice(0, 7)}-01`;
}

/** The first day of the month some months after (or before) the one a day falls in. */
export function addMonths(day: string, n: number): string {
  const total = Number(day.slice(0, 4)) * 12 + (Number(day.slice(5, 7)) - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

/** The weeks of a month's grid, each with seven days, from the week the month starts in to the week it ends in; days of
 * the neighbouring months that fill the first and last week are marked `inMonth: false`. */
export function monthGrid(day: string, weekStart: WeekStart = 1): { date: string; inMonth: boolean }[][] {
  const first = monthStartOf(day);
  const last = addDays(addMonths(day, 1), -1);
  const weeks: { date: string; inMonth: boolean }[][] = [];
  for (let start = weekStartOf(first, weekStart); start <= last; start = addDays(start, 7)) {
    weeks.push(weekDays(start, weekStart).map((date) => ({ date, inMonth: date.slice(0, 7) === first.slice(0, 7) })));
  }
  return weeks;
}

/** The span to ask the core for so that the week of today and the months after it can be shown: from the start of
 * today's week, for the longest span the core answers. Overdue entries come whatever the span. */
export function calendarSpan(today: string, weekStart: WeekStart = 1): { from: string; to: string } {
  const from = weekStartOf(today, weekStart);
  return { from, to: addDays(from, CALENDAR_SPAN_DAYS - 1) };
}

/** Whether a day is inside the span the Schedule was asked for (days outside it are not known, not empty). */
export function inSpan(day: string, span: { from: string; to: string }): boolean {
  return day >= span.from && day <= span.to;
}

/** A duty placed on a day, with the day it was originally due when it sits on another one (overdue ones sit on today). */
export type Placed<E> = { entry: E; originalDate: string | null };

/** Where each duty sits in a calendar: dated ones on their day; overdue ones on today, each with its original date.
 * Undated ones are not placed: they are in the list only. Keeps the order given within a day, overdue ones last. */
export function placeEntries<E extends { date: string | null }>(schedule: { today: string; overdue: E[]; days: { date: string; entries: E[] }[] }): Map<string, Placed<E>[]> {
  const placed = new Map<string, Placed<E>[]>();
  const put = (day: string, p: Placed<E>) => placed.set(day, [...(placed.get(day) ?? []), p]);
  for (const d of schedule.days) for (const entry of d.entries) put(d.date, { entry, originalDate: null });
  for (const entry of schedule.overdue) put(schedule.today, { entry, originalDate: entry.date });
  return placed;
}

/** The day an arrow key moves to from a day (left and right one day, up and down one week), or null for any other
 * key. Stays inside the span. */
export function moveDay(day: string, key: string, span: { from: string; to: string }): string | null {
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (!(key in step)) return null;
  const next = addDays(day, step[key]);
  return inSpan(next, span) ? next : day;
}

/** The day to show when moving a week or month view one step: a week to the same weekday a week later, a month to
 * the first of the next. Returns null when the step would leave the span (the first and last day of the shown
 * period must both be known, apart from days of the neighbouring months). */
export function step(view: "week" | "month", anchor: string, by: -1 | 1, span: { from: string; to: string }, weekStart: WeekStart = 1): string | null {
  const next = view === "week" ? addDays(anchor, 7 * by) : addMonths(anchor, by);
  const first = view === "week" ? weekStartOf(next, weekStart) : next;
  const last = view === "week" ? addDays(first, 6) : addDays(addMonths(next, 1), -1);
  const ok = by === 1 ? first <= span.to : last >= span.from;
  return ok ? next : null;
}
