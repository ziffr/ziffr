// The end of a Trial Workspace (spec 0021, ticket 9; GLOSSARY: Trial Workspace). The day before, its Owner gets one
// reminder; at its end it closes (keys revoked, Slack and Telegram unlinked; nothing is sent or taken from then on, by
// the checks in trials.ts); a week later it is deleted with everything in it, and its Owner too when it was their only
// workspace, so the Installation keeps no address of someone who is gone. The Owner may end it at once. A scheduler
// calls trialCleanup (POST /api/jobs/trial-cleanup); each step claims its rows first, so two runs never do one twice.
import { closeForSystem } from "./system-closes";
import { sendWebhooksNow } from "./webhook-send";
import { db } from "./db";
import { openNames, openRows } from "./sealed-columns";
import { Forbidden, type Actor } from "./actor";
import { deliverNotice } from "./deliveries";
import { keepTrial, trialEndsAt, trialThen } from "./trials";
import { settingsInEffect, settingsInEffectStrict } from "./settings-in-effect";
import { daysSetting } from "./installation-days";
import { defaultLimitFrom } from "./workspace-limits";
import { csvNumber } from "./export-values";
import { inCondensed, partOfCondensed, valueOfParts } from "./condensed-parts";
import { condensedFor } from "./condensed-values";
import type { Aggregation } from "./types";
import { NUMBER_STYLE_MARKS } from "./number-style";
import { numberStyleOf } from "./workspace-settings";
import { destroyWorkspaceKeys } from "./workspace-keys";

/** Days between a trial's end and its deletion unless the Installation sets otherwise (ZIFFR_TRIAL_GRACE_DAYS): time to
 * download its values. A trial keeps the days it had when it closed. */
export const TRIAL_GRACE_DAYS = 7;
const DAY = 86_400_000;

/** What a kept trial stays on (spec 0029): the default limit's name and number, for the bar and the reminder. */
export type KeptAs = { label: string | null; metrics: number | null };

/** Where a trial stands, for the bar on every page: null outside a trial. `keptAs` where trials are kept as ordinary
 * Workspaces (ZIFFR_TRIAL_THEN=keep), with what they then stay on. */
export async function trialStatus(workspaceId: string): Promise<{ endsAt: string; daysLeft: number; ended: boolean; deletedAt: string; keptAs: KeptAs | null; ownerName: string } | null> {
  const ends = await trialEndsAt(workspaceId);
  if (!ends) return null;
  const settings = await settingsInEffect();
  const left = ends.getTime() - Date.now();
  return {
    endsAt: ends.toISOString(), daysLeft: Math.max(0, Math.ceil(left / DAY)), ended: left <= 0, deletedAt: new Date(ends.getTime() + daysSetting("ZIFFR_TRIAL_GRACE_DAYS", settings) * DAY).toISOString(),
    keptAs: await keptAs(settings),
    ownerName: await ownerName(workspaceId),
  };
}

/** The trial Owner's name, for the words Members are told; "the Owner" when it cannot be read. Members of the Workspace may see who its Owner is. */
async function ownerName(workspaceId: string): Promise<string> {
  const id = await ownerOf(workspaceId);
  if (!id) return "the Owner";
  const { data } = await db().from("profiles").select("id, name").eq("id", id).maybeSingle();
  return data ? ((await openNames(workspaceId, [data]))[0]?.name || "the Owner") : "the Owner";
}

/** What a trial becomes at its end where trials are kept, else null. */
async function keptAs(settings?: Awaited<ReturnType<typeof settingsInEffect>>): Promise<KeptAs | null> {
  settings ??= await settingsInEffect();
  if (trialThen(settings) !== "keep") return null;
  const d = defaultLimitFrom(settings);
  return { label: d.label, metrics: d.metrics };
}

/** "Your trial ends on 3 December. Your Workspace then stays, on Free: up to 10 Metrics." with the default's words. */
export function keptWords(endsAt: string, kept: KeptAs): string {
  const day = new Date(endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const on = kept.metrics === null ? "" : `, on ${kept.label ?? "the default limit"}: up to ${kept.metrics.toLocaleString("en-US")} Metrics`;
  return `Your trial ends on ${day}. Your Workspace then stays${on}.`;
}

/** The trial's Owner (a trial has one). */
async function ownerOf(workspaceId: string): Promise<string | null> {
  const { data } = await db().from("memberships").select("user_id").eq("workspace_id", workspaceId).eq("role", "owner").limit(1).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

/** Reminds the Owners of trials that end within a day, once each, through their own Connector. Returns how many. */
export async function remindEndingTrials(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + DAY).toISOString();
  // Read strictly before anything is claimed: a reminder with the wrong words is never sent again.
  const settings = await settingsInEffectStrict();
  // Claimed first: only the run that sets the mark sends the reminder.
  const { data } = await db().from("workspaces").update({ trial_reminded_at: now.toISOString(), trial_grace_days: daysSetting("ZIFFR_TRIAL_GRACE_DAYS", settings) })
    .gt("trial_ends_at", now.toISOString()).lte("trial_ends_at", soon).is("trial_reminded_at", null).select("id, trial_ends_at");
  let n = 0;
  for (const w of data ?? []) {
    const owner = await ownerOf(w.id);
    if (!owner) continue;
    const day = String(w.trial_ends_at).slice(0, 10);
    const kept = await keptAs(settings);
    await deliverNotice(w.id, {
      recipientId: owner, senderId: null, subject: "Your Ziffr trial ends tomorrow",
      text: kept
        ? `${keptWords(String(w.trial_ends_at), kept)} From then on you can invite people, and every Connector reaches everyone.`
        : `Your trial ends on ${day}. Then it closes, and ${daysSetting("ZIFFR_TRIAL_GRACE_DAYS", settings)} days later it is deleted with everything in it. Download your Metrics and values before then from the bar at the top of any page.`,
      link: "/try",
    });
    n++;
  }
  return n;
}

/** Closes trials that have ended: their keys are revoked, Slack is disconnected, Telegram and Calendar Links removed. Returns
 * how many. Nothing could go out or come in after the end anyway; this tidies up what would otherwise wait for the
 * deletion. */
export async function closeEndedTrials(now = new Date()): Promise<number> {
  const at = now.toISOString();
  // Where trials are kept (spec 0029), an ended one becomes an ordinary Workspace instead: nothing is revoked. If the
  // setting cannot be read this throws and nothing is closed: revoking keys is not what a kept trial should get.
  if (trialThen(await settingsInEffectStrict()) === "keep") {
    const { data: ended } = await db().from("workspaces").select("id").lte("trial_ends_at", at).is("trial_closed_at", null);
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
  const [{ data: members }, { data: contacts }, { data: feeds }, { data: trial }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", workspaceId),
    db().from("contacts").select("person_id").eq("workspace_id", workspaceId),
    db().from("feeds").select("person_id").eq("workspace_id", workspaceId),
    db().from("workspaces").select("id").eq("id", workspaceId).not("trial_ends_at", "is", null).is("trial_kept_at", null).maybeSingle(),
  ]);
  // Only a trial is deleted here: its key is destroyed only once that is certain.
  if (!trial) return;
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
  // Fail closed: deleting needs a setting that was read and says "delete". An unreadable one throws, so a database
  // hiccup never deletes trials the Installation set to be kept; where they are kept, nothing is deleted here.
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

/** Whether any Trial Workspace exists: the cleanup keeps running for them after trials stop being offered. */
export async function trialsExist(): Promise<boolean> {
  const { count } = await db().from("workspaces").select("id", { count: "exact", head: true }).not("trial_ends_at", "is", null);
  return (count ?? 0) > 0;
}

/** Everything the scheduler does for trials, in order. Answers counts only. */
export async function trialCleanup(now = new Date()): Promise<{ reminded: number; closed: number; deleted: number }> {
  // The whole run waits when the settings cannot be read: the next run (an hour later) tries again.
  try {
    trialThen(await settingsInEffectStrict());
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
    return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
  };
  // A value is ours, never text someone typed: a minus is a negative number, not a formula.
  const number = (v: unknown) => `"${csvNumber(Number(v), style)}"`;
  // A Condensed Value (spec 0033) is one line for its span: `period` is the span's kind, `period_start` its first day,
  // `period_end` its last, `condensed_from` how many of the Metric's periods it was made from; both are empty on a value.
  const lines = [["metric", "name", "period", "period_start", "value", "unit", "source", "recorded_at", "period_end", "condensed_from"].map(cell).join(sep)];
  const condensed = await condensedFor(workspaceId, metrics.map((m) => m.id as number));
  for (const m of metrics) {
    for (let from = 0; ; from += 1000) {
      const { data: rows } = await db().from("observations").select("id, period_start, value, value_sealed, source, created_at").eq("workspace_id", workspaceId).eq("metric_id", m.id)
        .order("period_start").order("id").range(from, from + 999);
      // A period a Condensed Value stands for is written once, as it, even while its originals are not deleted yet.
      for (const r of (await openRows("observations", workspaceId, (rows ?? []) as Record<string, unknown>[])).filter((x) => typeof x.value === "number" && !inCondensed(condensed[m.id as number] ?? [], String(x.period_start)))) lines.push([cell(m.slug), cell(m.name), cell(m.period), cell(r.period_start), number(r.value), cell(m.unit), cell(r.source), cell(r.created_at), cell(""), cell("")].join(sep));
      if (!rows || rows.length < 1000) break;
    }
    for (const c of condensed[m.id as number] ?? []) {
      const value = valueOfParts(m.aggregation as Aggregation, [partOfCondensed(c)], c.of);
      if (value !== undefined) lines.push([cell(m.slug), cell(m.name), cell(c.into), cell(c.period), number(value), cell(m.unit), cell("condensed"), cell(c.condensedOn), cell(c.periodEnd), cell(c.held)].join(sep));
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}
