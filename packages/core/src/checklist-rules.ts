// Checklist Items, the pure rules (GLOSSARY: Checklist Item, Workflow, Guest; spec 0045): which items a config holds,
// a Workflow's period as its Metrics have it, and who may read an item's words. The engine is checklist.ts; the Period
// Timeline and the pages use these without it.
import { workingPeriod } from "./workflow-rules";
import type { YearStart } from "./periods";
import type { ChecklistItem, Metric, Period } from "./types";

/** An item for information. */
export type InfoItem = Extract<ChecklistItem, { kind: "info" }>;
/** The Checklist Items for information of a stored config, in order. */
export const infoItems = (steps: { type: string }[]): InfoItem[] => steps.filter((s): s is InfoItem => s.type === "checklist" && (s as ChecklistItem).kind === "info");

/** An item to tick off: a Task for its Assignee each period. */
export type TickItem = Extract<ChecklistItem, { kind: "tick" }>;
/** The Checklist Items to tick off of a stored config, in order. */
export const tickItems = (steps: { type: string }[]): TickItem[] => steps.filter((s): s is TickItem => s.type === "checklist" && (s as ChecklistItem).kind === "tick");

/** A Workflow's period as its Metrics have it: the last ended period of the one period they share, or why it has none
 * (no Metric is asked for, or the Metrics differ: a monthly and a quarterly one). Derived and Archived Metrics are not asked. */
export type WorkflowPeriod = { ok: true; period: string; span: Period } | { ok: false; why: "none" | "mixed" };

/** The Workflow's period as of a day (spec 0045: both new steps work once per Workflow and period). */
export function workflowPeriod(metrics: Pick<Metric, "period" | "formula" | "archived_at">[], asOf: string, yearStart: YearStart): WorkflowPeriod {
  const spans = [...new Set(metrics.filter((m) => !m.formula && !m.archived_at).map((m) => m.period))];
  if (!spans.length) return { ok: false, why: "none" };
  if (spans.length > 1) return { ok: false, why: "mixed" };
  return { ok: true, period: workingPeriod(asOf, spans[0], yearStart), span: spans[0] };
}

/** Whether a viewer may read an item's words: its Workflow's owner, anyone it is sent to or given to, and otherwise
 * everyone but a Guest; an item that names a `readGroup` is read by that Group's people only. */
export function mayReadItem(item: ChecklistItem, viewer: { id: string; role: string; groupIds: number[] }, ownerId: string): boolean {
  if (viewer.id === ownerId) return true;
  const mine = item.kind === "info"
    ? item.people.includes(viewer.id) || item.groups.some((g) => viewer.groupIds.includes(g))
    : item.assignee === viewer.id || item.standIn === viewer.id;
  if (mine) return true;
  if (viewer.role === "guest") return false;
  return item.readGroup === undefined || viewer.groupIds.includes(item.readGroup);
}
