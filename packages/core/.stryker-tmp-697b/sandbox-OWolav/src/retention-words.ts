// @ts-nocheck
// Retention, the words and the small rules around the setting (spec 0033, ticket #381; GLOSSARY: Retention, Condensed
// Value): what a setting is called in a sentence, when a change needs a fresh preview and confirmation, and the note a
// Metric shows while a confirmed Retention waits for its first day. Pure: it reads and writes nothing, so the pages and
// the core say the same thing. The rules of what a Retention does to which period are retention-rules.ts.
import { format } from "date-fns";
import { canCondense, parseRetention, type Retention, type RetentionMetric } from "./retention-rules";

/** The words people see when a changed numbers' preview no longer matches what the core finds. */
export const NUMBERS_CHANGED = "The numbers changed; look again.";

/** The word a person types to confirm a delete for the whole Workspace (for one Metric they type its name). */
export const DELETE_WORD = "delete";

/** A Retention in a sentence: "keep 25 months, then condense into months", "keep 3 years, then delete". */
export function retentionWords(r: Retention | null): string {
  if (!r) return "none: values are kept for ever";
  const keep = r.keep_months % 12 === 0 ? `${r.keep_months / 12} ${r.keep_months === 12 ? "year" : "years"}` : `${r.keep_months} months`;
  return r.then === "delete" ? `keep ${keep}, then delete` : `keep ${keep}, then condense into ${r.into}s`;
}

/** Whether changing the Retention in force from `from` to `to` needs a fresh preview and a confirmation: turning it
 * on, keeping values for less time, condensing into another period, or going from condensing to deleting. Making it
 * longer, turning it off, and going from deleting to condensing (which keeps more) need none. */
export function needsConfirmation(from: Retention | null, to: Retention | null): boolean {
  if (!to) return false;
  if (!from) return true;
  if (to.keep_months < from.keep_months) return true;
  if (from.then === "condense" && to.then === "delete") return true;
  return from.then === "condense" && to.then === "condense" && from.into !== to.into;
}

/** A Retention read back from what the database holds (a column that no code of ours wrote is read as none). */
export function storedRetention(value: unknown): Retention | null {
  const parsed = parseRetention(value ?? null);
  return parsed.ok ? parsed.retention : null;
}

/** A confirmed Retention that has not started: the setting, its first day, who confirmed it and on what day, and what the
 * person was shown (`counted`: the periods and values it would have touched then; the daily job must not take more than
 * that without a new confirmation). `id` names this confirmation, so a cancel or a start cannot hit a newer one;
 * `starts_after` is the instant it may start at the earliest (7 days on, whatever the Workspace's clock says by then). */
export type PendingRetention = { id: string; retention: Retention; starts_on: string; starts_after: string; confirmed_on: string; set_by: string; counted: Counted; told: boolean; reminded: boolean };

/** What a person was shown when they confirmed: the periods and values the Retention would touch, and those it left alone
 * because open work held them (they may be freed later; the confirmation said so). */
export type Counted = { periods: number; values: number; held_back_periods: number; held_back_values: number };

/** A pending Retention read back from what the database holds, or null when it holds none or something else. */
export function storedPending(value: unknown): PendingRetention | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const day = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const retention = storedRetention(v.retention);
  const c = v.counted as Record<string, unknown> | null;
  const count = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
  const periods = count(c?.periods), values = count(c?.values);
  // Held-back counts came with the daily job: a confirmation made before has none, which reads as none.
  const heldPeriods = c?.held_back_periods === undefined ? 0 : count(c.held_back_periods), heldValues = c?.held_back_values === undefined ? 0 : count(c.held_back_values);
  if (!retention || !day(v.starts_on) || !day(v.confirmed_on) || typeof v.set_by !== "string" || typeof v.id !== "string" || typeof v.starts_after !== "string" || Number.isNaN(Date.parse(v.starts_after)) || periods === null || values === null || heldPeriods === null || heldValues === null) return null;
  return { id: v.id, retention, starts_on: v.starts_on as string, starts_after: v.starts_after, confirmed_on: v.confirmed_on as string, set_by: v.set_by, counted: { periods, values, held_back_periods: heldPeriods, held_back_values: heldValues }, told: v.told === true, reminded: v.reminded === true };
}

/** A day as people read it: "28 November 2026". */
export const dayWords = (day: string): string => format(new Date(`${day}T12:00:00`), "d MMMM yyyy");

/** What a Metric says while a Retention waits for its first day: which values go and from when. */
export function pendingNote(p: PendingRetention, keptFrom: string): string {
  const what = p.retention.then === "delete" ? "deleted" : `condensed into ${p.retention.into}s`;
  return `Values before ${dayWords(keptFrom)} will be ${what} from ${dayWords(p.starts_on)}.`;
}

/** What a Retention in force may take, from the confirmation it started from: the day and id of that confirmation and
 * what the person was shown. The daily job never takes more of the old periods and values than this without a new
 * confirmation; it is copied when the Retention starts, so cancelling or confirming again cannot change a running one. */
export type RetentionCap = { id: string; confirmed_on: string; periods: number; values: number; held_back_periods: number; held_back_values: number };

/** The cap a confirmation sets when its Retention starts. */
export function capOf(p: Pick<PendingRetention, "id" | "confirmed_on" | "counted">): RetentionCap {
  return { id: p.id, confirmed_on: p.confirmed_on, periods: p.counted.periods, values: p.counted.values, held_back_periods: p.counted.held_back_periods, held_back_values: p.counted.held_back_values };
}

/** A cap read back from what the database holds, or null when there is none or it is not one: a Retention without a
 * readable cap is never run. */
export function storedCap(value: unknown): RetentionCap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const count = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
  const periods = count(v.periods), values = count(v.values), hp = count(v.held_back_periods), hv = count(v.held_back_values);
  if (typeof v.id !== "string" || typeof v.confirmed_on !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v.confirmed_on) || periods === null || values === null || hp === null || hv === null) return null;
  return { id: v.id, confirmed_on: v.confirmed_on, periods, values, held_back_periods: hp, held_back_values: hv };
}

/** A Retention as a program reads it on a Metric (GLOSSARY: Retention): the setting in force and the one confirmed but
 * not yet started with its first day. Never who confirmed it or the counts it was shown. */
export type ApiRetention = { retention: Retention | null; retention_pending: (Retention & { starts_on: string }) | null };

/** The Retention fields of a Metric as stored, for the API and the MCP Server: only the setting and the first day. */
export function retentionForApi(retention: unknown, pending: unknown): ApiRetention {
  const p = storedPending(pending);
  return { retention: storedRetention(retention), retention_pending: p ? { ...p.retention, starts_on: p.starts_on } : null };
}

/** A suggested setting as a link carries it ("condense.24.month", "delete.36"): the Usage page sends it, the Metric page
 * reads it back through the same checks as any browser input, so a made-up link can only ever pre-fill a form. */
export function retentionToParam(r: Retention): string {
  return r.then === "delete" ? `delete.${r.keep_months}` : `condense.${r.keep_months}.${r.into}`;
}

/** The setting a link carries, or null when it carries none that is valid. */
export function retentionFromParam(param: unknown): Retention | null {
  if (typeof param !== "string" || param.length > 40) return null;
  const [then, keep, into, ...rest] = param.split(".");
  if (rest.length || !/^\d{1,4}$/.test(keep ?? "") || (then === "delete" && into !== undefined)) return null;
  const parsed = parseRetention(then === "delete" ? { keep_months: Number(keep), then } : { keep_months: Number(keep), then, into });
  return parsed.ok ? parsed.retention : null;
}

/** Values a Metric must hold past the suggested keep time before Usage suggests a Retention: under a year of daily values
 * the saving is not worth a person's attention. */
export const SUGGEST_MIN_VALUES = 365;
/** The keep time Usage suggests: two years, one of the form's own choices. */
export const SUGGEST_KEEP_MONTHS = 24;

/** The Retention Usage suggests for a Metric nobody has looked at: only values that can be condensed (never a rate or a
 * Derived Metric), and only daily or weekly ones, where old detail piles up: days into months, weeks into quarters. Null
 * when nothing fits. It is a suggestion, shown in the form with its counts; nothing is set by it. */
export function suggestedRetention(metric: RetentionMetric): Retention | null {
  if (!canCondense(metric)) return null;
  if (metric.period === "day") return { keep_months: SUGGEST_KEEP_MONTHS, then: "condense", into: "month" };
  if (metric.period === "week") return { keep_months: SUGGEST_KEEP_MONTHS, then: "condense", into: "quarter" };
  return null;
}
