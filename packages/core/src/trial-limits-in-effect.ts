// The Trial Limits in effect (spec 0040; GLOSSARY: Trial Limit): the environment first, then what Ziffr Cloud or an
// Installation Admin saved, then the default, as every Installation Setting. The database triggers read one row
// (`trial_limits`), which is written from the numbers here before anything they guard is made, so a change by Ziffr
// Cloud, the page or the environment applies to running trials without a release. The row holds the Installation's numbers
// only, never a Workspace's. Server only.
import { db } from "./db";
import { settingsInEffect, settingsInEffectNow, settingsInEffectStrict } from "./settings-in-effect";
import { TRIAL_LIMIT_COLUMNS, trialLimitsFrom, type TrialLimitNumbers } from "./trial-limits";

/** The Trial Limits now. */
export async function trialLimitsInEffect(): Promise<TrialLimitNumbers> {
  return trialLimitsFrom(await settingsInEffect());
}

/** The Trial Limits as last read (a few seconds old at most), for the words of an error made deep in a call. */
export const trialLimitsNow = (): TrialLimitNumbers => trialLimitsFrom(settingsInEffectNow());

/** How long the row is trusted to match the settings before they are compared again. */
const SYNC_EVERY_MS = 5_000;
let synced: { key: string; at: number } | null = null;

/** Writes the numbers the database enforces into its one row when they differ, so a trigger never counts against a
 * stale number. Called before a Metric, key, Feed or View Link of a trial is made, and when a Trial Limit is saved.
 * Strict: what the database enforces is never written from a guess; when the settings cannot be read, the row stays as it is. */
export async function syncTrialLimits(force = false): Promise<void> {
  let numbers: TrialLimitNumbers;
  try { numbers = trialLimitsFrom(await settingsInEffectStrict()); } catch { return; }
  const row = Object.fromEntries(Object.entries(TRIAL_LIMIT_COLUMNS).map(([key, column]) => [column, numbers[key as keyof typeof TRIAL_LIMIT_COLUMNS]]));
  const key = JSON.stringify(row);
  if (!force && synced && synced.key === key && Date.now() - synced.at < SYNC_EVERY_MS) return;
  const { data } = await db().from("trial_limits").select("metrics, keys, feeds, assistants, view_links").eq("only_row", true).maybeSingle();
  if (!data || Object.entries(row).some(([column, n]) => (data as Record<string, number>)[column] !== n)) {
    const { error } = await db().from("trial_limits").upsert({ only_row: true, ...row, updated_at: new Date().toISOString() });
    if (error) throw new Error("The Trial Limits could not be saved.");
  }
  synced = { key, at: Date.now() };
}

/** Forgets that the row was written, so the next call compares again (tests). */
export function forgetTrialLimitsSync(): void {
  synced = null;
}
