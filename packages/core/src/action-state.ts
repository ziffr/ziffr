// The one place an Action's state changes (GLOSSARY: Action, Webhook; spec 0034, "One state change, one event"). Every
// way in goes through `changeActionState`: the app, each Connector's inbound (email, Slack, Telegram), a Workflow step
// and the system's own closes. It changes the row with one conditional update (`where status = <the status it read>`),
// and only the call that really changed the row writes the send rows for Webhooks, so a change made twice (two
// channels at once, a retry) is one event and the later call is a no-op. A test greps the core for any other writer of
// `actions.status`, so a new channel cannot bypass this. Security: callers decide who may change what (`guard` only
// narrows further); a Workspace is checked in the same statement, and nothing here reads a Workspace's words.
import { db } from "./db";
import { FROM_APP, queueWebhookEvent, type ChangeSource, type DoneReason } from "./webhook-events";
import type { WebhookEvent } from "./webhooks";

/** The three states of an Action. */
export type ActionStatus = "open" | "answered" | "closed";

/** Which Actions a change may apply to, by what the Action is for: a plain one, an Escalation, an Approval or a Self-check. */
export type PurposeRule = "any" | "approval" | "plain" | "plain_or_escalation" | "not_self_check" | "approval_or_self_check";

/** One change of state, with the guards the row must meet and what to tell Webhooks. */
export type StateChange = {
  to: ActionStatus;
  /** The statuses it may change from; every other one when left out. */
  from?: ActionStatus[];
  /** Why it is done, for `action.done`; worked out from the change when left out. */
  reason?: DoneReason;
  guard?: { assigneeId?: string; askerId?: string; kind?: "task" | "question"; purpose?: PurposeRule };
  /** The Thread message that came with the change (a reply that answered): its text goes with the event. */
  messageId?: number | null;
};

type Row = { id: number; kind: "task" | "question"; status: ActionStatus; purpose: string | null; asker_id: string; assignee_id: string; metric_id: number; period_start: string };

const purposeFits = (purpose: string | null, rule: PurposeRule) =>
  rule === "any" || (rule === "plain" && purpose === null) || (rule === "plain_or_escalation" && (purpose === null || purpose === "escalation"))
  || (rule === "approval" && purpose === "approval") || (rule === "not_self_check" && purpose !== "self_check") || (rule === "approval_or_self_check" && (purpose === "approval" || purpose === "self_check"));

/** The event a change makes, or none. A Task that reaches done or closed is `action.done` once (it is not again when the
 * asker closes what was done); a Question answered is `action.answered`, and closed is `action.done`; a reopen is `action.updated`. */
export function eventForChange(kind: "task" | "question", from: ActionStatus, to: ActionStatus, reason?: DoneReason): { type: WebhookEvent; reason: DoneReason | null } | null {
  if (to === "open") return { type: "action.updated", reason: null };
  if (kind === "task") {
    if (from === "answered") return null;
    return { type: "action.done", reason: reason ?? (to === "answered" ? "done" : "closed") };
  }
  if (to === "answered") return { type: "action.answered", reason: null };
  return { type: "action.done", reason: reason ?? (from === "answered" ? "answered" : "closed") };
}

/** Changes one Action of one Workspace and tells the Webhooks, once. `changed` is true only for the call that made the
 * change; `status` is the state the Action is in afterwards (null when there is no such Action here); `refused` is true
 * when the Action is not there or does not fit the guard (a repeat is not a refusal). Neither changes or sends anything. */
export async function changeActionState(workspaceId: string, actionId: number, change: StateChange, source: ChangeSource = FROM_APP): Promise<{ changed: boolean; status: ActionStatus | null; refused: boolean }> {
  const { data } = await db().from("actions").select("id, kind, status, purpose, asker_id, assignee_id, metric_id, period_start").eq("id", actionId).eq("workspace_id", workspaceId).maybeSingle();
  const row = data as Row | null;
  if (!row) return { changed: false, status: null, refused: true };
  const g = change.guard ?? {};
  const allowed = (change.from ?? (["open", "answered", "closed"] as ActionStatus[]).filter((s) => s !== change.to));
  if ((g.assigneeId !== undefined && g.assigneeId !== row.assignee_id) || (g.askerId !== undefined && g.askerId !== row.asker_id)
    || (g.kind !== undefined && g.kind !== row.kind) || !purposeFits(row.purpose, g.purpose ?? "any")) return { changed: false, status: row.status, refused: true };
  // Not a state it may change from (already there, or moved on): a repeat, not a refusal.
  if (!allowed.includes(row.status)) return { changed: false, status: row.status, refused: false };
  // One conditional update: the row must still be as it was read, so two calls at once change it once.
  const { data: done } = await db().from("actions").update({ status: change.to, updated_at: new Date().toISOString() })
    .eq("id", row.id).eq("workspace_id", workspaceId).eq("status", row.status).eq("asker_id", row.asker_id).eq("assignee_id", row.assignee_id).select("id");
  if (!done?.length) {
    const { data: now } = await db().from("actions").select("status").eq("id", row.id).eq("workspace_id", workspaceId).maybeSingle();
    return { changed: false, status: (now?.status as ActionStatus | undefined) ?? null, refused: false };
  }
  const event = eventForChange(row.kind, row.status, change.to, change.reason);
  if (event) await queueWebhookEvent(workspaceId, event.type, source, { actionId: row.id, metricId: row.metric_id, period: row.period_start, threadMessageId: change.messageId ?? null, reason: event.reason });
  return { changed: true, status: change.to, refused: false };
}

/** The Actions a system or Workflow close applies to. */
export type CloseWhere = { metricId?: number; period?: string; kind?: "task" | "question"; purposes?: ("approval" | "self_check")[]; /** The states that count as not closed yet; only `open` when left out. */ statuses?: ("open" | "answered")[] };

/** Closes every Action of a Workspace that is not closed yet (open, unless `where.statuses` says more) and fits `where`, one by one
 * through `changeActionState`, so each fires its own event once. Returns how many it closed. */
export async function closeActions(workspaceId: string, where: CloseWhere, source: ChangeSource, reason: DoneReason): Promise<number> {
  let q = db().from("actions").select("id").eq("workspace_id", workspaceId).in("status", where.statuses ?? ["open"]);
  if (where.metricId !== undefined) q = q.eq("metric_id", where.metricId);
  if (where.period !== undefined) q = q.eq("period_start", where.period);
  if (where.kind !== undefined) q = q.eq("kind", where.kind);
  if (where.purposes) q = q.in("purpose", where.purposes);
  const { data } = await q.order("id");
  let closed = 0;
  for (const a of data ?? []) if ((await changeActionState(workspaceId, a.id as number, { to: "closed", reason }, source)).changed) closed++;
  return closed;
}

/** Tells the Webhooks that chose `action.created` that an Action was given to someone. Called when its Delivery is
 * made, whichever way the Action was made (asked in the app, a Workflow's question, an Approval or a Self-check). */
export async function announceNewAction(actionId: number, source: ChangeSource): Promise<void> {
  const { data } = await db().from("actions").select("workspace_id, metric_id, period_start").eq("id", actionId).maybeSingle();
  if (data) await queueWebhookEvent(data.workspace_id as string, "action.created", source, { actionId, metricId: data.metric_id as number, period: data.period_start as string });
}
