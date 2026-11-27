// Opting out of email (spec 0004, ticket #74; GLOSSARY: Prompt, Delivery). Every Prompt and reminder by email has a
// one-click link (RFC 8058) with a token of its own; using it stops Prompts and reminders by email for that person in
// that workspace, and the owners of the Metrics concerned are told which of their numbers it means. Questions, tasks
// and Thread replies keep coming. Only the person gets the emails again: their own switch here, the Undo of the stop
// just made, or the link of a message sent to them (email-resume.ts).
import { randomBytes } from "node:crypto";
import type { Actor } from "./actor";
import { db } from "./db";
import { openNames } from "./sealed-columns";
import { deliverNotice, waysFor } from "./deliveries";
import { feedIdsAmong } from "./feed-people";
import { hashed } from "./internal/delivery-send";
import { addressIn, mailboxMark, OPT_OUT_KINDS } from "./mail";
import { mailRepliesReturn, openWays } from "./prompt-reach";
import { allowedWays, type PromptWay } from "./prompt-route";
import { stopNotice, type StoppedMetric } from "./stop-notice";
import { DEMO_WORKSPACE_ID } from "./team";
import { personBlocked } from "./user-block";
import { getMetrics } from "./workspace-data";
import type { Metric, SourceId } from "./types";

const TOKEN = /^[A-Za-z0-9_-]{32}$/;
/** The secret of an Undo: 32 random bytes in base64url. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;

/** How long the Undo on the page that has just stopped the emails works. */
export const UNDO_MINUTES = 30;

/** Whether an unsubscribe token belongs to a Prompt or reminder that can be stopped (for the page that asks first). */
export async function unsubscribeTokenValid(token: string): Promise<boolean> {
  return Boolean(await deliveryFor(token));
}

/** Whether a token belongs to an Alert message, whose link pauses that Alert and not reminders (for the page that asks). */
export async function unsubscribeIsAlert(token: string): Promise<boolean> {
  return (await deliveryFor(token))?.kind === "alert";
}

/** Whether a token belongs to a Heads-up message, whose link switches off Heads-ups by message (for the page that asks). */
export async function unsubscribeIsHeadsUp(token: string): Promise<boolean> {
  return (await deliveryFor(token))?.kind === "heads_up";
}

/** Whether a token belongs to a Tell message, whose link says "stop telling me" for its Workflow (for the page that asks). */
export async function unsubscribeIsTell(token: string): Promise<boolean> {
  return Boolean((await deliveryFor(token))?.tell_workflow_id);
}

async function deliveryFor(token: string) {
  if (!TOKEN.test(String(token))) return null;
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id, alert_id, tell_workflow_id").eq("unsubscribe_token", token).maybeSingle();
  if (!d || d.workspace_id === DEMO_WORKSPACE_ID || !(OPT_OUT_KINDS.includes(d.kind) || (d.kind === "alert" && (d.alert_id || d.tell_workflow_id)) || d.kind === "heads_up" || (d.kind === "checklist" && d.tell_workflow_id))) return null;
  return d;
}

/** What using a link did. `undo` is given only when this very call stopped the requests by email: the secret that takes
 * that stop back for UNDO_MINUTES. A link used again, or after a stop made another way, gets none, so an old or
 * forwarded email never switches anything back on. */
export type Unsubscribed = { undo: string | null };

/** Stops what the token's email was about, for the person it went to, in its workspace: Prompts and reminders by email,
 * or the one Alert, Workflow or Heads-ups. Returns false for an unknown token; using a token again changes nothing and
 * tells nobody twice. */
export async function optOutByToken(token: string): Promise<false | Unsubscribed> {
  const d = await deliveryFor(token);
  if (!d) return false;
  if ((d.kind === "alert" || d.kind === "checklist") && d.tell_workflow_id) {
    // A Tell message or a Checklist Item (GLOSSARY: Tell, Checklist Item): "stop telling me" for the Workflow it came from, the person's own switch (tell.ts).
    await db().from("tell_stops").upsert({ workflow_id: d.tell_workflow_id, person_id: d.recipient_id, workspace_id: d.workspace_id }, { onConflict: "workflow_id,person_id", ignoreDuplicates: true });
    return { undo: null };
  }
  if (d.kind === "heads_up") {
    // The person's own switch, as under Your Deliveries: no more Heads-ups by message (they stay in the list); open ones end.
    await db().from("heads_up_settings").upsert({ workspace_id: d.workspace_id, person_id: d.recipient_id, by_message: false, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
    await db().rpc("end_heads_up_told", { p_ws: d.workspace_id, p_person: d.recipient_id, p_standing: [], p_now: new Date().toISOString() });
    return { undo: null };
  }
  if (d.kind === "alert") {
    // One Alert, the one this message was about and only if it is still its recipient's (GLOSSARY: Alert): paused by the
    // person's own switch, which nothing but the person undoes. Using the link again changes nothing.
    await db().from("alerts").update({ paused_by_person: true, updated_at: new Date().toISOString() }).eq("id", d.alert_id).eq("workspace_id", d.workspace_id).eq("person_id", d.recipient_id);
    return { undo: null };
  }
  const undo = randomBytes(32).toString("base64url");
  // The mailbox this link was sent to, from the send's own record: where a later question may go.
  const { data: sent } = await db().from("email_sends").select("address_key").eq("delivery_id", d.id).order("id", { ascending: false }).limit(1).maybeSingle();
  const added = await stopEmail(d.workspace_id, d.recipient_id, {
    undo_hash: hashed(undo), undo_until: new Date(Date.now() + UNDO_MINUTES * 60_000).toISOString(),
    address_hash: sent ? hashed(sent.address_key as string) : null,
  });
  return { undo: added ? undo : null };
}

/** Takes back the stop that the page has just made: only with that stop's own secret, once, within UNDO_MINUTES, and
 * only beside the link of an email to the same person. Both are untrusted. Returns whether the emails are on again. */
export async function undoEmailStop(token: string, undo: string): Promise<boolean> {
  if (!SECRET.test(String(undo))) return false;
  const d = await deliveryFor(token);
  if (!d || !OPT_OUT_KINDS.includes(d.kind) || (await personBlocked(d.recipient_id))) return false;
  // One statement: the secret goes with the row, so it works once, also when pressed twice at once.
  const { data } = await db().from("email_opt_outs").delete().eq("workspace_id", d.workspace_id).eq("person_id", d.recipient_id)
    .eq("undo_hash", hashed(undo)).gt("undo_until", new Date().toISOString()).select("person_id");
  return Boolean(data?.length);
}

/** Stops Prompts and reminders by email for a person in a workspace and tells the owners of the Metrics they are asked
 * for. Says whether this call made the stop: a second one changes nothing, keeps nothing of `kept` and tells nobody. */
async function stopEmail(workspaceId: string, personId: string, kept: { undo_hash?: string; undo_until?: string; address_hash: string | null }): Promise<boolean> {
  const { data: added, error } = await db().from("email_opt_outs").upsert({ workspace_id: workspaceId, person_id: personId, ...kept }, { onConflict: "workspace_id,person_id", ignoreDuplicates: true }).select("person_id");
  if (error) throw new Error("The requests by email could not be stopped. Try again in a moment.");
  if (!added?.length) return false;
  // The stop stands whether or not the owners can be told now: the person's page does not fail on it.
  await tellOwnersOfStop(workspaceId, personId, "email").catch((e: unknown) => console.error("Owners could not be told of a stop:", e instanceof Error ? e.message : e));
  return true;
}

/** Tells the owners of the Metrics a person is asked for that they stopped requests by this way: which of that owner's
 * numbers it concerns, who is still asked and what stays empty (stop-notice.ts). Each owner hears only of Metrics they
 * own. Once a day at most per person, by any way. The caller has recorded the stop. */
export async function tellOwnersOfStop(ws: string, personId: string, way: PromptWay): Promise<void> {
  // Someone who switches it off, on and off again tells the owners once a day at most, not at every flip; the claim
  // is one statement in the database, so flips sent at once tell them once too.
  const { data: mayTell } = await db().rpc("claim_opt_out_notice", { p_workspace: ws, p_person: personId });
  if (mayTell !== true) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data: held } = await db().from("tokens").select("metric_id, stands_in_for, expires_at").eq("workspace_id", ws).eq("submitter_id", personId);
  // A Stand-in's lapsed Token asks nothing any more.
  const ids = new Set((held ?? []).filter((t) => !(t.stands_in_for && t.expires_at && String(t.expires_at) < today)).map((t) => t.metric_id as number));
  if (!ids.size) return;
  const [all, mailReplies, { data: memberships }] = await Promise.all([getMetrics(ws), mailRepliesReturn(ws), db().from("memberships").select("user_id").eq("workspace_id", ws)]);
  const members = new Set((memberships ?? []).map((m) => m.user_id as string));
  // Only numbers that are asked for, and by this way: nothing is said about a Derived or Archived Metric.
  const concerned = all.filter((m) => ids.has(m.id) && !m.formula && !m.archived_at && m.owner_id !== personId && members.has(m.owner_id) && allowedWays(m.sources as SourceId[], mailReplies)[way]);
  if (!concerned.length) return;
  const { data: tokens } = await db().from("tokens").select("metric_id, submitter_id").eq("workspace_id", ws).in("metric_id", concerned.map((m) => m.id)).is("stands_in_for", null);
  const people = [...new Set([personId, ...(tokens ?? []).map((t) => t.submitter_id as string)])];
  const [feeds, { data: profiles }] = await Promise.all([feedIdsAmong(people), db().from("profiles").select("id, name").in("id", people)]);
  const names = await openNames(ws, profiles);
  const named = (id: string) => String(names?.find((p) => p.id === id)?.name ?? "Someone");
  const openFor = async (id: string, m: Metric) => (await openWays(ws, id, m.sources as SourceId[], await waysFor(ws, id, "prompt"))).open;
  const facts = async (m: Metric): Promise<StoppedMetric & { owner: string }> => {
    const others = [...new Set((tokens ?? []).filter((t) => t.metric_id === m.id && t.submitter_id !== personId).map((t) => t.submitter_id as string))];
    const asked = await Promise.all(others.filter((id) => !feeds.has(id)).map(async (id) => ((await openFor(id, m)).length ? (id === m.owner_id ? "You" : named(id)) : null)));
    return {
      owner: m.owner_id, name: String(m.name), slug: m.slug, still: await openFor(personId, m),
      others: asked.filter((n): n is string => n !== null), feeds: others.filter((id) => feeds.has(id)).map(named), form: (m.sources as SourceId[]).includes("web_form"),
    };
  };
  const metrics = await Promise.all(concerned.map(facts));
  for (const owner of new Set(metrics.map((m) => m.owner))) {
    const notice = stopNotice(named(personId), way, metrics.filter((m) => m.owner === owner));
    // From Ziffr itself: with the person as sender they would read, in their own Outbox, who else is asked.
    await deliverNotice(ws, { recipientId: owner, senderId: null, ...notice });
  }
}

/** Whether the actor stopped Prompts and reminders by email in their workspace. */
export async function emailOptedOut(actor: Actor): Promise<boolean> {
  const { data } = await db().from("email_opt_outs").select("person_id").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  return Boolean(data);
}

/** The actor stops Prompts and reminders by email in their workspace, as the link in such an email does. Only for
 * themselves, and not in the demo, whose made-up people get no email. */
export async function optOutOfEmail(actor: Actor): Promise<void> {
  const address = await addressIn(actor.workspaceId, actor.personId);
  await stopEmail(actor.workspaceId, actor.personId, { address_hash: address ? mailboxMark(address) : null });
}

/** The actor gets Prompts and reminders by email again in their workspace. Only they can: it was their choice. */
export async function optBackIn(actor: Actor): Promise<void> {
  await db().from("email_opt_outs").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
}
