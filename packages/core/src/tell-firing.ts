// Firing the Workflow step Tell (GLOSSARY: Tell, Alert, Workflow, Import; spec 0032, ticket #377): after a value counts,
// each Tell step of the Metric's Workflow is checked, and one that has become true tells each person it names, once
// per crossing. The conditions are the Alert rules (alert-rules.ts) and the state rule is the same (alertStep); what
// differs is who is told and why: people and Groups chosen by the Workflow's owner, each checked for sight of the Metric
// at that moment, and the Webhooks an Owner or Admin named, which get `alert.fired` (webhook-send.ts decides at sending
// whether the Metric is one Everyone sees).
// Security: a message holds only its own Metric's name, period, value, target and change and a link to its page; a
// person who cannot see the Metric, is not a member with a sign-in, or said "stop telling me" is skipped silently (and
// the Delivery is checked again when it is sent, as for an Alert). Only published or approved values are looked at, no
// option: a team message about a value its Approver may send back is how rumours start. Groups are expanded to people,
// never to a channel; a step tells at most TELL_PEOPLE_PER_STEP people. The state change is claimed in the database
// first, so two values at once tell once, and the daily message limits are the Alerts' own.
import { openWorkflowRow } from "./workflow-rows";
import { getGroups, visibleMetricIds } from "./access";
import { ALERT_MESSAGES_PER_PERSON_PER_DAY, ALERT_MESSAGES_PER_WORKSPACE_PER_DAY, TELL_PEOPLE_PER_STEP } from "./alert-limits";
import { alertHolds, alertStep, isPerPeriod, validCondition, type AlertCondition } from "./alert-rules";
import { alertContext, alertText, latestView, ALERT_LIMIT_NOTE, type Ctx } from "./alert-firing";
import { db } from "./db";
import { deliverAlert } from "./deliveries";
import { queueAlertFired } from "./webhook-events";
import { yearStartFor } from "./fiscal-year";
import { DEMO_WORKSPACE_ID } from "./team";
import type { Metric, WorkflowStep } from "./types";

/** One Tell step as stored. */
export type TellStep = Extract<WorkflowStep, { type: "tell" }>;

/** Whether a stored Tell condition is one the rules can read (a level or a share; never "not in by its Due Date"). */
export function tellCondition(s: TellStep): AlertCondition | null {
  const c = s.condition as unknown;
  return validCondition(c) && c.kind !== "missing_after_due" ? c : null;
}

/** The people a Tell step names, Groups expanded, each once, named people first, at most TELL_PEOPLE_PER_STEP. Only
 * members of the Workspace with a sign-in (not Contacts or Feeds), and not those who said "stop telling me" for this
 * Workflow. Sight of a Metric is not decided here but for each message. */
export async function tellRecipients(ws: string, workflowId: number, step: Pick<TellStep, "people" | "groups">): Promise<string[]> {
  const groups = step.groups.length ? (await getGroups(ws)).filter((g) => step.groups.includes(g.id)) : [];
  const wanted = [...new Set([...step.people, ...groups.flatMap((g) => g.members)])];
  if (!wanted.length) return [];
  const [{ data: members }, { data: stops }] = await Promise.all([
    db().from("memberships").select("user_id").eq("workspace_id", ws).in("user_id", wanted),
    db().from("tell_stops").select("person_id").eq("workflow_id", workflowId).eq("workspace_id", ws),
  ]);
  const ok = new Set((members ?? []).map((m) => String(m.user_id)));
  const stopped = new Set((stops ?? []).map((s) => String(s.person_id)));
  return wanted.filter((p) => ok.has(p) && !stopped.has(p)).slice(0, TELL_PEOPLE_PER_STEP);
}

/** Checks the Tell steps of a Metric's Workflow after a value counted: recorded, approved or corrected. Called from the
 * core's one submit and approval path next to the Alerts (workflow-engine.ts). `imported` is an Import: nothing is
 * told, the steps are only brought up to date. Never throws: a failing check must not fail the value that caused it. */
export async function checkTells(metricId: number, opts: { imported?: boolean } = {}): Promise<void> {
  try {
    const { data: row } = await db().from("metrics").select("workspace_id, workflow_id, archived_at, formula").eq("id", metricId).maybeSingle();
    // Nothing is sent from the demo, for a Derived or Archived Metric, or one without a Workflow.
    if (!row?.workflow_id || row.archived_at || row.formula || row.workspace_id === DEMO_WORKSPACE_ID) return;
    const ws = String(row.workspace_id);
    const wf = await openWorkflowRow(ws, (await db().from("workflows").select("id, config").eq("id", row.workflow_id).eq("workspace_id", ws).maybeSingle()).data);
    const steps = ((wf?.config as { steps?: WorkflowStep[] } | null)?.steps ?? []).filter((s): s is TellStep => s.type === "tell");
    if (!wf || !steps.length) return;
    const ctx = await alertContext(ws);
    const m = ctx.metrics.find((x) => x.id === metricId);
    if (!m) return;
    const view = await latestView(ctx, m);
    // A value waiting for Approval is not looked at until it is approved; then it is checked as if it had just arrived.
    if (!view || view.pending) return;
    const { data: states } = await db().from("tell_states").select("step_id, state, fired_period").eq("workflow_id", wf.id).eq("metric_id", metricId);
    for (const step of steps) {
      const was = (states ?? []).find((s) => s.step_id === step.id);
      await handle(ctx, m, Number(wf.id), step, view, was ? { state: was.state as "armed" | "fired", firedPeriod: (was.fired_period as string | null) ?? null } : null, !!opts.imported);
    }
  } catch (e) {
    console.error("Tell steps could not be checked:", e instanceof Error ? e.message : e);
  }
}

/** One Tell step against the Metric's latest period: the rules, the claim, then the messages. */
async function handle(ctx: Ctx, m: Metric, workflowId: number, step: TellStep, view: NonNullable<Awaited<ReturnType<typeof latestView>>>, row: { state: "armed" | "fired"; firedPeriod: string | null } | null, imported: boolean): Promise<void> {
  const c = tellCondition(step);
  if (!c || typeof step.id !== "string") return;
  const holds = alertHolds(c, { metric: m, workspaceMethod: ctx.method, value: view.value, previous: view.previous, target: view.target });
  const was = row ?? { state: "armed" as const, firedPeriod: null };
  const next = alertStep(c.kind, was, holds, view.period, imported);
  if (next.fire) {
    // Claimed before anyone is told: only the call that changed the row sends.
    const { data: claimed } = await db().rpc("claim_tell_fire", { p_workflow: workflowId, p_step: step.id, p_metric: m.id, p_ws: ctx.ws, p_period: view.period, p_per_period: isPerPeriod(c.kind) });
    if (claimed === true) await tell(ctx, m, workflowId, step, c, view);
    return;
  }
  const to = next.next;
  if (to.state === was.state && to.firedPeriod === was.firedPeriod) return;
  if (row) await db().from("tell_states").update({ state: to.state, fired_period: to.firedPeriod }).eq("workflow_id", workflowId).eq("step_id", step.id).eq("metric_id", m.id).eq("state", was.state);
  else await db().from("tell_states").upsert({ workflow_id: workflowId, step_id: step.id, metric_id: m.id, workspace_id: ctx.ws, state: to.state, fired_period: to.firedPeriod }, { onConflict: "workflow_id,step_id,metric_id", ignoreDuplicates: true });
}

/** Tells each person of a fired step who may see the Metric and has room in their day. */
async function tell(ctx: Ctx, m: Metric, workflowId: number, step: TellStep, c: AlertCondition, view: Parameters<typeof alertText>[2]): Promise<void> {
  // The Webhooks the step names get `alert.fired` (spec 0034): only ids go into the row, and the message is built, and
  // who may hear it judged (a Metric Everyone sees), when it is sent.
  if (step.webhooks?.length) await queueAlertFired(ctx.ws, step.webhooks, { workflowId, stepId: step.id, metricId: m.id, period: view.period });
  const yearStart = await yearStartFor(ctx.ws, m.period);
  const text = `${alertText(m, c, view, ctx, yearStart)} You are told by a Workflow; stop these in Your settings.`;
  for (const person of await tellRecipients(ctx.ws, workflowId, step)) {
    // The moment of sending (AGENTS.md rule 3): sight is asked here, for this person, and a person without it is skipped
    // with no word; the Delivery is checked once more when it leaves (delivery-send.ts).
    if (!(await visibleMetricIds(ctx.ws, person, ctx.metrics)).has(m.id)) continue;
    const { data: claim } = await db().rpc("claim_alert_message", { p_ws: ctx.ws, p_person: person, p_day: new Date().toISOString().slice(0, 10), p_per_person: ALERT_MESSAGES_PER_PERSON_PER_DAY, p_per_workspace: ALERT_MESSAGES_PER_WORKSPACE_PER_DAY });
    if (claim !== "send" && claim !== "note") continue;
    const note = claim === "note";
    await deliverAlert(ctx.ws, { recipientId: person, subject: note ? "More Alerts fired today" : `Update: ${m.name}`, text: note ? ALERT_LIMIT_NOTE : text, link: note ? "/settings/alerts" : `/metrics/${encodeURIComponent(m.slug)}`, metricId: note ? null : m.id, alertId: null, tellWorkflowId: note ? undefined : workflowId });
  }
}
