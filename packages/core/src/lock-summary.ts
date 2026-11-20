// The summary to a Workflow's owner when a period locks (GLOSSARY: Lock, Workflow, Period Timeline): off by default, a
// setting on the Workflow (`lockSummary`). It is sent once, by the Lock that makes every value the Workflow asks for
// locked, through the owner's Delivery Preference, and says only what the owner may see: it is their own
// period timeline, as a short notice. Nothing is recorded for it: a period unlocked and locked again sends it again.
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
  const { data: wf } = await db().from("workflows").select("id, name, owner_id, config").eq("id", workflowId).eq("workspace_id", ws).maybeSingle();
  if (!wf || !(wf.config as WorkflowConfig | null)?.lockSummary) return false;
  const { data: owner } = await db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", wf.owner_id).maybeSingle();
  if (!owner) return false;
  const who: Actor = { personId: wf.owner_id as string, workspaceId: ws, role: owner.role as Actor["role"] };
  const t = await periodTimeline(who, workflowId, period);
  if (!t.of || t.locked < t.of) return false;
  const happened = t.events.filter((e) => ["approval_asked", "approved", "sent_back", "checked", "note", "action"].includes(e.kind)).slice(0, LINES).map((e) => `- ${e.text}`);
  await deliverNotice(ws, {
    recipientId: wf.owner_id as string, senderId: null,
    subject: `${wf.name}: ${t.label} is locked`,
    text: [`${wf.name}, ${t.label}: locked. ${t.in} of ${t.of} values in.`, ...happened].join("\n"),
    link: `/workflows?id=${workflowId}`,
  });
  return true;
}
