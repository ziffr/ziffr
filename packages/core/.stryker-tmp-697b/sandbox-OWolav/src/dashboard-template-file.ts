// @ts-nocheck
// The Dashboard Template file format, ziffr.dashboard-template/1 (GLOSSARY: Dashboard Template, Slot): the format lives in @ziffr/pack (MIT), so a creator checks a file exactly as Ziffr does;
// this module adds how a checked file becomes what a Dashboard Template stores.
import type { DashboardTemplateFile, WidgetSettingsFile } from "@ziffr/pack/dashboard-template-file";
import type { ViewDesign } from "@ziffr/pack/view-design";
import type { DashboardTemplateBody, Slot, WidgetSettings } from "./types";

export * from "@ziffr/pack/dashboard-template-file";

/** A template file's widget settings as a widget keeps them: callouts and notes tied to their rule, Panels to their
 * Slot, and the View Design written out (from `designs` when the file names one by key). Null when it names a design
 * `designs` does not hold. */
export function templateWidgetSettings(s: WidgetSettingsFile | undefined, designs: ReadonlyMap<string, ViewDesign>): WidgetSettings | null {
  const { design, callouts, panels, ...rest } = s ?? {};
  const body = typeof design === "string" ? designs.get(design) : design;
  if (design !== undefined && !body) return null;
  return {
    ...rest,
    ...(callouts ? { callouts: callouts.map((c) => ({ period: "", rule: c.rule, text: c.text ?? "" })) } : {}),
    ...(panels ? {
      panels: panels.map(({ annotations, ...p }) => ({
        ...p, metricIds: [],
        ...(annotations ? { annotations: annotations.map((a) => ({ kind: a.kind, anchor: { type: "rule" as const, rule: a.rule }, ...(a.text !== undefined ? { text: a.text } : {}), ...(a.arrow !== undefined ? { arrow: a.arrow } : {}) })) } : {}),
      })),
    } : {}),
    ...(body ? { design: { id: null, body } } : {}),
  };
}

/** A checked Dashboard Template file as the Slots and body a Dashboard Template stores. Widgets whose View Design is
 * not among `designs` are left out. */
export function dashboardTemplateFromFile(t: DashboardTemplateFile, designs: ReadonlyMap<string, ViewDesign> = new Map()): { slots: Slot[]; body: DashboardTemplateBody } {
  return {
    slots: templateSlots(t.slots),
    body: {
      widgets: t.widgets.flatMap((w) => {
        const settings = templateWidgetSettings(w.settings, designs);
        return settings ? [{ view: w.view, metricSlots: w.slots, settings, title: w.title ?? null, x: w.x, y: w.y, w: w.w, h: w.h }] : [];
      }),
    },
  };
}

/** A template file's Slots as a template keeps them: a suggestion stays the key of its Pack's entry, never a Metric id,
 * so exporting the template again suggests the same entry. */
export const templateSlots = (slots: DashboardTemplateFile["slots"]): Slot[] => slots.map((s) => ({ label: s.label, multiple: s.multiple ?? false, ...(s.suggests ? { suggests: s.suggests } : {}) }));
