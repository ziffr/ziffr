// The monthly usage digest (spec 0031, ticket #368; GLOSSARY: Usage). Once a month each Owner of a Workspace that has
// something unused gets one plain-text email: counts, at most five names a list, and a link to the Usage page. Never
// a value, a View Count per item or an answer; the names are what that Owner sees on the page, so it says nothing the
// page does not. Never for the demo, a trial or a Workspace still within its first 90 days of counting. Each Owner's
// month is claimed in the database before anything is made, so repeated or parallel runs send once. It goes through
// the ordinary Delivery and mail path (limits, address, Outbox). One setting per person switches it off everywhere;
// the link in the email does it with no sign-in (usage-digest-token.ts).
import type { Actor } from "./actor";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { linkTo } from "./deliveries";
import { addressIn, mailEnabled } from "./mail";
import { initialDeliveryState } from "./outbound";
import { insertSealed } from "./sealed-columns";
import { settingsInEffect } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspaceUsage, type UsageReport } from "./usage-report";
import { digestTokenAvailable, verifyDigestToken } from "./usage-digest-token";

/** Names shown per list. */
export const DIGEST_NAMES = 5;
/** The digest goes out on days 1 to 7 of a month (UTC): the 1st, and a missed day caught up in the first week. */
export const DIGEST_LAST_DAY = 7;
/** Most time one run takes; what is left waits for the next day's run. */
const BUDGET_MS = 8 * 60_000;
const DAY = 86_400_000;

/** The digest's subject; it carries the Workspace's name so an Owner of several can tell them apart. */
const subjectFor = (workspace: string) => `Unused in ${clean(workspace)} on Ziffr`;

/** A name as one short line: control, invisible and direction-changing characters and runs of spaces become one space,
 * "://" is broken so a mail client does not turn a name into a link, long names are cut. */
function clean(name: unknown): string {
  const one = String(name ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]+/g, " ").replace(/:\/\//g, ": //").replace(/\s+/g, " ").trim();
  return one.length > 80 ? `${one.slice(0, 79)}…` : one;
}

type Part = { count: number; heading: (n: number) => string; items: { name: string; why: string }[] };

/** The lists the digest reports, from the Usage page's own report: what is not opened, Metrics without values and
 * Submitters without values. Only counts and names; "read by a program", projections and suggestions stay on the page. */
function parts(r: UsageReport): Part[] {
  const s = (n: number) => (n === 1 ? "" : "s");
  const plain = (rows: { name: string; why: string }[]) => rows.map((x) => ({ name: x.name, why: x.why }));
  const all: Part[] = [
    { count: r.notOpened.dashboards.length, heading: (n) => `${n} dashboard${s(n)} not opened for ${r.unusedDays} days`, items: plain(r.notOpened.dashboards) },
    { count: r.notOpened.decks.length, heading: (n) => `${n} deck${s(n)} not opened for ${r.unusedDays} days`, items: plain(r.notOpened.decks) },
    { count: r.notOpened.metrics.length, heading: (n) => `${n} Metric${s(n)} not opened for ${r.unusedDays} days`, items: plain(r.notOpened.metrics) },
    { count: r.noValues.length, heading: (n) => `${n} Metric${s(n)} without values`, items: plain(r.noValues) },
    { count: r.submitters.length, heading: (n) => `${n} Submitter${s(n)} who ${n === 1 ? "has" : "have"} not sent a value`, items: r.submitters.map((x) => ({ name: x.name, why: `asked for ${x.metrics.length} Metric${s(x.metrics.length)}` })) },
  ];
  return all.filter((p) => p.count > 0);
}

/** The digest's text for one Owner, or null when the Usage page has nothing unused to say. Holds no value. */
export function digestText(report: UsageReport, workspaceName: string): string | null {
  const list = parts(report);
  if (!list.length) return null;
  const out = [`Something in ${clean(workspaceName)} may be ready to tidy up. This is what Ziffr counted:`, ""];
  for (const p of list) {
    out.push(`${p.heading(p.count)}:`);
    for (const i of p.items.slice(0, DIGEST_NAMES)) out.push(`  - ${clean(i.name)} (${clean(i.why)})`);
    if (p.count > DIGEST_NAMES) out.push(`  and ${p.count - DIGEST_NAMES} more`);
    out.push("");
  }
  out.push("Nothing is archived or deleted by itself. See the lists and decide on the Usage page:", linkTo("/settings/usage"));
  return out.join("\n");
}

/** The actor switches the usage digest on or off for themselves, in every Workspace. Only their own, and refused in the
 * demo, whose made-up people get no email. */
export async function setUsageDigest(actor: Actor, on: boolean): Promise<void> {
  // The setting belongs to the person, not to the Workspace, so the database's guard does not see it: refused here.
  refuseInDemo(actor);
  if (on === true) await db().from("usage_digest_opt_outs").delete().eq("person_id", actor.personId);
  else await db().from("usage_digest_opt_outs").upsert({ person_id: actor.personId }, { onConflict: "person_id", ignoreDuplicates: true });
}

/** Whether the unsubscribe link's token is one Ziffr signed (for the page that asks first). Reveals nothing else. */
export function usageDigestTokenValid(token: string): boolean {
  return verifyDigestToken(token) !== null;
}

/** Switches the digest off for the person a signed token names, with no sign-in. False for any other token; using it twice, or
 * for a person who is gone, changes nothing. */
export async function optOutOfUsageDigestByToken(token: string): Promise<boolean> {
  const person = verifyDigestToken(token);
  if (!person) return false;
  // A person who is gone has nothing to stop; it says the same as for anyone, so the link tells nothing about accounts.
  const { data: p } = await db().from("profiles").select("id").eq("id", person).maybeSingle();
  if (!p) return true;
  const { error } = await db().from("usage_digest_opt_outs").upsert({ person_id: person }, { onConflict: "person_id", ignoreDuplicates: true });
  return !error;
}

/** The month as yyyy-mm (UTC). */
const monthOf = (now: Date) => now.toISOString().slice(0, 7);

/** The digest for one Owner of one Workspace this month: claimed first, then built from what that Owner sees. Returns
 * true when an email was queued. A claim whose Delivery could not be made is given back. */
async function digestFor(ws: { id: string; name: string }, ownerId: string, month: string, now: Date): Promise<boolean> {
  const { data: claimed, error } = await db().from("usage_digests").upsert({ workspace_id: ws.id, person_id: ownerId, month }, { onConflict: "workspace_id,month,person_id", ignoreDuplicates: true }).select("person_id");
  if (error || !claimed?.length) return false;
  try {
    const owner: Actor = { personId: ownerId, workspaceId: ws.id, role: "owner" };
    const report = await workspaceUsage(owner, now);
    // Not before the Workspace's own unused days have been counted (the job's date test is the shortest they may be).
    if (report.countingSince === null || report.fillsInOn !== null) { await release(ws.id, ownerId, month); return false; }
    const text = digestText(report, ws.name);
    if (text === null) return false;
    const state = await initialDeliveryState("email", ws.id, ownerId);
    // Held back (a trial, say) or not queued for sending: nothing is made for the Outbox either.
    if (state !== "queued") { await release(ws.id, ownerId, month); return false; }
    // Queued only: the deliveries job sends it within the Workspace's and inbox's limits.
    await insertSealed("deliveries", ws.id, [{ connector: "email", recipient_id: ownerId, sender_id: null, kind: "digest", subject: subjectFor(ws.name), body: text, mail_state: state }]);
    return true;
  } catch (e) {
    await release(ws.id, ownerId, month);
    throw e;
  }
}

/** Gives a claim back, so the next run tries again. */
async function release(workspaceId: string, personId: string, month: string): Promise<void> {
  await db().from("usage_digests").delete().eq("workspace_id", workspaceId).eq("person_id", personId).eq("month", month);
}

/** The job: on days 1 to 7 of the month, the digest to each Owner who has not opted out, of each Workspace that is
 * not the demo or a trial and has counted for 90 days. Does nothing without working email or a key to sign the
 * unsubscribe link (said in the log). Answers counts only. */
export async function usageDigestJob(now = new Date()): Promise<{ sent: number; skipped: number; failed: number }> {
  const none = { sent: 0, skipped: 0, failed: 0 };
  if (now.getUTCDate() > DIGEST_LAST_DAY) return none;
  const settings = await settingsInEffect();
  if (!mailEnabled(settings)) { console.error("Usage digest: this Ziffr cannot send email; nothing is sent."); return none; }
  if (!digestTokenAvailable()) { console.error("Usage digest: neither ZIFFR_SECRETS_KEY nor ZIFFR_JOB_SECRET can sign the unsubscribe link; nothing is sent."); return none; }
  const month = monthOf(now);
  // The shortest a Workspace may set (30 days); each Workspace's own days are checked by its report, which lists nothing before they have been counted.
  const since = new Date(now.getTime() - 30 * DAY).toISOString().slice(0, 10);
  const { data: workspaces, error } = await db().from("workspaces").select("id, name").neq("id", DEMO_WORKSPACE_ID).is("trial_ends_at", null).is("practice_for", null).not("usage_since", "is", null).lte("usage_since", since).order("id");
  if (error) throw new Error("The Workspaces could not be read.");
  const started = Date.now();
  const result = { ...none };
  for (const ws of workspaces ?? []) {
    if (Date.now() - started > BUDGET_MS) break;
    const { data: owners } = await db().from("memberships").select("user_id").eq("workspace_id", ws.id).eq("role", "owner");
    const ids = (owners ?? []).map((o) => o.user_id as string);
    if (!ids.length) continue;
    const [{ data: out }, { data: done }] = await Promise.all([
      db().from("usage_digest_opt_outs").select("person_id").in("person_id", ids),
      db().from("usage_digests").select("person_id").eq("workspace_id", ws.id).eq("month", month),
    ]);
    const stopped = new Set((out ?? []).map((o) => o.person_id as string));
    const handled = new Set((done ?? []).map((d) => d.person_id as string));
    for (const o of owners ?? []) {
      const id = o.user_id as string;
      if (stopped.has(id) || handled.has(id)) { result.skipped++; continue; }
      try {
        // Nobody to send to without a usable address in this Workspace.
        if (!(await addressIn(ws.id, id))) { result.skipped++; continue; }
        if (await digestFor({ id: ws.id as string, name: String(ws.name) }, id, month, now)) result.sent++; else result.skipped++;
      } catch (e) {
        // One Owner's failure waits for the next run; the others still go.
        result.failed++;
        console.error(`Usage digest: ${(e as Error).message}`);
      }
    }
  }
  return result;
}
