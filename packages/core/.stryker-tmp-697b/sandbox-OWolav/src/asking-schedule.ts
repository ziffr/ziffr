// @ts-nocheck
// The Asking Schedule (spec 0035, ticket #361; GLOSSARY: Asking Schedule, Workflow, Due Date): the time of day and the
// days a Workflow runs on its own. Pure: the job, the Workflow editor and the tests all ask these functions which days
// are run days and when the next one is. Days are calendar days (YYYY-MM-DD) in the Workspace's time zone, worked on
// with UTC arithmetic so a clock change never moves a day.
import type { AskingDays, AskingSchedule, Period } from "./types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS = 86_400_000;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The fewest days apart that "every N days" may be. */
export const EVERY_N_MIN = 2;
/** The most days apart that "every N days" may be. */
export const EVERY_N_MAX = 90;

/** A day as a number of days since 1970, or null when the text is not a real day. */
function dayNumber(day: unknown): number | null {
  if (typeof day !== "string" || !DAY.test(day)) return null;
  const t = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== day ? null : t / MS;
}

/** The weekday of a day, 1 (Monday) to 7 (Sunday). */
export function weekdayOf(day: string): number {
  return ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
}

/** How many days the month a day is in has. */
function daysInMonthOf(day: string): number {
  const [y, m] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The day `n` days after `day` (before, when negative). */
export function addDaysTo(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * MS).toISOString().slice(0, 10);
}

/** A setting from the outside (a browser, a stored config) made safe: only known shapes and sane numbers, anything
 * extra dropped. Undefined when there is none; throws a sentence saying what to change when it is not valid. */
export function cleanAsking(v: unknown): AskingSchedule | undefined {
  if (v === undefined || v === null) return undefined;
  const bad = (what: string) => new Error(`The asking schedule is not valid: ${what}`);
  if (typeof v !== "object" || Array.isArray(v)) throw bad("it must say the hour and the days.");
  const { hour, days } = v as { hour?: unknown; days?: unknown };
  if (hour !== null && hour !== undefined && (typeof hour !== "number" || !Number.isInteger(hour) || hour < 0 || hour > 23)) throw bad("the hour is a whole number from 0 to 23.");
  if (typeof days !== "object" || days === null || Array.isArray(days)) throw bad("choose the days.");
  const d = days as Record<string, unknown>;
  const clean = ((): AskingDays => {
    switch (d.kind) {
      case "every_day": return { kind: "every_day" };
      case "weekdays": return { kind: "weekdays" };
      case "chosen_weekdays": {
        const list = Array.isArray(d.days) ? d.days : [];
        if (list.length < 1 || list.length > 7 || !list.every((x) => typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 7)) throw bad("choose at least one weekday.");
        return { kind: "chosen_weekdays", days: [...new Set(list as number[])].sort((a, b) => a - b) };
      }
      case "every_n_days": {
        const n = d.n;
        if (typeof n !== "number" || !Number.isInteger(n) || n < EVERY_N_MIN || n > EVERY_N_MAX) throw bad(`every ${EVERY_N_MIN} to ${EVERY_N_MAX} days.`);
        const year = dayNumber(d.from) === null ? null : Number(String(d.from).slice(0, 4));
        if (year === null || year < 2000 || year > 2100) throw bad("pick the day it starts on.");
        return { kind: "every_n_days", n, from: d.from as string };
      }
      case "month_day": {
        const m = d.day;
        if (m !== "last" && (typeof m !== "number" || !Number.isInteger(m) || m < 1 || m > 31)) throw bad("a day of the month from 1 to 31, or the last.");
        return { kind: "month_day", day: m as number | "last" };
      }
      default: throw bad("choose the days.");
    }
  })();
  return { hour: hour === undefined ? null : (hour as number | null), days: clean };
}

/** Whether a Workflow with these days runs on a day. */
export function isAskingDay(days: AskingDays, day: string): boolean {
  switch (days.kind) {
    case "every_day": return true;
    case "weekdays": return weekdayOf(day) <= 5;
    case "chosen_weekdays": return days.days.includes(weekdayOf(day));
    case "every_n_days": {
      const at = dayNumber(day);
      const from = dayNumber(days.from);
      return at !== null && from !== null && at >= from && (at - from) % days.n === 0;
    }
    case "month_day": {
      const dom = Number(day.slice(8, 10));
      // A day the month does not have runs on the month's last day.
      return dom === (days.day === "last" ? daysInMonthOf(day) : Math.min(days.day, daysInMonthOf(day)));
    }
  }
}

/** The hour a schedule runs at: its own, or the Workspace's run hour when it has none. */
export function askingHour(s: AskingSchedule, workspaceRunHour: number): number {
  return s.hour ?? workspaceRunHour;
}

/** Whether a Workflow with this schedule is due now: today is a run day and its hour has come. `local` is the
 * Workspace's day and hour now. The hour is "at or after", so an hour a clock change skipped runs in the next one. */
export function isAskingDue(s: AskingSchedule, workspaceRunHour: number, local: { day: string; hour: number }): boolean {
  return isAskingDay(s.days, local.day) && local.hour >= askingHour(s, workspaceRunHour);
}

/** The first run day on or after a day, or null when there is none within two years (an every-N-days start far away). */
export function nextAskingDay(days: AskingDays, from: string): string | null {
  for (let i = 0; i <= 800; i++) {
    const d = addDaysTo(from, i);
    if (isAskingDay(days, d)) return d;
  }
  return null;
}

/** The next time it runs, as a day: today when today is a run day whose hour has not come yet, else the next run
 * day. `local` is the Workspace's day and hour now. */
export function nextAskingRun(s: AskingSchedule, workspaceRunHour: number, local: { day: string; hour: number }): string | null {
  const start = isAskingDay(s.days, local.day) && local.hour >= askingHour(s, workspaceRunHour) ? addDaysTo(local.day, 1) : local.day;
  return nextAskingDay(s.days, start);
}

/** The most days between two run days (a run day to the next), which is how long a period or a Due Date can pass
 * unasked. */
export function longestGap(days: AskingDays): number {
  switch (days.kind) {
    case "every_day": return 1;
    case "weekdays": return 3;
    case "chosen_weekdays": {
      const w = days.days;
      return Math.max(...w.map((d, i) => (i === w.length - 1 ? w[0] + 7 - d : w[i + 1] - d)));
    }
    case "every_n_days": return days.n;
    case "month_day": return 31;
  }
}

/** A Metric's period in days, at its longest: a gap longer than that can let a whole period end unasked. */
const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 31, quarter: 92, year: 366 };

/** What to tell the Workflow's owner about a schedule, in words: periods it would skip, and Due Dates it can miss. */
export function askingWarnings(s: AskingSchedule, periods: Period[], dueWorkingDays: number): string[] {
  const gap = longestGap(s.days);
  const out: string[] = [];
  if (periods.some((p) => gap > PERIOD_DAYS[p])) out.push("Metrics with a short period are asked for the last period only; the periods in between are not asked for.");
  if (gap > Math.max(0, dueWorkingDays) + 1) out.push("On this schedule a Prompt can reach people after the Due Date.");
  return out;
}

const two = (n: number) => String(n).padStart(2, "0");

/** The days in words, such as "every third day from 1 December 2026" or "Monday and Thursday". */
export function describeDays(days: AskingDays): string {
  switch (days.kind) {
    case "every_day": return "every day";
    case "weekdays": return "every weekday";
    case "chosen_weekdays": {
      const names = days.days.map((d) => WEEKDAY[d % 7]);
      return names.length === 1 ? `every ${names[0]}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    }
    case "every_n_days": {
      const [y, m, d] = days.from.split("-").map(Number);
      return `${days.n === 2 ? "every second day" : days.n === 3 ? "every third day" : `every ${days.n} days`} from ${d} ${MONTH[m - 1]} ${y}`;
    }
    case "month_day": return days.day === "last" ? "on the last day of the month" : `on the ${days.day}${[11, 12, 13].includes(days.day % 100) ? "th" : ["th", "st", "nd", "rd"][days.day % 10] ?? "th"} of the month`;
  }
}

/** A schedule in a sentence: "Runs every third day from 1 December 2026 at 14:00 (Europe/Berlin)." */
export function describeAsking(s: AskingSchedule, workspaceRunHour: number, timeZone: string): string {
  return `Runs ${describeDays(s.days)} at ${two(askingHour(s, workspaceRunHour))}:00 (${timeZone.replace(/_/g, " ")}).`;
}
