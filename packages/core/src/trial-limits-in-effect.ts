// The Trial Limits in effect (spec 0040; GLOSSARY: Trial Limit): the environment first, then what Ziffr Cloud or an
// Installation Admin saved, then the default, as every Installation Setting. The database triggers read one row
// (`trial_limits`) of the Installation's numbers, never a Workspace's. That row is written in exactly two kinds of
// places, both inside the database: the functions that save a Trial Limit (Ziffr Cloud's call, the page's save), in the
// same transaction as the setting, and the hourly trial job, which brings it in line with a changed environment. Never from
// the paths that make a Metric, key, Feed or View Link, so a failed write can block none of them. Server only.
import { db } from "./db";
import { settingsInEffect, settingsInEffectNow } from "./settings-in-effect";
import { TRIAL_LIMIT_COLUMNS, trialLimitOf, trialLimitsFrom, type TrialLimitNumbers } from "./trial-limits";

/** The Trial Limits now. */
export async function trialLimitsInEffect(): Promise<TrialLimitNumbers> {
  return trialLimitsFrom(await settingsInEffect());
}

/** The Trial Limits as last read (a few seconds old at most), for the words of an error made deep in a call. */
export const trialLimitsNow = (): TrialLimitNumbers => trialLimitsFrom(settingsInEffectNow());

/** What the server's environment sets of the limits the database enforces, for the functions that write the row: the
 * database cannot read the environment. Values are passed as text and checked against their range there. */
export function trialLimitEnvironment(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(TRIAL_LIMIT_COLUMNS)) {
    const name = trialLimitOf(key as keyof typeof TRIAL_LIMIT_COLUMNS).name;
    const value = env[name]?.trim();
    if (value) out[name] = value.slice(0, 12);
  }
  return out;
}

/** Brings the row the triggers read in line with the settings and the environment, for the hourly trial job. */
export async function syncTrialLimits(): Promise<void> {
  const { error } = await db().rpc("refresh_trial_limits", { p_env: trialLimitEnvironment() });
  if (error) throw new Error("The Trial Limits could not be saved.");
}
