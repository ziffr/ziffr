// The Workflow engine (GLOSSARY: Workflow, Due Date, Stand-in, Away, Escalation, Unusual Value, Approval, Lock).
// Entry points that take an id from outside look it up in one Workspace only. Time-based steps run once a day by the
// clock (scheduled-runs.ts, spec 0005), or as of a pretended day in the demo.
import { format } from "date-fns";
import { db } from "./db";
import { periodLabel, periodStart, formatValue } from "./format";
import { normalizeMetric } from "./metric-row";
import { deliver, deliverPrompt } from "./deliveries";
import { targetFor } from "./compare";
import { dueDate, shiftPeriod, unusualReasons, workingPeriod } from "./workflow-rules";
import type { Metric, Period, PeriodState, Workflow, WorkflowStep } from "./types";

/** A Metric with its Workflow and the period at hand. */
type Ctx = { m: Metric; wf: Workflow; period: string };

/** The Metric and its Workflow for a period, or null when it has none. */
async function metricCtx(metricId: number, period: string): Promise<Ctx | null> {
  const { data: row } = await db().from("metrics").select("*").eq("id", metricId).single();
  if (!row?.workflow_id) return null;
  const { data: wf } = await db().from("workflows").select("*").eq("id", row.workflow_id).single();
  return wf ? { m: normalizeMetric(row) as Metric, wf: wf as Workflow, period } : null;
}

/** The Workflow state of one period of a Metric. */
export async function getState(metricId: number, period: string): Promise<PeriodState | null> {
  const { data } = await db().from("period_states").select("*").eq("metric_id", metricId).eq("period_start", period).maybeSingle();
  return (data as PeriodState | null) ?? null;
}

/** Writes the Workflow state of one period. */
async function setState(metricId: number, period: string, patch: Partial<PeriodState>) {
  await db().from("period_states").upsert({ metric_id: metricId, period_start: period, state: "asked", ...patch, updated_at: new Date().toISOString() }, { onConflict: "metric_id,period_start", ignoreDuplicates: false });
}

/** Who is asked: the submitter, or their Stand-in while they are Away. */
async function whoToAsk(metricId: number, day: string) {
  const { data: tokens } = await db().from("tokens").select("submitter_id, stand_in_id").eq("metric_id", metricId).is("stands_in_for", null);
  if (!tokens?.length) return [];
  // Only the submitters' own Away entries, not everyone's.
  const { data: away } = await db().from("away").select("user_id").in("user_id", tokens.map((t) => t.submitter_id)).lte("starts", day).gte("ends", day);
  const out = new Set((away ?? []).map((a) => a.user_id));
  return (tokens ?? []).map((t) => ({ submitter: t.submitter_id as string, standIn: t.stand_in_id as string | null, ask: out.has(t.submitter_id) && t.stand_in_id ? t.stand_in_id : t.submitter_id, away: out.has(t.submitter_id) }));
}

/** The latest value of a period. */
async function latestValue(metricId: number, period: string) {
  const { data } = await db().from("observations").select("id, value, submitter_id").eq("metric_id", metricId).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
  return data?.[0] ?? null;
}

/** Runs the Workflows of one workspace's Metrics as of a day: asks, reminds and escalates for missing values, and
 * checks values that came in. Returns what happened, in words. With `queue`, emails wait for the deliveries job.
 */
export async function runWorkflows(workspaceId: string, asOf: string, actorId: string, { queue = false }: { queue?: boolean } = {}) {
  const [{ data: rows }, { data: flows }] = await Promise.all([
    db().from("metrics").select("*").eq("workspace_id", workspaceId).not("workflow_id", "is", null),
    // The workspace's Workflows once, not again for each Metric.
    db().from("workflows").select("*").eq("workspace_id", workspaceId),
  ]);
  const workflows = new Map((flows ?? []).map((w) => [w.id as number, w as Workflow]));
  const log: string[] = [];
  for (const row of rows ?? []) {
    const m = normalizeMetric(row) as Metric;
    if (m.formula) continue;
    const period = workingPeriod(asOf, m.period, periodStart);
    const wf = workflows.get(row.workflow_id as number);
    if (!wf) continue;
    const ctx: Ctx = { m, wf, period };
    const label = `${m.name}, ${periodLabel(period, m.period)}`;
    const [state, value] = await Promise.all([getState(m.id, period), latestValue(m.id, period)]);
    if (value) {
      if (!state || state.state === "asked") log.push(...(await onValue(m.id, period, value.submitter_id ?? actorId)).map((x) => `${label}: ${x}`));
      continue;
    }
    const due = dueDate(period, m.period, ctx.wf.config);
    const done = new Set(state?.done_steps ?? []);
    const people = await whoToAsk(m.id, asOf);
    if (!state) {
      for (const p of people) await deliverPrompt({ metricId: m.id, submitterId: p.ask, senderId: ctx.wf.owner_id, period, queue, note: p.away ? "You stand in while your colleague is away." : undefined });
      await setState(m.id, period, { state: "asked", done_steps: [] });
      log.push(`${label}: asked ${people.map((p) => p.ask).join(", ")}, due ${due}`);
    }
    for (const [i, step] of ctx.wf.config.steps.entries()) {
      if (done.has(i)) continue;
      if (step.type === "remind" && asOf >= shiftPeriod(due, "day", -step.daysBefore)) {
        for (const p of people) await deliverPrompt({ metricId: m.id, submitterId: p.ask, senderId: ctx.wf.owner_id, period, queue, note: `Reminder, due ${due}.` });
        done.add(i);
        log.push(`${label}: reminded`);
      }
      if (step.type === "escalate" && asOf > shiftPeriod(due, "day", step.daysAfter) ) {
        if (step.to === "stand-in") {
          for (const p of people) if (p.standIn && p.standIn !== p.ask) await deliverPrompt({ metricId: m.id, submitterId: p.standIn, senderId: ctx.wf.owner_id, period, queue, note: `The value was due ${due} and is still missing; you are the stand-in.` });
          log.push(`${label}: asked the stand-in`);
        } else {
          await escalateToOwner(ctx, due, actorId, queue);
          log.push(`${label}: told the owner`);
        }
        done.add(i);
      }
    }
    await setState(m.id, period, { state: "asked", done_steps: [...done] });
  }
  return log;
}

/** Asks the Metric owner to follow up a missing value. */
async function escalateToOwner(ctx: Ctx, due: string, actorId: string, queue = false) {
  const { data } = await db().from("actions").insert({
    metric_id: ctx.m.id, period_start: ctx.period, asker_id: ctx.wf.owner_id === ctx.m.owner_id ? actorId : ctx.wf.owner_id, assignee_id: ctx.m.owner_id,
    question: `${ctx.m.name} for ${periodLabel(ctx.period, ctx.m.period)} was due ${due} and is still missing. Please follow up.`, kind: "question", purpose: "escalation",
  }).select("id, asker_id").single();
  if (data) await deliver({ kind: "question", actionId: data.id, senderId: data.asker_id, recipientId: ctx.m.owner_id, queue });
}

/** A value came in (or was corrected): check it, then ask for Approval or publish. Returns what happened, in words. */
export async function onValue(metricId: number, period: string, submitterId: string): Promise<string[]> {
  const ctx = await metricCtx(metricId, period);
  if (!ctx) return [];
  const value = await latestValue(metricId, period);
  if (!value) return [];
  const steps = ctx.wf.config.steps;
  const check = steps.find((s): s is Extract<WorkflowStep, { type: "check" }> => s.type === "check");
  const approve = steps.find((s): s is Extract<WorkflowStep, { type: "approve" }> => s.type === "approve");
  let reasons: string[] = [];
  if (check) {
    const before = shiftPeriod(period, ctx.m.period, -1);
    const prev = await latestValue(metricId, before);
    const { data: targets } = await db().from("series_values").select("period_start, value").eq("metric_id", metricId).eq("kind", "target");
    const t = targetFor(ctx.m, period, (targets ?? []).map((x) => ({ period: x.period_start, value: Number(x.value) })));
    reasons = unusualReasons(ctx.m, Number(value.value), prev ? Number(prev.value) : undefined, before, check, t);
  }
  const approvers = (approve?.approvers ?? []).filter((a) => a !== submitterId);
  // A new value restarts approval: approval tasks from an earlier round can no longer decide anything.
  await db().from("actions").update({ status: "closed", updated_at: new Date().toISOString() }).eq("metric_id", metricId).eq("period_start", period).eq("purpose", "approval").eq("kind", "task").eq("status", "open");
  if (reasons.length && approvers.length) {
    const actionId = await requestApproval(ctx, approvers[0], submitterId, reasons, Number(value.value));
    await setState(metricId, period, { state: "approval", approval_step: 0, approval_action_id: actionId, note: reasons.join("; ") });
    return [`unusual (${reasons.join("; ")}), approval asked from ${approvers[0]}`];
  }
  return [await publish(ctx)];
}

/** Asks the next approver for Approval, as a task. */
async function requestApproval(ctx: Ctx, approver: string, submitterId: string, reasons: string[], value: number) {
  const { data } = await db().from("actions").insert({
    metric_id: ctx.m.id, period_start: ctx.period, asker_id: submitterId === approver ? ctx.wf.owner_id : submitterId, assignee_id: approver,
    question: `Approve ${ctx.m.name} for ${periodLabel(ctx.period, ctx.m.period)}: ${formatValue(ctx.m, value)}, ${reasons.join(", ")}. Reply “approve”, or “send back:” with what to check.`,
    kind: "task", purpose: "approval",
  }).select("id, asker_id").single();
  if (data) await deliver({ kind: "task", actionId: data.id, senderId: data.asker_id, recipientId: approver });
  return (data?.id as number | undefined) ?? null;
}

/** Publishes a period, locking it if the Workflow says so. */
async function publish(ctx: Ctx) {
  const pub = ctx.wf.config.steps.find((s): s is Extract<WorkflowStep, { type: "publish" }> => s.type === "publish");
  await setState(ctx.m.id, ctx.period, { state: pub?.lock ? "locked" : "published", approval_step: null, approval_action_id: null });
  return pub?.lock ? "published and locked" : "published";
}

/** The approver of an approval task approves; the next approver is asked, or the value is published. */
export async function approve(ws: string, actionId: number, by: string) {
  const { data: a } = await db().from("actions").select("*").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (!a || a.purpose !== "approval" || a.assignee_id !== by || a.status !== "open") throw new Error("This approval is not yours, or it is done.");
  const state = await getState(a.metric_id, a.period_start);
  const ctx = await metricCtx(a.metric_id, a.period_start);
  if (!ctx || state?.state !== "approval" || state.approval_action_id !== actionId) throw new Error("This value is not waiting for this approval.");
  await db().from("actions").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", actionId);
  await db().from("thread_messages").insert({ action_id: actionId, author_id: by, body: "Approved.", workspace_id: ws });
  const value = await latestValue(a.metric_id, a.period_start);
  const approvers = (ctx.wf.config.steps.find((s): s is Extract<WorkflowStep, { type: "approve" }> => s.type === "approve")?.approvers ?? []).filter((x) => x !== value?.submitter_id);
  const next = (state.approval_step ?? 0) + 1;
  if (next < approvers.length) {
    const nextAction = await requestApproval(ctx, approvers[next], value?.submitter_id ?? a.asker_id, (state.note ?? "").split("; ").filter(Boolean), Number(value?.value));
    await setState(a.metric_id, a.period_start, { state: "approval", approval_step: next, approval_action_id: nextAction, note: state.note });
    return `Approved; ${approvers[next]} approves next.`;
  }
  return `Approved; ${await publish(ctx)}.`;
}

/** Sends the value back to the submitter with what to check; the value stays, marked as not approved. */
export async function sendBack(ws: string, actionId: number, by: string, comment: string) {
  const { data: a } = await db().from("actions").select("*").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (!a || a.purpose !== "approval" || a.assignee_id !== by || a.status !== "open") throw new Error("This approval is not yours, or it is done.");
  const current = await getState(a.metric_id, a.period_start);
  if (current?.state !== "approval" || current.approval_action_id !== actionId) throw new Error("This value is not waiting for this approval.");
  await db().from("thread_messages").insert({ action_id: actionId, author_id: by, body: `Sent back: ${comment || "please check this value."}` });
  await db().from("actions").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", actionId);
  await setState(a.metric_id, a.period_start, { state: "submitted", approval_step: null, approval_action_id: null, note: `Sent back by ${by}: ${comment}` });
  await deliver({ kind: "reply", actionId, senderId: by, recipientId: a.asker_id, text: `Sent back: ${comment}. Reply with “Correction: <value>” if it needs changing.` });
}

/** The metric owner locks or unlocks one period by hand; unlocking needs a reason. */
export async function setLock(ws: string, metricId: number, period: string, lock: boolean, by: string, reason?: string) {
  const { data: m } = await db().from("metrics").select("owner_id").eq("id", metricId).eq("workspace_id", ws).maybeSingle();
  if (!m || m.owner_id !== by) throw new Error("Only the metric owner locks or unlocks a period.");
  if (!lock && !reason?.trim()) throw new Error("Say why it is unlocked.");
  await setState(metricId, period, { state: lock ? "locked" : "published", note: lock ? null : `Unlocked by ${by} on ${format(new Date(), "d MMM yyyy")}: ${reason}` });
}

/** Closes a period for every metric of a workflow that has a value: they lock. Returns how many. */
export async function closePeriod(ws: string, workflowId: number, asOf: string, by: string) {
  const { data: wf } = await db().from("workflows").select("owner_id").eq("id", workflowId).eq("workspace_id", ws).maybeSingle();
  if (!wf || wf.owner_id !== by) throw new Error("Only the workflow's owner closes a period.");
  const { data: rows } = await db().from("metrics").select("*").eq("workflow_id", workflowId).eq("workspace_id", ws);
  let n = 0;
  for (const row of rows ?? []) {
    const m = normalizeMetric(row) as Metric;
    const period = workingPeriod(asOf, m.period as Period, periodStart);
    if (!(await latestValue(m.id, period))) continue;
    await setState(m.id, period, { state: "locked", approval_step: null, note: `Closed with the period by ${by}` });
    n++;
  }
  return n;
}
