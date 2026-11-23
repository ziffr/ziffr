// @ts-nocheck
// The demo's simulated outside channels (GLOSSARY: Demo Mode, Connector, Delivery): in the demo anyone may play the
// recipient answering in Slack, email or WhatsApp, or closing a ticket, the way the Sources page lets anyone play a
// submitter. Nothing a visitor does in the demo is saved (#271), so each of these says what would happen, after the
// same checks as the real thing, and changes nothing. Only ever in the demo workspace: real answers come in through
// the Connectors themselves.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { CONNECTORS, parseReply, type ConnectorId } from "./connectors/index";
import { participants } from "./threads";
import { peopleIn, previewValue, type SubmissionInput, type SubmissionResult } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";

/** Refuses anything outside the demo workspace. */
function demoOnly(actor: Actor) {
  if (actor.workspaceId !== DEMO_WORKSPACE_ID) throw new Forbidden();
}

/** A Delivery about an Action, in the demo. */
async function actionDelivery(id: number) {
  const { data } = await db().from("deliveries").select("*").eq("id", id).eq("workspace_id", DEMO_WORKSPACE_ID).maybeSingle();
  if (!data || !data.action_id) throw new Forbidden();
  return data;
}

/** The first name of one of the demo's people, as a sentence names them. */
async function firstName(personId: string): Promise<string> {
  const { data } = await db().from("profiles").select("name").eq("id", personId).maybeSingle();
  return String(data?.name ?? "They").split(" ")[0];
}

/** What a value sent as someone on Slack or by mail would do, recognised among the demo's people. */
export async function simulateMessage(actor: Actor, input: Omit<SubmissionInput, "workspaceId">): Promise<SubmissionResult> {
  demoOnly(actor);
  if (input.source !== "slack" && input.source !== "mail") throw new Forbidden();
  return previewValue({ ...input, text: String(input.text ?? "").slice(0, 5000), workspaceId: DEMO_WORKSPACE_ID });
}

/** What the recipient's answer where the Delivery reached them would do in its Thread, in a sentence. */
export async function simulateReply(actor: Actor, deliveryId: number, text: string): Promise<string> {
  demoOnly(actor);
  const d = await actionDelivery(deliveryId);
  if (!CONNECTORS[d.connector as ConnectorId]?.capabilities.includes("replies")) throw new Forbidden();
  const { body, correction } = parseReply(String(text ?? "").slice(0, 2000));
  if (!body && correction === null) throw new Error("Write an answer first.");
  // The checks of postReply (threads.ts), without its writes.
  const a = await participants(DEMO_WORKSPACE_ID, d.action_id);
  if (!a || ![a.asker_id, a.assignee_id, a.owner_id].includes(d.recipient_id)) throw new Error("Only the people on this thread can reply.");
  const who = await firstName(d.recipient_id);
  if (a.purpose === "approval" && a.assignee_id === d.recipient_id && a.status === "open" && correction === null) {
    if (/^\s*approved?\b/i.test(body)) return `${who}'s answer would approve the value.`;
    if (/^\s*send back\b/i.test(body)) return `${who}'s answer would send the value back.`;
  }
  return correction !== null ? `${who}'s answer would land in the thread, proposing ${correction} as a correction.` : `${who}'s answer would land in the thread.`;
}

/** What closing the ticket would do: mark the task done. */
export async function simulateTicketClose(actor: Actor, deliveryId: number): Promise<string> {
  demoOnly(actor);
  const d = await actionDelivery(deliveryId);
  if (d.connector !== "tickets") throw new Forbidden();
  // The conditions of finishTask (threads.ts), read instead of written.
  const a = await participants(DEMO_WORKSPACE_ID, d.action_id);
  if (!a || a.kind !== "task" || a.status !== "open" || a.assignee_id !== d.recipient_id) throw new Error("That task is not open any more.");
  return `The task would be done in Ziffr, and ${await firstName(a.asker_id)} would be told.`;
}

/** What the submitter's answer to a Prompt where it reached them would do, through intake and its Submission Rule. */
export async function simulatePromptAnswer(actor: Actor, deliveryId: number, text: string): Promise<SubmissionResult> {
  demoOnly(actor);
  const { data: d } = await db().from("deliveries").select("*, prompts(id, source)").eq("id", deliveryId).eq("workspace_id", DEMO_WORKSPACE_ID).maybeSingle();
  const p = d?.prompts as { id: number; source: string } | null;
  if (!d || d.kind !== "prompt" || !p || (p.source !== "slack" && p.source !== "mail")) throw new Forbidden();
  // The recipient's handle or address as the demo knows them (a Contact's are kept per workspace).
  const person = (await peopleIn(DEMO_WORKSPACE_ID, { contactDetails: true })).find((x) => x.id === d.recipient_id);
  if (!person) throw new Forbidden();
  return previewValue({ source: p.source as "slack" | "mail", sender: p.source === "slack" ? person.slack_handle : person.email, text: String(text ?? "").slice(0, 2000), promptId: p.id, workspaceId: DEMO_WORKSPACE_ID });
}
