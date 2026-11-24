"use server";
// Workflows (GLOSSARY: Workflow, Stand-in, Away, Approval, Self-check, Lock): thin calls into the core (@ziffr/core/workflows).
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { attempt } from "@/lib/action-result";
import { inDemoVisit } from "@/lib/demo-visit-action";
import { demoTextForVisit } from "@ziffr/core/demo-text";
import * as wf from "@ziffr/core/workflows";
import * as questions from "@ziffr/core/questions";
import type { WorkflowConfig } from "@ziffr/core/types";

const done = () => revalidatePath("/", "layout");

/** Saves a Workflow; returns its id. */
export async function saveWorkflow(id: number | null, name: string, config: WorkflowConfig) {
  return attempt(async () => {
    const saved = await wf.saveWorkflow(await currentActor(), id === null ? null : Number(id), String(name ?? ""), config);
    done();
    return saved;
  });
}

/** Deletes a Workflow. */
export async function deleteWorkflow(id: number) {
  return attempt(async () => {
    await wf.deleteWorkflow(await currentActor(), Number(id));
    done();
  });
}

/** A metric's owner decides which workflow its values take. */
export async function setMetricWorkflow(metricId: number, workflowId: number | null) {
  return attempt(async () => {
    await wf.setMetricWorkflow(await currentActor(), Number(metricId), workflowId === null ? null : Number(workflowId));
    done();
  });
}

/** The demo: runs its Workflows as of a day you pick, to try what the clock does. */
export async function runWorkflowsNow(asOf: string) {
  // In the demo its Prompts, reminders and escalations go to the Outbox; the whole demo takes one run a minute (spec 0051).
  return attempt(() => inDemoVisit("workflow-actions:runWorkflowsNow", async () => {
    const log = await wf.runWorkflowsAsOf(await currentActor(), String(asOf));
    done();
    return log;
  }, { workflowRun: true }));
}

/** A real workspace: runs today's steps now, once (spec 0005), or one Workflow's own run (spec 0035). Null when today ran already. */
export async function runTodayNow(workflowId?: number) {
  return attempt(async () => {
    const counts = await wf.runTodayNow(await currentActor(), workflowId === undefined ? undefined : Number(workflowId));
    done();
    return counts;
  });
}

/** The approver approves a value. */
export async function approveValue(actionId: number) {
  return attempt(() => inDemoVisit("workflow-actions:approveValue", async () => {
    const r = await wf.approveValue(await currentActor(), Number(actionId));
    done();
    return r;
  }));
}

/** The submitter confirms their own value in a Self-check. */
export async function confirmOwnValue(actionId: number) {
  return attempt(() => inDemoVisit("workflow-actions:confirmOwnValue", async () => {
    const r = await wf.confirmOwnValue(await currentActor(), Number(actionId));
    done();
    return r;
  }));
}

/** The submitter corrects their own value in a Self-check. */
export async function correctOwnValue(actionId: number, value: number) {
  return attempt(() => inDemoVisit("workflow-actions:correctOwnValue", async () => {
    const r = await wf.correctOwnValue(await currentActor(), Number(actionId), Number(value));
    done();
    return r;
  }));
}

/** The approver sends a value back. */
export async function sendValueBack(actionId: number, comment: string) {
  return attempt(() => inDemoVisit("workflow-actions:sendValueBack", async (visiting) => {
    await wf.sendValueBack(await currentActor(), Number(actionId), demoTextForVisit(visiting, String(comment ?? ""), "message"));
    done();
  }));
}

/** Someone on the Thread (the approver on an Approval) proposes a corrected value instead of approving: a Correction in the Thread (the Metric's owner accepts it, and it goes through approval again). */
export async function proposeValueCorrection(actionId: number, value: number, why: string) {
  return attempt(() => inDemoVisit("workflow-actions:proposeValueCorrection", async (visiting) => {
    const n = typeof value === "number" ? value : NaN;
    if (!Number.isFinite(n)) throw new Error("Enter the corrected value as a number.");
    await questions.reply(await currentActor(), Number(actionId), demoTextForVisit(visiting, String(why ?? ""), "message").slice(0, 1000), n);
    done();
  }));
}

/** The Metric owner locks or unlocks a period. */
export async function lockPeriod(metricId: number, period: string, lock: boolean, reason?: string) {
  return attempt(() => inDemoVisit("workflow-actions:lockPeriod", async (visiting) => {
    await wf.lockPeriod(await currentActor(), Number(metricId), String(period), Boolean(lock), reason === undefined ? undefined : demoTextForVisit(visiting, String(reason), "message"));
    done();
  }));
}

/** The Workflow's owner closes a period. */
export async function closeWorkflowPeriod(workflowId: number, asOf: string) {
  return attempt(() => inDemoVisit("workflow-actions:closeWorkflowPeriod", async () => {
    const n = await wf.closeWorkflowPeriod(await currentActor(), Number(workflowId), String(asOf));
    done();
    return n;
  }));
}

/** The metric owner chooses who stands in for each submitter. */
export async function setStandIn(metricId: number, submitterId: string, standInId: string | null) {
  return attempt(() => inDemoVisit("workflow-actions:setStandIn", async () => {
    await wf.setStandIn(await currentActor(), Number(metricId), String(submitterId), standInId === null ? null : String(standInId));
    done();
  }));
}

/** People set their own away dates; owners and admins can set anyone's. null clears them. */
export async function setAway(userId: string, starts: string | null, ends: string | null) {
  return attempt(() => inDemoVisit("workflow-actions:setAway", async () => {
    await wf.setAway(await currentActor(), String(userId), starts, ends);
    done();
  }));
}
