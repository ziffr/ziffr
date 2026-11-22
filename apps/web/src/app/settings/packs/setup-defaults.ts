// What "Set up from this Pack" starts with (GLOSSARY: Pack, Metric Catalog, Workflow Template, Approver): the whole
// Pack chosen, so one press does the whole job. Who becomes an Approver is the one thing that decides who may do what,
// so the person setting up is filled in only when nobody else in the Workspace could be asked; otherwise it stays empty.
import type { PackSetupOptions } from "@ziffr/core/pack-setup";

export type SetupStart = { picked: Set<string>; dashboard: string; workflow: string; approvers: string[] };

/** Every Metric, the dashboard and the Workflow when the Pack has exactly one of each, and the viewer as Approver when they are the only member. */
export function setupStart(options: PackSetupOptions, viewer: string): SetupStart {
  const flow = options.workflows.length === 1 ? options.workflows[0]! : null;
  const alone = options.people.length === 1 && options.people[0]!.id === viewer;
  return {
    picked: new Set(options.entries.map((e) => e.key)),
    dashboard: options.dashboards.length === 1 ? options.dashboards[0]!.key : "",
    workflow: flow?.key ?? "",
    approvers: flow ? Array.from({ length: flow.approvers }, () => (alone ? viewer : "")) : [],
  };
}
