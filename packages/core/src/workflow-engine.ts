// The Workflow engine (GLOSSARY: Workflow, Due Date, Stand-in, Away, Escalation, Unusual Value, Approval, Self-check,
// Lock, Feed).
// Entry points that take an id from outside look it up in one Workspace only. Time-based steps run once a day by the
// clock (scheduled-runs.ts, spec 0005), or as of a pretended day in the demo.
import { format } from "date-fns";
import { db } from "./db";
import { insertSealed, openOne, openRows } from "./sealed-columns";
import { formatValue } from "./format";
import { normalizeMetric } from "./metric-row";
import { deliver, deliverPrompt } from "./deliveries";
import { targetFor } from "./compare";
import { dueDate, unusualReasons, workingPeriod } from "./workflow-rules";
import { localTime } from "./workspace-clock";
import { visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import type { Metric, Period, PeriodState, Workflow, WorkflowStep } from "./types";
import { recordAudit } from "./audit-log";
import { changeActionState, closeActions } from "./action-state";
import { FROM_APP, queueWebhookEvent, type ChangeSource } from "./webhook-events";
import { sendLockSummary } from "./lock-summary";
import { periodLabel, shiftPeriod, type YearStart } from "./periods";
import { yearStartFor, yearStartOf } from "./fiscal-year";
import type { NumberStyle } from "./number-style";
import { numberStyleOf } from "./workspace-settings";
import { checkAlerts, checkMissingAlerts } from "./alert-firing";
import { refreshAlertSight } from "./alerts";
import { checkTells } from "./tell-firing";

/** A Metric with its Workflow and the period at hand. */
type Ctx = { m: Metric; wf: Workflow; period: string; yearStart: YearStart; numberStyle: NumberStyle; ws: string };

/** The Metric and its Workflow for a period, or null when it has none. */
async function metricCtx(metricId: number, period: string): Promise<Ctx | null> {
  const { data: sealedRow } = await db().from("metrics").select("*").eq("id", metricId).single();
  const row = await openOne("metrics", String(sealedRow?.workspace_id), sealedRow);
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

/** Which Workflows a run covers (GLOSSARY: Asking Schedule): all of them (the demo, which ignores schedules), only
 * those that run with the Workspace's daily run, or one Workflow that runs on its own days and hour. */
export type RunScope = "all" | "unscheduled" | { workflowId: number };

/** Runs the Workflows of one workspace's Metrics as of a day: asks, reminds and escalates for missing values, and
 * checks values that came in. Returns what happened, in words. With `queue`, emails wait for the deliveries job.
 */
export async function runWorkflows(workspaceId: string, asOf: string, actorId: string, { queue = false, scope = "all" }: { queue?: boolean; scope?: RunScope } = {}) {
  const [{ data: sealedRows }, { data: flows }] = await Promise.all([
    db().from("metrics").select("*").eq("workspace_id", workspaceId).not("workflow_id", "is", null),
    // The workspace's Workflows once, not again for each Metric.
    db().from("workflows").select("*").eq("workspace_id", workspaceId),
  ]);
  const rows = await openRows("metrics", workspaceId, sealedRows);
  const workflows = new Map((flows ?? []).map((w) => [w.id as number, w as Workflow]));
  const [yearStart, numberStyle] = await Promise.all([yearStartOf(workspaceId), numberStyleOf(workspaceId)]);
  const log: string[] = [];
  // Alerts whose person lost or regained sight of their Metric, or whose Metric is archived: bookkeeping, no messages.
  if (typeof scope === "string") await refreshAlertSight(workspaceId).catch((e) => console.error("Alerts could not be refreshed:", e instanceof Error ? e.message : e));
  for (const row of rows ?? []) {
    const own = workflows.get(row.workflow_id as number);
    // A Workflow with an Asking Schedule is run by its own run, not by the Workspace's.
    if (scope === "unscheduled" ? own?.config.asking : typeof scope === "object" && row.workflow_id !== scope.workflowId) continue;
    const m = normalizeMetric(row) as Metric;
    // An Archived Metric is skipped: no Prompt, reminder or Escalation goes out for it (GLOSSARY: Archived Metric).
    if (m.formula || m.archived_at) continue;
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
    // The day after the Due Date, with still no value: the Alerts that wait for that fire, once per period.
    await checkMissingAlerts(workspaceId, m.id, period, due, asOf);
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
  const [data] = await insertSealed("actions", ctx.ws, [{
    metric_id: ctx.m.id, period_start: ctx.period, asker_id: ctx.wf.owner_id === ctx.m.owner_id ? actorId : ctx.wf.owner_id, assignee_id: ctx.m.owner_id,
    question: `${ctx.m.name} for ${periodLabel(ctx.period, ctx.m.period, ctx.yearStart)} was due ${due} and is still missing.${from} Please follow up.`, kind: "question", purpose: "escalation",
  }], "id, asker_id") as { id: number; asker_id: string }[];
  if (data) await deliver({ kind: "question", actionId: data.id, senderId: data.asker_id, recipientId: ctx.m.owner_id, queue, source: { type: "workflow" } });
}

/** Whether a person of the Metric's workspace sees it now (Shares and Groups, as everywhere else). */
async function seesMetric(ctx: Ctx, person: string): Promise<boolean> {
  return (await visibleMetricIds(ctx.ws, person, await getMetrics(ctx.ws))).has(ctx.m.id);
}

/** Who approves a value, in order: the Approve step's Approvers but never the one the value is from. When that leaves
 * nobody (the submitter is the only Approver), the Metric's owner approves instead, else the Workflow's owner, but
 * only someone who sees the Metric: the Approval task shows its value. With nobody else at all, the step's choice
 * decides (onValue): a Self-check by the submitter, or counting it without Approval, never an Approval by the
 * submitter. A step that names nobody holds nothing back. */
async function approversFor(ctx: Ctx, step: Extract<WorkflowStep, { type: "approve" }> | undefined, from: string): Promise<string[]> {
  if (!step?.approvers.length) return [];
  // Named Approvers are chosen by the Workflow's owner for this purpose; only the fallback must already see the Metric.
  const named = step.approvers.filter((a) => a !== from);
  if (named.length) return named;
  for (const candidate of [ctx.m.owner_id, ctx.wf.owner_id]) {
    if (!candidate || candidate === from) continue;
    // Only someone of this workspace who sees the Metric now (Shares and Groups as everywhere else).
    if (await seesMetric(ctx, candidate)) return [candidate];
  }
  return [];
}

/** Whether a period is history for a Workflow as of today: before the period it works on (the last one that ended),
 * in the workspace's own time zone. */
async function beforeWorkingPeriod(ctx: Ctx, period: string): Promise<boolean> {
  const { data } = await db().from("workspaces").select("time_zone").eq("id", ctx.ws).maybeSingle();
  const today = localTime(new Date(), String(data?.time_zone ?? "UTC")).day;
  return period < workingPeriod(today, ctx.m.period, ctx.yearStart);
}

/** What a Metric's Workflow would do with a new value from a submitter, for a preview that writes nothing (spec 0026):
 * its check step, whether it approves every value, whether it has Approvers at all, who would be asked first (null
 * when nobody but the submitter could approve, and the value would wait), and the period it works on, before which
 * an Import counts at once. Null when the Metric has no Workflow: its values are published as they come. */
export type ValueOutlook = {
  check: Extract<WorkflowStep, { type: "check" }> | null;
  every: boolean;
  approves: boolean;
  approver: string | null;
  working: string;
  yearStart: YearStart;
};

/** The ValueOutlook of a Metric for a submitter; mirrors onValue, so the preview and the recording agree. */
export async function valueOutlook(metricId: number, submitterId: string): Promise<ValueOutlook | null> {
  const ctx = await metricCtx(metricId, "");
  if (!ctx) return null;
  const steps = ctx.wf.config.steps;
  const check = steps.find((s): s is Extract<WorkflowStep, { type: "check" }> => s.type === "check") ?? null;
  const approve = steps.find((s): s is Extract<WorkflowStep, { type: "approve" }> => s.type === "approve");
  const { data } = await db().from("workspaces").select("time_zone").eq("id", ctx.ws).maybeSingle();
  const today = localTime(new Date(), String(data?.time_zone ?? "UTC")).day;
  const approves = Boolean(approve?.approvers.length);
  return {
    check,
    every: approve?.values === "every",
    approves,
    approver: approves ? ((await approversFor(ctx, approve, submitterId))[0] ?? null) : null,
    working: workingPeriod(today, ctx.m.period, ctx.yearStart),
    yearStart: ctx.yearStart,
  };
}

/** A value came in (or was corrected): check it, then ask for Approval or publish. Returns what happened, in words.
 * An Unusual Value waits for the Approvers; with an Approve step for every value, every value does. An Import
 * (GLOSSARY: Import) is not checked: a Feed's history should not raise an Approval per period, and its values are
 * marked as imported instead. Under Every value an Import counts at once only for history, a period before the one
 * the Workflow works on; one for that period or later waits like any value, so a Feed closing the month is approved.
 * When nobody but the submitter could approve it, the submitter checks it (GLOSSARY: Self-check) or it counts at
 * once, as the Approve step says. `selfChecked` is set only by correctSelfCheck, the id of the value the submitter
 * just typed while checking: if it is still the latest, it counts as confirmed instead of asking them again. */
export async function onValue(metricId: number, period: string, submitterId: string, opts: { imported?: boolean; selfChecked?: number } = {}): Promise<string[]> {
  const done = await workflowStep(metricId, period, submitterId, opts);
  // The one place a value that counts reaches the Alerts, whatever Source it came from and whether or not the Metric has
  // a Workflow (spec 0032): a value waiting for Approval is looked at only by Alerts that include those; an Import is silent.
  await checkAlerts(metricId, { imported: opts.imported });
  // The Workflow's own Tell steps look at the same value, for the people the Workflow's owner chose.
  await checkTells(metricId, { imported: opts.imported });
  return done;
}

/** The Workflow's own part of a new value: check, Approval or publish. */
async function workflowStep(metricId: number, period: string, submitterId: string, opts: { imported?: boolean; selfChecked?: number }): Promise<string[]> {
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
  // A new value restarts approval: approval and Self-check tasks from an earlier round can no longer decide anything.
  await closeActions(ctx.ws, { metricId, period, kind: "task", purposes: ["approval", "self_check"] }, { type: "workflow" }, "closed");
  // A step stored without the choice holds back Unusual Values only, as before the choice existed.
  const every = approve?.values === "every" && (!opts.imported || !(await beforeWorkingPeriod(ctx, period)));
  // Asked only when a value needs Approval: who sees the Metric is not cheap to work out.
  const approvers = reasons.length || every ? await approversFor(ctx, approve, submitterId) : [];
  // Approval is needed, but the submitter is the only person who could give it. Never an Approval by them: the step
  // says whether they check it themselves (a Self-check, the default) or it counts without Approval, said in a note.
  if ((reasons.length || every) && approve?.approvers.length && !approvers.length) {
    // A Feed is a program: it cannot check anything, and nobody stands behind its value, so it waits under either
    // choice, as before the choice existed.
    if ((await feedsAmong([submitterId])).size) {
      await setState(metricId, period, { state: "approval", approval_step: null, approval_action_id: null, approval_for: submitterId, note: "Waits for Approval: nobody but the Feed that sent it can approve it. Add an Approver to the Workflow." });
      return ["waits for approval: nobody but the Feed that sent it can approve it"];
    }
    if (approve.nobodyElse === "count") {
      await recordAudit(ctx.ws, null, { kind: "approval.skipped", object: { type: "metric", id: metricId, name: ctx.m.name }, details: { period, submitter: submitterId, workflow: ctx.wf.id } });
      return [`counted without approval: nobody else could approve it; ${await publish(ctx, COUNTED_NOTE)}`];
    }
    if (opts.selfChecked !== undefined && opts.selfChecked === value.id) return [`corrected and confirmed by the submitter; ${await publish(ctx, CONFIRMED_NOTE)}`];
    const actionId = await requestSelfCheck(ctx, submitterId, reasons, Number(value.value), value.id as number);
    if (reasons.length) await queueWebhookEvent(ctx.ws, "value.unusual", { type: "workflow" }, { metricId, period });
    await setState(metricId, period, { state: "approval", approval_step: null, approval_action_id: actionId, approval_for: submitterId, note: `Waits for its submitter to check it: nobody else can approve it.${reasons.length ? ` ${reasons.join("; ")}` : ""}` });
    return ["nobody else can approve it: its submitter checks it"];
  }
  if ((reasons.length || every) && approvers.length) {
    const actionId = await requestApproval(ctx, approvers[0], submitterId, reasons, Number(value.value));
    // An Unusual Value waits for Approval: the Webhooks that chose it hear of the Metric and period, never of the value.
    if (reasons.length) await queueWebhookEvent(ctx.ws, "value.unusual", { type: "workflow" }, { metricId, period });
    await setState(metricId, period, { state: "approval", approval_step: 0, approval_action_id: actionId, approval_for: submitterId, note: reasons.join("; ") });
    return [reasons.length ? `unusual (${reasons.join("; ")}), approval asked from ${approvers[0]}` : `every value is approved, approval asked from ${approvers[0]}`];
  }
  return [await publish(ctx)];
}

/** Asks the next approver for Approval, as a task. */
async function requestApproval(ctx: Ctx, approver: string, submitterId: string, reasons: string[], value: number) {
  const [data] = await insertSealed("actions", ctx.ws, [{
    metric_id: ctx.m.id, period_start: ctx.period, asker_id: submitterId === approver ? ctx.wf.owner_id : submitterId, assignee_id: approver,
    // Without reasons the value waits because every value is approved here, not because it is unusual.
    question: `Approve ${ctx.m.name} for ${periodLabel(ctx.period, ctx.m.period, ctx.yearStart)}: ${formatValue(ctx.m, value, ctx.numberStyle)}${reasons.length ? `, ${reasons.join(", ")}` : ""}. Reply “approve”, or “send back:” with what to check.`,
    kind: "task", purpose: "approval",
  }], "id, asker_id") as { id: number; asker_id: string }[];
  if (data) await deliver({ kind: "task", actionId: data.id, senderId: data.asker_id, recipientId: approver, source: { type: "workflow" } });
  return (data?.id as number | undefined) ?? null;
}

/** Asks the submitter to check their own value, as a task (GLOSSARY: Self-check): only when nobody else could
 * approve it. Its purpose is not "approval", so approve() never takes it and the four-eyes rule there stays whole.
 * Asked by the submitter too: the Workflow's owner may not see the Metric, and a task's asker reads its Thread. */
async function requestSelfCheck(ctx: Ctx, submitterId: string, reasons: string[], value: number, observationId: number) {
  // The question is sealed with the Workspace Key (sealed-columns.ts), as every task's is.
  const [data] = await insertSealed("actions", ctx.ws, [{
    metric_id: ctx.m.id, period_start: ctx.period, observation_id: observationId, asker_id: submitterId, assignee_id: submitterId,
    question: `Check your value: ${formatValue(ctx.m, value, ctx.numberStyle)} for ${periodLabel(ctx.period, ctx.m.period, ctx.yearStart)}${reasons.length ? `, ${reasons.join(", ")}` : ""}. Is that right? Nobody else can approve it. Reply “confirm”, or “Correction: <value>”.`,
    kind: "task", purpose: "self_check",
  }], "id, asker_id") as { id: number; asker_id: string }[];
  if (data) await deliver({ kind: "task", actionId: data.id, senderId: data.asker_id, recipientId: submitterId, source: { type: "workflow" } });
  return (data?.id as number | undefined) ?? null;
}

/** The period note of a value its submitter confirmed in a Self-check: never called an Approval. */
const CONFIRMED_NOTE = "Confirmed by the submitter: nobody else could approve it.";
/** The period note of a value counted at once because nobody but its submitter could approve it. */
const COUNTED_NOTE = "Counted without approval: nobody else could approve it.";

/** Publishes a period, locking it if the Workflow says so, with a note when given (why it counts). */
async function publish(ctx: Ctx, note?: string) {
  await setState(ctx.m.id, ctx.period, { state: publishedState(ctx), approval_step: null, approval_action_id: null, ...(note ? { note } : {}) });
  if (publishedState(ctx) === "locked") await sendLockSummary(ctx.ws, ctx.wf.id, ctx.period);
  return publishedLabel(ctx);
}

function publishedState(ctx: Ctx): "locked" | "published" {
  return ctx.wf.config.steps.some((s) => s.type === "publish" && s.lock) ? "locked" : "published";
}
function publishedLabel(ctx: Ctx) {
  return publishedState(ctx) === "locked" ? "published and locked" : "published";
}

/** Publishes a period only while it still waits on this task, in one statement: a value that came in after the task
 * was decided started a round of its own, which this decision must not overwrite. False when it did. */
async function publishDecided(ctx: Ctx, actionId: number, note?: string): Promise<boolean> {
  const { data } = await db().from("period_states")
    .update({ state: publishedState(ctx), approval_step: null, approval_action_id: null, ...(note ? { note } : {}), updated_at: new Date().toISOString() })
    .eq("metric_id", ctx.m.id).eq("period_start", ctx.period).eq("state", "approval").eq("approval_action_id", actionId).select("metric_id");
  if (data?.length && publishedState(ctx) === "locked") await sendLockSummary(ctx.ws, ctx.wf.id, ctx.period);
  return Boolean(data?.length);
}

/** An open Self-check task of the workspace that is the person's own and that the period still waits on, with the
 * Metric's context; refused otherwise. Only the value's own submitter holds one, and only for their value. */
async function openSelfCheck(ws: string, actionId: number, by: string) {
  const { data: a } = await db().from("actions").select("*").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (!a || a.purpose !== "self_check" || a.assignee_id !== by || a.status !== "open") throw new Error("This check is not yours, or it is done.");
  const state = await getState(a.metric_id, a.period_start);
  const ctx = await metricCtx(a.metric_id, a.period_start);
  if (!ctx || state?.state !== "approval" || state.approval_action_id !== actionId || state.approval_for !== by) throw new Error("This value is not waiting for this check.");
  return { a, ctx };
}

// Closed only while still open and still the submitter's own, in one statement: two presses at once decide once, the second is refused.
/** Closes an Approval or Self-check that is still open and still `by`'s, once (exported for its test); throws when it is not. */
export async function claimTask(ws: string, actionId: number, by: string, source: ChangeSource): Promise<void> {
  const { changed } = await changeActionState(ws, actionId, { to: "closed", from: ["open"], reason: "done", guard: { purpose: "approval_or_self_check", assigneeId: by } }, source);
  if (!changed) throw new Error("This check is not yours, or it is done.");
}

/** The submitter confirms their own value in a Self-check: it counts, recorded as confirmed by the submitter in the
 * Thread, the period's note and the Audit Log, never as an Approval. If someone else could approve it by now (an
 * Approver was added), the four-eyes rule applies again: they are asked instead and nothing is published. */
export async function confirmSelfCheck(ws: string, actionId: number, by: string, source: ChangeSource = FROM_APP): Promise<string> {
  const { a, ctx } = await openSelfCheck(ws, actionId, by);
  const step = ctx.wf.config.steps.find((s): s is Extract<WorkflowStep, { type: "approve" }> => s.type === "approve");
  if ((await approversFor(ctx, step, by)).length) {
    // onValue closes this task and asks the Approver: the value is checked as a new round.
    const log = await onValue(a.metric_id, a.period_start, by);
    return `Someone else can approve it now: ${log.join("; ")}.`;
  }
  await claimTask(ws, actionId, by, source);
  if (!(await publishDecided(ctx, actionId, CONFIRMED_NOTE))) throw new Error("A newer value came in: it is checked instead.");
  await insertSealed("thread_messages", ws, [{ action_id: actionId, author_id: by, body: "Confirmed by the submitter." }]);
  await recordAudit(ws, by, { kind: "self_check.confirmed", object: { type: "metric", id: a.metric_id, name: ctx.m.name }, details: { period: a.period_start } });
  return `Confirmed by you; ${publishedLabel(ctx)}.`;
}

/** The submitter corrects their own value in a Self-check, as a Correction: the new value replaces it (the first is
 * kept as the original) and goes through the Workflow again. Since they just typed it while checking, it then counts
 * as confirmed by them if still nobody else could approve it; otherwise the Approvers decide as for any value. */
export async function correctSelfCheck(ws: string, actionId: number, by: string, value: number, source: ChangeSource = FROM_APP): Promise<string> {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) >= 1e15) throw new Error("Give the corrected value as a number.");
  const { a } = await openSelfCheck(ws, actionId, by);
  // Only the value this check is about, of this Metric in this workspace.
  const { data: obs } = a.observation_id
    ? await db().from("observations").select("id, value, original_value").eq("id", a.observation_id).eq("workspace_id", ws).eq("metric_id", a.metric_id).maybeSingle()
    : { data: null };
  if (!obs) throw new Error("This value is not waiting for this check.");
  await claimTask(ws, actionId, by, source);
  await db().from("observations").update({ value, original_value: obs.original_value ?? obs.value }).eq("id", obs.id).eq("workspace_id", ws).eq("metric_id", a.metric_id);
  await insertSealed("thread_messages", ws, [{ action_id: actionId, author_id: by, body: "Corrected by the submitter.", correction_value: value, correction_status: "accepted" }]);
  const { data: m } = await db().from("metrics").select("name").eq("id", a.metric_id).eq("workspace_id", ws).maybeSingle();
  await recordAudit(ws, by, { kind: "self_check.corrected", object: { type: "metric", id: a.metric_id, name: m?.name ?? null }, details: { period: a.period_start, action_id: actionId } });
  await setState(a.metric_id, a.period_start, { state: "submitted", approval_step: null, approval_action_id: null });
  return (await onValue(a.metric_id, a.period_start, by, { selfChecked: obs.id as number })).join("; ");
}

/** The approver of an approval task approves; the next approver is asked, or the value is published. */
export async function approve(ws: string, actionId: number, by: string, source: ChangeSource = FROM_APP) {
  const { data: a } = await db().from("actions").select("*").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (!a || a.purpose !== "approval" || a.assignee_id !== by || a.status !== "open") throw new Error("This approval is not yours, or it is done.");
  const state = await getState(a.metric_id, a.period_start);
  const ctx = await metricCtx(a.metric_id, a.period_start);
  if (!ctx || state?.state !== "approval" || state.approval_action_id !== actionId) throw new Error("This value is not waiting for this approval.");
  // Whoever holds the task now (a successor's tasks are handed over when someone leaves) must not be the one the
  // value is from.
  const value = await latestValue(a.metric_id, a.period_start);
  const from = state.approval_for ?? value?.submitter_id ?? a.asker_id;
  if (by === from) throw new Error("Nobody approves their own value. Ask someone else to approve it.");
  // Closed only while still open, in one statement: two presses at once (a double tap on a button, a reply and a
  // press) approve once, and the second is refused like an approval that is done.
  if (!(await changeActionState(ws, actionId, { to: "closed", from: ["open"], reason: "done", guard: { purpose: "approval", assigneeId: by } }, source)).changed) throw new Error("This approval is not yours, or it is done.");
  await insertSealed("thread_messages", ws, [{ action_id: actionId, author_id: by, body: "Approved." }]);
  // Here, not in the Actor's wrapper: approvals also arrive as replies through a Connector (threads.ts).
  await recordAudit(ws, by, { kind: "approval.given", object: { type: "metric", id: a.metric_id, name: ctx.m.name }, details: { period: a.period_start, step: (state.approval_step ?? 0) + 1 } });
  // The same people, in the same order, as when the round started: skipping the one the round is about (also when
  // it began with an accepted Correction), not whoever submitted the latest value.
  const approvers = await approversFor(ctx, ctx.wf.config.steps.find((s): s is Extract<WorkflowStep, { type: "approve" }> => s.type === "approve"), from);
  const next = (state.approval_step ?? 0) + 1;
  if (next < approvers.length) {
    const nextAction = await requestApproval(ctx, approvers[next], from, (state.note ?? "").split("; ").filter(Boolean), Number(value?.value));
    await setState(a.metric_id, a.period_start, { state: "approval", approval_step: next, approval_action_id: nextAction, approval_for: from, note: state.note });
    return `Approved; ${approvers[next]} approves next.`;
  }
  if (!(await publishDecided(ctx, actionId))) return "Approved; a newer value came in, and it is checked instead.";
  // Approved: a value that waited is now one Alerts may look at, checked as if it had just arrived.
  await checkAlerts(a.metric_id);
  await checkTells(a.metric_id);
  return `Approved; ${publishedLabel(ctx)}.`;
}

/** Sends the value back to the submitter with what to check; the value stays, marked as not approved. */
export async function sendBack(ws: string, actionId: number, by: string, comment: string, source: ChangeSource = FROM_APP) {
  const { data: a } = await db().from("actions").select("*").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
  if (!a || a.purpose !== "approval" || a.assignee_id !== by || a.status !== "open") throw new Error("This approval is not yours, or it is done.");
  const current = await getState(a.metric_id, a.period_start);
  if (current?.state !== "approval" || current.approval_action_id !== actionId) throw new Error("This value is not waiting for this approval.");
  // Decided first, in one conditional update, so two presses at once send it back once.
  if (!(await changeActionState(ws, actionId, { to: "answered", from: ["open"], reason: "done", guard: { purpose: "approval", assigneeId: by } }, source)).changed) throw new Error("This approval is not yours, or it is done.");
  await insertSealed("thread_messages", ws, [{ action_id: actionId, author_id: by, body: `Sent back: ${comment || "please check this value."}` }]);
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
  // A Lock never stands in for an Approval: a value waiting for one, or sent back, is neither locked nor, by unlocking,
  // published.
  const current = await getState(metricId, period);
  if (lock && (current?.state === "approval" || current?.state === "submitted")) throw new Error("This value waits for Approval, or was sent back: it can be locked once it is approved.");
  if (!lock && current?.state !== "locked") throw new Error("Only a locked period can be unlocked.");
  await setState(metricId, period, { state: lock ? "locked" : "published", note: lock ? null : `Unlocked by ${by} on ${format(new Date(), "d MMM yyyy")}: ${reason}` });
  const { data: flow } = lock ? await db().from("metrics").select("workflow_id").eq("id", metricId).eq("workspace_id", ws).maybeSingle() : { data: null };
  if (flow?.workflow_id) await sendLockSummary(ws, flow.workflow_id as number, period);
}

/** Closes a period for every metric of a workflow that has a value: they lock, except values still waiting for
 * Approval or sent back. Returns how many locked. */
export async function closePeriod(ws: string, workflowId: number, asOf: string, by: string) {
  const { data: wf } = await db().from("workflows").select("owner_id").eq("id", workflowId).eq("workspace_id", ws).maybeSingle();
  if (!wf || wf.owner_id !== by) throw new Error("Only the workflow's owner closes a period.");
  const [{ data: sealedRows }, yearStart] = await Promise.all([db().from("metrics").select("*").eq("workflow_id", workflowId).eq("workspace_id", ws), yearStartOf(ws)]);
  const rows = await openRows("metrics", ws, sealedRows);
  let n = 0;
  const closed = new Set<string>();
  for (const row of rows ?? []) {
    const m = normalizeMetric(row) as Metric;
    const period = workingPeriod(asOf, m.period as Period, yearStart);
    if (!(await latestValue(m.id, period))) continue;
    // A value still waiting for Approval, or sent back, stays open: closing the period approves nothing.
    const st = await getState(m.id, period);
    if (st?.state === "approval" || st?.state === "submitted") continue;
    await setState(m.id, period, { state: "locked", approval_step: null, note: `Closed with the period by ${by}` });
    n++;
    closed.add(period);
  }
  for (const p of closed) await sendLockSummary(ws, workflowId, p);
  return n;
}
