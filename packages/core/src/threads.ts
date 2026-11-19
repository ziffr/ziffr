// Thread replies (GLOSSARY: Thread, Correction), wherever they are written: in Ziffr or answered through a Connector.
// Every function looks the Action up in one Workspace only.
import { db } from "./db";
import { insertSealed } from "./sealed-columns";
import { deliver } from "./deliveries";
import type { ConnectorId } from "./connectors/index";

/** Who takes part in an Action: asker, assignee and the metric's owner. Only they reply. */
export async function participants(ws: string, actionId: number) {
  const { data: a } = await db().from("actions").select("id, asker_id, assignee_id, status, kind, purpose, metrics(owner_id)").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (!a) return null;
  return { ...a, owner_id: (a.metrics as unknown as { owner_id: string }).owner_id };
}

/** Adds a reply and tells the others, through each one's Connector. On an approval task, "approve" or
 * "send back: …" from the approver decide it, from Ziffr or from Slack, email or WhatsApp. On a Self-check,
 * "confirm" or "Correction: <value>" from the submitter it is for decide it the same way. */
export async function postReply(ws: string, actionId: number, authorId: string, body: string, correction: number | null) {
  const a = await participants(ws, actionId);
  if (!a || ![a.asker_id, a.assignee_id, a.owner_id].includes(authorId)) throw new Error("Only the people on this thread can reply.");
  if (a.purpose === "approval" && a.assignee_id === authorId && a.status === "open" && correction === null) {
    const { approve, sendBack } = await import("./workflow-engine");
    if (/^\s*approved?\b/i.test(body)) { await approve(ws, actionId, authorId); return; }
    const back = body.match(/^\s*send back\s*:?\s*([\s\S]*)$/i);
    if (back) { await sendBack(ws, actionId, authorId, back[1].trim()); return; }
  }
  if (a.purpose === "self_check" && a.assignee_id === authorId && a.status === "open") {
    const { confirmSelfCheck, correctSelfCheck } = await import("./workflow-engine");
    if (correction !== null) { await correctSelfCheck(ws, actionId, authorId, correction); return; }
    if (/^\s*(confirm(ed)?|yes)\b/i.test(body)) { await confirmSelfCheck(ws, actionId, authorId); return; }
  }
  await insertSealed("thread_messages", ws, [{
    action_id: actionId,
    author_id: authorId,
    body: body || (correction !== null ? "Proposing a correction." : "…"),
    correction_value: correction,
    correction_status: correction !== null ? "proposed" : null,
  }]);
  // The Assignee replying moves an open Action to answered; not an Approval or Self-check, which only their own
  // commands decide: answered, it could no longer be decided and the value would wait for good.
  const answered = a.assignee_id === authorId && a.status === "open" && a.purpose !== "approval" && a.purpose !== "self_check";
  await db().from("actions").update({ ...(answered ? { status: "answered" } : {}), updated_at: new Date().toISOString() }).eq("id", actionId).eq("workspace_id", ws);
  const other = authorId === a.assignee_id ? a.asker_id : a.assignee_id;
  await deliver({ kind: "reply", actionId, senderId: authorId, recipientId: other, text: body, correction });
  if (correction !== null && a.owner_id !== other) await deliver({ kind: "correction", actionId, senderId: authorId, recipientId: a.owner_id, text: body, correction });
}

/** A task marked done, in Ziffr or by closing its ticket. Never an Approval or Self-check: those are decided by
 * approving, sending back, confirming or correcting, and one marked done would leave its value waiting for good. */
export async function finishTask(ws: string, actionId: number, byId: string) {
  const { data } = await db().from("actions").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", actionId).eq("workspace_id", ws).eq("assignee_id", byId).eq("kind", "task").eq("status", "open").or("purpose.is.null,purpose.eq.escalation").select("asker_id");
  if (data?.[0]) await deliver({ kind: "done", actionId, senderId: byId, recipientId: data[0].asker_id });
  return Boolean(data?.[0]);
}

/** A Connector picked for one message, or none to use the recipient's preference. */
export type Via = ConnectorId | null | undefined;
