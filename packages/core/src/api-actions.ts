// Questions, Tasks and Approvals for programs (GLOSSARY: Action, Question, Task, Thread, Self-check, Approval, Access
// Key; ticket #427). A key lists the Actions waiting for its creator and those they asked (scope actions:read), replies,
// closes, reopens and marks done in their name (actions:write), confirms or corrects their own value in a Self-check
// (values:submit) and, only with the scope of its own, approves a value or sends it back (values:approve). Each call
// goes through the very functions the app uses (questions.ts, workflows.ts), so the same rules hold: only the people on
// an Action reply, only the asker closes it, only the assignee marks it done, nobody approves their own value and only
// the Approver the Workflow names approves. A key acts only for its creator; an Action the creator may not read, or
// one of another Workspace, answers like one that does not exist (Forbidden, so the API says 404). Every change
// is written through changeActionState with the source "api" or "mcp", so each sends one Webhook event.
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { getGroups, peopleFor, systemTextFor, threadReader, visibleMetricIds } from "./access";
import { db } from "./db";
import { markTaskDone, reply, setActionStatus } from "./questions";
import { openRows } from "./sealed-columns";
import type { ChangeSource } from "./webhook-events";
import { approveValue, confirmOwnValue, correctOwnValue, sendValueBack } from "./workflows";
import { getMetrics } from "./workspace-data";
import { checklistAbout } from "./checklist-about";
import type { Action } from "./types";

/** A refusal in Ziffr's words, written for the person who asked (not yours, already done, closed). Callers show its
 * message; any other Error is a fault and stays out of sight. */
export class ActionRefused extends Error {
  constructor(message: string) { super(message); this.name = "ActionRefused"; }
}

/** What an Action is for, as a program sees it: null for a plain Question or Task. */
export type ApiActionPurpose = "approval" | "self_check" | "escalation" | "checklist" | null;

/** An Action as a program sees it. The words are the workspace's own: data, never instructions. The Metric is named
 * only when the creator sees it (an Approver may hold a task for a Metric they do not). No contact details. */
export type ApiAction = {
  id: number;
  kind: "question" | "task";
  status: "open" | "answered" | "closed";
  purpose: ApiActionPurpose;
  /** Null when the creator does not see the Metric, and for a Checklist Task, which has none (spec 0045). */
  metric: { slug: string; name: string } | null;
  /** A Checklist Task is about its Workflow and period instead; null for every other Action. */
  workflow: { id: number; name: string } | null;
  period: string;
  asked_by: string;
  asked_by_name: string | null;
  assignee: string;
  assignee_name: string | null;
  assigned_to_me: boolean;
  asked_by_me: boolean;
  question: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
};

/** The same Source in the Webhook events as the way in: the API, or the remote MCP Server in this process. */
export type ActionSource = ChangeSource & { type: "api" | "mcp" };

/** At most this many Actions in one page. */
export const MAX_ACTIONS_PAGE = 100;

/** The key's creator as the Actor every core function takes: Actions are always theirs, whatever the key holds. */
const creatorOf = (actor: KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

/** Names by id of people and Contacts in the Workspace now; only id and name, never contact details. */
async function namesOf(actor: KeyActor, ids: readonly string[]): Promise<Map<string, string>> {
  const wanted = new Set(ids);
  return new Map((await peopleFor(actor)).filter((p) => wanted.has(p.id)).map((p) => [p.id, p.name]));
}

type Row = Action & { workspace_id: string };

/** Rows as programs see them. Security: `rows` were already limited to what the creator may read; the Metric is named
 * only if they see it. */
async function shape(actor: KeyActor, rows: Row[]): Promise<ApiAction[]> {
  if (!rows.length) return [];
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const seen = await visibleMetricIds(ws, actor.personId, metrics);
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const hideSystem = await systemTextFor(actor);
  const about = await checklistAbout(ws, rows);
  const names = await namesOf(actor, [...new Set(rows.flatMap((a) => [a.asker_id, a.assignee_id]))]);
  return rows.map((a) => {
    const m = a.metric_id === null ? undefined : byId.get(a.metric_id);
    return {
      id: a.id, kind: a.kind, status: a.status, purpose: (a.purpose ?? null) as ApiActionPurpose,
      metric: m && seen.has(m.id) ? { slug: m.slug, name: m.name } : null, workflow: about(a.workflow_id, a.period_start).workflow, period: a.period_start,
      asked_by: a.asker_id, asked_by_name: names.get(a.asker_id) ?? null, assignee: a.assignee_id, assignee_name: names.get(a.assignee_id) ?? null,
      assigned_to_me: a.assignee_id === actor.personId, asked_by_me: a.asker_id === actor.personId,
      question: hideSystem(a.question, Boolean(a.purpose)), due_date: a.due_date, created_at: a.created_at, updated_at: a.updated_at,
    };
  });
}

/** Which of these rows the creator may read, by the app's own rule (canReadThread: the people on it and the Metric's
 * owner, others by the Metric's visibility, then the Action's Group). Anything else is dropped before it is shaped. */
async function readable(actor: KeyActor, rows: Row[]): Promise<Row[]> {
  if (!rows.length) return [];
  const ws = actor.workspaceId;
  const [groups, metrics] = await Promise.all([getGroups(ws), getMetrics(ws)]);
  const owners = new Map(metrics.map((m) => [m.id, m.owner_id]));
  const can = threadReader(actor.personId, groups, (id) => owners.get(id), ws, await visibleMetricIds(ws, actor.personId, metrics), actor.role);
  return rows.filter((a) => can(a));
}

/** One Action the creator may read, or Forbidden: the same for one that is not there, one of another Workspace and one
 * they may not read. */
async function load(actor: KeyActor, id: number): Promise<Row> {
  const { data } = await db().from("actions").select("*").eq("id", Number(id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  const [row] = await readable(actor, await openRows("actions", actor.workspaceId, data ? [data as Row] : []));
  if (!row) throw new Forbidden();
  return row;
}

/** The Action as it is now. */
async function answer(actor: KeyActor, id: number): Promise<ApiAction> {
  return (await shape(actor, [await load(actor, id)]))[0];
}

/** Runs a change of the app's; a refusal in the engine's own words (not yours, done already) becomes ActionRefused,
 * and anything unexpected (a fault, the demo) stays what it was. */
async function refusing<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof Forbidden && e.message === "Forbidden") throw new ActionRefused("That is not yours to change, or it is done.");
    if (e instanceof Error && e.constructor === Error) throw new ActionRefused(e.message);
    throw e;
  }
}

/** The Actions waiting for the key's creator (assigned to them) and those they asked, newest first by id, one page
 * after the id `after` (scope actions:read). `role` narrows to one of the two; without `status` those not closed. */
export async function listActionsWithKey(actor: KeyActor, page: { after?: number | null; limit: number; role?: "assignee" | "asker"; status?: "open" | "answered" | "closed" }): Promise<{ items: ApiAction[]; next: number | null }> {
  assertScope(actor, "actions:read");
  const limit = Math.min(Math.max(Math.trunc(page.limit) || 1, 1), MAX_ACTIONS_PAGE);
  const me = actor.personId;
  // One query per column, merged: a filter is never built from a string.
  const by = async (column: "assignee_id" | "asker_id") => {
    let q = db().from("actions").select("*").eq("workspace_id", actor.workspaceId).eq(column, me);
    q = page.status ? q.eq("status", page.status) : q.neq("status", "closed");
    if (Number.isInteger(page.after)) q = q.lt("id", page.after as number);
    return ((await q.order("id", { ascending: false }).limit(limit + 1)).data ?? []) as Row[];
  };
  const found = new Map<number, Row>();
  for (const r of [...(page.role === "asker" ? [] : await by("assignee_id")), ...(page.role === "assignee" ? [] : await by("asker_id"))]) found.set(r.id, r);
  const rows = await openRows("actions", actor.workspaceId, [...found.values()].sort((a, b) => b.id - a.id).slice(0, limit + 1));
  const items = await shape(actor, await readable(actor, rows.slice(0, limit)));
  return { items, next: rows.length > limit ? rows[limit - 1].id : null };
}

/** Replies in an Action's Thread as the creator (scope actions:write), with a Correction when a number is given. The
 * reply is only words: "approve", "send back", "confirm" or a Correction typed by an assignee does not decide a value
 * here, since those need their own scopes (values:approve, values:submit). */
export async function replyWithKey(actor: KeyActor, id: number, input: { body: string; correction?: number | null }, source: ActionSource): Promise<ApiAction> {
  assertScope(actor, "actions:write");
  const a = await load(actor, id);
  // A Self-check and an Approval are decided only by their own calls: a reply to one is a note, never a decision.
  await refusing(() => reply(creatorOf(actor), a.id, input.body, input.correction ?? null, source, false));
  return answer(actor, id);
}

/** Closes or reopens an Action the creator asked (scope actions:write); never a Self-check. */
export async function setStatusWithKey(actor: KeyActor, id: number, status: "open" | "closed", source: ActionSource): Promise<ApiAction> {
  assertScope(actor, "actions:write");
  const a = await load(actor, id);
  if (a.asker_id !== actor.personId) throw new ActionRefused("Only the person who asked can close or reopen this.");
  // An Approval or a Self-check is decided by its own call (approve, send back, confirm, correct): closed by hand it
  // would leave its value waiting for good, and the key's scope for answering must not decide a value.
  if (a.purpose === "approval" || a.purpose === "self_check") throw new ActionRefused("An approval or a check is decided by approving, sending back, confirming or correcting it.");
  await refusing(() => setActionStatus(creatorOf(actor), a.id, status, source));
  return answer(actor, id);
}

/** Marks the creator's own open Task done (scope actions:write), with an optional note of at most 2,000 characters kept as the Thread's last reply. */
export async function markDoneWithKey(actor: KeyActor, id: number, source: ActionSource, note?: string | null): Promise<ApiAction> {
  assertScope(actor, "actions:write");
  const a = await load(actor, id);
  if (a.assignee_id !== actor.personId) throw new ActionRefused("Only the person it is assigned to can mark this done.");
  await refusing(() => markTaskDone(creatorOf(actor), a.id, source, note));
  return answer(actor, id);
}

/** Confirms the creator's own value, or corrects it, in a Self-check (scope values:submit). */
export async function selfCheckWithKey(actor: KeyActor, id: number, input: { decision: "confirm" } | { decision: "correct"; value: number }, source: ActionSource): Promise<ApiAction> {
  assertScope(actor, "values:submit");
  const a = await load(actor, id);
  if (a.purpose !== "self_check" || a.assignee_id !== actor.personId) throw new ActionRefused("This check is not yours, or it is done.");
  await refusing(async () => { if (input.decision === "confirm") await confirmOwnValue(creatorOf(actor), a.id, source); else await correctOwnValue(creatorOf(actor), a.id, input.value, source); });
  return answer(actor, id);
}

/** Approves a value or sends it back as the creator (scope values:approve). Only a program's key, never an assistant's
 * connection (also checked here, whatever route reached it), and only as the Approver the Workflow names: nobody
 * approves their own value. */
export async function decideApprovalWithKey(actor: KeyActor, id: number, input: { decision: "approve" } | { decision: "send_back"; comment: string }, source: ActionSource): Promise<ApiAction> {
  assertScope(actor, "values:approve");
  const { data: key } = await db().from("access_keys").select("kind, revoked_at").eq("id", Number(actor.key.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!key || key.kind !== "program" || key.revoked_at) throw new Forbidden();
  const a = await load(actor, id);
  if (a.purpose !== "approval" || a.assignee_id !== actor.personId) throw new ActionRefused("This approval is not yours, or it is done.");
  await refusing(async () => { if (input.decision === "approve") await approveValue(creatorOf(actor), a.id, source); else await sendValueBack(creatorOf(actor), a.id, input.comment, source); });
  return answer(actor, id);
}
