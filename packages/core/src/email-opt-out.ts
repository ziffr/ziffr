// Opting out of email (spec 0004, ticket #74; GLOSSARY: Prompt, Delivery). Every Prompt and reminder by email has a
// one-click link (RFC 8058) with a token of its own; using it stops Prompts and reminders by email for that person in
// that workspace, and the owners of the Metrics concerned are told. Questions, tasks and Thread replies keep coming.
import type { Actor } from "./actor";
import { db } from "./db";
import { openNames } from "./sealed-columns";
import { deliverNotice } from "./deliveries";
import { OPT_OUT_KINDS } from "./mail";
import { DEMO_WORKSPACE_ID } from "./team";

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** Whether an unsubscribe token belongs to a Prompt or reminder that can be stopped (for the page that asks first). */
export async function unsubscribeTokenValid(token: string): Promise<boolean> {
  return Boolean(await deliveryFor(token));
}

async function deliveryFor(token: string) {
  if (!TOKEN.test(String(token))) return null;
  const { data: d } = await db().from("deliveries").select("id, workspace_id, recipient_id, kind, action_id, prompt_id").eq("unsubscribe_token", token).maybeSingle();
  if (!d || d.workspace_id === DEMO_WORKSPACE_ID || !OPT_OUT_KINDS.includes(d.kind)) return null;
  return d;
}

/** Stops Prompts and reminders by email for the person the token's email went to, in its workspace. Returns false for
 * an unknown token; using a token again changes nothing and tells nobody twice. */
export async function optOutByToken(token: string): Promise<boolean> {
  const d = await deliveryFor(token);
  if (!d) return false;
  await stopEmail(d.workspace_id, d.recipient_id);
  return true;
}

/** Stops Prompts and reminders by email for a person in a workspace and tells the owners of the Metrics they submit
 * to, once: a second stop changes nothing and tells nobody again. */
async function stopEmail(workspaceId: string, personId: string): Promise<void> {
  const { data: added } = await db().from("email_opt_outs").upsert({ workspace_id: workspaceId, person_id: personId }, { onConflict: "workspace_id,person_id", ignoreDuplicates: true }).select("person_id");
  if (!added?.length) return;
  await tellOwnersOfStop(workspaceId, personId, "by email");
}

/** Tells the owners of the Metrics a person submits to that they stopped Prompts and reminders by email or on
 * Slack: they ask for those values and should know. Once a day at most per person, by either way. */
export async function tellOwnersOfStop(ws: string, personId: string, where: "by email" | "on Slack" | "on Telegram"): Promise<void> {
  // Someone who switches it off, on and off again tells the owners once a day at most, not at every flip; the claim
  // is one statement in the database, so flips sent at once tell them once too.
  const { data: mayTell } = await db().rpc("claim_opt_out_notice", { p_workspace: ws, p_person: personId });
  if (mayTell !== true) return;
  const [{ data: tokens }, { data: person }] = await Promise.all([
    db().from("tokens").select("metric_id").eq("workspace_id", ws).eq("submitter_id", personId),
    db().from("profiles").select("id, name").eq("id", personId).maybeSingle().then(async (r) => ({ data: r.data ? (await openNames(ws, [r.data]))[0] : null })),
  ]);
  const metricIds = [...new Set((tokens ?? []).map((t) => t.metric_id as number))];
  const { data: metrics } = metricIds.length ? await db().from("metrics").select("owner_id").eq("workspace_id", ws).in("id", metricIds) : { data: [] };
  const owners = [...new Set((metrics ?? []).map((m) => m.owner_id as string))].filter((o) => o !== personId);
  for (const owner of owners) {
    await deliverNotice(ws, {
      recipientId: owner, senderId: personId, subject: `${person?.name ?? "Someone"} stopped reminders ${where}`,
      text: `${person?.name ?? "Someone"} will get no more Prompts or reminders ${where} in this workspace. Ask them another way, or set another Connector for them.`,
      link: "/connectors",
    });
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
  await stopEmail(actor.workspaceId, actor.personId);
}

/** The actor gets Prompts and reminders by email again in their workspace. Only they can: it was their choice. */
export async function optBackIn(actor: Actor): Promise<void> {
  await db().from("email_opt_outs").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
}
