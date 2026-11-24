// The demo's simulated outside channels (GLOSSARY: Demo Mode, Connector, Delivery): in the demo anyone may play the
// recipient answering in Slack, email or WhatsApp, or closing a ticket, the way the Sources page lets anyone play a
// submitter. Each of these says what would happen, after the same checks as the real thing, and changes nothing (the
// `simulate…` functions: a preview, as the read-only demo always had). Where visitors may change the demo (spec 0051, ticket 8)
// the `record…` functions do the same as the real Connector does when the answer arrives, through the same core functions
// (submitValue, postReply, finishTask): the answer lands in the demo's Thread, values and Outbox, and nothing is sent, because
// the senders skip the demo (mail.ts, slack-send.ts, telegram-send.ts). Only ever in the demo workspace: real answers come in
// through the Connectors themselves.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { CONNECTORS, parseReply, type ConnectorId } from "./connectors/index";
import { participants, finishTask, postReply } from "./threads";
import { peopleIn, previewValue, submitValue, type SubmissionInput, type SubmissionResult } from "./submissions";
import { DEMO_WORKSPACE_ID } from "./team";
import { refuseInDemo } from "./demo";
import type { ChangeSource } from "./webhook-events";

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

/** The source of a message, as the Source a person's answer there is stored with. */
function messageSource(input: Omit<SubmissionInput, "workspaceId">): "slack" | "mail" {
  if (input.source !== "slack" && input.source !== "mail") throw new Forbidden();
  return input.source;
}

/** What a value sent as someone on Slack or by mail would do, recognised among the demo's people. */
export async function simulateMessage(actor: Actor, input: Omit<SubmissionInput, "workspaceId">): Promise<SubmissionResult> {
  demoOnly(actor);
  messageSource(input);
  return previewValue({ ...input, text: String(input.text ?? "").slice(0, 5000), workspaceId: DEMO_WORKSPACE_ID });
}

/** Records a value sent as someone on Slack or by mail, as the real Connector would after proving who wrote: through intake, with
 * its Submission Rule, Locks and Workflow. The person is recognised by the handle or address, as in the preview. */
export async function recordSimulatedMessage(actor: Actor, input: Omit<SubmissionInput, "workspaceId">): Promise<SubmissionResult> {
  demoOnly(actor);
  refuseInDemo(actor, "actions:recordSimulatedMessage");
  messageSource(input);
  // The sender is shown to every visitor (the intake log): only a handle or address of one of the demo's people, never words of the visitor's.
  const known = (await peopleIn(DEMO_WORKSPACE_ID, { contactDetails: true })).flatMap((p) => [p.slack_handle, p.email]).filter(Boolean);
  if (!known.includes(String(input.sender ?? ""))) throw new Forbidden("Pick one of the demo's people to send as.");
  return submitValue({ ...input, text: String(input.text ?? "").slice(0, 5000), workspaceId: DEMO_WORKSPACE_ID });
}

/** The checks of postReply (threads.ts) for a recipient's reply to a Delivery about an Action, without its writes. */
async function replyContext(deliveryId: number, text: string) {
  const d = await actionDelivery(deliveryId);
  if (!CONNECTORS[d.connector as ConnectorId]?.capabilities.includes("replies")) throw new Forbidden();
  const { body, correction } = parseReply(String(text ?? "").slice(0, 2000));
  if (!body && correction === null) throw new Error("Write an answer first.");
  const a = await participants(DEMO_WORKSPACE_ID, d.action_id);
  if (!a || ![a.asker_id, a.assignee_id, a.owner_id].includes(d.recipient_id)) throw new Error("Only the people on this thread can reply.");
  return { d, a, body, correction, who: await firstName(d.recipient_id) };
}

/** What the recipient's answer where the Delivery reached them would do in its Thread, in a sentence. */
export async function simulateReply(actor: Actor, deliveryId: number, text: string): Promise<string> {
  demoOnly(actor);
  const { a, d, body, correction, who } = await replyContext(deliveryId, text);
  if (a.purpose === "approval" && a.assignee_id === d.recipient_id && a.status === "open" && correction === null) {
    if (/^\s*approved?\b/i.test(body)) return `${who}'s answer would approve the value.`;
    if (/^\s*send back\b/i.test(body)) return `${who}'s answer would send the value back.`;
  }
  return correction !== null ? `${who}'s answer would land in the thread, proposing ${correction} as a correction.` : `${who}'s answer would land in the thread.`;
}

/** Where a Delivery's Connector says an answer came from, for the change it makes (webhooks, history). */
const ANSWERED_FROM: Partial<Record<ConnectorId, ChangeSource>> = { email: { type: "email" }, slack: { type: "slack" }, telegram: { type: "telegram" }, tickets: { type: "ticket_system" } };

/** Records the recipient's answer to a Delivery about an Action, as the real Connector does: a reply in the Thread, "approve" or
 * "send back" on an Approval, "confirm" or a Correction on a Self-check, "done" on a Checklist Task. Says what it did. */
export async function recordSimulatedReply(actor: Actor, deliveryId: number, text: string): Promise<string> {
  demoOnly(actor);
  refuseInDemo(actor, "connector-actions:recordSimulatedReply");
  const { a, d, body, correction, who } = await replyContext(deliveryId, text);
  await postReply(DEMO_WORKSPACE_ID, d.action_id, d.recipient_id, body, correction, ANSWERED_FROM[d.connector as ConnectorId] ?? { type: "app" });
  await db().from("deliveries").update({ status: "answered" }).eq("id", d.id).eq("workspace_id", DEMO_WORKSPACE_ID);
  if (a.purpose === "approval" && a.assignee_id === d.recipient_id && a.status === "open" && correction === null && /^\s*(approved?|send back)\b/i.test(body)) {
    return `${who}'s answer ${/^\s*approved?\b/i.test(body) ? "approved the value" : "sent the value back"}.`;
  }
  return correction !== null ? `${who}'s answer is in the thread, proposing ${correction} as a correction.` : `${who}'s answer is in the thread.`;
}

/** The checks of finishTask (threads.ts) for closing a ticket, read instead of written. */
async function ticketContext(deliveryId: number) {
  const d = await actionDelivery(deliveryId);
  if (d.connector !== "tickets") throw new Forbidden();
  const a = await participants(DEMO_WORKSPACE_ID, d.action_id);
  if (!a || a.kind !== "task" || a.status !== "open" || a.assignee_id !== d.recipient_id) throw new Error("That task is not open any more.");
  return { d, a };
}

/** What closing the ticket would do: mark the task done. */
export async function simulateTicketClose(actor: Actor, deliveryId: number): Promise<string> {
  demoOnly(actor);
  const { a } = await ticketContext(deliveryId);
  return `The task would be done in Ziffr, and ${await firstName(a.asker_id)} would be told.`;
}

/** Closes the ticket as the ticket system does when someone there does: the task is done in Ziffr and its asker is told (in the Outbox). */
export async function recordSimulatedTicketClose(actor: Actor, deliveryId: number): Promise<string> {
  demoOnly(actor);
  refuseInDemo(actor, "connector-actions:recordSimulatedTicketClose");
  const { d, a } = await ticketContext(deliveryId);
  if (!(await finishTask(DEMO_WORKSPACE_ID, a.id, d.recipient_id, { type: "ticket_system" }))) throw new Error("That task is not open any more.");
  return `The task is done in Ziffr, and ${await firstName(a.asker_id)} is told.`;
}

/** What a Prompt Delivery is about, and who it went to as the demo knows them: the checks both the preview and the recording make. */
async function promptContext(deliveryId: number) {
  const { data: d } = await db().from("deliveries").select("*, prompts(id, source)").eq("id", deliveryId).eq("workspace_id", DEMO_WORKSPACE_ID).maybeSingle();
  const p = d?.prompts as { id: number; source: string } | null;
  if (!d || d.kind !== "prompt" || !p || (p.source !== "slack" && p.source !== "mail")) throw new Forbidden();
  // The recipient's handle or address as the demo knows them (a Contact's are kept per workspace).
  const person = (await peopleIn(DEMO_WORKSPACE_ID, { contactDetails: true })).find((x) => x.id === d.recipient_id);
  if (!person) throw new Forbidden();
  return { source: p.source as "slack" | "mail", sender: p.source === "slack" ? person.slack_handle : person.email, promptId: p.id };
}

/** What the submitter's answer to a Prompt where it reached them would do, through intake and its Submission Rule. */
export async function simulatePromptAnswer(actor: Actor, deliveryId: number, text: string): Promise<SubmissionResult> {
  demoOnly(actor);
  const { source, sender, promptId } = await promptContext(deliveryId);
  return previewValue({ source, sender, text: String(text ?? "").slice(0, 2000), promptId, workspaceId: DEMO_WORKSPACE_ID });
}

/** Records the submitter's answer to a Prompt as the real Connector does: through intake with its Submission Rule, Locks and
 * Workflow, which closes the Prompt and its other ways (prompt-ways.ts). */
export async function recordSimulatedPromptAnswer(actor: Actor, deliveryId: number, text: string): Promise<SubmissionResult> {
  demoOnly(actor);
  refuseInDemo(actor, "connector-actions:recordSimulatedPromptAnswer");
  const { source, sender, promptId } = await promptContext(deliveryId);
  return submitValue({ source, sender, text: String(text ?? "").slice(0, 2000), promptId, workspaceId: DEMO_WORKSPACE_ID });
}
