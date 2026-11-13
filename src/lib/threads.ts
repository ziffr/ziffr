import "server-only";
// Thread replies (GLOSSARY: Thread, Correction), wherever they are written: in Ziffr or answered through a Connector.
import { db } from "./db";
import { deliver } from "./deliveries";
import type { ConnectorId } from "@/connectors";

/** Who takes part in an Action: asker, assignee and the metric's owner. Only they reply. */
export async function participants(actionId: number) {
  const { data: a } = await db.from("actions").select("id, asker_id, assignee_id, status, kind, metrics(owner_id)").eq("id", actionId).single();
  if (!a) return null;
  return { ...a, owner_id: (a.metrics as unknown as { owner_id: string }).owner_id };
}

/** Adds a reply and tells the others, through each one's Connector. */
export async function postReply(actionId: number, authorId: string, body: string, correction: number | null) {
  const a = await participants(actionId);
  if (!a || ![a.asker_id, a.assignee_id, a.owner_id].includes(authorId)) throw new Error("Only the people on this thread can reply.");
  await db.from("thread_messages").insert({
    action_id: actionId,
    author_id: authorId,
    body: body || (correction !== null ? "Proposing a correction." : "…"),
    correction_value: correction,
    correction_status: correction !== null ? "proposed" : null,
  });
  // The Assignee replying moves an open Action to answered.
  const answered = a.assignee_id === authorId && a.status === "open";
  await db.from("actions").update({ ...(answered ? { status: "answered" } : {}), updated_at: new Date().toISOString() }).eq("id", actionId);
  const other = authorId === a.assignee_id ? a.asker_id : a.assignee_id;
  await deliver({ kind: "reply", actionId, senderId: authorId, recipientId: other, text: body, correction });
  if (correction !== null && a.owner_id !== other) await deliver({ kind: "correction", actionId, senderId: authorId, recipientId: a.owner_id, text: body, correction });
}

/** A task marked done, in Ziffr or by closing its ticket. */
export async function finishTask(actionId: number, byId: string) {
  const { data } = await db.from("actions").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", actionId).eq("assignee_id", byId).eq("kind", "task").eq("status", "open").select("asker_id");
  if (data?.[0]) await deliver({ kind: "done", actionId, senderId: byId, recipientId: data[0].asker_id });
  return Boolean(data?.[0]);
}

export type Via = ConnectorId | null | undefined;
