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

/** Access Keys of people, Feeds, and Feed Keys per Feed that a Trial Workspace may have working at once (the
 * database keeps the counts: access_keys_in_trial, feeds_in_trial). */
export const TRIAL_KEYS_MAX = 2;

/** The words for a trial's key and Feed limits, by the code the database raises. */
export function trialLimitMessage(code: string | undefined): string | null {
  if (code === "ZF431") return `A trial has at most ${TRIAL_KEYS_MAX} Access Keys that work. Revoke one to make another.`;
  if (code === "ZF432") return `A Feed in a trial has at most ${TRIAL_KEYS_MAX} keys that work. Revoke one to make another.`;
  if (code === "ZF433") return `A trial has at most ${TRIAL_KEYS_MAX} Feeds. Delete one to make another.`;
  return null;
}

/** Real messages a Trial Workspace may send in 24 hours, over all its Connectors together (claim_trial_send). */
export const TRIAL_DELIVERIES_PER_DAY = 50;

/** Why a trial keeps a Delivery in the Outbox, in words for the Outbox. */
export const TRIAL_HOLDS_BACK = {
  notOwner: "Kept in the Outbox: a trial sends only to its Owner.",
  ended: "Kept in the Outbox: this trial has ended.",
} as const;

/** Why a Delivery to this recipient may not leave the workspace for real, or null when it may (always outside a
 * trial). A trial reaches only its Owner (ADR 0010), and nobody once it has ended. Checked when a Delivery is made
 * and again by each Connector right before it sends, so one queued by any other path is still held back. */
export async function trialHoldsBack(workspaceId: string, recipientId: string): Promise<string | null> {
  const ends = await trialEndsAt(workspaceId);
  if (!ends) return null;
  if (ends.getTime() <= Date.now()) return TRIAL_HOLDS_BACK.ended;
  const { data } = await db().from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", recipientId).maybeSingle();
  return data?.role === "owner" ? null : TRIAL_HOLDS_BACK.notOwner;
}

/** Whether a workspace is a Trial Workspace that has ended: it takes no replies and sends nothing any more. */
export async function trialEnded(workspaceId: string): Promise<boolean> {
  const ends = await trialEndsAt(workspaceId);
  return ends !== null && ends.getTime() <= Date.now();
}

/** Moves a queued Delivery a trial holds back to the Outbox, with the reason, so it reads as kept, not as failed. */
export async function keepInOutbox(deliveryId: number, reason: string): Promise<"skipped"> {
  await db().from("deliveries").update({ mail_state: "outbox", last_error: reason }).eq("id", deliveryId).eq("mail_state", "queued");
  return "skipped";
}

/** Takes a queued Delivery's slot in its trial's daily limit, right before its Connector sends it: "ok" (also
 * outside a trial), "wait" (the limit is reached; it is tried again in an hour) or "gone". */
export async function claimTrialSend(deliveryId: number): Promise<"ok" | "wait" | "gone"> {
  const { data, error } = await db().rpc("claim_trial_send", { p_id: deliveryId, p_per_day: TRIAL_DELIVERIES_PER_DAY });
  if (error) throw new Error("The message could not be claimed for sending.");
  return data === "ok" || data === "wait" ? data : "gone";
}

/** Whether a new trial can be made right now on this Installation: false when trials are off or the cap is reached.
 * A count only, never which workspaces, so the login page may ask it for anyone. */
export async function trialsOpen(env: Record<string, string | undefined> = process.env): Promise<boolean> {
  let settings: { days: number; max: number } | null = null;
  try { settings = trialSettings(env); } catch { return false; }
  if (!settings) return false;
  const { count } = await db().from("workspaces").select("id", { count: "exact", head: true }).gt("trial_ends_at", new Date().toISOString());
  return (count ?? 0) < settings.max;
}
