// A Metric's Workflow for programs and assistants (GLOSSARY: Workflow, Due Date, Access Key; ticket #612). A key with
// metrics:edit gives a Metric of its creator's one of the creator's own Workflows, or none, through the same
// setMetricWorkflow as the Workflow dropdown in the app, so only the Metric's owner may and a Derived Metric has none.
// A Workflow with an Approve or Tell step decides who sees a value before it is published or who is told about it, so
// a key joins or leaves one only with the scope and the kind of key that may choose those people (the same rule as for
// changing such a Workflow). Reading says only the Workflow's name and the next Due Date.
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { db } from "./db";
import { yearStartFor } from "./fiscal-year";
import { periodStart, shiftPeriod } from "./periods";
import { openWorkflowRow, openWorkflowRows } from "./workflow-rows";
import { WorkflowRefused } from "./workflows";
import { dueDate, workingPeriod } from "./workflow-rules";
import { localTime, workspaceClock } from "./workspace-clock";
import { askingHour, nextAskingRun } from "./asking-schedule";
import type { AskingSchedule, Metric, WorkflowConfig } from "./types";

/** Thrown when a Workflow cannot be given to a Metric for its content (none by that name, two by that name, one the
 * key may not use); the API answers 422 with the message, as for any WorkflowRefused (which it also is: the Metric's
 * Workflow changed between the check and the write). */
export class WorkflowChoiceRefused extends WorkflowRefused {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowChoiceRefused";
  }
}

/** A Metric's Workflow as programs see it: its id and name, and whether the key's creator owns it. */
export type ApiMetricWorkflow = { id: number; name: string; yours: boolean };

/** The next day a value is due: the Due Date of the period Ziffr asks for next, and that period's first day. */
export type ApiNextDue = { date: string; period: string };

/** When the Workflow next asks for values: the day, the whole hour and the time zone both are in. */
export type ApiNextAsked = { day: string; hour: number; time_zone: string };

/** What a Workflow reference names: its id (a number) or its exact name (not case sensitive). */
export type WorkflowRef = number | string;

const hasPeopleStep = (c: WorkflowConfig) => (c?.steps ?? []).some((s) => s.type === "approve" || s.type === "tell");

/** The creator's own Workflow a program named, by id or exact name; nobody else's, as for the Workflow endpoints. */
async function ownWorkflow(creator: Actor, ref: WorkflowRef): Promise<{ id: number; name: string; config: WorkflowConfig }> {
  const rows = (await db().from("workflows").select("id, name, owner_id, config").eq("workspace_id", creator.workspaceId).eq("owner_id", creator.personId)).data ?? [];
  const mine = await openWorkflowRows(creator.workspaceId, rows);
  const found = typeof ref === "number"
    ? mine.filter((w) => w.id === ref)
    : mine.filter((w) => String(w.name).trim().toLowerCase() === String(ref).trim().toLowerCase());
  if (found.length > 1) throw new WorkflowChoiceRefused(`You own more than one Workflow called "${String(ref)}"; name it by its id (list_workflows).`);
  if (!found.length) throw new WorkflowChoiceRefused("You own no such Workflow. Name one of yours by its id or exact name (list_workflows), or null for none.");
  const w = found[0];
  return { id: w.id as number, name: String(w.name), config: w.config as WorkflowConfig };
}

/** Whether this key may choose who approves and who is told (see api-workflows); a person's own Actor always may. */
async function mayChoosePeople(actor: Actor | KeyActor): Promise<boolean> {
  if (!actor.key) return true;
  if (!actor.key.scopes.includes("workflows:people")) return false;
  const { data: key } = await db().from("access_keys").select("kind, revoked_at").eq("id", Number(actor.key.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  return Boolean(key && key.kind === "program" && !key.revoked_at);
}

/** Checks everything about giving the Metric this Workflow (or none) before anything is written; a refusal changes
 * nothing. Returns the Workflow's id (null for none) and the one the Metric has now, which the write insists on. */
export async function checkWorkflowChoice(actor: Actor | KeyActor, creator: Actor, metric: Pick<Metric, "id" | "owner_id" | "formula">, ref: WorkflowRef | null): Promise<{ id: number | null; from: number | null }> {
  assertScope(actor, "metrics:edit");
  if (metric.formula) throw new WorkflowChoiceRefused("A Derived Metric is computed; it has no Workflow.");
  if (metric.owner_id !== creator.personId) throw new Forbidden("Only the Metric's owner sets its Workflow.");
  const people = await mayChoosePeople(actor);
  let target: number | null = null;
  if (ref !== null) {
    const w = await ownWorkflow(creator, ref);
    if (!people && hasPeopleStep(w.config)) throw new WorkflowChoiceRefused("This key cannot put a Metric into a Workflow that has an Approve or Tell step: that decides who sees its values. Do it in Ziffr.");
    target = w.id;
  }
  // Leaving such a Workflow (for none or another) would drop its Approvals, so it is the same decision.
  const { data: row } = await db().from("metrics").select("workflow_id").eq("id", metric.id).eq("workspace_id", creator.workspaceId).maybeSingle();
  const current = (row?.workflow_id as number | null | undefined) ?? null;
  if (current !== null && current !== target && !people) {
    const w = await openWorkflowRow(creator.workspaceId, (await db().from("workflows").select("id, config").eq("id", current).eq("workspace_id", creator.workspaceId).maybeSingle()).data);
    if (w && hasPeopleStep(w.config as WorkflowConfig)) throw new WorkflowChoiceRefused("This key cannot take a Metric out of a Workflow that has an Approve or Tell step: that would drop its Approvals. Do it in Ziffr.");
  }
  return { id: target, from: current };
}

/** A Metric's Workflow and its next Due Date for the Metric page's answer to a program: both null without a Workflow,
 * for a Derived or an Archived Metric (nothing is asked for). The next Due Date is the one of the period a Workflow
 * asks for now (the last one that ended) while that is today or later, else the one of the period after. */
export async function workflowFacts(actor: Actor | KeyActor, metric: Pick<Metric, "id" | "period" | "formula" | "archived_at">, now = new Date()): Promise<{ workflow: ApiMetricWorkflow | null; next_due: ApiNextDue | null; next_asked: ApiNextAsked | null }> {
  const ws = actor.workspaceId;
  const { data: row } = await db().from("metrics").select("workflow_id").eq("id", metric.id).eq("workspace_id", ws).single();
  const id = (row?.workflow_id as number | null) ?? null;
  if (id === null) return { workflow: null, next_due: null, next_asked: null };
  const w = await openWorkflowRow(ws, (await db().from("workflows").select("id, name, owner_id, config").eq("id", id).eq("workspace_id", ws).maybeSingle()).data);
  if (!w) return { workflow: null, next_due: null, next_asked: null };
  const workflow = { id, name: String(w.name), yours: w.owner_id === actor.personId };
  if (metric.formula || metric.archived_at) return { workflow, next_due: null, next_asked: null };
  const yearStart = await yearStartFor(ws, metric.period);
  const { timeZone, runHour } = await workspaceClock({ personId: actor.personId, workspaceId: ws, role: "member" });
  const local = localTime(now, timeZone);
  const today = local.day;
  const cfg = w.config as WorkflowConfig;
  // Without an Asking Schedule of its own a Workflow asks with the Workspace's daily run.
  const asking: AskingSchedule = cfg.asking ?? { hour: null, days: { kind: "every_day" } };
  const askDay = nextAskingRun(asking, runHour, local);
  const next_asked = askDay ? { day: askDay, hour: askingHour(asking, runHour), time_zone: timeZone } : null;
  let period = workingPeriod(today, metric.period, yearStart);
  let date = dueDate(period, metric.period, cfg);
  if (date < today) {
    period = periodStart(shiftPeriod(period, metric.period, 1), metric.period, yearStart);
    date = dueDate(period, metric.period, cfg);
  }
  return { workflow, next_due: { date, period }, next_asked };
}
