// The end of a Trial Workspace (spec 0021, ticket 9; GLOSSARY: Trial Workspace). The day before, its Owner gets one
// reminder; at its end it closes (keys revoked, Slack and Telegram unlinked; nothing is sent or taken from then on, by
// the checks in trials.ts); a week later it is deleted with everything in it, and its Owner too when it was their only
// workspace, so the Installation keeps no address of someone who is gone. The Owner may end it at once. A scheduler
// calls trialCleanup (POST /api/jobs/trial-cleanup); each step claims its rows first, so two runs never do one twice.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { deliverNotice } from "./deliveries";
import { trialEndsAt } from "./trials";
import { csvNumber } from "./export-values";
import { NUMBER_STYLE_MARKS } from "./number-style";
import { numberStyleOf } from "./workspace-settings";
import { destroyWorkspaceKeys } from "./workspace-keys";
import { recordInstallationSystemEvent } from "./installation-admins";

/** Days between a trial's end and its deletion: time to download its values. */
export const TRIAL_GRACE_DAYS = 7;
const DAY = 86_400_000;

/** Where a trial stands, for the bar on every page: null outside a trial. */
export async function trialStatus(workspaceId: string): Promise<{ endsAt: string; daysLeft: number; ended: boolean; deletedAt: string } | null> {
  const ends = await trialEndsAt(workspaceId);
  if (!ends) return null;
  const left = ends.getTime() - Date.now();
  return { endsAt: ends.toISOString(), daysLeft: Math.max(0, Math.ceil(left / DAY)), ended: left <= 0, deletedAt: new Date(ends.getTime() + TRIAL_GRACE_DAYS * DAY).toISOString() };
}

/** The trial's Owner (a trial has one). */
async function ownerOf(workspaceId: string): Promise<string | null> {
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/** Reminds the Owners of trials that end within a day, once each, through their own Connector. Returns how many. */
export async function remindEndingTrials(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + DAY).toISOString();
  // Claimed first: only the run that sets the mark sends the reminder.
  const { data } = await db().from("workspaces").update({ trial_reminded_at: now.toISOString() })
    .gt("trial_ends_at", now.toISOString()).lte("trial_ends_at", soon).is("trial_reminded_at", null).select("id, trial_ends_at");
  let n = 0;
  for (const w of data ?? []) {
    const owner = await ownerOf(w.id);
    if (!owner) continue;
    const day = String(w.trial_ends_at).slice(0, 10);
    await deliverNotice(w.id, {
      recipientId: owner, senderId: null, subject: "Your Ziffr trial ends tomorrow",
      text: `Your trial ends on ${day}. Then it closes, and ${TRIAL_GRACE_DAYS} days later it is deleted with everything in it. Download your Metrics and values before then from the bar at the top of any page.`,
      link: "/try",
    });
    n++;
  }
  return n;
}

/** Closes trials that have ended: their keys are revoked, Slack is disconnected and Telegram links removed. Returns
 * how many. Nothing could go out or come in after the end anyway; this tidies up what would otherwise wait for the
 * deletion. */
export async function closeEndedTrials(now = new Date()): Promise<number> {
  const at = now.toISOString();
  const { data } = await db().from("workspaces").update({ trial_closed_at: at }).lte("trial_ends_at", at).is("trial_closed_at", null).select("id");
  for (const w of data ?? []) {
    await db().from("access_keys").update({ revoked_at: at }).eq("workspace_id", w.id).is("revoked_at", null);
    await db().from("slack_installations").update({ revoked_at: at }).eq("workspace_id", w.id).is("revoked_at", null);
    await db().from("telegram_links").delete().eq("workspace_id", w.id);
  }
  return data?.length ?? 0;
}

/** Deletes one trial with everything in it: first its Workspace Key (spec 0028), so that if anything below stops
 * half-way what is left cannot be opened; then the workspace (its rows go with it), the person rows of its Contacts
 * and Feeds, and its Owner with their sign-in when they are in no other workspace. The Installation's audit keeps one
 * line: the workspace's id, never its name. */
async function deleteTrial(workspaceId: string): Promise<void> {
  const [{ data: members }, { data: contacts }, { data: feeds }, { data: trial }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId),
    db().from("contacts").select("person_id").eq("workspace_id", workspaceId),
    db().from("feeds").select("person_id").eq("workspace_id", workspaceId),
    db().from("workspaces").select("id").eq("id", workspaceId).not("trial_ends_at", "is", null).maybeSingle(),
  ]);
  // Only a trial is deleted here: its key is destroyed only once that is certain.
  if (!trial) throw new Error("The trial could not be deleted.");
  await destroyWorkspaceKeys(workspaceId);
  const { error } = await db().from("workspaces").delete().eq("id", workspaceId).not("trial_ends_at", "is", null);
  if (error) throw new Error("The trial could not be deleted.");
  await recordInstallationSystemEvent("workspace.deleted", workspaceId);
  // Contacts and Feeds are person rows made for this workspace alone, never with a sign-in.
  const others = [...(contacts ?? []).map((c) => c.person_id as string), ...(feeds ?? []).map((f) => f.person_id as string)];
  if (others.length) {
    const { error: e2 } = await db().from("profiles").delete().in("id", others);
    if (e2) throw new Error("The trial's Contacts and Feeds could not be deleted.");
  }
  // A member goes only when they belong nowhere else, decided in the same statement that deletes them; their sign-in
  // goes only once their person row is gone, so nobody is left without one, or with an address and no account.
  for (const m of members ?? []) {
    const { data: authUser, error: e3 } = await db().rpc("delete_lone_person", { p_person: m.user_id });
    if (e3) throw new Error("A member of the trial could not be deleted.");
    if (typeof authUser === "string") await db().auth.admin.deleteUser(authUser);
  }
}

/** Deletes trials that ended more than the grace days ago. Returns how many. */
export async function deleteExpiredTrials(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - TRIAL_GRACE_DAYS * DAY).toISOString();
  const { data } = await db().from("workspaces").select("id").lte("trial_ends_at", before);
  let n = 0;
  // Each on its own: one that fails waits for the next run and never holds back the others.
  for (const w of data ?? []) {
    try {
      await deleteTrial(w.id as string);
      n++;
    } catch (e) {
      console.error(`Trial ${w.id} could not be deleted: ${(e as Error).message}`);
    }
  }
  return n;
}

/** Whether any Trial Workspace exists: the cleanup keeps running for them after trials stop being offered. */
export async function trialsExist(): Promise<boolean> {
  const { count } = await db().from("workspaces").select("id", { count: "exact", head: true }).not("trial_ends_at", "is", null);
  return (count ?? 0) > 0;
}

/** Everything the scheduler does for trials, in order. Answers counts only. */
export async function trialCleanup(now = new Date()): Promise<{ reminded: number; closed: number; deleted: number }> {
  return { reminded: await remindEndingTrials(now), closed: await closeEndedTrials(now), deleted: await deleteExpiredTrials(now) };
}

/** The Owner ends their trial now: it is deleted at once with everything in it, and they with it. */
export async function endTrialNow(actor: Actor): Promise<void> {
  if (actor.role !== "owner" || !(await trialEndsAt(actor.workspaceId))) throw new Forbidden("Only a trial's Owner can end it.");
  await deleteTrial(actor.workspaceId);
}

/** A trial's Metrics and values as CSV, for its Owner to keep: one row per value, oldest first per Metric. Every
 * field is quoted, and one that starts like a formula gets a leading apostrophe, so a spreadsheet never runs it.
 * Values are written in the workspace's Number Style, without group marks and as precise as stored, and the fields
 * are separated by ";" when the decimal mark is a comma, as spreadsheets set to that style expect (spec 0022). */
export async function trialValuesCsv(actor: Actor): Promise<string> {
  if (actor.role !== "owner" || !(await trialEndsAt(actor.workspaceId))) throw new Forbidden("Only a trial's Owner can download it this way.");
  const [{ data: metrics }, style] = await Promise.all([
    db().from("metrics").select("id, slug, name, period, unit").eq("workspace_id", actor.workspaceId).order("name"),
    numberStyleOf(actor.workspaceId),
  ]);
  const sep = NUMBER_STYLE_MARKS[style].decimal === "," ? ";" : ",";
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  // A value is ours, never text someone typed: a minus is a negative number, not a formula.
  const number = (v: unknown) => `"${csvNumber(Number(v), style)}"`;
  const lines = [["metric", "name", "period", "period_start", "value", "unit", "source", "recorded_at"].map(cell).join(sep)];
  for (const m of metrics ?? []) {
    for (let from = 0; ; from += 1000) {
      const { data: rows } = await db().from("observations").select("period_start, value, source, created_at").eq("workspace_id", actor.workspaceId).eq("metric_id", m.id)
        .order("period_start").order("id").range(from, from + 999);
      for (const r of rows ?? []) lines.push([cell(m.slug), cell(m.name), cell(m.period), cell(r.period_start), number(r.value), cell(m.unit), cell(r.source), cell(r.created_at)].join(sep));
      if (!rows || rows.length < 1000) break;
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}
