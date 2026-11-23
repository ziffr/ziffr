// @ts-nocheck
// The day and count settings of an Installation (spec 0025, ticket #517; GLOSSARY: Installation Settings): how long
// logs are kept, how long a trial's data waits, how long a Workspace may stay over its limit. One table of names, ranges
// and defaults, so the page, the checks and the jobs that delete things agree. Pure: nothing here reads a database.
// A value outside its range is never used, whatever put it there (a typo in the environment, an old row): the default
// applies instead, so a mistaken setting can shorten what is kept only down to the lower bound, never past it.
import type { Settings } from "./settings-in-effect";

/** A whole-number setting: its range and what applies without one (today's value). */
export type DaysSetting = { min: number; max: number; default: number; unit: "days" | "values" };

/** Every one, by its environment variable. The lower bounds protect the server and what must be kept; the upper ones
 * the database. */
export const DAYS_SETTINGS: Record<string, DaysSetting> = {
  ZIFFR_KEEP_ACCESS_LOG_DAYS: { min: 7, max: 730, default: 90, unit: "days" },
  ZIFFR_KEEP_AUDIT_DAYS: { min: 365, max: 3650, default: 730, unit: "days" },
  ZIFFR_KEEP_WEBHOOK_LOG_DAYS: { min: 1, max: 90, default: 14, unit: "days" },
  ZIFFR_KEEP_VIEW_COUNT_DAYS: { min: 90, max: 800, default: 400, unit: "days" },
  ZIFFR_RETENTION_VALUES_PER_RUN: { min: 500, max: 100_000, default: 5000, unit: "values" },
  ZIFFR_TRIAL_GRACE_DAYS: { min: 1, max: 60, default: 7, unit: "days" },
  ZIFFR_UNUSED_WAIT_DAYS: { min: 7, max: 90, default: 14, unit: "days" },
  ZIFFR_LIMIT_GRACE_DAYS: { min: 0, max: 90, default: 14, unit: "days" },
  ZIFFR_LIMIT_GRACE_EVERY_DAYS: { min: 0, max: 730, default: 90, unit: "days" },
};

/** Below this many days the Audit Log is a weaker record of who did what: the page says so, in plain words. */
export const AUDIT_WARN_BELOW_DAYS = 730;

/** What the Audit Log keeps whatever is set: the database refuses to remove a younger event (the lower bound). */
export const AUDIT_FLOOR_DAYS = DAYS_SETTINGS.ZIFFR_KEEP_AUDIT_DAYS.min;

/** The settings Ziffr Cloud pins on a Ziffr Cloud deployment (the hosted Installation): the Workspace Limits, the grace
 * values, the trial days and the wait before an unused Workspace goes. The page shows them as "set by Ziffr Cloud",
 * and only the server's environment gives them a value. */
export const CLOUD_PINNED = new Set([
  "ZIFFR_DEFAULT_METRICS_LIMIT", "ZIFFR_DEFAULT_LIMIT_LABEL", "ZIFFR_LIMIT_GRACE_DAYS", "ZIFFR_LIMIT_GRACE_EVERY_DAYS",
  "ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_GRACE_DAYS", "ZIFFR_DELETE_UNUSED_AFTER_DAYS", "ZIFFR_UNUSED_WAIT_DAYS",
]);

/** Whether this is a Ziffr Cloud deployment: the same test as cloud-api.ts's cloudEnabled (a ZIFFR_CLOUD_KEY of 32
 * bytes or more), repeated here because that file imports the settings. */
export const hostedByCloud = (env: Settings): boolean => Buffer.byteLength(env.ZIFFR_CLOUD_KEY ?? "", "utf8") >= 32;

/** Why a value is not one for this setting, in the page's words, or null when it is. */
export function daysProblem(name: string, value: string): string | null {
  const d = DAYS_SETTINGS[name];
  if (!d) return "That is not a setting with days.";
  const n = Number(value);
  if (/^\d{1,7}$/.test(value) && n >= d.min && n <= d.max) return null;
  const nouns = d.unit === "days" ? "a whole number of days" : "a whole number of values";
  return `Write ${nouns} from ${d.min.toLocaleString("en-US")} to ${d.max.toLocaleString("en-US")}.`;
}

/** The value in effect for a setting: the one written, or the default when none is written or it is out of range. */
export function daysSetting(name: string, settings: Settings): number {
  const d = DAYS_SETTINGS[name];
  const raw = settings[name]?.trim();
  return raw && !daysProblem(name, raw) ? Number(raw) : d.default;
}

/** The settings whose value is written but out of range, so the default applies: for the page, to say so. */
export function daysOutOfRange(settings: Settings): string[] {
  return Object.keys(DAYS_SETTINGS).filter((name) => {
    const raw = settings[name]?.trim();
    return !!raw && daysProblem(name, raw) !== null;
  });
}

/** Milliseconds in a day. */
export const DAY_MS = 86_400_000;
