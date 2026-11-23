// The words a Checklist Task is shown by (GLOSSARY: Checklist Item, Task, Workflow; spec 0045): where a Metric's name
// would be, the Workflow's name and its period. Kept apart from the steps so that messages and pages can use it.
import { db } from "./db";
import { periodLabel, type YearStart } from "./periods";
import { yearStartFor } from "./fiscal-year";
import type { Period } from "./types";

/** The Workflow and period words a Checklist Task is shown by, where a Metric's name would be: for each Workflow id and
 * period start, "<Workflow>" and "<March 2026>". The period is written as the Workflow's own Metrics have it, else as a day. */
export async function checklistAbout(ws: string, pairs: readonly { workflow_id?: number | null; period_start: string }[]): Promise<(workflowId: number | null | undefined, period: string) => { workflow: { id: number; name: string } | null; period: string }> {
  const ids = [...new Set(pairs.map((p) => p.workflow_id).filter((x): x is number => typeof x === "number"))];
  if (!ids.length) return () => ({ workflow: null, period: "" });
  const [{ data: flows }, { data: metrics }] = await Promise.all([
    db().from("workflows").select("id, name").eq("workspace_id", ws).in("id", ids),
    db().from("metrics").select("workflow_id, period, formula, archived_at").eq("workspace_id", ws).in("workflow_id", ids),
  ]);
  const names = new Map((flows ?? []).map((w) => [w.id as number, String(w.name)]));
  const spans = new Map<number, Set<Period>>();
  for (const m of metrics ?? []) if (!m.formula && !m.archived_at) (spans.get(m.workflow_id as number) ?? spans.set(m.workflow_id as number, new Set()).get(m.workflow_id as number)!).add(m.period as Period);
  const spanOf = new Map([...spans].filter(([, s]) => s.size === 1).map(([id, s]) => [id, [...s][0]]));
  const yearStarts = new Map<Period, YearStart>();
  for (const span of new Set(spanOf.values())) yearStarts.set(span, await yearStartFor(ws, span));
  return (workflowId, period) => {
    if (typeof workflowId !== "number" || !names.has(workflowId)) return { workflow: null, period: "" };
    const span = spanOf.get(workflowId);
    return { workflow: { id: workflowId, name: names.get(workflowId)! }, period: span ? periodLabel(period, span, yearStarts.get(span)!) : period };
  };
}

