// The Workflow engine (GLOSSARY: Workflow, Due Date, Stand-in, Away, Escalation, Unusual Value, Approval, Lock, Feed).
// Entry points that take an id from outside look it up in one Workspace only. Time-based steps run once a day by the
// clock (scheduled-runs.ts, spec 0005), or as of a pretended day in the demo.
import { format } from "date-fns";
import { db } from "./db";
import { formatValue } from "./format";
import { normalizeMetric } from "./metric-row";
import { deliver, deliverPrompt } from "./deliveries";
import { targetFor } from "./compare";
import { dueDate, unusualReasons, workingPeriod } from "./workflow-rules";
import { localTime } from "./workspace-clock";
import type { Metric, Period, PeriodState, Workflow, WorkflowStep } from "./types";
import { recordAudit } from "./audit-log";
import { periodLabel, shiftPeriod, type YearStart } from "./periods";
import { yearStartFor, yearStartOf } from "./fiscal-year";
import type { NumberStyle } from "./number-style";
import { numberStyleOf } from "./workspace-settings";

/** A Metric with its Workflow and the period at hand. */
type Ctx = { m: Metric; wf: Workflow; period: string; yearStart: YearStart; numberStyle: NumberStyle; ws: string };

/** The Metric and its Workflow for a period, or null when it has none. */
async function metricCtx(metricId: number, period: string): Promise<Ctx | null> {
  const { data: row } = await db().from("metrics").select("*").eq("id", metricId).single();
  if (!row?.workflow_id) return null;
  const { data: wf } = await db().from("workflows").select("*").eq("id", row.workflow_id).single();
  const m = normalizeMetric(row) as Metric;
  return wf ? { m, wf: wf as Workflow, period, ws: String(row.workspace_id), yearStart: await yearStartFor(String(row.workspace_id), m.period), numberStyle: await numberStyleOf(String(row.workspace_id)) } : null;
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

/** The Feeds among some submitters (GLOSSARY: Feed): they are never asked, and their missing values go to the owner. */
async function feedsAmong(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await db().from("feeds").select("person_id, name").in("person_id", ids);
  return new Map((data ?? []).map((f) => [f.person_id as string, f.name as string]));
}

/** Who is asked: the submitter, or their Stand-in while they are Away. A Feed is a program and is never asked. */
async function whoToAsk(metricId: number, day: string) {
  const { data: all } = await db().from("tokens").select("submitter_id, stand_in_id").eq("metric_id", metricId).is("stands_in_for", null);
  const feeds = await feedsAmong((all ?? []).map((t) => t.submitter_id as string));
  const tokens = (all ?? []).filter((t) => !feeds.has(t.submitter_id));
  if (!tokens.length) return [];
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
  const [yearStart, numberStyle] = await Promise.all([yearStartOf(workspaceId), numberStyleOf(workspaceId)]);
  const log: string[] = [];
  for (const row of rows ?? []) {
    const m = normalizeMetric(row) as Metric;
    if (m.formula) continue;
    const period = workingPeriod(asOf, m.period, yearStart);
    const wf = workflows.get(row.workflow_id as number);
    if (!wf) continue;
    const ctx: Ctx = { m, wf, period, yearStart, numberStyle, ws: workspaceId };
    const label = `${m.name}, ${periodLabel(period, m.period, yearStart)}`;
    const [state, value] = await Promise.all([getState(m.id, period), latestValue(m.id, period)]);
    if (value) {
      if (!state || state.state === "asked") log.push(...(await onValue(m.id, period, value.submitter_id ?? actorId)).map((x) => `${label}: ${x}`));
      continue;
    }
    const due = dueDate(period, m.period, ctx.wf.config);
    const done = new Set(state?.done_steps ?? []);
    const people = await whoToAsk(m.id, asOf);
    const { data: feedTokens } = await db().from("tokens").select("submitter_id").eq("metric_id", m.id).is("stands_in_for", null);
    const feeds = [...(await feedsAmong((feedTokens ?? []).map((t) => t.submitter_id as string))).values()];
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
          // A Feed has no Stand-in: when it is what is missing, the owner hears of it instead (spec 0012).
          if (feeds.length) {
            await escalateToOwner(ctx, due, actorId, queue, feeds);
            log.push(`${label}: told the owner`);
          }
        } else {
          await escalateToOwner(ctx, due, actorId, queue, feeds);
          log.push(`${label}: told the owner`);
        }
        done.add(i);
      }
    }
    await setState(m.id, period, { state: "asked", done_steps: [...done] });
  }
  return log;
}

/** Asks the Metric owner to follow up a missing value, naming the Feeds that should have sent it. */
async function escalateToOwner(ctx: Ctx, due: string, actorId: string, queue = false, feeds: string[] = []) {
  const from = feeds.length ? ` It should come from the Feed ${feeds.join(", ")}: check that it still runs.` : "";
  const { data } = await db().from("actions").insert({
    metric_id: ctx.m.id, period_start: ctx.period, asker_id: ctx.wf.owner_id === ctx.m.owner_id ? actorId : ctx.wf.owner_id, assignee_id: ctx.m.owner_id,
    question: `${ctx.m.name} for ${periodLabel(ctx.period, ctx.m.period, ctx.yearStart)} was due ${due} and is still missing.${from} Please follow up.`, kind: "question", purpose: "escalation",
  }).select("id, asker_id").single();
  if (data) await deliver({ kind: "question", actionId: data.id, senderId: data.asker_id, recipientId: ctx.m.owner_id, queue });
}

/** Who approves a value, in order: the Approve step's Approvers but never the one the value is from. With Every value,
 * when that leaves nobody (the submitter is the only Approver), the Workflow's owner approves instead, else the
 * Metric's owner, so a value never counts unapproved because its submitter is an Approver. An Approve step that names
 * nobody holds nothing back. */
function approversFor(ctx: Ctx, step: Extract<WorkflowStep, { type: "approve" }> | undefined, from: string): string[] {
  if (!step?.approvers.length) return [];
  const named = step.approvers.filter((a) => a !== from);
  if (named.length || step.values !== "every") return named;
  return [ctx.wf.owner_id, ctx.m.owner_id].filter((a) => a && a !== from).slice(0, 1);
}

/** Whether a period is history for a Workflow as of today: before the period it works on (the last one that ended),
 * in the workspace's own time zone. */
async function beforeWorkingPeriod(ctx: Ctx, period: string): Promise<boolean> {
  const { data } = await db().from("workspaces").select("time_zone").eq("id", ctx.ws).maybeSingle();
  const today = localTime(new Date(), String(data?.time_zone ?? "UTC")).day;
  return period < workingPeriod(today, ctx.m.period, ctx.yearStart);
}

/** A value came in (or was corrected): check it, then ask for Approval or publish. Returns what happened, in words.
 * An Unusual Value waits for the Approvers; with an Approve step for every value, every value does. An Import
 * (GLOSSARY: Import) is not checked: a Feed's history should not raise an Approval per period, and its values are
 * marked as imported instead. Under Every value an Import counts at once only for history, a period before the one
 * the Workflow works on; one for that period or later waits like any value, so a Feed closing the month is approved. */
export async function onValue(metricId: number, period: string, submitterId: string, opts: { imported?: boolean } = {}): Promise<string[]> {
  const ctx = await metricCtx(metricId, period);
  if (!ctx) return [];
  const value = await latestValue(metricId, period);
  if (!value) return [];
  const steps = ctx.wf.config.steps;
  const check = steps.find((s): s is Extract<WorkflowStep, { type: "check" }> => s.type === "check");
  const approve = steps.find((s): s is Extract<WorkflowStep, { type: "approve" }> => s.type === "approve");
  let reasons: string[] = [];
  if (check && !opts.imported) {
    const before = shiftPeriod(period, ctx.m.period, -1);
    const prev = await latestValue(metricId, before);
    const { data: targets } = await db().from("series_values").select("period_start, value").eq("metric_id", metricId).eq("kind", "target");
    const t = targetFor(ctx.m, period, (targets ?? []).map((x) => ({ period: x.period_start, value: Number(x.value) })));
    reasons = unusualReasons(ctx.m, Number(value.value), prev ? Number(prev.value) : undefined, before, check, ctx.yearStart, ctx.numberStyle, t);
  }
  const approvers = approversFor(ctx, approve, submitterId);
  // A new value restarts approval: approval tasks from an earlier round can no longer decide anything.
  await db().from("actions").update({ status: "closed", updated_at: new Date().toISOString() }).eq("metric_id", metricId).eq("period_start", period).eq("purpose", "approval").eq("kind", "task").eq("status", "open");
  // A step stored without the choice holds back Unusual Values only, as before the choice existed.
  const every = approve?.values === "every" && (!opts.imported || !(await beforeWorkingPeriod(ctx, period)));
  if ((reasons.length || every) && approvers.length) {
    const actionId = await requestApproval(ctx, approvers[0], submitterId, reasons, Number(value.value));
    await setState(metricId, period, { state: "approval", approval_step: 0, approval_action_id: actionId, approval_for: submitterId, note: reasons.join("; ") });
    return [reasons.length ? `unusual (${reasons.join("; ")}), approval asked from ${approvers[0]}` : `every value is approved, approval asked from ${approvers[0]}`];
  }
  return [await publish(ctx)];
}

/** Asks the next approver for Approval, as a task. */
async function requestApproval(ctx: Ctx, approver: string, submitterId: string, reasons: string[], value: number) {
  const { data } = await db().from("actions").insert({
    metric_id: ctx.m.id, period_start: ctx.period, asker_id: submitterId === approver ? ctx.wf.owner_id : submitterId, assignee_id: approver,
    // Without reasons the value waits because every value is approved here, not because it is unusual.
    question: `Approve ${ctx.m.name} for ${periodLabel(ctx.period, ctx.m.period, ctx.yearStart)}: ${formatValue(ctx.m, value, ctx.numberStyle)}${reasons.length ? `, ${reasons.join(", ")}` : ""}. Reply “approve”, or “send back:” with what to check.`,
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
  // Closed only while still open, in one statement: two presses at once (a double tap on a button, a reply and a
  // press) approve once, and the second is refused like an approval that is done.
  const { data: closed } = await db().from("actions").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "open").select("id");
  if (!closed?.length) throw new Error("This approval is not yours, or it is done.");
  await db().from("thread_messages").insert({ action_id: actionId, author_id: by, body: "Approved.", workspace_id: ws });
  // Here, not in the Actor's wrapper: approvals also arrive as replies through a Connector (threads.ts).
  await recordAudit(ws, by, { kind: "approval.given", object: { type: "metric", id: a.metric_id, name: ctx.m.name }, details: { period: a.period_start, step: (state.approval_step ?? 0) + 1 } });
  const value = await latestValue(a.metric_id, a.period_start);
  // The same people, in the same order, as when the round started: skipping the one the round is about (also when
  // it began with an accepted Correction), not whoever submitted the latest value.
  const from = state.approval_for ?? value?.submitter_id ?? a.asker_id;
  const approvers = approversFor(ctx, ctx.wf.config.steps.find((s): s is Extract<WorkflowStep, { type: "approve" }> => s.type === "approve"), from);
  const next = (state.approval_step ?? 0) + 1;
  if (next < approvers.length) {
    const nextAction = await requestApproval(ctx, approvers[next], from, (state.note ?? "").split("; ").filter(Boolean), Number(value?.value));
    await setState(a.metric_id, a.period_start, { state: "approval", approval_step: next, approval_action_id: nextAction, approval_for: from, note: state.note });
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
  // The period only: the comment is a message and stays in the Thread.
  const { data: m } = await db().from("metrics").select("name").eq("id", a.metric_id).eq("workspace_id", ws).maybeSingle();
  await recordAudit(ws, by, { kind: "approval.sent_back", object: { type: "metric", id: a.metric_id, name: m?.name ?? null }, details: { period: a.period_start } });
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
  const [{ data: rows }, yearStart] = await Promise.all([db().from("metrics").select("*").eq("workflow_id", workflowId).eq("workspace_id", ws), yearStartOf(ws)]);
  let n = 0;
  for (const row of rows ?? []) {
    const m = normalizeMetric(row) as Metric;
    const period = workingPeriod(asOf, m.period as Period, yearStart);
    if (!(await latestValue(m.id, period))) continue;
    await setState(m.id, period, { state: "locked", approval_step: null, note: `Closed with the period by ${by}` });
    n++;
  }
  return n;
}
