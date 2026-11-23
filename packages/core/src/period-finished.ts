// The Finished Period (GLOSSARY: Finished Period, Workflow, Lock, Checklist Item, Send Snapshot; spec 0045, ticket #793):
// a Workflow's period once every value it asks for is published and locked and every Checklist Task of it is done.
// It is never stored, so a Task reopened un-finishes it; it is read from the Locks and the Tasks wherever it is asked.
// It is checked where those change: after a Lock (`afterLock`, next to the lock summary), after a Checklist Task is
// ticked off (action-state.ts) and again in each run as a catch-up (all in send-snapshot.ts). What a finished period sets
// off is the Send Snapshot step, and checking or sending never undoes or stops the Lock or the tick-off that set it off.
import { tickItems } from "./checklist-rules";
import { db } from "./db";
import { periodEnd } from "./periods";
import { openWorkflowRow } from "./workflow-rows";
import type { Period, WorkflowConfig } from "./types";

/** When the Workflow's period (its first day) finished: the latest moment a Lock or a Task made it so, as an instant.
 * Null when it is not finished: a value not locked, a Checklist Task not done, no value asked for at all, or Metrics
 * that do not share one period (a Workflow with no period has none to finish). */
export async function periodFinishedAt(ws: string, workflowId: number, period: string): Promise<string | null> {
  const { data: asked } = await db().from("metrics").select("id, period").eq("workspace_id", ws).eq("workflow_id", workflowId).is("formula", null).is("archived_at", null);
  if (!asked?.length || new Set(asked.map((m) => m.period)).size > 1) return null;
  const ids = asked.map((m) => m.id as number);
  const [{ data: locks }, { data: tasks }, wf] = await Promise.all([
    db().from("period_states").select("metric_id, updated_at").eq("workspace_id", ws).eq("period_start", period).eq("state", "locked").in("metric_id", ids),
    db().from("actions").select("status, updated_at, checklist_item_id").eq("workspace_id", ws).eq("workflow_id", workflowId).eq("purpose", "checklist").eq("period_start", period),
    db().from("workflows").select("id, config").eq("id", workflowId).eq("workspace_id", ws).maybeSingle().then((r) => openWorkflowRow(ws, r.data)),
  ]);
  if ((locks?.length ?? 0) < ids.length || (tasks ?? []).some((t) => t.status !== "closed")) return null;
  // The Tasks are given by the Workflow's first run of the period, which may come after the last value is locked (a Feed
  // that delivered early): an item to tick off that was there when the period ended and has no Task yet is still to come.
  // An item added after the period ended is not counted for it, nor is one that names nobody (it gives nothing).
  const end = periodEnd(period, asked[0].period as Period);
  const given = new Set((tasks ?? []).map((t) => String(t.checklist_item_id)));
  const waiting = tickItems((wf?.config as WorkflowConfig | undefined)?.steps ?? []).filter((i) => i.assignee && (i.addedOn ?? "") <= end && !given.has(i.id));
  if (waiting.length) {
    // An Assignee who left the Workspace is given nothing (giveChecklistTasks), so their item names nobody and holds nothing back.
    const { data: members } = await db().from("memberships").select("user_id").eq("workspace_id", ws).in("user_id", waiting.map((i) => i.assignee as string));
    const still = new Set((members ?? []).map((m) => String(m.user_id)));
    if (waiting.some((i) => still.has(i.assignee as string))) return null;
  }
  return [...(locks ?? []), ...(tasks ?? [])].map((r) => String(r.updated_at)).sort().at(-1) ?? null;
}

/** Whether the Workflow's period is finished (see periodFinishedAt). */
export async function periodFinished(ws: string, workflowId: number, period: string): Promise<boolean> {
  return (await periodFinishedAt(ws, workflowId, period)) !== null;
}
