// Retention, the words and the small rules around the setting (spec 0033, ticket #381; GLOSSARY: Retention, Condensed
// Value): what a setting is called in a sentence, when a change needs a fresh preview and confirmation, and the note a
// Metric shows while a confirmed Retention waits for its first day. Pure: it reads and writes nothing, so the pages and
// the core say the same thing. The rules of what a Retention does to which period are retention-rules.ts.
import { format } from "date-fns";
import { parseRetention, type Retention } from "./retention-rules";

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
export type PendingRetention = { id: string; retention: Retention; starts_on: string; starts_after: string; confirmed_on: string; set_by: string; counted: { periods: number; values: number }; told: boolean; reminded: boolean };

/** A pending Retention read back from what the database holds, or null when it holds none or something else. */
export function storedPending(value: unknown): PendingRetention | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const day = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const retention = storedRetention(v.retention);
  const c = v.counted as { periods?: unknown; values?: unknown } | null;
  const count = (x: unknown) => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
  const periods = count(c?.periods), values = count(c?.values);
  if (!retention || !day(v.starts_on) || !day(v.confirmed_on) || typeof v.set_by !== "string" || typeof v.id !== "string" || typeof v.starts_after !== "string" || Number.isNaN(Date.parse(v.starts_after)) || periods === null || values === null) return null;
  return { id: v.id, retention, starts_on: v.starts_on as string, starts_after: v.starts_after, confirmed_on: v.confirmed_on as string, set_by: v.set_by, counted: { periods, values }, told: v.told === true, reminded: v.reminded === true };
}

/** A day as people read it: "28 November 2026". */
export const dayWords = (day: string): string => format(new Date(`${day}T12:00:00`), "d MMMM yyyy");

/** What a Metric says while a Retention waits for its first day: which values go and from when. */
export function pendingNote(p: PendingRetention, keptFrom: string): string {
  const what = p.retention.then === "delete" ? "deleted" : `condensed into ${p.retention.into}s`;
  return `Values before ${dayWords(keptFrom)} will be ${what} from ${dayWords(p.starts_on)}.`;
}
