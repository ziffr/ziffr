// The demo's simulated outside channels (GLOSSARY: Demo Mode, Connector, Delivery): in the demo anyone may play the
// recipient answering in Slack, email or WhatsApp, or closing a ticket, the way the Sources page lets anyone play a
// submitter. Only ever in the demo workspace: real answers come in through the Connectors themselves.
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { CONNECTORS, parseReply, type ConnectorId } from "./connectors/index";
import { finishTask, postReply } from "./threads";
import { peopleIn, submitValue, type SubmissionInput, type SubmissionResult } from "./submissions";
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

/** A value sent as someone on Slack or by mail, recognised among the demo's people. */
export async function simulateMessage(actor: Actor, input: Omit<SubmissionInput, "workspaceId">): Promise<SubmissionResult> {
  demoOnly(actor);
  if (input.source !== "slack" && input.source !== "mail") throw new Forbidden();
  return submitValue({ ...input, text: String(input.text ?? "").slice(0, 5000), workspaceId: DEMO_WORKSPACE_ID });
}

/** The recipient answers where the Delivery reached them; the answer lands in the Thread. */
export async function simulateReply(actor: Actor, deliveryId: number, text: string) {
  demoOnly(actor);
  const d = await actionDelivery(deliveryId);
  if (!CONNECTORS[d.connector as ConnectorId]?.capabilities.includes("replies")) throw new Forbidden();
  const { body, correction } = parseReply(String(text ?? "").slice(0, 2000));
  if (!body && correction === null) throw new Error("Write an answer first.");
  await postReply(DEMO_WORKSPACE_ID, d.action_id, d.recipient_id, body, correction);
  await db().from("deliveries").update({ status: "answered" }).eq("id", deliveryId).eq("workspace_id", DEMO_WORKSPACE_ID);
}

/** Closing the ticket marks the task done. */
export async function simulateTicketClose(actor: Actor, deliveryId: number) {
  demoOnly(actor);
  const d = await actionDelivery(deliveryId);
  if (d.connector !== "tickets") throw new Forbidden();
  if (!(await finishTask(DEMO_WORKSPACE_ID, d.action_id, d.recipient_id))) throw new Error("That task is not open any more.");
  await db().from("deliveries").update({ status: "closed" }).eq("action_id", d.action_id).eq("connector", "tickets").eq("workspace_id", DEMO_WORKSPACE_ID);
}

/** The submitter answers a Prompt where it reached them; the answer goes through intake and its Submission Rule. */
export async function simulatePromptAnswer(actor: Actor, deliveryId: number, text: string): Promise<SubmissionResult> {
  demoOnly(actor);
  const { data: d } = await db().from("deliveries").select("*, prompts(id, source)").eq("id", deliveryId).eq("workspace_id", DEMO_WORKSPACE_ID).maybeSingle();
  const p = d?.prompts as { id: number; source: string } | null;
  if (!d || d.kind !== "prompt" || !p || (p.source !== "slack" && p.source !== "mail")) throw new Forbidden();
  // The recipient's handle or address as the demo knows them (a Contact's are kept per workspace).
  const person = (await peopleIn(DEMO_WORKSPACE_ID, { contactDetails: true })).find((x) => x.id === d.recipient_id);
  if (!person) throw new Forbidden();
  const r = await submitValue({ source: p.source as "slack" | "mail", sender: p.source === "slack" ? person.slack_handle : person.email, text: String(text ?? "").slice(0, 2000), promptId: p.id, workspaceId: DEMO_WORKSPACE_ID });
  if (r.ok) await db().from("deliveries").update({ status: "answered" }).eq("id", deliveryId).eq("workspace_id", DEMO_WORKSPACE_ID);
  return r;
}
