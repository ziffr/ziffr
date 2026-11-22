// Trial Workspaces (spec 0021, GLOSSARY: Trial Workspace). Only hosted Ziffr offers them (spec 0040, ADR 0015): where
// ZIFFR_CLOUD_KEY is set and ZIFFR_TRIAL_DAYS gives a number of days; then every
// workspace made on it is one, owned by one person and reaching nobody else, so nothing here asks a person whether
// they want a trial. The cap and "one per person" are checked in one locked database step (create_trial_workspace).
import { db } from "./db";
import { Forbidden } from "./actor";
import { hostedByCloud } from "./installation-days";
import { settingsInEffect, settingsInEffectStrict, storedSettings } from "./settings-in-effect";
import { trialLimitFrom, trialLimitOf } from "./trial-limits";
import { trialLimitsInEffect, trialLimitsNow } from "./trial-limits-in-effect";

/** Live Trial Workspaces an Installation holds unless the Trial Limit "Trials at once" says otherwise. */
export const DEFAULT_TRIAL_MAX = trialLimitOf("max").default;

/** The trial settings the Installation has now, from the environment, the Installation settings page or the
 * default; null when trials are not offered. A wrong value throws, as trialSettings says. */
export async function trialSettingsInEffect(): Promise<{ days: number; max: number } | null> {
  // A row an older version saved on the Installation settings page counts as "set" too: without a Ziffr Cloud key it
  // makes no trial, and must not quietly turn sign-ins into ordinary Workspaces either.
  if (!hostedByCloud(process.env) && (await storedSettings()).values.get("ZIFFR_TRIAL_DAYS")?.trim()) throw trialDaysWithoutCloud();
  // The strict read: if the stored settings cannot be read, this throws and no trial is made. On hosted Ziffr "trials
  // off" lives only in a row Ziffr Cloud wrote, so falling back to the environment alone would switch trials back on.
  return trialSettings(await settingsInEffectStrict());
}

/** The refusal for trial days set without a Ziffr Cloud key: in the words of a person who signs in, who has no use for
 * setting names; the server's log names them for the operator. */
function trialDaysWithoutCloud(): Error {
  console.error("ZIFFR_TRIAL_DAYS is set, but trials exist only on hosted Ziffr (ZIFFR_CLOUD_KEY is not set): no Workspace is made until the days are removed.");
  return new Error("New Workspaces cannot be made here right now; ask whoever runs this Ziffr.");
}

/** The one rule for trials (spec 0040): true only on hosted Ziffr (a ZIFFR_CLOUD_KEY) with a valid number of trial days (14 unless set, 0 for none).
 * Everything that makes a trial, shows trial words or reads a ZIFFR_TRIAL_* setting asks this or trialSettings, which
 * gives the same answer. Not a lock against someone who edits the source: it is what the product offers by itself. */
export function trialsOffered(env: Record<string, string | undefined> = process.env): boolean {
  try { return trialSettings(env) !== null; } catch { return false; }
}

/** The Installation's trial settings: null without a Ziffr Cloud key (no trials; the days and the cap are not read, and
 * a ZIFFR_TRIAL_DAYS that is set anyway throws) or when ZIFFR_TRIAL_DAYS is not set. On hosted Ziffr a setting that is there but wrong (days
 * outside 1 to 30, a cap that is not a positive whole number) throws instead of counting as unset: an operator who
 * meant to offer trials must never end up offering ordinary workspaces, with invitations, to strangers. */
export function trialSettings(env: Record<string, string | undefined> = process.env): { days: number; max: number } | null {
  if (!hostedByCloud(env)) {
    // Fails closed: an operator who set the days meant to offer trials, and must never end up handing strangers ordinary
    // Workspaces, with invitations, instead. Nothing is made until the setting is removed or a Ziffr Cloud key is set.
    if (env.ZIFFR_TRIAL_DAYS?.trim() || env.ZIFFR_TRIAL_DAYS_DEFAULT?.trim()) throw trialDaysWithoutCloud();
    return null;
  }
  const rawDays = env.ZIFFR_TRIAL_DAYS?.trim();
  // Trials are offered on hosted Ziffr with the default days unless Ziffr Cloud (or the server) says 0: explicitly off.
  if (rawDays === "0") return null;
  if (!rawDays) return { days: trialLimitOf("days").default, max: trialLimitFrom(env, "max") };
  const days = Number(rawDays);
  if (!/^\d+$/.test(rawDays) || days < 1 || days > 30) throw new Error("ZIFFR_TRIAL_DAYS must be a whole number from 1 to 30; no workspace is made until it is.");
  // A cap outside its range (1 to 100,000) counts for nothing, like every Trial Limit: the default applies.
  return { days, max: trialLimitFrom(env, "max") };
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
  // Checked here too, so no caller of the core can make a trial on an Installation that is not hosted Ziffr.
  if (!hostedByCloud(process.env)) throw new Error("Trials exist only on hosted Ziffr.");
  const { data, error } = await db().rpc("create_trial_workspace", { p_person: personId, p_name: name, p_days: settings.days, p_max: settings.max });
  if (error || typeof data !== "string") throw new Error("The workspace could not be created.");
  if (data === "full" || data === "taken") throw new TrialRefused(data);
  return data.slice("ok:".length);
}

/** What becomes of a trial at its end on an Installation that is NOT hosted Ziffr (spec 0029, ZIFFR_TRIAL_THEN): "delete"
 * (the default) or "keep", which turns it into an ordinary Workspace on the default limit. Trials exist only on hosted Ziffr
 * now and there is no Free Size there: on hosted Ziffr this is always "delete". It is still read elsewhere so that a trial
 * that exists on an Installation that chose "keep" never changes its fate (spec 0040). A value that is set but neither
 * throws: an operator must never delete Workspaces they meant to keep. */
export function trialThen(env: Record<string, string | undefined>): "delete" | "keep" {
  if (hostedByCloud(process.env)) return "delete";
  const raw = env.ZIFFR_TRIAL_THEN?.trim().toLowerCase();
  if (!raw || raw === "delete") return "delete";
  if (raw === "keep") return "keep";
  throw new Error("ZIFFR_TRIAL_THEN must be delete or keep.");
}

/** Turns a Trial Workspace into an ordinary one now, because its Owner subscribed to a Size: its trial's day becomes a
 * record, its keys and View Links get back the end dates they were made with, and the Workspace Limit settles
 * (spec 0029, spec 0040). True for the call that did it. */
export async function keepTrial(workspaceId: string): Promise<boolean> {
  const { data, error } = await db().rpc("keep_trial", { p_workspace: workspaceId });
  if (error) throw new Error("The trial could not be kept.");
  return data === true;
}

/** When a workspace's trial ends, or null when it is not a Trial Workspace. A Workspace whose Size was cancelled has
 * the day it was closed. Where an old trial is kept (ZIFFR_TRIAL_THEN=keep, never on hosted Ziffr) one that has ended
 * becomes ordinary the first time anything asks. */
export async function trialEndsAt(workspaceId: string): Promise<Date | null> {
  return trialEndsAtRead(workspaceId, false);
}

/** trialEndsAt, but a failed read throws instead of reading as "not a trial": for what must fail closed. */
async function trialEndsAtRead(workspaceId: string, strict: boolean): Promise<Date | null> {
  const { data, error } = await db().from("workspaces").select("trial_ends_at").eq("id", workspaceId).maybeSingle();
  if (error && strict) throw new Error("The trial could not be read.");
  const ends = data?.trial_ends_at ? new Date(data.trial_ends_at as string) : null;
  // Where an old trial is kept (never on hosted Ziffr), it becomes ordinary the first time anything asks after its end.
  if (ends && ends.getTime() <= Date.now() && trialThen(await settingsInEffect()) === "keep") {
    await keepTrial(workspaceId);
    return null;
  }
  return ends;
}

/** Refuses what a trial does not offer however many people it holds: an invite link (it cannot be counted or limited
 * by address) and Domain Joining (an Owner approving strangers who ask). Invitations by email are allowed, within the
 * Trial Limits the database keeps (ADR 0015). */
export async function assertNotTrial(workspaceId: string, what = "This"): Promise<void> {
  if (await trialEndsAt(workspaceId)) throw new Forbidden(`${what} is not possible in a trial: invite people by email instead.`);
}

/** The words for an invitation email a trial may not send, by the message the claim raises with ZF436 (the daily number of
 * the trial, or of all trials together), and for a second open invitation to one address. */
export function trialInvitationMessage(refusal: { message?: string } | undefined): string {
  const message = refusal?.message;
  const n = trialLimitsNow();
  if (message === "invitation_open_for_address") return "This address has an open invitation already. Revoke it first to invite it again.";
  if (message === "invitations_all_trials_day") return "Ziffr is not sending invitation emails for trials right now; send the link yourself, or try again tomorrow.";
  return `A trial sends at most ${n.invitationsPerDay === 1 ? "1 invitation email" : `${n.invitationsPerDay} invitation emails`} a day. Send the link yourself, or wait until tomorrow.`;
}

/** The words for a trial's Metric, key, Feed and View Link limits, by the code the database raises, with the numbers as
 * the Trial Limits are now (the database keeps the counts: metrics_per_trial, access_keys_in_trial, feeds_in_trial,
 * view_links_in_trial). */
export function trialLimitMessage(code: string | undefined): string | null {
  const n = trialLimitsNow();
  const s = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
  if (code === "ZF430") return `A trial has at most ${s(n.metrics, "Metric")}. Archive or delete one to make another.`;
  if (code === "ZF431") return `A trial has at most ${s(n.keys, "Access Key")} that work. Revoke one to make another.`;
  if (code === "ZF432") return `A Feed in a trial has at most ${s(n.feeds, "key")} that work. Revoke one to make another.`;
  if (code === "ZF434") return `A trial may connect ${n.assistants === 1 ? "one assistant" : `${n.assistants} assistants`} at a time. Disconnect one to connect another.`;
  if (code === "ZF433") return `A trial has at most ${s(n.feeds, "Feed")}. Delete one to make another.`;
  if (code === "ZF435") return `A trial holds at most ${s(n.people, "person", "people")}, invitations that are still open included. Revoke an invitation or wait until it ends to invite another.`;
  if (code === "ZF439") return "Invitations open once the Owner has recorded a first value of their own. Answer the first request in the Trial guide, then invite your colleagues.";
  if (code === "ZF437") return `A trial has at most ${s(n.viewLinks, "View Link")} that work. Revoke one to make another.`;
  return null;
}

/** Why a trial keeps a Delivery in the Outbox, in words for the Outbox. */
export const TRIAL_HOLDS_BACK = {
  contact: "Kept in the Outbox: a trial never sends to a Contact.",
  notAccepted: "Kept in the Outbox: a trial sends only to people who accepted their invitation.",
  ended: "Kept in the Outbox: this trial has ended.",
  unreadable: "Kept in the Outbox: Ziffr could not check whether this is a trial.",
} as const;

/** Why a Delivery to this recipient may not leave the workspace for real, or null when it may (always outside a
 * trial). A trial reaches the people who accepted: its Owner and every Member, Admin and Guest, whose address they
 * proved by signing in (ADR 0015, which replaces ADR 0010's "only its Owner"). It never reaches a Contact, whose
 * details someone only typed, nor anyone without a membership (an invitation that is still open), nor anybody once it
 * has ended. Checked when a Delivery is made and again by each Connector right before it sends, so one queued by any
 * other path is still held back. */
export async function trialHoldsBack(workspaceId: string, recipientId: string): Promise<string | null> {
  // Fails closed: if the Workspace cannot be read, nothing is sent (it stays in the Outbox).
  let ends: Date | null;
  try { ends = await trialEndsAtRead(workspaceId, true); } catch { return TRIAL_HOLDS_BACK.unreadable; }
  if (!ends) return null;
  if (ends.getTime() <= Date.now()) return TRIAL_HOLDS_BACK.ended;
  const [{ data: contact }, { data: member }] = await Promise.all([
    db().from("contacts").select("person_id").eq("workspace_id", workspaceId).eq("person_id", recipientId).maybeSingle(),
    db().from("memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", recipientId).maybeSingle(),
  ]);
  // A Contact row wins: the address Ziffr would use is then the typed one, even for someone who is also a member.
  if (contact) return TRIAL_HOLDS_BACK.contact;
  return member ? null : TRIAL_HOLDS_BACK.notAccepted;
}

/** The last day (UTC, "YYYY-MM-DD") a View Link made now may end on: the trial's last day, or null outside a trial. A trial
 * that has ended makes none. The database clamps the same way (view_links_in_trial), so this is for the words and the
 * Audit Log to say the date the link really has. */
export async function trialLastDay(workspaceId: string): Promise<string | null> {
  const ends = await trialEndsAtRead(workspaceId, true);
  if (!ends) return null;
  if (ends.getTime() <= Date.now()) throw new Forbidden("This trial has ended: nothing can be shared any more.");
  return ends.toISOString().slice(0, 10);
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
  const { data, error } = await db().rpc("claim_trial_send", { p_id: deliveryId, p_per_day: (await trialLimitsInEffect()).messagesPerDay });
  if (error) throw new Error("The message could not be claimed for sending.");
  return data === "ok" || data === "wait" ? data : "gone";
}

/** Whether a new trial can be made right now on this Installation: false when trials are off or the cap is reached.
 * A count only, never which workspaces, so the login page may ask it for anyone. */
export async function trialsOpen(given?: Record<string, string | undefined>): Promise<boolean> {
  // Unreadable settings mean no trial is offered (fail closed, as trialSettingsInEffect).
  const env = given ?? (await settingsInEffectStrict().catch(() => null));
  if (!env) return false;
  let settings: { days: number; max: number } | null = null;
  try { settings = trialSettings(env); } catch { return false; }
  if (!settings) return false;
  const { count } = await db().from("workspaces").select("id", { count: "exact", head: true }).gt("trial_ends_at", new Date().toISOString());
  return (count ?? 0) < settings.max;
}
