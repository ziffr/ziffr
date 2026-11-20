// Thread replies (GLOSSARY: Thread, Correction), wherever they are written: in Ziffr or answered through a Connector.
// Every function looks the Action up in one Workspace only.
import { db } from "./db";
import { insertSealed } from "./sealed-columns";
import { deliver } from "./deliveries";
import { changeActionState } from "./action-state";
import { FROM_APP, queueWebhookEvent, type ChangeSource } from "./webhook-events";
import type { ConnectorId } from "./connectors/index";

/** Who takes part in an Action: asker, assignee and the metric's owner. Only they reply. */
export async function participants(ws: string, actionId: number) {
  const { data: a } = await db().from("actions").select("id, asker_id, assignee_id, status, kind, purpose, metric_id, period_start, metrics(owner_id)").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (!a) return null;
  return { ...a, owner_id: (a.metrics as unknown as { owner_id: string }).owner_id };
}

/** Adds a reply and tells the others, through each one's Connector. On an approval task, "approve" or
 * "send back: …" from the approver decide it, from Ziffr or from Slack, email or WhatsApp. On a Self-check,
 * "confirm" or "Correction: <value>" from the submitter it is for decide it the same way. */
export async function postReply(ws: string, actionId: number, authorId: string, body: string, correction: number | null, source: ChangeSource = FROM_APP) {
  const a = await participants(ws, actionId);
  if (!a || ![a.asker_id, a.assignee_id, a.owner_id].includes(authorId)) throw new Error("Only the people on this thread can reply.");
  if (a.purpose === "approval" && a.assignee_id === authorId && a.status === "open" && correction === null) {
    const { approve, sendBack } = await import("./workflow-engine");
    if (/^\s*approved?\b/i.test(body)) { await approve(ws, actionId, authorId, source); return; }
    const back = body.match(/^\s*send back\s*:?\s*([\s\S]*)$/i);
    if (back) { await sendBack(ws, actionId, authorId, back[1].trim(), source); return; }
  }
  if (a.purpose === "self_check" && a.assignee_id === authorId && a.status === "open") {
    const { confirmSelfCheck, correctSelfCheck } = await import("./workflow-engine");
    if (correction !== null) { await correctSelfCheck(ws, actionId, authorId, correction, source); return; }
    if (/^\s*(confirm(ed)?|yes)\b/i.test(body)) { await confirmSelfCheck(ws, actionId, authorId, source); return; }
  }
  const [message] = await insertSealed("thread_messages", ws, [{
    action_id: actionId,
    author_id: authorId,
    body: body || (correction !== null ? "Proposing a correction." : "…"),
    correction_value: correction,
    correction_status: correction !== null ? "proposed" : null,
  }]);
  const messageId = Number(message?.id) || null;
  // The Assignee replying moves an open Action to answered; not an Approval or Self-check, which only their own
  // commands decide: answered, it could no longer be decided and the value would wait for good. The change tells the
  // Webhooks (with the reply); a reply that changes no state is an update of its own.
  const moved = a.assignee_id === authorId && a.status === "open" && a.purpose !== "approval" && a.purpose !== "self_check"
    ? await changeActionState(ws, actionId, { to: "answered", from: ["open"], guard: { assigneeId: authorId, purpose: "plain_or_escalation" }, messageId }, source)
    : null;
  if (!moved?.changed) {
    await db().from("actions").update({ updated_at: new Date().toISOString() }).eq("id", actionId).eq("workspace_id", ws);
    await queueWebhookEvent(ws, "action.updated", source, { actionId, metricId: a.metric_id, period: a.period_start, threadMessageId: messageId });
  }
  const other = authorId === a.assignee_id ? a.asker_id : a.assignee_id;
  await deliver({ kind: "reply", actionId, senderId: authorId, recipientId: other, text: body, correction });
  if (correction !== null && a.owner_id !== other) await deliver({ kind: "correction", actionId, senderId: authorId, recipientId: a.owner_id, text: body, correction });
}

/** A task marked done, in Ziffr or by closing its ticket. Never an Approval or Self-check: those are decided by
 * approving, sending back, confirming or correcting, and one marked done would leave its value waiting for good. */
export async function finishTask(ws: string, actionId: number, byId: string, source: ChangeSource = FROM_APP) {
  const { changed } = await changeActionState(ws, actionId, { to: "answered", from: ["open"], reason: "done", guard: { assigneeId: byId, kind: "task", purpose: "plain_or_escalation" } }, source);
  if (!changed) return false;
  const { data } = await db().from("actions").select("asker_id").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (data) await deliver({ kind: "done", actionId, senderId: byId, recipientId: data.asker_id });
  return true;
}

/** A Connector picked for one message, or none to use the recipient's preference. */
export type Via = ConnectorId | null | undefined;
