// How long the Audit Log keeps an event (spec 0008, ticket #517; GLOSSARY: Audit Log, Retention, Approval). The days are
// an Installation Setting (ZIFFR_KEEP_AUDIT_DAYS, 365 to 3,650, default 730). The setting never takes the Audit Log
// below the age of an event that a Retention or an Approval still refers to: the events of a Metric that has a Retention
// (its setting, its confirmation, its runs and the export before deleting) and of a Metric with an Approval open, whose
// story of a period (period-record.ts) is told from them. Server only; never reached by a key.
import { db } from "./db";
import { AUDIT_FLOOR_DAYS, DAY_MS, daysSetting } from "./installation-days";
import { settingsInEffect, settingsInEffectStrict, type Settings } from "./settings-in-effect";

/** The events of a Metric that has a Retention, which its runs and its confirmation are read from. */
const RETENTION_KINDS = ["metric.retention_set", "metric.retention_cancelled", "retention.run", "retention.mismatch", "retention.needs_confirmation", "retention.stopped", "export.retention_values"];
/** The events a period's record shows for a Metric whose Approval is open (the same kinds as period-record.ts, and a Filled-in Value, which its Period Record step will tell from it: spec 0046). */
const APPROVAL_KINDS = ["approval.given", "approval.sent_back", "approval.skipped", "self_check.confirmed", "self_check.corrected", "correction.accepted", "correction.declined", "period.locked", "period.unlocked", "value.filled_in"];

const CHUNK = 200;
const PAGE = 1000;

/** Ids of the Metrics a query names, a page at a time. */
async function idsOf(read: (from: number, to: number) => PromiseLike<{ data: { [k: string]: unknown }[] | null; error: unknown }>, column: string): Promise<number[]> {
  const ids = new Set<number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await read(from, from + PAGE - 1);
    if (error) throw new Error("The Audit Log's references could not be read.");
    for (const r of data ?? []) ids.add(Number(r[column]));
    if ((data?.length ?? 0) < PAGE) return [...ids];
  }
}

/** The age in days of the oldest event a Retention or an Approval still refers to, rounded up; 0 when none does.
 * Throws when it cannot be found out: whatever deletes on it then does not. */
export async function referencedAuditAgeDays(now = new Date()): Promise<number> {
  const [retained, approving] = await Promise.all([
    idsOf((a, b) => db().from("metrics").select("id").not("retention", "is", null).order("id").range(a, b), "id"),
    idsOf((a, b) => db().from("period_states").select("metric_id").eq("state", "approval").order("metric_id").range(a, b), "metric_id"),
  ]);
  let oldest: number | null = null;
  for (const [ids, kinds] of [[retained, RETENTION_KINDS], [approving, APPROVAL_KINDS]] as const) {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data, error } = await db().from("audit_events").select("at").eq("object_type", "metric").in("object_id", ids.slice(i, i + CHUNK).map(String)).in("kind", kinds).order("at").limit(1);
      if (error) throw new Error("The Audit Log's references could not be read.");
      const at = data?.[0]?.at ? new Date(String(data[0].at)).getTime() : null;
      if (at !== null && (oldest === null || at < oldest)) oldest = at;
    }
  }
  return oldest === null ? 0 : Math.max(0, Math.ceil((now.getTime() - oldest) / DAY_MS));
}

/** The days the setting says, never below the floor the database keeps (365). */
export const auditKeepSetting = (settings: Settings): number => Math.max(AUDIT_FLOOR_DAYS, daysSetting("ZIFFR_KEEP_AUDIT_DAYS", settings));

// What the oldest reference was, found at most every ten minutes per process: the Audit Log is written to often.
let referenced: { days: number; at: number } | null = null;

/** The days an event is kept now: the setting in effect (strict: unreadable settings throw, never turn into a guess)
 * or, if more, the age of the oldest event a Retention or an Approval refers to. Used by what deletes. */
export async function auditKeepDays(now = new Date()): Promise<number> {
  const setting = auditKeepSetting(await settingsInEffectStrict());
  if (!referenced || now.getTime() - referenced.at > 600_000) referenced = { days: await referencedAuditAgeDays(now), at: now.getTime() };
  return Math.max(setting, referenced.days);
}

/** Forgets the cached reference (after a save, in tests). */
export function forgetAuditReference(): void { referenced = null; }

/** The refusal for lowering the Audit Log below what is still referred to, or null when `days` is fine. Read fresh. */
export async function auditKeepRefusal(days: number, now = new Date()): Promise<string | null> {
  const needed = await referencedAuditAgeDays(now);
  if (days >= needed) return null;
  return `The Audit Log cannot be kept for only ${days.toLocaleString("en-US")} days: a Retention or an Approval still refers to an event ${needed.toLocaleString("en-US")} days old. Keep it at least ${needed.toLocaleString("en-US")} days, or cancel the Retention or decide the Approval first.`;
}

/** How long events are kept, in words for the Audit Log page: "2 years", "400 days". The setting only: it is no secret. */
export async function auditKeptWords(): Promise<string> {
  const days = auditKeepSetting(await settingsInEffect());
  return days % 365 === 0 ? `${days / 365} year${days === 365 ? "" : "s"}` : `${days.toLocaleString("en-US")} days`;
}
