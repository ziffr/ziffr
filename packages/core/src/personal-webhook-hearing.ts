// What a Personal Webhook may hear (GLOSSARY: Personal Webhook; spec 0037, "What a Personal Webhook hears"; ticket #642).
// A Personal Webhook acts as its person: at the moment of sending, with the same rules that decide what the person sees in
// the app (the Metrics they see, and who may read a Thread), an event is either theirs to hear, in full, or not sent at
// all, with nothing in the log to hint at it. There is no redacted form. SECURITY (AGENTS.md rule 3): this is the one
// place that decides it; it takes the person, never a role the caller claims (the role is read from the database), judges
// the Workspace's switch and the person's place again, and answers with the facts the message may be built from.
// Also here: the Metrics a person picks, stored only after they were seen to be the person's to see.
import { Forbidden, type Actor } from "./actor";
import { getGroups, threadReader, visibleMetricIds } from "./access";
import { db } from "./db";
import { personalWebhookMayRun } from "./personal-webhook-state";
import { openRows } from "./sealed-columns";
import type { Metric } from "./types";
import { getMetrics } from "./workspace-data";
import { openWorkflowRow } from "./workflow-rows";

/** How many Metrics a Personal Webhook may pick for the value events. */
export const PERSONAL_WEBHOOK_PICKED_METRICS_MAX = 50;

/** What happened, as ids: an Action event, or a value event of one Metric and period. */
export type PersonalEvent =
  | { type: "action.created" | "action.updated" | "action.answered" | "action.done"; actionId: number }
  | { type: "value.recorded" | "value.unusual"; metricId: number; period: string };

/** What the person may hear of an event: the Action (opened) given to them or asked by them, or the Metric of a value
 * event (whether they may see a waiting value is asked after the value is read: mayPeekWaitingValue). */
export type Hearing =
  | { kind: "action"; action: Record<string, unknown>; metric: Metric }
  | { kind: "value"; metric: Metric; period: string };

const ACTION_EVENTS = ["action.created", "action.updated", "action.answered", "action.done"];

/** Whether the person may see a value of this Metric that waits for Approval (or was sent back): the Metric's Owner, its
 * Approvers, and the one who submitted it. Anyone else who sees the Metric hears of the value without the number. */
export async function mayPeekWaitingValue(ws: string, person: string, metric: Metric, period: string): Promise<boolean> {
  if (metric.owner_id === person) return true;
  const { data: state } = await db().from("period_states").select("approval_for, approval_action_id").eq("workspace_id", ws).eq("metric_id", metric.id).eq("period_start", period).maybeSingle();
  if (state?.approval_for === person) return true;
  if (state?.approval_action_id) {
    const { data: task } = await db().from("actions").select("assignee_id").eq("id", state.approval_action_id as number).eq("workspace_id", ws).maybeSingle();
    if (task?.assignee_id === person) return true;
  }
  const workflowId = (metric as Metric & { workflow_id?: number | null }).workflow_id;
  if (!workflowId) return false;
  const wf = await openWorkflowRow(ws, (await db().from("workflows").select("id, config").eq("id", workflowId).eq("workspace_id", ws).maybeSingle()).data);
  const steps = ((wf?.config as { steps?: { type: string; approvers?: string[] }[] } | null)?.steps ?? []);
  return steps.some((s) => s.type === "approve" && Array.isArray(s.approvers) && s.approvers.includes(person));
}

/** Whether the person's Personal Webhook may hear this event now, and what of it: null when not, and then nothing is sent
 * and nothing is logged about it. Checked at every send, so a Metric made private, a Share taken away or a person who is
 * no longer an Owner, Admin or Member hears nothing from that moment. An Action event only for an Action given to the
 * person or asked by them, and only if they may read its Thread (the app's rule: the people on it, the Metric's Owner,
 * and anyone who sees the Metric unless the Thread is kept to a Group); a value event only for a Metric they see that is
 * not archived or Derived. Picking the Metric is the caller's check (it is the Webhook's, not the person's sight). */
export async function personalWebhookMayHear(person: Actor, event: PersonalEvent): Promise<Hearing | null> {
  const ws = person.workspaceId;
  if (person.key || !(await personalWebhookMayRun(ws, person.personId))) return null;
  const metrics = await getMetrics(ws);
  if (ACTION_EVENTS.includes(event.type)) {
    const actionId = (event as { actionId: number }).actionId;
    if (!Number.isInteger(actionId)) return null;
    const { data } = await db().from("actions").select("*").eq("id", actionId).eq("workspace_id", ws).maybeSingle();
    if (!data) return null;
    const [action] = await openRows("actions", ws, [data as Record<string, unknown>]);
    // Given to the person or asked by them: not every Action they could see.
    if (action.assignee_id !== person.personId && action.asker_id !== person.personId) return null;
    const metric = metrics.find((m) => m.id === action.metric_id);
    if (!metric) return null;
    const visible = await visibleMetricIds(ws, person.personId, metrics);
    const can = threadReader(person.personId, await getGroups(ws), (id) => metrics.find((m) => m.id === id)?.owner_id, ws, visible);
    if (!can(action as never)) return null;
    return { kind: "action", action, metric };
  }
  const { metricId, period } = event as { metricId: number; period: string };
  if (!Number.isInteger(metricId) || typeof period !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(period)) return null;
  const metric = metrics.find((m) => m.id === metricId);
  if (!metric || metric.archived_at || metric.formula) return null;
  if (!(await visibleMetricIds(ws, person.personId, metrics)).has(metric.id)) return null;
  return { kind: "value", metric, period };
}

/** The Metrics a person picks for the value events, as stored: whole numbers, no more than the limit, no repeats. Each
 * one new to the list must be a Metric of this Workspace that the person sees now; a Metric that is not, or is not
 * theirs to see, is refused in the same words, so the answer tells nothing about it. Ones already on the list stay (a
 * Metric the person no longer sees is skipped at every send, and the page marks it). */
export async function checkedPickedMetrics(person: Actor, raw: unknown, current: readonly number[] = []): Promise<number[]> {
  if (!Array.isArray(raw)) throw new Error("Pick Metrics from the list.");
  if (raw.length > PERSONAL_WEBHOOK_PICKED_METRICS_MAX * 2) throw new Error(`A Webhook hears up to ${PERSONAL_WEBHOOK_PICKED_METRICS_MAX} Metrics.`);
  const ids: number[] = [];
  for (const id of raw) {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) throw new Error("Pick Metrics from the list.");
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length > PERSONAL_WEBHOOK_PICKED_METRICS_MAX) throw new Error(`A Webhook hears up to ${PERSONAL_WEBHOOK_PICKED_METRICS_MAX} Metrics.`);
  const fresh = ids.filter((id) => !current.includes(id));
  if (fresh.length) {
    const metrics = await getMetrics(person.workspaceId);
    const seen = await visibleMetricIds(person.workspaceId, person.personId, metrics);
    for (const id of fresh) if (!seen.has(id) || !metrics.some((m) => m.id === id && !m.archived_at && !m.formula)) throw new Forbidden("That Metric was not found.");
  }
  return ids;
}
