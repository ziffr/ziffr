// Unused Workspaces on the default limit (spec 0029, ticket #269; GLOSSARY: Workspace Limit, Workspace Key). Where an
// Installation sets ZIFFR_DELETE_UNUSED_AFTER_DAYS (hosted Ziffr: 90) and has a default limit, a Workspace on that
// default that nobody used for that many days gets one warning to its Owners; 14 days later, still unused, it is
// deleted, its key destroyed first, and a person whose only Workspace it was goes with their sign-in, as with trials.
// Never a trial, never the demo, never a Workspace with a limit of its own. One sign-in or one value stops it. The
// database decides each step under the Workspace's lock (claim_unused_warning, delete_unused_workspace).
import { Forbidden, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { db } from "./db";
import { valuesCsv } from "./trial-end";
import { getMetrics } from "./workspace-data";
import { deliverNotice } from "./deliveries";
import { settingsInEffect, type Settings } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { mailEnabled } from "./mail";
import { forgetWorkspaceKey } from "./workspace-keys";
import { defaultLimitFrom } from "./workspace-limits";

/** The warning's subject; the database looks for a sent email with it before it deletes (deletable_as_unused). */
export const UNUSED_WARNING_SUBJECT = "Your Ziffr Workspace will be deleted";

/** Days between the warning and the deletion. */
export const UNUSED_WAIT_DAYS = 14;
const DAY = 86_400_000;
/** Most Workspaces one run warns or deletes; the next run takes the rest. */
const PER_RUN = 200;

/** The days without use after which a Workspace is warned, or null when the rule is off: the setting is unset, is not a
 * whole number from 30 to 3,650 (said in the server log, never guessed), there is no default limit, or this Ziffr
 * cannot send email, by which the warning must reach the Owners. */
export function unusedAfterDays(settings: Settings): number | null {
  const raw = settings.ZIFFR_DELETE_UNUSED_AFTER_DAYS?.trim();
  if (!raw) return null;
  if (!/^\d{1,4}$/.test(raw) || Number(raw) < 30 || Number(raw) > 3650) {
    console.error("Unused Workspaces: ZIFFR_DELETE_UNUSED_AFTER_DAYS must be a whole number from 30 to 3650; nothing is deleted until it is.");
    return null;
  }
  if (!mailEnabled(settings)) {
    console.error("Unused Workspaces: ZIFFR_DELETE_UNUSED_AFTER_DAYS is set, but this Ziffr cannot send email; nothing is warned or deleted until it can.");
    return null;
  }
  return defaultLimitFrom(settings).metrics === null ? null : Number(raw);
}

// Workspaces this process marked as used, and when: a person's every page asks, so the database is asked at most every
// ten minutes per Workspace from here (and writes at most once an hour, touch_workspace).
const touched = new Map<string, number>();

/** Records that someone of the Workspace used it now: a sign-in, and every page or action of a signed-in person (a
 * session that stays open is use too). Values touch it in the database. */
export async function touchWorkspace(workspaceId: string): Promise<void> {
  if (workspaceId === DEMO_WORKSPACE_ID) return;
  const last = touched.get(workspaceId);
  if (last && Date.now() - last < 10 * 60_000) return;
  touched.set(workspaceId, Date.now());
  const { error } = await db().rpc("touch_workspace", { p_workspace: workspaceId });
  if (error) { touched.delete(workspaceId); console.error(`Unused Workspaces: could not record use (${error.code ?? "error"})`); }
}

/** A day as "3 December 2026". */
const dayWords = (at: Date) => at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Warns the Owners of one Workspace unused for `days`, by email, once per time unused. A warning that reaches no
 * Owner is taken back, so a Workspace is never deleted without one. True when it was warned. */
async function warn(workspaceId: string, days: number, now: Date): Promise<boolean> {
  // Claimed in the database, which checks again that it is unused and on the default limit, so it warns once.
  const { data: claimed, error } = await db().rpc("claim_unused_warning", { p_workspace: workspaceId, p_days: days });
  if (error || claimed !== true) return false;
  const on = dayWords(new Date(now.getTime() + UNUSED_WAIT_DAYS * DAY));
  let sent = 0;
  try {
    const { data: owners } = await db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner");
    for (const o of owners ?? []) {
      // By email, whatever Connector the Owner prefers for replies: this one must reach them where they will look.
      await deliverNotice(workspaceId, {
        recipientId: o.user_id as string, senderId: null, subject: UNUSED_WARNING_SUBJECT, via: "email",
        text: `Nobody has signed in to your Workspace or sent it a value for ${days} days. On ${on} it will be deleted with all its Metrics, values and dashboards, and its key destroyed, so nothing of it can be read again. One sign-in or one value keeps it. To keep a copy of its values, sign in and download them from the link below.`,
        link: "/settings/workspace/download",
      });
      sent++;
    }
  } finally {
    // A warning that reached nobody is taken back; one that failed to send never deletes either, since the deletion
    // needs a sent email of it (deletable_as_unused).
    if (sent === 0) await db().rpc("unclaim_unused_warning", { p_workspace: workspaceId });
  }
  return sent > 0;
}

/** The day's warnings and deletions: what the database picks (unused on the default limit, oldest first; warned 14
 * to 21 days ago and still unused), at most PER_RUN of each. Returns how many were warned and deleted. */
export async function runUnusedWorkspaces(days: number, now = new Date()): Promise<{ warned: number; deleted: number }> {
  const { data, error } = await db().rpc("unused_workspace_candidates", { p_days: days, p_limit: PER_RUN });
  if (error) throw new Error("The unused Workspaces could not be read.");
  let warned = 0;
  let deleted = 0;
  for (const c of (data ?? []) as { workspace_id: string; step: "warn" | "delete" }[]) {
    try {
      if (c.step === "warn" && (await warn(c.workspace_id, days, now))) warned++;
      if (c.step === "delete" && (await deleteUnused(c.workspace_id, days))) deleted++;
    } catch (e) {
      // One that fails waits for the next run; the others still go.
      console.error(`Unused Workspace ${c.workspace_id}: ${(e as Error).message}`);
    }
  }
  return { warned, deleted };
}

/** Deletes one Workspace as unused, if it still may be: its key and the Workspace in one step in the database, then
 * the person rows of its Contacts and Feeds, and each member whose only Workspace it was, with their sign-in (never an
 * Installation Admin). */
async function deleteUnused(workspaceId: string, days: number): Promise<boolean> {
  const [{ data: members }, { data: contacts }, { data: feeds }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId),
    db().from("contacts").select("person_id").eq("workspace_id", workspaceId),
    db().from("feeds").select("person_id").eq("workspace_id", workspaceId),
  ]);
  const { data: gone, error } = await db().rpc("delete_unused_workspace", { p_workspace: workspaceId, p_days: days });
  forgetWorkspaceKey(workspaceId);
  if (error) throw new Error("The Workspace could not be deleted.");
  if (gone !== true) return false;
  // Contacts and Feeds are person rows made for this Workspace alone, never with a sign-in.
  const others = [...(contacts ?? []).map((c) => c.person_id as string), ...(feeds ?? []).map((f) => f.person_id as string)];
  if (others.length) {
    const { error: e2 } = await db().from("profiles").delete().in("id", others);
    if (e2) console.error(`Unused Workspace ${workspaceId}: its Contacts and Feeds could not be deleted (${e2.code ?? "error"})`);
  }
  // A member goes only when they belong nowhere else, decided in the statement that deletes them (as with trials).
  for (const m of members ?? []) {
    const { data: authUser, error: e3 } = await db().rpc("delete_lone_person", { p_person: m.user_id });
    if (e3) throw new Error("A member of the Workspace could not be deleted.");
    if (typeof authUser === "string") await db().auth.admin.deleteUser(authUser);
  }
  return true;
}

/** The daily job: warn, then delete, only where the Installation turned the rule on. */
export async function unusedWorkspacesJob(now = new Date()): Promise<{ warned: number; deleted: number }> {
  const days = unusedAfterDays(await settingsInEffect());
  if (days === null) return { warned: 0, deleted: 0 };
  return runUnusedWorkspaces(days, now);
}

/** The values of every Metric the person sees, as CSV, for Owners and Admins: what the warning offers to keep before a
 * Workspace is deleted. Never another Workspace's, never a Metric not shared with them. */
export async function workspaceValuesCsv(actor: Actor): Promise<string> {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin") || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("Only Owners and Admins download the Workspace's values.");
  const metrics = await getMetrics(actor.workspaceId);
  return valuesCsv(actor.workspaceId, await visibleMetricIds(actor.workspaceId, actor.personId, metrics));
}
