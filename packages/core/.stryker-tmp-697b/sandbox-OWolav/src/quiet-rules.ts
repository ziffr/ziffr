// @ts-nocheck
// Quiet Hours, the rules (ticket #519; GLOSSARY: Quiet Hours): when a clock time falls inside a person's quiet hours and
// when they end. Pure: no database, no clock of its own, so the settings form can import it too. Days and hours are the
// local ones of a time zone, worked out for every step from the real instant, so a clock change neither shortens nor
// repeats a quiet period.

/** One set of quiet hours: from `fromHour` up to, not including, `toHour` (past midnight when from is later; equal means
 * no hours), and `days` (0 Sunday to 6 Saturday) that are quiet from midnight to midnight. `timeZone` null is the Workspace's. */
export type QuietRule = { fromHour: number; toHour: number; days: number[]; timeZone: string | null };

/** The rule that is never quiet: what a person sets to opt out of the Workspace's default. */
export const NEVER_QUIET: QuietRule = { fromHour: 0, toHour: 0, days: [], timeZone: null };

/** Whether a rule is quiet at no time. */
export const neverQuiet = (r: QuietRule) => r.fromHour === r.toHour && r.days.length === 0;

/** The weekday names, Sunday first as the rule counts them. */
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/** Checks an untrusted rule and returns it clean (days sorted, once each), or the reason in words for the person. */
export function checkRule(input: unknown, knownZone: (name: unknown) => boolean): QuietRule | string {
  const r = input as Partial<Record<keyof QuietRule, unknown>> | null;
  if (typeof r !== "object" || r === null) return "Quiet hours are missing.";
  const hour = (h: unknown) => typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23;
  if (!hour(r.fromHour) || !hour(r.toHour)) return "Pick hours from 0 to 23.";
  if (!Array.isArray(r.days) || r.days.length > 7 || !r.days.every((d) => typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6)) return "Pick days from Sunday to Saturday.";
  const days = [...new Set(r.days as number[])].sort((a, b) => a - b);
  // Ziffr never holds a message for good, so one day at least stays open.
  if (days.length === 7) return "Leave at least one day without quiet hours, or messages could never be sent.";
  if (r.timeZone !== null && r.timeZone !== undefined && !knownZone(r.timeZone)) return "Pick a time zone from the list.";
  return { fromHour: r.fromHour as number, toHour: r.toHour as number, days, timeZone: (r.timeZone as string | null | undefined) ?? null };
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The local weekday (0 Sunday), hour and minute of an instant in a time zone. */
function localClock(instant: Date, timeZone: string): { weekday: number; hour: number; minute: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant).map((p) => [p.type, p.value]));
  return { weekday: WEEKDAY_INDEX[parts.weekday], hour: Number(parts.hour), minute: Number(parts.minute) };
}

/** Whether a local weekday and hour are quiet under a rule. */
export function isQuietAt(rule: QuietRule, weekday: number, hour: number): boolean {
  if (rule.days.includes(weekday)) return true;
  if (rule.fromHour === rule.toHour) return false;
  return rule.fromHour < rule.toHour ? hour >= rule.fromHour && hour < rule.toHour : hour >= rule.fromHour || hour < rule.toHour;
}

/** When the quiet hours that cover an instant end (the start of the first local hour that is not quiet), or null when
 * the instant is not in quiet hours. `timeZone` is the one to use when the rule names none. */
export function quietEnd(rule: QuietRule, instant: Date, timeZone: string): Date | null {
  const zone = rule.timeZone ?? timeZone;
  const quietNow = (t: Date) => { const c = localClock(t, zone); return isQuietAt(rule, c.weekday, c.hour); };
  if (!quietNow(instant)) return null;
  // Step to the start of each next local hour (whole minutes, so zones on a half hour line up too). Six free days and at
  // least one free hour a day mean the end comes within a week; the cap only means a message that somehow met rules with
  // no end still goes out, a week later, and is never held for good.
  let t = instant;
  for (let i = 0; i < 8 * 24 && quietNow(t); i++) {
    const { minute } = localClock(t, zone);
    t = new Date(Math.floor(t.getTime() / 60_000) * 60_000 + (60 - minute) * 60_000);
  }
  return t;
}
