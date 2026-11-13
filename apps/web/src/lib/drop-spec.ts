// What a Pool item becomes on a slide or artboard: one place for metrics, saved widgets, specs and team templates.
import { TEMPLATES } from "@/views/templates";
import { fromTemplate } from "./team-templates";
import type { DropSource } from "@/app/canvas-actions";
import type { CanvasData, TemplateId, Widget, WidgetSettings } from "./types";

export type DropSpec = { template: TemplateId; metricIds: number[]; settings: WidgetSettings; title: string; grid?: { w: number; h: number } };

export function dropSpec(s: DropSource, data: CanvasData, saved: Widget[], metricTemplate: TemplateId): DropSpec | null {
  if (s.type === "metric") return { template: metricTemplate, metricIds: [s.id], settings: TEMPLATES[metricTemplate].settings, title: "" };
  if (s.type === "widget") {
    const w = saved.find((x) => x.id === s.id);
    return w ? { template: w.template, metricIds: w.metric_ids, settings: w.settings, title: w.title ?? "", grid: { w: w.w, h: w.h } } : null;
  }
  if (s.type === "template") {
    const t = data.templates.find((x) => x.id === s.id);
    if (!t || t.kind !== "widget" || !s.fills) return null;
    const w = fromTemplate(t, s.fills);
    return { template: w.template, metricIds: w.metric_ids, settings: w.settings, title: w.title ?? "", grid: { w: t.w, h: t.h } };
  }
  return { template: s.template, metricIds: s.metricIds, settings: s.settings ?? TEMPLATES[s.template].settings, title: s.title ?? "" };
}
