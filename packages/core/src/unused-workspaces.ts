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
import { forgetWorkspaceKey } from "./workspace-keys";
import { defaultLimitFrom } from "./workspace-limits";

/** Days between the warning and the deletion. */
export const UNUSED_WAIT_DAYS = 14;
const DAY = 86_400_000;
/** Most Workspaces one run warns or deletes; the next run takes the rest. */
const PER_RUN = 200;

/** The days without use after which a Workspace is warned, or null when the rule is off: the setting is unset, is not a
 * whole number from 30 to 3,650 (said in the server log, never guessed), or there is no default limit. */
export function unusedAfterDays(settings: Settings): number | null {
  const raw = settings.ZIFFR_DELETE_UNUSED_AFTER_DAYS?.trim();
  if (!raw) return null;
  if (!/^\d{1,4}$/.test(raw) || Number(raw) < 30 || Number(raw) > 3650) {
    console.error("Unused Workspaces: ZIFFR_DELETE_UNUSED_AFTER_DAYS must be a whole number from 30 to 3650; nothing is deleted until it is.");
    return null;
  }
  return defaultLimitFrom(settings).metrics === null ? null : Number(raw);
}

/** Records that someone of the Workspace used it now (a sign-in; values touch it in the database). */
export async function touchWorkspace(workspaceId: string): Promise<void> {
  if (workspaceId === DEMO_WORKSPACE_ID) return;
  const { error } = await db().rpc("touch_workspace", { p_workspace: workspaceId });
  if (error) console.error(`Unused Workspaces: could not record use (${error.code ?? "error"})`);
}

/** A day as "3 December 2026". */
const dayWords = (at: Date) => at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Warns the Owners of Workspaces unused for `days`, once per time unused. Returns how many Workspaces were warned. */
export async function warnUnusedWorkspaces(days: number, now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - days * DAY).toISOString();
  const { data } = await db().from("workspaces").select("id").is("unused_warned_at", null).is("trial_ends_at", null).lte("last_used_at", before).neq("id", DEMO_WORKSPACE_ID).order("last_used_at").limit(PER_RUN);
  let n = 0;
  for (const w of data ?? []) {
    // Claimed in the database, which checks again that it is unused and on the default limit, so it warns once.
    const { data: claimed, error } = await db().rpc("claim_unused_warning", { p_workspace: w.id, p_days: days });
    if (error || claimed !== true) continue;
    const on = dayWords(new Date(now.getTime() + UNUSED_WAIT_DAYS * DAY));
    const { data: owners } = await db().from("memberships").select("user_id").eq("workspace_id", w.id).eq("role", "owner");
    for (const o of owners ?? []) {
      await deliverNotice(w.id as string, {
        recipientId: o.user_id as string, senderId: null, subject: "Your Ziffr Workspace will be deleted",
        text: `Nobody has signed in to your Workspace or sent it a value for ${days} days. On ${on} it will be deleted with all its Metrics, values and dashboards, and its key destroyed, so nothing of it can be read again. One sign-in or one value keeps it. To keep a copy of its values, sign in and download them from the link below.`,
        link: "/settings/workspace/download",
      });
    }
    n++;
  }
  return n;
}

/** Deletes Workspaces still unused 14 days after their warning. Returns how many. */
export async function deleteUnusedWorkspaces(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - UNUSED_WAIT_DAYS * DAY).toISOString();
  const { data } = await db().from("workspaces").select("id").not("unused_warned_at", "is", null).lte("unused_warned_at", before).is("trial_ends_at", null).neq("id", DEMO_WORKSPACE_ID).limit(PER_RUN);
  let n = 0;
  for (const w of data ?? []) {
    try {
      if (await deleteUnused(w.id as string)) n++;
    } catch (e) {
      // One that fails waits for the next run; the others still go.
      console.error(`Unused Workspace ${w.id} could not be deleted: ${(e as Error).message}`);
    }
  }
  return n;
}

/** Deletes one Workspace as unused, if it still may be: its key and the Workspace in one step in the database, then
 * the person rows of its Contacts and Feeds, and each member whose only Workspace it was, with their sign-in. */
async function deleteUnused(workspaceId: string): Promise<boolean> {
  const [{ data: members }, { data: contacts }, { data: feeds }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId),
    db().from("contacts").select("person_id").eq("workspace_id", workspaceId),
    db().from("feeds").select("person_id").eq("workspace_id", workspaceId),
  ]);
  const { data: gone, error } = await db().rpc("delete_unused_workspace", { p_workspace: workspaceId });
  forgetWorkspaceKey(workspaceId);
  if (error) throw new Error("The Workspace could not be deleted.");
  if (gone !== true) return false;
  // Contacts and Feeds are person rows made for this Workspace alone, never with a sign-in.
  const others = [...(contacts ?? []).map((c) => c.person_id as string), ...(feeds ?? []).map((f) => f.person_id as string)];
  if (others.length) await db().from("profiles").delete().in("id", others);
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
  return { warned: await warnUnusedWorkspaces(days, now), deleted: await deleteUnusedWorkspaces(now) };
}

/** The values of every Metric the person sees, as CSV, for Owners and Admins: what the warning offers to keep before a
 * Workspace is deleted. Never another Workspace's, never a Metric not shared with them. */
export async function workspaceValuesCsv(actor: Actor): Promise<string> {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin") || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("Only Owners and Admins download the Workspace's values.");
  const metrics = await getMetrics(actor.workspaceId);
  return valuesCsv(actor.workspaceId, await visibleMetricIds(actor.workspaceId, actor.personId, metrics));
}
