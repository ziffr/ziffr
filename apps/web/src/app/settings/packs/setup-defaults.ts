// What "Set up from this Pack" starts with (GLOSSARY: Pack, Metric Catalog, Workflow Template, Approver): the whole
// Pack chosen, so one press does the whole job. Who becomes an Approver is the one thing that decides who may do what,
// so the person setting up is filled in only when nobody else in the Workspace could be asked; otherwise it stays empty.
import type { PackSetupOptions } from "@ziffr/core/pack-setup";

export type SetupStart = { picked: Set<string>; dashboard: string; workflow: string; approvers: string[] };

/** Blank Approvers for a Workflow, the viewer in the one when they are the only member. */
export function approversStart(options: PackSetupOptions, viewer: string, count: number): string[] {
  // Each person may be Approver once, so a sole member can fill only a Workflow that asks for one.
  const alone = count === 1 && options.people.length === 1 && options.people[0]!.id === viewer;
  return Array.from({ length: count }, () => (alone ? viewer : ""));
}

/** Every Metric, the dashboard and the Workflow when the Pack has exactly one of each, and the viewer as Approver when they are the only member. */
export function setupStart(options: PackSetupOptions, viewer: string): SetupStart {
  const flow = options.workflows.length === 1 ? options.workflows[0]! : null;
  return {
    picked: new Set(options.entries.map((e) => e.key)),
    dashboard: options.dashboards.length === 1 ? options.dashboards[0]!.key : "",
    workflow: flow?.key ?? "",
    approvers: flow ? approversStart(options, viewer, flow.approvers) : [],
  };
}

/** How many Metrics the Setup Guide ticks to begin with: a few, so the first Metric exists quickly and the rest is a choice. */
const GUIDE_METRICS = 3;

/** The entries a Dashboard Template's Slots suggest, in order, or null when one Slot suggests none (it could not be filled
 * from the entries made here). Used to say what ticking the dashboard adds. */
export function dashboardNeeds(options: PackSetupOptions, key: string): string[] | null {
  const d = options.dashboards.find((x) => x.key === key);
  if (!d) return null;
  const keys = d.slots.map((s) => s.suggests);
  return keys.every((k): k is string => typeof k === "string") ? [...new Set(keys)] : null;
}

/** What the Setup Guide's "Set up from this Pack" starts with (spec 0052): the Pack's first three Metrics that take values
 * ticked (a Derived Metric is ticked by the person, and brings its inputs), the person asked for them, the first dashboard
 * only when those three fill all its Slots, and the first Workflow with the person as its Approver when it asks for one. A
 * Workflow that asks for several Approvers is left unticked: one person cannot approve twice. */
export function guideStart(options: PackSetupOptions, viewer: string): SetupStart {
  const picked = new Set(options.entries.filter((e) => !e.derived).slice(0, GUIDE_METRICS).map((e) => e.key));
  const first = options.dashboards[0];
  const needs = first ? dashboardNeeds(options, first.key) : null;
  const flow = options.workflows[0] && options.workflows[0].approvers <= 1 ? options.workflows[0] : null;
  return {
    picked,
    dashboard: first && needs && needs.every((k) => picked.has(k)) ? first.key : "",
    workflow: flow?.key ?? "",
    approvers: flow ? Array.from({ length: flow.approvers }, () => viewer) : [],
  };
}
