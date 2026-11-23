// The summary to a Workflow's owner when a period locks (GLOSSARY: Lock, Workflow, Period Timeline): off by default, a
// setting on the Workflow (`lockSummary`). It is sent once, by the Lock that makes every value the Workflow asks for
// locked, through the owner's Delivery Preference, and says only what the owner may see: it is their own
// period timeline, as a short notice. Nothing is recorded for it: a period unlocked and locked again sends it again.
// When the Workflow has Checklist Tasks it also says how many of them are done (the Finished Period, period-finished.ts).
import { openWorkflowRow } from "./workflow-rows";
import { db } from "./db";
import { deliverNotice } from "./deliveries";
import { periodTimeline } from "./period-timeline";
import type { Actor } from "./actor";
import type { WorkflowConfig } from "./types";

/** How many lines of what happened the summary carries at most. */
const LINES = 5;

/** Sends the Workflow's owner the summary when `period` of the Workflow is now locked for every value it asks for.
 * Does nothing when the Workflow has not asked for it, has no such value, or something is not locked yet. */
export async function sendLockSummary(ws: string, workflowId: number, period: string): Promise<boolean> {
  // A summary that cannot be sent must never undo or stop the Lock it follows.
  try {
    return await summarise(ws, workflowId, period);
  } catch {
    return false;
  }
}

async function summarise(ws: string, workflowId: number, period: string): Promise<boolean> {
  const wf = await openWorkflowRow(ws, (await db().from("workflows").select("id, name, owner_id, config").eq("id", workflowId).eq("workspace_id", ws).maybeSingle()).data);
  if (!wf || !(wf.config as WorkflowConfig | null)?.lockSummary) return false;
  const { data: owner } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", wf.owner_id).maybeSingle();
  if (!owner) return false;
  // Cheap first: only when every value the Workflow asks for has a Lock for the period is the timeline made at all.
  const { data: asked } = await db().from("metrics").select("id").eq("workspace_id", ws).eq("workflow_id", workflowId).is("formula", null).is("archived_at", null);
  const ids = (asked ?? []).map((m) => m.id as number);
  if (!ids.length) return false;
  const { count } = await db().from("period_states").select("metric_id", { count: "exact", head: true }).eq("workspace_id", ws).eq("period_start", period).eq("state", "locked").in("metric_id", ids);
  if ((count ?? 0) < ids.length) return false;
  const who: Actor = { personId: wf.owner_id as string, workspaceId: ws, role: owner.role as Actor["role"] };
  const t = await periodTimeline(who, workflowId, period);
  if (!t.of || t.locked < t.of) return false;
  const happened = t.events.filter((e) => ["approval_asked", "approved", "sent_back", "checked", "note", "action"].includes(e.kind)).slice(0, LINES).map((e) => `- ${e.text}`);
  await deliverNotice(ws, {
    recipientId: wf.owner_id as string, senderId: null,
    subject: `${wf.name}: ${t.label} is locked`,
    // With Checklist Items the summary says how far the rest of the close is (spec 0045): counts, never their words.
    text: [`${wf.name}, ${t.label}: locked. ${t.in} of ${t.of} values in.`, ...(t.checklist.of ? [`${t.checklist.done} of ${t.checklist.of} checklist items done.`] : []), ...happened].join("\n"),
    link: `/workflows?id=${workflowId}`,
  });
  return true;
}
