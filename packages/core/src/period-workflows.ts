// A Workflow that asks for a period (specs 0067 and #1343; GLOSSARY: Workflow, Asking Schedule): a Metric without one
// joins the owner's Workflow that asks on the days its period needs (daily; weekly on Monday; monthly on the 1st, which
// also serves quarters and years), at the Workspace's asking hour. One per period, made once and reused. It sends
// nothing: a new Asking Schedule never runs for a day that has begun, and the Workflow asks from its next run. Only the
// actor's own Metrics move, through the same saveWorkflow and setMetricWorkflow as in the app, with their checks and
// Audit Log lines. Returns ids and a count.
import type { Actor } from "./actor";
import { describeDays } from "./asking-schedule";
import { db } from "./db";
import type { AskingDays, Period, WorkflowConfig } from "./types";
import { openWorkflowRows } from "./workflow-rows";
import { saveWorkflow, setMetricWorkflow } from "./workflows";

const DAYS: Record<"day" | "week" | "month", { name: string; days: AskingDays }> = {
  day: { name: "Ask every day", days: { kind: "every_day" } },
  week: { name: "Ask every Monday", days: { kind: "chosen_weekdays", days: [1] } },
  month: { name: "Ask on the 1st of the month", days: { kind: "month_day", day: 1 } },
};

/** The name and asking days of the Workflow a period joins: each period is asked once, after it ends. */
export function askingFor(period: Period): { name: string; days: AskingDays } {
  return DAYS[period === "day" || period === "week" ? period : "month"];
}

// The actor's Workflow for these days: of that name, at the Workspace's asking hour, and with no step but Publish.
async function workflowFor(actor: Actor, period: Period): Promise<number> {
  const want = askingFor(period);
  const { data, error } = await db().from("workflows").select("id, name, config").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).order("id");
  if (error) throw new Error("The Workflows could not be read.");
  const found = (await openWorkflowRows(actor.workspaceId, data)).find((w) => {
    const config = w.config as WorkflowConfig;
    return w.name === want.name && config.asking?.hour === null && describeDays(config.asking.days) === describeDays(want.days) && config.steps.every((s) => s.type === "publish");
  });
  return (found?.id as number | undefined) ?? saveWorkflow(actor, null, want.name, { dueWorkingDays: 3, steps: [], asking: { hour: null, days: want.days } });
}

/** Puts each of these Metrics into the Workflow for its period. A Metric that has a Workflow already, is Derived or
 * Archived, or is not the actor's own is left as it is. Returns the Workflows joined and how many Metrics joined one. */
export async function joinPeriodWorkflows(actor: Actor, metricIds: number[]): Promise<{ workflowIds: number[]; joined: number }> {
  if (!metricIds.length) return { workflowIds: [], joined: 0 };
  const { data, error } = await db().from("metrics").select("id, period").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).in("id", metricIds).is("workflow_id", null).is("formula", null).is("archived_at", null).order("id");
  if (error) throw new Error("Your metrics could not be read.");
  const flows = new Map<string, number>();
  for (const m of data) {
    const { name } = askingFor(m.period as Period);
    const id = flows.get(name) ?? (await workflowFor(actor, m.period as Period));
    flows.set(name, id);
    await setMetricWorkflow(actor, m.id as number, id);
  }
  return { workflowIds: [...flows.values()], joined: data.length };
}
