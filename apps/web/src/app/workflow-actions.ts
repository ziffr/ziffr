"use server";
// Workflows (GLOSSARY: Workflow, Stand-in, Away, Approval, Lock): thin calls into the core (@ziffr/core/workflows).
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import * as wf from "@ziffr/core/workflows";
import type { WorkflowConfig } from "@ziffr/core/types";

const done = () => revalidatePath("/", "layout");

/** Saves a Workflow; returns its id. */
export async function saveWorkflow(id: number | null, name: string, config: WorkflowConfig) {
  const saved = await wf.saveWorkflow(await currentActor(), id === null ? null : Number(id), String(name ?? ""), config);
  done();
  return saved;
}

/** Deletes a Workflow. */
export async function deleteWorkflow(id: number) {
  await wf.deleteWorkflow(await currentActor(), Number(id));
  done();
}

/** A metric's owner decides which workflow its values take. */
export async function setMetricWorkflow(metricId: number, workflowId: number | null) {
  await wf.setMetricWorkflow(await currentActor(), Number(metricId), workflowId === null ? null : Number(workflowId));
  done();
}

/** PROTOTYPE: what a scheduler would run each morning, here as of any day you pick. */
export async function runWorkflowsNow(asOf: string) {
  const log = await wf.runWorkflowsAsOf(await currentActor(), String(asOf));
  done();
  return log;
}

/** The approver approves a value. */
export async function approveValue(actionId: number) {
  const r = await wf.approveValue(await currentActor(), Number(actionId));
  done();
  return r;
}

/** The approver sends a value back. */
export async function sendValueBack(actionId: number, comment: string) {
  await wf.sendValueBack(await currentActor(), Number(actionId), String(comment ?? ""));
  done();
}

/** The Metric owner locks or unlocks a period. */
export async function lockPeriod(metricId: number, period: string, lock: boolean, reason?: string) {
  await wf.lockPeriod(await currentActor(), Number(metricId), String(period), Boolean(lock), reason);
  done();
}

/** The Workflow's owner closes a period. */
export async function closeWorkflowPeriod(workflowId: number, asOf: string) {
  const n = await wf.closeWorkflowPeriod(await currentActor(), Number(workflowId), String(asOf));
  done();
  return n;
}

/** The metric owner chooses who stands in for each submitter. */
export async function setStandIn(metricId: number, submitterId: string, standInId: string | null) {
  await wf.setStandIn(await currentActor(), Number(metricId), String(submitterId), standInId === null ? null : String(standInId));
  done();
}

/** People set their own away dates; owners and admins can set anyone's. null clears them. */
export async function setAway(userId: string, starts: string | null, ends: string | null) {
  await wf.setAway(await currentActor(), String(userId), starts, ends);
  done();
}
