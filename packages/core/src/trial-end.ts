// The end of a Trial Workspace (spec 0021, ticket 9; spec 0040, ticket 6; GLOSSARY: Trial Workspace). Its Owner gets a
// reminder three days and one day before and one as it ends, each naming the two ways on (subscribe, or take the
// Workspace Export and run Ziffr yourself) and the day of the deletion; at its end it closes (keys revoked, Slack and Telegram unlinked; nothing is sent or taken from then on, by
// the checks in trials.ts); a week later it is deleted with everything in it, and its Owner too when it was their only
// workspace, so the Installation keeps no address of someone who is gone. The Owner may end it at once. A scheduler
// calls trialCleanup (POST /api/jobs/trial-cleanup); each step claims its rows first, so two runs never do one twice.
import { closeForSystem } from "./system-closes";
import { sendWebhooksNow } from "./webhook-send";
import { db } from "./db";
import { openNames, openRows } from "./sealed-columns";
import { Forbidden, type Actor, type WorkspaceRoleName } from "./actor";
import { deliverNotice } from "./deliveries";
import { keepTrial, trialEndsAt, trialThen } from "./trials";
import { settingsInEffect, settingsInEffectStrict } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { daysSetting } from "./installation-days";
import { csvNumber } from "./export-values";
import { inCondensed, partOfCondensed, valueOfParts } from "./condensed-parts";
import { condensedFor } from "./condensed-values";
import type { Aggregation } from "./types";
import { NUMBER_STYLE_MARKS } from "./number-style";
import { numberStyleOf } from "./workspace-settings";
import { destroyWorkspaceKeys } from "./workspace-keys";
import { membersGoingWords, trialEndsWords, workspaceClosedWords, workspaceReopenedWords } from "./trial-words";

/** Days between a trial's end and its deletion unless the Installation sets otherwise (ZIFFR_TRIAL_GRACE_DAYS): time to
 * download its values. A trial keeps the days it had when it closed. */
export const TRIAL_GRACE_DAYS = 7;
const DAY = 86_400_000;

/** Where a trial stands, for the bar on every page: null outside a trial. `cancelled` is a Workspace whose Size was
 * cancelled: it closes as an ended trial does, and its screens do not say "trial". */
export async function trialStatus(workspaceId: string, role?: WorkspaceRoleName): Promise<{ endsAt: string; daysLeft: number; ended: boolean; deletedAt: string; cancelled: boolean; keeps: boolean; ownerName: string | null } | null> {
  const ends = await trialEndsAt(workspaceId);
  if (!ends) return null;
  const settings = await settingsInEffect();
  const left = ends.getTime() - Date.now();
  return {
    endsAt: ends.toISOString(), daysLeft: Math.max(0, Math.ceil(left / DAY)), ended: left <= 0, deletedAt: new Date(ends.getTime() + daysSetting("ZIFFR_TRIAL_GRACE_DAYS", settings) * DAY).toISOString(),
    cancelled: await cancelledOf(workspaceId),
    // An old trial on an Installation that keeps them (never hosted Ziffr): it becomes an ordinary Workspace at its end.
    keeps: trialThen(settings) === "keep",
    // Only a role that sees who else is in the Workspace is given the name; a Guest, or no role, gets none.
    ownerName: role === "owner" || role === "admin" || role === "member" ? await ownerName(workspaceId) : null,
  };
}

/** The trial Owner's name, for the words Members are told; null when it cannot be read. Members of the Workspace may see who its Owner is. */
async function ownerName(workspaceId: string): Promise<string | null> {
  const id = await ownerOf(workspaceId);
  if (!id) return null;
  const { data } = await db().from("profiles").select("id, name").eq("id", id).maybeSingle();
  return data ? ((await openNames(workspaceId, [data]))[0]?.name || null) : null;
}

/** Whether the Workspace closed because its Size was cancelled, not because a trial ended. */
async function cancelledOf(workspaceId: string): Promise<boolean> {
  const { data } = await db().from("workspaces").select("closed_because").eq("id", workspaceId).maybeSingle();
  return data?.closed_because === "cancelled";
}

/** The trial's Owner (a trial has one). */
async function ownerOf(workspaceId: string): Promise<string | null> {
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/** The three reminders, nearest last: each is claimed by its own mark on the Workspace. The last goes in the hour
 * before the end, because a Delivery of a trial that has ended stays in the Outbox. */
const REMINDERS = [
  { mark: "trial_reminded_3_at", ahead: 3 * DAY, subject: "Your Ziffr trial ends in 3 days" },
  { mark: "trial_reminded_at", ahead: DAY, subject: "Your Ziffr trial ends tomorrow" },
  { mark: "trial_reminded_end_at", ahead: 90 * 60_000, subject: "Your Ziffr trial ends today" },
] as const;

/** Reminds the Owners of trials that end within three days, within a day and within the hour and a half, once each,
 * through their own Connector. Each says the two ways on and the day it is deleted (see trialEndsWords). A trial that
 * is already closer to its end than a reminder's time gets only the nearest one, never several at once. Returns how
 * many messages were sent. */
export async function remindEndingTrials(now = new Date()): Promise<number> {
  // Read strictly before anything is claimed: a reminder with the wrong words is never sent again.
  const settings = await settingsInEffectStrict();
  // An old trial that an Installation keeps (never hosted Ziffr) is not deleted, so none of these words would be true.
  if (trialThen(settings) === "keep") return 0;
  const grace = daysSetting("ZIFFR_TRIAL_GRACE_DAYS", settings);
  let n = 0;
  // Nearest first: a trial that is claimed by one is never claimed by a farther one in the same run.
  for (const [i, r] of [...REMINDERS].reverse().entries()) {
    const farther = REMINDERS.length - 1 - i;
    const upTo = new Date(now.getTime() + r.ahead).toISOString();
    // Claimed first: only the run that sets the mark sends the reminder.
    const { data } = await db().from("workspaces").update({ [r.mark]: now.toISOString() })
      .gt("trial_ends_at", now.toISOString()).lte("trial_ends_at", upTo).is(r.mark, null).is("closed_because", null).select("id, trial_ends_at");
    for (const w of data ?? []) {
      // The people who would lose their account with it hear once: at the day-before reminder, or at the last when that
      // one was spent unsent (a trial made for a day or two).
      let tellMembers = r.mark === "trial_reminded_at";
      if (r.mark === "trial_reminded_end_at") tellMembers = !(await db().from("workspaces").select("trial_reminded_at").eq("id", w.id).single()).data?.trial_reminded_at;
      // A farther reminder is spent too, and the days promised are kept with the first one: what the Owner was told holds.
      for (const f of REMINDERS.slice(0, farther)) await db().from("workspaces").update({ [f.mark]: now.toISOString() }).eq("id", w.id).is(f.mark, null);
      await db().from("workspaces").update({ trial_grace_days: grace }).eq("id", w.id).is("trial_grace_days", null);
      const { data: kept } = await db().from("workspaces").select("trial_grace_days").eq("id", w.id).single();
      const owner = await ownerOf(w.id);
      if (!owner) continue;
      const days = (kept?.trial_grace_days as number | null) ?? grace;
      const endsAt = new Date(w.trial_ends_at as string);
      // Each on its own: one that fails is logged and never drops the others claimed in this batch.
      try {
        await deliverNotice(w.id, {
          recipientId: owner, senderId: null, subject: r.subject,
          text: trialEndsWords(endsAt.toISOString(), new Date(endsAt.getTime() + days * DAY).toISOString()),
          // The page that offers the Workspace Export to its Owner.
          link: "/settings/export",
        });
        n++;
        if (tellMembers) await tellMembersWhoWouldGo(w.id as string, new Date(endsAt.getTime() + days * DAY).toISOString());
      } catch (e) {
        console.error(`Reminder for trial ${w.id} could not be sent: ${(e as Error).message}`);
      }
    }
  }
  return n;
}

/** Closes trials that have ended: their keys are revoked, Slack is disconnected, Telegram and Calendar Links removed. Returns
 * how many. Nothing could go out or come in after the end anyway; this tidies up what would otherwise wait for the
 * deletion. */
export async function closeEndedTrials(now = new Date()): Promise<number> {
  const at = now.toISOString();
  // An old trial on an Installation that keeps them (never hosted Ziffr, which has no Free Size) becomes an ordinary
  // Workspace instead, as before; if the setting cannot be read this throws and nothing is closed.
  if (trialThen(await settingsInEffectStrict()) === "keep") {
    const { data: ended } = await db().from("workspaces").select("id").lte("trial_ends_at", at).is("trial_closed_at", null).is("closed_because", null);
    let kept = 0;
    for (const w of ended ?? []) if (await keepTrial(w.id as string)) kept++;
    return kept;
  }
  // The grace days in effect now are kept with the closing: what the Owner was told is what holds, whatever is set later.
  const grace = daysSetting("ZIFFR_TRIAL_GRACE_DAYS", await settingsInEffectStrict());
  await db().from("workspaces").update({ trial_grace_days: grace }).lte("trial_ends_at", at).is("trial_closed_at", null).is("trial_grace_days", null);
  const { data } = await db().from("workspaces").update({ trial_closed_at: at }).lte("trial_ends_at", at).is("trial_closed_at", null).select("id");
  for (const w of data ?? []) {
    // The Workspace is closing: its open Actions close with their events, so external tasks do not linger.
    await closeForSystem(w.id as string, { statuses: ["open", "answered"] }, "workspace_closing");
    await db().from("access_keys").update({ revoked_at: at }).eq("workspace_id", w.id).is("revoked_at", null);
    await db().from("slack_installations").update({ revoked_at: at }).eq("workspace_id", w.id).is("revoked_at", null);
    await db().from("telegram_links").delete().eq("workspace_id", w.id);
    // Calendar Links end with the trial (spec 0027); fetches already answer "not found" once it has ended.
    await db().from("calendar_links").delete().eq("workspace_id", w.id);
  }
  return data?.length ?? 0;
}

/** Deletes one trial with everything in it: first its Workspace Key (spec 0028), so that if anything below stops
 * half-way what is left cannot be opened, with the Installation's one audit line by its id, never its name; then the
 * workspace (its rows go with it), the person rows of its Contacts and Feeds, and its Owner with their sign-in when
 * they are in no other workspace. A trial that is already gone is left as it is. */
async function deleteTrial(workspaceId: string): Promise<void> {
  const [{ data: members }, { data: contacts }, { data: feeds }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId),
    db().from("contacts").select("person_id").eq("workspace_id", workspaceId),
    db().from("feeds").select("person_id").eq("workspace_id", workspaceId),
  ]);
  // Only a trial or a cancelled Workspace is deleted here, and it is claimed in one statement first: a reopening (Ziffr
  // Cloud undoing a cancellation) can no longer win, so the two never interleave. The key is destroyed only after that.
  const { data: claimed } = await db().rpc("claim_trial_for_deletion", { p_workspace: workspaceId });
  if (claimed !== true) return;
  // What is still open is closed, and everything queued is sent now: the send rows go with the Workspace, its key next.
  await closeForSystem(workspaceId, { statuses: ["open", "answered"] }, "workspace_closing");
  await sendWebhooksNow(workspaceId);
  await destroyWorkspaceKeys(workspaceId);
  const { data: gone, error } = await db().from("workspaces").delete().eq("id", workspaceId).not("trial_ends_at", "is", null).is("trial_kept_at", null).select("id");
  if (error || gone?.length !== 1) throw new Error("The trial could not be deleted.");
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

/** The days a trial's data stays: the later of the days promised (kept at its reminder or closing; the usual 7 for one
 * closed before they were kept) and the days in effect now, so a lower setting never deletes it sooner than promised. */
const graceOf = (promised: number | null, closed: boolean, current: number): number => (promised === null ? (closed ? TRIAL_GRACE_DAYS : current) : Math.max(promised, current));

/** Deletes trials that ended more than the grace days ago. Returns how many. */
export async function deleteExpiredTrials(now = new Date()): Promise<number> {
  // Fail closed: deleting needs a setting that was read and says "delete" (spec 0040: a trial an Installation chose to
  // keep is never deleted). An unreadable one throws, so a database hiccup never deletes what was meant to be kept.
  const settings = await settingsInEffectStrict();
  if (trialThen(settings) !== "delete") return 0;
  // Each trial's own grace days: those kept when it was closed, else the usual 7 for one closed before they were kept,
  // else (not closed yet) the days in effect now. Never fewer than the lowest allowed, a day, from the first query.
  const current = daysSetting("ZIFFR_TRIAL_GRACE_DAYS", settings);
  const { data: ended } = await db().from("workspaces").select("id, trial_ends_at, trial_closed_at, trial_grace_days").lte("trial_ends_at", new Date(now.getTime() - DAY).toISOString()).is("trial_kept_at", null);
  const data = (ended ?? []).filter((w) => new Date(w.trial_ends_at as string).getTime() + graceOf(w.trial_grace_days as number | null, !!w.trial_closed_at, current) * DAY <= now.getTime());
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

/** Tells the people of a Workspace that is closing, and whose only Workspace it is, that it and their account go on the
 * day named (the Owner has their own words). Their notice names the Owner only to roles that see who else is in the
 * Workspace; a Guest is given none (deliverNotice hides names from Guests as well). Nothing else about the Workspace. */
async function tellMembersWhoWouldGo(workspaceId: string, deletedAt: string): Promise<void> {
  const { data: members } = await db().from("memberships").select("user_id, role").eq("workspace_id", workspaceId).neq("role", "owner");
  const owner = await ownerName(workspaceId);
  for (const m of members ?? []) {
    const id = m.user_id as string;
    const [{ count }, { data: admin }] = await Promise.all([
      db().from("memberships").select("workspace_id", { count: "exact", head: true }).eq("user_id", id),
      db().from("installation_admins").select("person_id").eq("person_id", id).maybeSingle(),
    ]);
    // Only someone who would be deleted with it: this is the only Workspace they belong to.
    if (count !== 1 || admin) continue;
    // Each on its own: one that fails is logged and never keeps the others from being told.
    try {
      await deliverNotice(workspaceId, { recipientId: id, senderId: null, subject: "A Ziffr Workspace of yours is closing", text: membersGoingWords(m.role === "guest" ? null : owner, deletedAt), link: "/" });
    } catch (e) {
      console.error(`A member of ${workspaceId} could not be told it is closing: ${(e as Error).message}`);
    }
  }
}

/** Closes a Workspace whose Size was cancelled, or whose payment failed for good, as an ended trial is closed (spec 0040:
 * read-only for the grace days with the Workspace Export offered, then deleted). Called by Ziffr Cloud only, and only for
 * a Workspace whose limit Ziffr Cloud set. Its Owner is told first, while a message still leaves it, with the day it is
 * deleted, and so are the people who would lose their account with it. "closed" for the call that closed it, "already"
 * for one that was closed this way before, "refused" for a Workspace in a trial, the demo, one without a limit of
 * Ziffr Cloud's or one closed as a trial. */
export async function closeCancelledWorkspace(workspaceId: string): Promise<"closed" | "already" | "refused"> {
  if (workspaceId === DEMO_WORKSPACE_ID) return "refused";
  const grace = daysSetting("ZIFFR_TRIAL_GRACE_DAYS", await settingsInEffectStrict());
  // Claimed first, by one call only, so concurrent retries never tell people twice; told next, while a message still
  // leaves; closed last. A call that finds it claimed but not closed (the one before stopped half-way) only closes it.
  const { data: claimed, error } = await db().rpc("claim_cancelled_workspace", { p_workspace: workspaceId });
  if (error) throw new Error("The Workspace could not be closed.");
  if (claimed === true) {
    const deletedOn = new Date(Date.now() + grace * DAY).toISOString();
    const owner = await ownerOf(workspaceId);
    try {
      if (owner) await deliverNotice(workspaceId, { recipientId: owner, senderId: null, subject: "Your Ziffr Size was cancelled", text: workspaceClosedWords(deletedOn), link: "/settings/export" });
      await tellMembersWhoWouldGo(workspaceId, deletedOn);
    } catch (e) {
      // The closing is decided; a notice that could not be made never keeps it open.
      console.error(`Notices for the cancelled Workspace ${workspaceId} could not be sent: ${(e as Error).message}`);
    }
  }
  const { data, error: e2 } = await db().rpc("close_cancelled_workspace", { p_workspace: workspaceId });
  if (e2) throw new Error("The Workspace could not be closed.");
  if (data === true) {
    // Closed at once, not at the next hourly run: keys and links stop now, and the days promised are kept.
    await closeEndedTrials();
    return "closed";
  }
  if (claimed === true) return "closed";
  const { data: w } = await db().from("workspaces").select("closed_because").eq("id", workspaceId).maybeSingle();
  return w?.closed_because === "cancelled" ? "already" : "refused";
}

/** Undoes a cancellation during the grace days (Ziffr Cloud: the Size was booked again): the Workspace is ordinary
 * again. What closing revoked (keys, Slack, Telegram, Calendar Links) stays revoked, and closed Actions stay closed;
 * its Owner is told so. False when it was not closed by a cancellation or is deleted already. */
export async function reopenCancelledWorkspace(workspaceId: string): Promise<boolean> {
  const { data, error } = await db().rpc("reopen_cancelled_workspace", { p_workspace: workspaceId });
  if (error) throw new Error("The Workspace could not be opened again.");
  if (data !== true) return false;
  const owner = await ownerOf(workspaceId);
  if (owner) await deliverNotice(workspaceId, { recipientId: owner, senderId: null, subject: "Your Ziffr Workspace is open again", text: workspaceReopenedWords, link: "/" });
  return true;
}

/** Whether any Trial Workspace exists: the cleanup keeps running for them after trials stop being offered. */
export async function trialsExist(): Promise<boolean> {
  const { count } = await db().from("workspaces").select("id", { count: "exact", head: true }).not("trial_ends_at", "is", null);
  return (count ?? 0) > 0;
}

/** Everything the scheduler does for trials, in order. Answers counts only. */
export async function trialCleanup(now = new Date()): Promise<{ reminded: number; closed: number; deleted: number }> {
  // The whole run waits when the settings cannot be read: the next run (an hour later) tries again.
  try {
    await settingsInEffectStrict();
  } catch (e) {
    console.error(`Trial cleanup skipped: ${(e as Error).message}`);
    throw e;
  }
  return { reminded: await remindEndingTrials(now), closed: await closeEndedTrials(now), deleted: await deleteExpiredTrials(now) };
}

/** The Owner ends their trial now: it is deleted at once with everything in it, and they with it. */
export async function endTrialNow(actor: Actor): Promise<void> {
  if (actor.role !== "owner" || !(await trialEndsAt(actor.workspaceId))) throw new Forbidden("Only a trial's Owner can end it.");
  // Fail closed like the cleanup: with the setting unreadable, an ended trial might be one to keep.
  if (trialThen(await settingsInEffectStrict()) === "keep") throw new Forbidden("Trials are kept here, not deleted.");
  await deleteTrial(actor.workspaceId);
}

/** A trial's Metrics and values as CSV, for its Owner to keep: one row per value, oldest first per Metric. Every
 * field is quoted, and one that starts like a formula gets a leading apostrophe, so a spreadsheet never runs it.
 * Values are written in the workspace's Number Style, without group marks and as precise as stored, and the fields
 * are separated by ";" when the decimal mark is a comma, as spreadsheets set to that style expect (spec 0022). */
export async function trialValuesCsv(actor: Actor): Promise<string> {
  if (actor.role !== "owner" || !(await trialEndsAt(actor.workspaceId))) throw new Forbidden("Only a trial's Owner can download it this way.");
  return valuesCsv(actor.workspaceId, null);
}

/** A Workspace's values as CSV (see trialValuesCsv), of every Metric or only of the ones given. For callers that
 * checked who may read them. */
export async function valuesCsv(workspaceId: string, only: ReadonlySet<number> | null): Promise<string> {
  return `${(await valueLines(workspaceId, only)).join("\r\n")}\r\n`;
}

/** The lines of valuesCsv, the header first and then one per value, for a caller that also counts them. A read that
 * fails throws: a file is never handed out with values missing. For callers that checked who may read them. */
export async function valueLines(workspaceId: string, only: ReadonlySet<number> | null): Promise<string[]> {
  const [{ data: sealedRows }, style] = await Promise.all([
    db().from("metrics").select("id, slug, name, period, unit, aggregation").eq("workspace_id", workspaceId),
    numberStyleOf(workspaceId),
  ]);
  // Names are sealed, so the order by name is made here, on the opened rows.
  const all = (await openRows("metrics", workspaceId, sealedRows)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const metrics = all.filter((m) => !only || only.has(m.id as number));
  const sep = NUMBER_STYLE_MARKS[style].decimal === "," ? ";" : ",";
  const cell = (v: unknown) => {
    const s = String(v ?? "");
    // The full-width signs and a line feed start a formula in some spreadsheets too.
    return `"${(/^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  // A value is ours, never text someone typed: a minus is a negative number, not a formula.
  const number = (v: unknown) => `"${csvNumber(Number(v), style)}"`;
  // A Condensed Value (spec 0033) is one line for its span: `period` is the span's kind, `period_start` its first day,
  // `period_end` its last, `condensed_from` how many of the Metric's periods it was made from; both are empty on a value.
  const lines = [["metric", "name", "period", "period_start", "value", "unit", "source", "recorded_at", "period_end", "condensed_from"].map(cell).join(sep)];
  const condensed = await condensedFor(workspaceId, metrics.map((m) => m.id as number));
  for (const m of metrics) {
    for (let from = 0; ; from += 1000) {
      const { data: rows, error } = await db().from("observations").select("id, period_start, value, value_sealed, source, created_at").eq("workspace_id", workspaceId).eq("metric_id", m.id)
        .order("period_start").order("id").range(from, from + 999);
      if (error) throw new Error("The values could not be read. Try again in a moment.");
      // A period a Condensed Value stands for is written once, as it, even while its originals are not deleted yet.
      for (const r of (await openRows("observations", workspaceId, (rows ?? []) as Record<string, unknown>[])).filter((x) => typeof x.value === "number" && !inCondensed(condensed[m.id as number] ?? [], String(x.period_start)))) lines.push([cell(m.slug), cell(m.name), cell(m.period), cell(r.period_start), number(r.value), cell(m.unit), cell(r.source), cell(r.created_at), cell(""), cell("")].join(sep));
      if (!rows || rows.length < 1000) break;
    }
    for (const c of condensed[m.id as number] ?? []) {
      const value = valueOfParts(m.aggregation as Aggregation, [partOfCondensed(c)], c.of);
      if (value !== undefined) lines.push([cell(m.slug), cell(m.name), cell(c.into), cell(c.period), number(value), cell(m.unit), cell("condensed"), cell(c.condensedOn), cell(c.periodEnd), cell(c.held)].join(sep));
    }
  }
  return lines;
}
