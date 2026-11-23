// Checklist Tasks (GLOSSARY: Checklist Item, Task, Assignee, Due Date, Stand-in, Away, Escalation, Workflow; spec 0045,
// ticket #792): what an item to tick off gives its Assignee once for each period, and how the Workflow's Remind and
// Escalate steps treat it as they treat a missing value. A Checklist Task is an Action about the Workflow and its period
// instead of a Metric (`metric_id` is null, `purpose` is `checklist`): there is no value to see, so it is read by the
// people on it, and by the Workspace's Owners, Admins and Members unless its item names a Group to keep it to (access.ts,
// `threadReader`); a Guest reads only a Task given to them. It is given on the period's first run, to the item's Stand-in
// while the Assignee is Away, once (a unique row per item and period) and never to a Webhook (spec 0034 names a Metric).
// Security (AGENTS.md rule 3): the item's words are the Task's question, sealed as every Action's is; a message about it
// names the Workflow and the period, never a Metric.
import { db } from "./db";
import { insertSealed, openNames } from "./sealed-columns";
import { deliver, deliverNotice } from "./deliveries";
import { dueDate } from "./workflow-rules";
import { periodLabel, shiftPeriod, type YearStart } from "./periods";
import { yearStartFor } from "./fiscal-year";
import { tickItems, type TickItem } from "./checklist-rules";
import type { Period, Workflow, WorkflowConfig } from "./types";

/** What a Task's stored row says about it, for the steps and the pages. */
export type TaskRow = { id: number; assignee_id: string; asker_id: string; period_start: string; due_date: string | null; checklist_item_id: string | null };

/** The sentence a Task gets when it is given to a Stand-in. It names no one: a Guest may be the Stand-in. */
export const STAND_IN_NOTE = "Given to you as the stand-in, because the Assignee is away.";
/** The sentence a Task gets when it is handed to the Stand-in by an Escalation. */
export const HANDED_NOTE = "Handed to you as the stand-in: it was not done by its due date.";

/** Whether a person is Away on a day. */
async function isAway(person: string, day: string): Promise<boolean> {
  const { data } = await db().from("away").select("user_id").eq("user_id", person).lte("starts", day).gte("ends", day).limit(1);
  return Boolean(data?.length);
}

/** Whether a person is a member of the Workspace with a sign-in (never a Contact or a Feed). */
async function isMember(ws: string, person: string): Promise<boolean> {
  return Boolean((await db().from("memberships").select("user_id").eq("workspace_id", ws).eq("user_id", person).maybeSingle()).data);
}

/** A Checklist Task's own step claim: the run's id for the one call that may do the step for this Task, null for every other. */
async function claimTaskStep(ws: string, workflowId: number, taskId: number, step: number, period: string): Promise<boolean> {
  const { data, error } = await db().rpc("claim_workflow_step", { p_workspace: ws, p_workflow: workflowId, p_step: `t${taskId}s${step}`, p_period: period, p_kind: "task_step" });
  if (error) throw new Error("The step could not be claimed.");
  return data !== null && data !== undefined;
}

/** A Thread note by the Workflow's owner (the Task's asker), no more than a sentence, not delivered to anyone. */
async function noteOn(ws: string, actionId: number, authorId: string, body: string) {
  await insertSealed("thread_messages", ws, [{ action_id: actionId, author_id: authorId, body }]);
}

/** Gives the Task of each item to tick off, for the Workflow's period, once. Returns what happened, in words. The caller
 * has checked that the Workflow has a period (`when`) and that this is not the demo. */
export async function giveChecklistTasks(ws: string, wf: Workflow, period: string, span: Period, asOf: string, yearStart: YearStart): Promise<string[]> {
  const log: string[] = [];
  const label = periodLabel(period, span, yearStart);
  for (const item of tickItems(wf.config.steps)) {
    // An item that names nobody yet gives nothing, and does not use up the period.
    if (!item.assignee || !(await isMember(ws, item.assignee))) continue;
    const { data: given } = await db().from("actions").select("id").eq("workflow_id", wf.id).eq("checklist_item_id", item.id).eq("period_start", period).limit(1);
    if (given?.length) continue;
    // While the Assignee is Away their Stand-in gets it; without one the Assignee does, and the owner is told.
    const away = await isAway(item.assignee, asOf);
    const standIn = away && item.standIn && item.standIn !== item.assignee && (await isMember(ws, item.standIn)) ? item.standIn : null;
    const to = standIn ?? item.assignee;
    const due = dueDate(period, span, { dueWorkingDays: item.dueWorkingDays } as WorkflowConfig);
    let row: { id: number } | undefined;
    try {
      [row] = await insertSealed("actions", ws, [{
        metric_id: null, workflow_id: wf.id, checklist_item_id: item.id, period_start: period, asker_id: wf.owner_id, assignee_id: to,
        question: item.text, kind: "task", purpose: "checklist", due_date: due, read_group_id: item.readGroup ?? null,
      }]) as { id: number }[];
    } catch (e) {
      // Given at the same moment by another run: the unique row keeps it to one. Any other failure is not that.
      const { data: now } = await db().from("actions").select("id").eq("workflow_id", wf.id).eq("checklist_item_id", item.id).eq("period_start", period).limit(1);
      if (now?.length) continue;
      throw e;
    }
    if (!row) continue;
    if (standIn) await noteOn(ws, row.id, wf.owner_id, STAND_IN_NOTE);
    await deliver({ kind: "task", actionId: row.id, senderId: wf.owner_id, recipientId: to, queue: true, source: { type: "workflow" } });
    if (away && !standIn) {
      const [person] = await openNames(ws, (await db().from("profiles").select("*").eq("id", item.assignee)).data);
      await deliverNotice(ws, { recipientId: wf.owner_id, senderId: null, subject: `${wf.name}: a checklist task waits for someone who is away`, text: `${(person?.name as string | undefined) ?? "The Assignee"} is away and has no stand-in for a checklist item of ${wf.name}, ${label}. The task is theirs and waits.`, link: `/actions/${row.id}`, quiet: true });
    }
    log.push(`${wf.name}, ${label}: gave a checklist task to ${to}${standIn ? " (stand-in)" : ""}`);
  }
  return log;
}

/** The Workflow's Remind and Escalate steps for its open Checklist Tasks of the period, as for a missing value: a Remind step
 * reminds the Assignee that many days before the Task's Due Date, an Escalate step hands the Task to the item's Stand-in
 * ("ask the stand-in") or tells the Workflow's owner, once for each Task and step. */
export async function remindAndEscalateTasks(ws: string, wf: Workflow, period: string, asOf: string): Promise<string[]> {
  const log: string[] = [];
  const steps = wf.config.steps.flatMap((step, i) => (step.type === "remind" || step.type === "escalate" ? [{ step, i }] : []));
  if (!steps.length) return log;
  const { data: open } = await db().from("actions").select("id, assignee_id, asker_id, period_start, due_date, checklist_item_id").eq("workspace_id", ws).eq("workflow_id", wf.id).eq("purpose", "checklist").eq("status", "open").eq("period_start", period).order("id");
  const items = new Map(tickItems(wf.config.steps).map((x) => [x.id, x]));
  for (const t of (open ?? []) as TaskRow[]) {
    if (!t.due_date) continue;
    const due = String(t.due_date).slice(0, 10);
    const item: TickItem | undefined = t.checklist_item_id ? items.get(t.checklist_item_id) : undefined;
    for (const { step, i } of steps) {
      if (step.type === "remind" && asOf >= shiftPeriod(due, "day", -step.daysBefore)) {
        if (!(await claimTaskStep(ws, wf.id, t.id, i, t.period_start))) continue;
        await deliver({ kind: "reminder", actionId: t.id, senderId: wf.owner_id, recipientId: t.assignee_id, queue: true, source: { type: "workflow" } });
        log.push(`${wf.name}: reminded of a checklist task`);
      } else if (step.type === "escalate" && asOf > shiftPeriod(due, "day", step.daysAfter)) {
        if (!(await claimTaskStep(ws, wf.id, t.id, i, t.period_start))) continue;
        const standIn = step.to === "stand-in" && item?.standIn && item.standIn !== t.assignee_id && (await isMember(ws, item.standIn)) ? item.standIn : null;
        if (standIn) {
          // The first Assignee keeps reading it (previous_assignee_id); the Thread says so.
          // Only while it is still open: a Task ticked off a moment ago is not handed on, and nothing is said about it.
          const { data: moved } = await db().from("actions").update({ assignee_id: standIn, previous_assignee_id: t.assignee_id, updated_at: new Date().toISOString() }).eq("id", t.id).eq("workspace_id", ws).eq("status", "open").select("id");
          if (!moved?.length) continue;
          await noteOn(ws, t.id, wf.owner_id, HANDED_NOTE);
          await deliver({ kind: "task", actionId: t.id, senderId: wf.owner_id, recipientId: standIn, queue: true, source: { type: "workflow" } });
          log.push(`${wf.name}: handed a checklist task to the stand-in`);
        } else {
          // A Checklist Task has no Metric owner: the Workflow's owner hears of it.
          await deliverNotice(ws, { recipientId: wf.owner_id, senderId: null, subject: `${wf.name}: a checklist task is not done`, text: `A checklist task of ${wf.name} was due ${due} and is still open.`, link: `/actions/${t.id}`, quiet: true });
          log.push(`${wf.name}: told the owner of a checklist task`);
        }
      }
    }
  }
  return log;
}

/** Runs the Checklist Tasks of one Workflow as of a day (called by runChecklistItems once the Workflow has a period). */
export async function runChecklistTasks(ws: string, wf: Workflow, period: string, span: Period, asOf: string): Promise<string[]> {
  if (!tickItems(wf.config.steps).length) return [];
  const yearStart = await yearStartFor(ws, span);
  return [...(await giveChecklistTasks(ws, wf, period, span, asOf, yearStart)), ...(await remindAndEscalateTasks(ws, wf, period, asOf))];
}
