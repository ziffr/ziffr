// Workflows (GLOSSARY: Workflow, Stand-in, Away, Approval, Lock): defining them, giving a Metric one, running them,
// approving or sending back values, locking periods, stand-ins and away dates. Every function takes the Actor first
// and works only inside the actor's Workspace.
import { db } from "./db";
import { assertCan, can, Forbidden, type Actor } from "./actor";
import { assertMembersIn } from "./sharing";
import { assertSubmittersIn } from "./metrics";
import { approve, closePeriod, runWorkflows, sendBack, setLock } from "./workflow-engine";
import { ensureBaseline, recordVersion } from "./versions";
import type { WorkflowConfig, WorkflowStep } from "./types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));
const day = (v: unknown) => {
  if (!DAY.test(String(v))) throw new Error("Pick a day.");
  return String(v);
};

/** Steps as they may be stored: known types, sane numbers, approvers who are members, at most one check, approval and
 * publish, and publishing last. */
async function cleanConfig(actor: Actor, c: WorkflowConfig): Promise<WorkflowConfig> {
  const { data: people } = await db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId);
  const ids = new Set((people ?? []).map((p) => p.user_id as string));
  const steps: WorkflowStep[] = [];
  for (const s of (Array.isArray(c?.steps) ? c.steps : []).slice(0, 12)) {
    if (s.type === "remind") steps.push({ type: "remind", daysBefore: int(s.daysBefore, 0, 30) });
    else if (s.type === "escalate") steps.push({ type: "escalate", to: s.to === "owner" ? "owner" : "stand-in", daysAfter: int(s.daysAfter, 0, 30) });
    else if (s.type === "check" && !steps.some((x) => x.type === "check")) steps.push({ type: "check", changePct: int(s.changePct, 1, 1000), outsideTarget: Boolean(s.outsideTarget) });
    else if (s.type === "approve" && !steps.some((x) => x.type === "approve")) steps.push({ type: "approve", approvers: [...new Set((Array.isArray(s.approvers) ? s.approvers : []).map(String).filter((a) => ids.has(a)))].slice(0, 3) });
    else if (s.type === "publish" && !steps.some((x) => x.type === "publish")) steps.push({ type: "publish", lock: Boolean(s.lock) });
  }
  const pub = steps.filter((s) => s.type === "publish");
  return { dueWorkingDays: int(c?.dueWorkingDays, 0, 30), steps: [...steps.filter((s) => s.type !== "publish"), ...(pub.length ? pub : [{ type: "publish", lock: false } as WorkflowStep])] };
}

/** A Workflow of the actor's workspace that the actor owns, or Forbidden. */
async function ownWorkflow(actor: Actor, id: number) {
  const { data } = await db().from("workflows").select("owner_id").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.owner_id !== actor.personId) throw new Forbidden();
}

/** Saves a Workflow: a new one (Guests create nothing) or one the actor owns. Returns its id. */
export async function saveWorkflow(actor: Actor, id: number | null, name: string, config: WorkflowConfig, opts: { message?: string } = {}): Promise<number> {
  const row = { name: String(name ?? "").trim().slice(0, 80) || "Untitled workflow", config: await cleanConfig(actor, config), updated_at: new Date().toISOString() };
  if (id) {
    await ownWorkflow(actor, id);
    await ensureBaseline("workflow", id, actor.personId);
    await db().from("workflows").update(row).eq("id", id).eq("workspace_id", actor.workspaceId);
  } else {
    assertCan(actor, "create");
    const { data, error } = await db().from("workflows").insert({ ...row, owner_id: actor.personId, workspace_id: actor.workspaceId }).select("id").single();
    if (error || !data) throw new Error("The workflow could not be saved.");
    id = data.id as number;
  }
  await recordVersion("workflow", id, actor.personId, opts);
  return id;
}

/** Deletes a Workflow the actor owns. */
export async function deleteWorkflow(actor: Actor, id: number) {
  await ownWorkflow(actor, id);
  await db().from("workflows").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
}

/** A Metric's owner decides which Workflow its values take (none for Derived Metrics). */
export async function setMetricWorkflow(actor: Actor, metricId: number, workflowId: number | null) {
  const { data: m } = await db().from("metrics").select("owner_id, formula").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId || m.formula) throw new Forbidden();
  if (workflowId !== null && !(await db().from("workflows").select("id").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle()).data) throw new Forbidden();
  await db().from("metrics").update({ workflow_id: workflowId }).eq("id", metricId).eq("workspace_id", actor.workspaceId);
}

/** PROTOTYPE: what a scheduler would run each morning, here as of any day. Guests run nothing. */
export async function runWorkflowsAsOf(actor: Actor, asOf: string): Promise<string[]> {
  assertCan(actor, "create");
  return runWorkflows(actor.workspaceId, day(asOf), actor.personId);
}

/** The approver approves a value waiting for them. */
export async function approveValue(actor: Actor, actionId: number): Promise<string> {
  return approve(actor.workspaceId, Number(actionId), actor.personId);
}

/** The approver sends a value back with what to check. */
export async function sendValueBack(actor: Actor, actionId: number, comment: string) {
  await sendBack(actor.workspaceId, Number(actionId), actor.personId, String(comment ?? "").slice(0, 1000));
}

/** The Metric owner locks or unlocks a period; unlocking needs a reason. */
export async function lockPeriod(actor: Actor, metricId: number, period: string, lock: boolean, reason?: string) {
  await setLock(actor.workspaceId, Number(metricId), day(period), Boolean(lock), actor.personId, reason ? String(reason).slice(0, 300) : undefined);
}

/** The Workflow's owner closes a period: every Metric of it with a value locks. Returns how many. */
export async function closeWorkflowPeriod(actor: Actor, workflowId: number, asOf: string): Promise<number> {
  return closePeriod(actor.workspaceId, Number(workflowId), day(asOf), actor.personId);
}

/** The Metric owner chooses who stands in for a submitter: a member or a Contact of the workspace. */
export async function setStandIn(actor: Actor, metricId: number, submitterId: string, standInId: string | null) {
  const { data: m } = await db().from("metrics").select("owner_id").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId || standInId === submitterId) throw new Forbidden();
  if (standInId) await assertSubmittersIn(actor, [standInId]);
  await db().from("tokens").update({ stand_in_id: standInId }).eq("metric_id", metricId).eq("workspace_id", actor.workspaceId).eq("submitter_id", submitterId).is("stands_in_for", null);
  // Whoever stood in before loses their stand-in Token at once.
  await db().from("tokens").delete().eq("metric_id", metricId).eq("workspace_id", actor.workspaceId).eq("stands_in_for", submitterId).neq("submitter_id", standInId ?? "");
}

/** People set their own away dates; owners and admins can set any member's. null clears them. */
export async function setAway(actor: Actor, personId: string, starts: string | null, ends: string | null) {
  if (personId !== actor.personId) {
    if (!can(actor, "manage-members")) throw new Forbidden();
    await assertMembersIn(actor, [personId]);
  }
  if (starts && ends && (!DAY.test(starts) || !DAY.test(ends) || ends < starts)) throw new Error("Pick a start and an end date.");
  await db().from("away").delete().eq("user_id", personId);
  if (starts && ends) await db().from("away").insert({ user_id: personId, starts, ends });
}
