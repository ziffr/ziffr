// Trial Workspaces (spec 0021, GLOSSARY: Trial Workspace). An Installation offers them with ZIFFR_TRIAL_DAYS; then every
// workspace made on it is one, owned by one person and reaching nobody else, so nothing here asks a person whether
// they want a trial. The cap and "one per person" are checked in one locked database step (create_trial_workspace).
import { db } from "./db";
import { Forbidden } from "./actor";

/** Live Trial Workspaces an Installation holds unless ZIFFR_TRIAL_MAX says otherwise. */
export const DEFAULT_TRIAL_MAX = 200;

/** The Installation's trial settings: null when ZIFFR_TRIAL_DAYS is not set. A setting that is there but wrong (days
 * outside 1 to 30, a cap that is not a positive whole number) throws instead of counting as unset: an operator who
 * meant to offer trials must never end up offering ordinary workspaces, with invitations, to strangers. */
export function trialSettings(env: Record<string, string | undefined> = process.env): { days: number; max: number } | null {
  const rawDays = env.ZIFFR_TRIAL_DAYS?.trim();
  if (!rawDays) return null;
  const days = Number(rawDays);
  if (!/^\d+$/.test(rawDays) || days < 1 || days > 30) throw new Error("ZIFFR_TRIAL_DAYS must be a whole number from 1 to 30; no workspace is made until it is.");
  const rawMax = env.ZIFFR_TRIAL_MAX?.trim();
  if (!rawMax) return { days, max: DEFAULT_TRIAL_MAX };
  const max = Number(rawMax);
  if (!/^\d+$/.test(rawMax) || max < 1) throw new Error("ZIFFR_TRIAL_MAX must be a whole number from 1; no workspace is made until it is.");
  return { days, max };
}

/** Why a Trial Workspace could not be made, in words for the welcome page. */
export class TrialRefused extends Error {
  constructor(readonly reason: "full" | "taken") {
    super(reason === "full"
      ? "All trials on this Ziffr are taken right now. Look around the demo, or try again in a few days."
      : "You already have a trial on this Ziffr. Each person gets one.");
  }
}

/** Makes a Trial Workspace owned by the person and returns its id. Throws TrialRefused when the cap is reached or the
 * person already belongs to a workspace. The caller adds what every new workspace gets (its starter Theme). */
export async function createTrialWorkspace(personId: string, name: string, settings: { days: number; max: number }): Promise<string> {
  const { data, error } = await db().rpc("create_trial_workspace", { p_person: personId, p_name: name, p_days: settings.days, p_max: settings.max });
  if (error || typeof data !== "string") throw new Error("The workspace could not be created.");
  if (data === "full" || data === "taken") throw new TrialRefused(data);
  return data.slice("ok:".length);
}

/** When a workspace's trial ends, or null when it is not a Trial Workspace. */
export async function trialEndsAt(workspaceId: string): Promise<Date | null> {
  const { data } = await db().from("workspaces").select("trial_ends_at").eq("id", workspaceId).maybeSingle();
  return data?.trial_ends_at ? new Date(data.trial_ends_at as string) : null;
}

/** Refuses anything that would bring a second person into a Trial Workspace: a trial reaches only its Owner. */
export async function assertNotTrial(workspaceId: string, what = "This"): Promise<void> {
  if (await trialEndsAt(workspaceId)) throw new Forbidden(`${what} is not possible in a trial: a trial is for its Owner alone.`);
}
