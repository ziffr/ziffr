// What "Set up from this Pack" starts with (GLOSSARY: Pack, Metric Catalog, Workflow Template, Approver): the whole
// Pack chosen, so one press does the whole job. Who becomes an Approver is the one thing that decides who may do what,
// so the person setting up is filled in only when nobody else in the Workspace could be asked; otherwise it stays empty.
import type { PackSetupOptions } from "@ziffr/core/pack-setup";

export type SetupStart = { picked: Set<string>; dashboard: string; workflow: string; approvers: string[]; /** The dashboard and the Workflow made for each line of a Repeat, by Repeat. */ lineDashboards: Record<string, string>; lineWorkflows: Record<string, string> };

/** One line of a Repeat as the form holds it. */
export type LineRow = { id: number; name: string; fills: Record<string, string[]> };

/** The lines with those of a pasted list added, one for each line of text that holds a name, up to `max`. */
export function addedLines(rows: LineRow[], pasted: string, max: number): LineRow[] {
  let id = Math.max(0, ...rows.map((r) => r.id));
  const names = pasted.split(/\r?\n/).map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean);
  return [...rows, ...names.map((name) => ({ id: ++id, name, fills: {} }))].slice(0, Math.max(max, rows.length));
}

/** The Slots of a Dashboard Template that nothing made here fills, so a Metric is picked for each. A Slot that takes
 * several is filled from outside a Repeat with every line's Metric. */
export function openSlots(options: PackSetupOptions, template: PackSetupOptions["dashboards"][number], making: ReadonlySet<string>) {
  const repeatOf = new Map(options.entries.map((e) => [e.key, e.repeat ?? null]));
  return template.slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => {
    if (!slot.suggests || !making.has(slot.suggests)) return true;
    const of = repeatOf.get(slot.suggests) ?? null;
    return !(of === null || of === (template.repeat ?? null) || slot.multiple);
  });
}

/** Blank Approvers for a Workflow, the viewer in the one when they are the only member. */
export function approversStart(options: PackSetupOptions, viewer: string, count: number): string[] {
  // Each person may be Approver once, so a sole member can fill only a Workflow that asks for one.
  const alone = count === 1 && options.people.length === 1 && options.people[0]!.id === viewer;
  return Array.from({ length: count }, () => (alone ? viewer : ""));
}

/** Every Metric, the dashboard and the Workflow when the Pack has exactly one of each, and the viewer as Approver when they are the only member. */
export function setupStart(options: PackSetupOptions, viewer: string): SetupStart {
  // The one template of a scope: of the whole set, or of one Repeat.
  const only = <T extends { key: string; repeat?: string | null }>(list: T[], repeat: string | null) => {
    const of = list.filter((x) => (x.repeat ?? null) === repeat);
    return of.length === 1 ? of[0]! : null;
  };
  const perLine = (list: { key: string; repeat?: string | null }[]) => Object.fromEntries((options.repeats ?? []).map((r) => [r.key, only(list, r.key)?.key ?? ""]));
  const flow = only(options.workflows, null);
  return {
    picked: new Set(options.entries.map((e) => e.key)),
    dashboard: only(options.dashboards, null)?.key ?? "",
    workflow: flow?.key ?? "",
    approvers: flow ? approversStart(options, viewer, flow.approvers) : [],
    lineDashboards: perLine(options.dashboards),
    lineWorkflows: perLine(options.workflows),
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
    // A Pack with Repeats is set up on the Packs page, not here.
    lineDashboards: {},
    lineWorkflows: {},
  };
}
