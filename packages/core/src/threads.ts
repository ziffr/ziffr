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
  const { data: a } = await db().from("actions").select("id, asker_id, assignee_id, previous_assignee_id, status, kind, purpose, metric_id, period_start, metrics(owner_id)").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (!a) return null;
  // A Checklist Task has no Metric and so no Metric owner: its Workflow's owner is its asker.
  return { ...a, owner_id: (a.metrics as unknown as { owner_id: string } | null)?.owner_id ?? a.asker_id };
}

/** Adds a reply and tells the others, through each one's Connector. On an approval task, "approve" or
 * "send back: …" from the approver decide it, from Ziffr or from Slack, email or WhatsApp. On a Self-check,
 * "confirm" or "Correction: <value>" from the submitter it is for decide it the same way. `commands` is false for words that
 * are only words (a program's reply, a Webhook's). `opts.via` names the Webhook a reply came through (shown as "via <name>");
 * `opts.keepState` adds the message without moving the Action to answered. */
export async function postReply(ws: string, actionId: number, authorId: string, body: string, correction: number | null, source: ChangeSource = FROM_APP, commands = true, opts: { via?: string; viaWebhookId?: string; keepState?: boolean } = {}) {
  const a = await participants(ws, actionId);
  if (!a || ![a.asker_id, a.assignee_id, a.owner_id, a.previous_assignee_id].includes(authorId)) throw new Error("Only the people on this thread can reply.");
  // `commands` is false for a program's reply (API, MCP): its words are only words. "approve", "send back", "confirm" and
  // a Correction decide a value only from the channels a person uses, never through a scope that cannot (ticket #427).
  if (commands && a.purpose === "approval" && a.assignee_id === authorId && a.status === "open" && correction === null) {
    const { approve, sendBack } = await import("./workflow-engine");
    if (/^\s*approved?\b/i.test(body)) { await approve(ws, actionId, authorId, source); return; }
    const back = body.match(/^\s*send back\s*:?\s*([\s\S]*)$/i);
    if (back) { await sendBack(ws, actionId, authorId, back[1].trim(), source); return; }
  }
  // A Checklist Task is ticked off by "done" (the rest of the words are the note), from Ziffr, email, Slack or Telegram; any other
  // reply is only words: the Task stays open until it is ticked off (spec 0045).
  if (commands && a.purpose === "checklist" && a.assignee_id === authorId && a.status === "open") {
    const done = body.match(/^\s*(?:done|erledigt)\b[\s.:,;!-]*([\s\S]*)$/i);
    if (done && await finishTask(ws, actionId, authorId, source, done[1])) return;
  }
  if (commands && a.purpose === "self_check" && a.assignee_id === authorId && a.status === "open") {
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
    via: opts.via ?? null,
    via_webhook_id: opts.viaWebhookId ?? null,
  }]);
  const messageId = Number(message?.id) || null;
  // The Assignee replying moves an open Action to answered; not an Approval or Self-check, which only their own
  // commands decide: answered, it could no longer be decided and the value would wait for good. The change tells the
  // Webhooks (with the reply); a reply that changes no state is an update of its own.
  const moved = !opts.keepState && a.assignee_id === authorId && a.status === "open" && a.purpose !== "approval" && a.purpose !== "self_check" && a.purpose !== "checklist"
    ? await changeActionState(ws, actionId, { to: "answered", from: ["open"], guard: { assigneeId: authorId, purpose: "plain_or_escalation" }, messageId }, source)
    : null;
  if (!moved?.changed) {
    await db().from("actions").update({ updated_at: new Date().toISOString() }).eq("id", actionId).eq("workspace_id", ws);
    await queueWebhookEvent(ws, "action.updated", source, { actionId, metricId: a.metric_id, period: a.period_start, threadMessageId: messageId });
  }
  const other = authorId === a.assignee_id ? a.asker_id : a.assignee_id;
  // A reply that came through a Webhook says so to the asker too: the author is the assignee, the words may be another person's.
  await deliver({ kind: "reply", actionId, senderId: authorId, recipientId: other, text: opts.via ? `(via ${opts.via}) ${body}` : body, correction });
  if (correction !== null && a.owner_id !== other) await deliver({ kind: "correction", actionId, senderId: authorId, recipientId: a.owner_id, text: body, correction });
}

/** The longest note that comes with a task marked done. */
export const DONE_NOTE_MAX = 2000;

/** A task marked done, in Ziffr or by closing its ticket, with an optional note (kept as the Thread's last reply). Never an
 * Approval or Self-check: those are decided by approving, sending back, confirming or correcting, and one marked done would
 * leave its value waiting for good. A Checklist Task (spec 0045) is closed by it, since nobody has to look at it again for
 * the period to be done; any other task is answered, for its asker to close. */
export async function finishTask(ws: string, actionId: number, byId: string, source: ChangeSource = FROM_APP, note?: string | null) {
  const { data: row } = await db().from("actions").select("purpose").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  const checklist = row?.purpose === "checklist";
  const { changed } = await changeActionState(ws, actionId, { to: checklist ? "closed" : "answered", from: ["open"], reason: "done", guard: { assigneeId: byId, kind: "task", purpose: checklist ? "checklist" : "plain_or_escalation" } }, source);
  if (!changed) return false;
  const words = String(note ?? "").trim().slice(0, DONE_NOTE_MAX);
  const { data } = await db().from("actions").select("asker_id").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  // The note is the Thread's last reply and tells the asker with the done message; a task done without one only says it is done.
  if (words) await postReply(ws, actionId, byId, words, null, source, false, { keepState: true });
  else if (data) await deliver({ kind: "done", actionId, senderId: byId, recipientId: data.asker_id });
  return true;
}

/** A Connector picked for one message, or none to use the recipient's preference. */
export type Via = ConnectorId | null | undefined;
