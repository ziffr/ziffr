"use server";
// Workflows (GLOSSARY: Workflow, Stand-in, Away, Approval, Lock).
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { assertWorkspaceOwner, forbidden } from "@/lib/guards";
import { approve, closePeriod, runWorkflows, sendBack, setLock } from "@/lib/workflow";
import { ensureBaseline, recordVersion } from "@/lib/versions";
import type { WorkflowConfig, WorkflowStep } from "@ziffr/core/types";

const done = () => revalidatePath("/", "layout");
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (v: unknown, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(v) || 0)));

/** Steps as they may be stored: known types, sane numbers, real people, at most one check, approval and publish. */
async function cleanConfig(c: WorkflowConfig): Promise<WorkflowConfig> {
  const { data: people } = await db.from("profiles").select("id");
  const ids = new Set((people ?? []).map((p) => p.id));
  const steps: WorkflowStep[] = [];
  for (const s of (Array.isArray(c?.steps) ? c.steps : []).slice(0, 12)) {
    if (s.type === "remind") steps.push({ type: "remind", daysBefore: int(s.daysBefore, 0, 30) });
    else if (s.type === "escalate") steps.push({ type: "escalate", to: s.to === "owner" ? "owner" : "stand-in", daysAfter: int(s.daysAfter, 0, 30) });
    else if (s.type === "check" && !steps.some((x) => x.type === "check")) steps.push({ type: "check", changePct: int(s.changePct, 1, 1000), outsideTarget: Boolean(s.outsideTarget) });
    else if (s.type === "approve" && !steps.some((x) => x.type === "approve")) steps.push({ type: "approve", approvers: [...new Set((s.approvers ?? []).filter((a) => ids.has(a)))].slice(0, 3) });
    else if (s.type === "publish" && !steps.some((x) => x.type === "publish")) steps.push({ type: "publish", lock: Boolean(s.lock) });
  }
  // Publishing comes last, whatever order the steps were given in.
  const pub = steps.filter((s) => s.type === "publish");
  return { dueWorkingDays: int(c?.dueWorkingDays, 0, 30), steps: [...steps.filter((s) => s.type !== "publish"), ...(pub.length ? pub : [{ type: "publish", lock: false } as WorkflowStep])] };
}

async function assertOwnsWorkflow(id: number, viewer: string) {
  const { data } = await db.from("workflows").select("owner_id").eq("id", id).single();
  if (!data || data.owner_id !== viewer) forbidden();
}

export async function saveWorkflow(id: number | null, name: string, config: WorkflowConfig) {
  const viewer = await viewerId();
  const row = { name: String(name ?? "").trim().slice(0, 80) || "Untitled workflow", config: await cleanConfig(config), updated_at: new Date().toISOString() };
  if (id) {
    await assertOwnsWorkflow(id, viewer);
    await ensureBaseline("workflow", id, viewer);
    await db.from("workflows").update(row).eq("id", id);
  } else {
    const { data } = await db.from("workflows").insert({ ...row, owner_id: viewer }).select("id").single();
    id = data!.id as number;
  }
  await recordVersion("workflow", id!, viewer);
  done();
  return id!;
}

export async function deleteWorkflow(id: number) {
  await assertOwnsWorkflow(id, await viewerId());
  await db.from("workflows").delete().eq("id", id);
  done();
}

/** A metric's owner decides which workflow its values take. */
export async function setMetricWorkflow(metricId: number, workflowId: number | null) {
  const viewer = await viewerId();
  const { data: m } = await db.from("metrics").select("owner_id, formula").eq("id", metricId).single();
  if (!m || m.owner_id !== viewer || m.formula) forbidden();
  if (workflowId !== null && !(await db.from("workflows").select("id").eq("id", workflowId).maybeSingle()).data) forbidden();
  await db.from("metrics").update({ workflow_id: workflowId }).eq("id", metricId);
  done();
}

/** PROTOTYPE: what a scheduler would run each morning, here as of any day you pick. */
export async function runWorkflowsNow(asOf: string) {
  const viewer = await viewerId();
  if (!DAY.test(asOf)) forbidden();
  const log = await runWorkflows(asOf, viewer);
  done();
  return log;
}

export async function approveValue(actionId: number) {
  const r = await approve(actionId, await viewerId());
  done();
  return r;
}

export async function sendValueBack(actionId: number, comment: string) {
  await sendBack(actionId, await viewerId(), String(comment ?? "").slice(0, 1000));
  done();
}

export async function lockPeriod(metricId: number, period: string, lock: boolean, reason?: string) {
  if (!DAY.test(period)) forbidden();
  await setLock(metricId, period, lock, await viewerId(), reason ? String(reason).slice(0, 300) : undefined);
  done();
}

export async function closeWorkflowPeriod(workflowId: number, asOf: string) {
  if (!DAY.test(asOf)) forbidden();
  const n = await closePeriod(workflowId, asOf, await viewerId());
  done();
  return n;
}

/** The metric owner chooses who stands in for each submitter. */
export async function setStandIn(metricId: number, submitterId: string, standInId: string | null) {
  const viewer = await viewerId();
  const { data: m } = await db.from("metrics").select("owner_id").eq("id", metricId).single();
  if (!m || m.owner_id !== viewer || standInId === submitterId) forbidden();
  if (standInId && !(await db.from("profiles").select("id").eq("id", standInId).maybeSingle()).data) forbidden();
  await db.from("tokens").update({ stand_in_id: standInId }).eq("metric_id", metricId).eq("submitter_id", submitterId).is("stands_in_for", null);
  // Whoever stood in before loses their stand-in Token at once.
  await db.from("tokens").delete().eq("metric_id", metricId).eq("stands_in_for", submitterId).neq("submitter_id", standInId ?? "");
  done();
}

/** People set their own away dates; the workspace owner can set anyone's. null clears them. */
export async function setAway(userId: string, starts: string | null, ends: string | null) {
  const viewer = await viewerId();
  if (userId !== viewer) await assertWorkspaceOwner(viewer);
  await db.from("away").delete().eq("user_id", userId);
  if (starts && ends) {
    if (!DAY.test(starts) || !DAY.test(ends) || ends < starts) throw new Error("Pick a start and an end date.");
    await db.from("away").insert({ user_id: userId, starts, ends });
  }
  done();
}
