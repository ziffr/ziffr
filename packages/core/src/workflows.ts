// Workflows (GLOSSARY: Workflow, Stand-in, Away, Approval, Self-check, Lock): defining them, giving a Metric one,
// running them, approving or sending back values, checking one's own, locking periods, stand-ins and away dates. Every function takes the Actor first
// and works only inside the actor's Workspace.
import { db } from "./db";
import { assertCan, can, Forbidden, type Actor } from "./actor";
import { assertMembersIn } from "./sharing";
import { assertSubmittersIn } from "./metrics";
import { approve, closePeriod, confirmSelfCheck, correctSelfCheck, runWorkflows, sendBack, setLock } from "./workflow-engine";
import { claimDay, runClaimedDay, type RunCounts } from "./scheduled-runs";
import { DEMO_WORKSPACE_ID } from "./team";
import { localTime, workspaceClock } from "./workspace-clock";
import { ensureBaseline, recordVersion } from "./versions";
import type { WorkflowConfig, WorkflowStep } from "./types";
import { audit } from "./audit-log";

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
    else if (s.type === "approve" && !steps.some((x) => x.type === "approve")) steps.push({ type: "approve", approvers: [...new Set((Array.isArray(s.approvers) ? s.approvers : []).map(String).filter((a) => ids.has(a)))].slice(0, 3), values: s.values === "every" ? "every" : "unusual", nobodyElse: s.nobodyElse === "count" ? "count" : "self-check" });
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

/** Changes only the check step of a Workflow the actor owns (GLOSSARY: Unusual Value): when a value is unusual. The
 * rest of the Workflow stays exactly as stored, and the change is refused when the Workflow changed since `seen` (its
 * updated_at as read), so an edit in the Workflow editor meanwhile is never overwritten. Returns false when refused. */
export async function setWorkflowCheck(actor: Actor, id: number, check: { changePct?: number; outsideTarget?: boolean }, seen: string): Promise<boolean> {
  await ownWorkflow(actor, id);
  const { data: wf } = await db().from("workflows").select("config, updated_at").eq("id", id).eq("workspace_id", actor.workspaceId).single();
  if (!wf || wf.updated_at !== seen) return false;
  const config = wf.config as WorkflowConfig;
  if (!config.steps.some((s) => s.type === "check")) return false;
  const steps = config.steps.map((s) => (s.type === "check" ? { ...s, changePct: check.changePct === undefined ? s.changePct : int(check.changePct, 1, 1000), outsideTarget: check.outsideTarget ?? s.outsideTarget } : s));
  await ensureBaseline("workflow", id, actor.personId);
  const { data: done } = await db().from("workflows").update({ config: { ...config, steps }, updated_at: new Date().toISOString() })
    .eq("id", id).eq("workspace_id", actor.workspaceId).eq("updated_at", seen).select("id");
  if (!done?.length) return false;
  await recordVersion("workflow", id, actor.personId, { message: "Changed its Unusual Value check" });
  return true;
}

/** Deletes a Workflow the actor owns. */
export async function deleteWorkflow(actor: Actor, id: number) {
  await ownWorkflow(actor, id);
  await db().from("workflows").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
}

/** A Metric's owner decides which Workflow its values take (none for Derived Metrics). */
export async function setMetricWorkflow(actor: Actor, metricId: number, workflowId: number | null) {
  const { data: m } = await db().from("metrics").select("name, owner_id, formula, workflow_id").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || m.owner_id !== actor.personId || m.formula) throw new Forbidden();
  const wf = workflowId === null ? null : (await db().from("workflows").select("id, name").eq("id", workflowId).eq("workspace_id", actor.workspaceId).maybeSingle()).data;
  if (workflowId !== null && !wf) throw new Forbidden();
  await db().from("metrics").update({ workflow_id: workflowId }).eq("id", metricId).eq("workspace_id", actor.workspaceId);
  if ((m.workflow_id ?? null) !== workflowId) {
    await audit(actor, { kind: "metric.workflow_set", object: { type: "metric", id: metricId, name: m.name }, details: { workflow_id: workflowId, workflow_name: (wf?.name as string | undefined) ?? null, from_workflow_id: m.workflow_id ?? null } });
  }
}

/** Runs the demo's Workflows as of any day, to try what the clock does in a real workspace (spec 0005). Only the
 * demo may pretend: elsewhere a day runs once, by the clock or by runTodayNow. Guests run nothing. */
export async function runWorkflowsAsOf(actor: Actor, asOf: string): Promise<string[]> {
  assertCan(actor, "create");
  if (actor.workspaceId !== DEMO_WORKSPACE_ID) throw new Forbidden("Only the demo can pretend it is another day.");
  return runWorkflows(actor.workspaceId, day(asOf), actor.personId);
}

/** A day's run as the Workflows page shows it. */
export type RunInfo = { day: string; trigger: "schedule" | "manual"; state: "running" | "done" | "failed"; startedAt: string; counts: RunCounts };

/** When Workflows run in the actor's workspace, the last run, and whether today has run (spec 0005). */
export async function workflowSchedule(actor: Actor): Promise<{ timeZone: string; runHour: number; today: string; todayRan: boolean; lastRun: RunInfo | null; scheduled: boolean }> {
  const clock = await workspaceClock(actor);
  const { day: today } = localTime(new Date(), clock.timeZone);
  const [{ data: last }, { count: scheduled }] = await Promise.all([
    db().from("workflow_runs").select("day, trigger, state, started_at, prompts, reminders, escalations").eq("workspace_id", actor.workspaceId).order("day", { ascending: false }).limit(1).maybeSingle(),
    db().from("workflow_runs").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("trigger", "schedule"),
  ]);
  return {
    // A day at or after today was claimed (also before a change of time zone): today will not run again.
    ...clock, today, todayRan: Boolean(last && last.day >= today), scheduled: (scheduled ?? 0) > 0,
    lastRun: last ? { day: last.day, trigger: last.trigger, state: last.state, startedAt: last.started_at, counts: { prompts: last.prompts, reminders: last.reminders, escalations: last.escalations } } : null,
  };
}

/** Runs today's steps now, for Owners and Admins of a real workspace: the same claim as the clock's run, so it does
 * nothing once today ran, and the clock then leaves today alone. Returns the counts, or null when today ran already. */
export async function runTodayNow(actor: Actor): Promise<RunCounts | null> {
  if (actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins run today's steps.");
  const { day: today } = localTime(new Date(), (await workspaceClock(actor)).timeZone);
  const runId = await claimDay(actor.workspaceId, today, "manual");
  if (runId === null) return null;
  const counts = await runClaimedDay(runId, actor.workspaceId, today);
  await audit(actor, { kind: "workflow.run_now", object: { type: "workspace", id: actor.workspaceId }, details: { day: today, ...counts } });
  return counts;
}

/** The approver approves a value waiting for them. */
export async function approveValue(actor: Actor, actionId: number): Promise<string> {
  return approve(actor.workspaceId, Number(actionId), actor.personId);
}

/** The submitter confirms their own value in a Self-check (GLOSSARY: Self-check). */
export async function confirmOwnValue(actor: Actor, actionId: number): Promise<string> {
  return confirmSelfCheck(actor.workspaceId, Number(actionId), actor.personId);
}

/** The submitter corrects their own value in a Self-check; the number is checked in the engine. */
export async function correctOwnValue(actor: Actor, actionId: number, value: number): Promise<string> {
  return correctSelfCheck(actor.workspaceId, Number(actionId), actor.personId, Number(value));
}

/** The approver sends a value back with what to check. */
export async function sendValueBack(actor: Actor, actionId: number, comment: string) {
  await sendBack(actor.workspaceId, Number(actionId), actor.personId, String(comment ?? "").slice(0, 1000));
}

/** The Metric owner locks or unlocks a period; unlocking needs a reason. */
export async function lockPeriod(actor: Actor, metricId: number, period: string, lock: boolean, reason?: string) {
  await setLock(actor.workspaceId, Number(metricId), day(period), Boolean(lock), actor.personId, reason ? String(reason).slice(0, 300) : undefined);
  // The period only: the reason is free text and stays with the period itself.
  const { data: m } = await db().from("metrics").select("name").eq("id", Number(metricId)).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: lock ? "period.locked" : "period.unlocked", object: { type: "metric", id: Number(metricId), name: m?.name ?? null }, details: { period } });
}

/** The Workflow's owner closes a period: every Metric of it with a value locks. Returns how many. */
export async function closeWorkflowPeriod(actor: Actor, workflowId: number, asOf: string): Promise<number> {
  // Only the demo pretends; elsewhere the period is the one that has ended as of the workspace's today.
  const asOfDay = actor.workspaceId === DEMO_WORKSPACE_ID ? day(asOf) : localTime(new Date(), (await workspaceClock(actor)).timeZone).day;
  const locked = await closePeriod(actor.workspaceId, Number(workflowId), asOfDay, actor.personId);
  const { data: wf } = await db().from("workflows").select("name").eq("id", Number(workflowId)).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "period.closed", object: { type: "workflow", id: Number(workflowId), name: wf?.name ?? null }, details: { as_of: asOfDay, locked } });
  return locked;
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
