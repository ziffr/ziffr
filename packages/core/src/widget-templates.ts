// Built-in Widget Templates (GLOSSARY: View, Widget Template). The Views for Metrics and Analyses are View Designs
// (built-in-designs.ts): their name, Slots, size and settings come from their files. Findings and the free layout are
// drawn by code of their own. Plain data, shared by the app and the core.
import { BUILT_IN_DESIGNS, designSettings, designSlots, type DesignedView } from "./built-in-designs";
import type { Slot, TemplateId, Widget, WidgetSettings } from "./types";
import type { ViewDesign } from "./view-design";

/** A built-in Widget Template: what it draws and its default size and settings. */
export type TemplateDef = {
  id: TemplateId;
  label: string;
  blurb: string;
  kind: "metric" | "analysis" | "story" | "layout" | "slide";
  /** Templates that draw a Breakdown (a Finding of one period's, or a View of every period's): offered only for a Metric that has one. */
  needsBreakdown?: boolean;
  /** Templates that add a Metric up over the year: only a Metric whose Aggregation is sum can be drawn by them. */
  needsSum?: boolean;
  /** The metrics it asks for when it is added (GLOSSARY: Slot); none for a free layout, which starts empty. */
  slots: Slot[];
  size: { w: number; h: number };
  settings: WidgetSettings;
};

const one: Slot[] = [{ label: "Metric", multiple: false }];
const withBreakdown: Slot[] = [{ label: "Metric with a breakdown", multiple: false }];

// A built-in View Design as a Widget Template.
const designed = (id: DesignedView, needsBreakdown = false): TemplateDef => {
  const d = BUILT_IN_DESIGNS[id];
  return { id, label: d.name, blurb: d.description ?? "", kind: d.kind, ...(needsBreakdown ? { needsBreakdown } : {}), slots: designSlots(d), size: d.size, settings: designSettings(d) };
};

/** Every built-in Widget Template by id. */
export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  number: designed("number"),
  line: designed("line"),
  bars: designed("bars"),
  gauge: designed("gauge"),
  table: designed("table"),
  forecast: designed("forecast"),
  correlation: designed("correlation"),
  matrix: designed("matrix"),
  drivers: designed("drivers"),
  scoreboard: designed("scoreboard"),
  progress: designed("progress"),
  stacked: designed("stacked", true),
  pareto: { ...designed("pareto"), needsBreakdown: true },
  slope: designed("slope"),
  "running-total": { ...designed("running-total"), needsSum: true },
  bump: designed("bump", true),
  heatmap: designed("heatmap"),
  ranked: { id: "ranked", label: "Finding: ranked bars", blurb: "A breakdown, largest first, one row highlighted.", kind: "story", needsBreakdown: true, slots: withBreakdown, size: { w: 6, h: 9 }, settings: {} },
  share: { id: "share", label: "Finding: part of the whole", blurb: "How a breakdown divides the total.", kind: "story", needsBreakdown: true, slots: withBreakdown, size: { w: 6, h: 7 }, settings: {} },
  pictogram: { id: "pictogram", label: "Finding: 7 in 10", blurb: "The largest share as ten figures.", kind: "story", needsBreakdown: true, slots: withBreakdown, size: { w: 4, h: 8 }, settings: {} },
  story: { id: "story", label: "Finding: composed", blurb: "A frame around one or more panels: period bars, bridges, small multiples.", kind: "story", slots: one, size: { w: 8, h: 10 }, settings: { panels: [] } },
  // A View Design of the Workspace: its name, Slots and settings come from the design the widget carries (designTemplate).
  design: { id: "design", label: "View Design", blurb: "A View your Workspace added as a View Design.", kind: "metric", slots: one, size: { w: 6, h: 6 }, settings: {} },
  canvas: { id: "canvas", label: "Free layout", blurb: "Place widgets, text, arrows and shapes freely, like on a slide.", kind: "layout", slots: [], size: { w: 8, h: 10 }, settings: {} },
  // A Slide Element (spec 0057): what it draws is in its settings. For slides only, and never offered as a Widget.
  slide: { id: "slide", label: "Slide Element", blurb: "A part of a slide drawn in the deck's Theme.", kind: "slide", slots: [], size: { w: 6, h: 6 }, settings: {} },
  "story-line": { id: "story-line", label: "Finding: annotated line", blurb: "The trend with callouts at moments that matter.", kind: "story", slots: one, size: { w: 8, h: 9 }, settings: { window: 12, callouts: [] } },
};

/** The template a Metric dropped on a dashboard gets. */
export const DEFAULT_TEMPLATE: TemplateId = "number";
/** Templates that show one Metric. */
export const METRIC_TEMPLATES = Object.values(TEMPLATES).filter((t) => t.kind === "metric" && t.id !== "design");
/** Story templates. */
export const STORY_TEMPLATES = Object.values(TEMPLATES).filter((t) => t.kind === "story");
/** Templates one metric can be shown in: templates that need a breakdown (Stacked bars, Pareto, some Findings) only when it has one. */
/** Templates one metric can be shown in: story templates that need a breakdown only when it has one. */
export const templatesFor = (hasBreakdown: boolean) => [...METRIC_TEMPLATES, ...STORY_TEMPLATES, TEMPLATES.canvas].filter((t) => !t.needsBreakdown || hasBreakdown);

/** The built-in templates offered to choose from: every one but the stand-in for a Workspace's View Design, which is
 * offered by its own name (GLOSSARY: View Design). */
export const OFFERED_TEMPLATES = Object.values(TEMPLATES).filter((t) => t.id !== "design" && t.kind !== "slide");

/** Whether a view can stand on a dashboard: one that exists and is not a slide's own (a Slide Element). */
export const isDashboardView = (template: string): template is TemplateId => template in TEMPLATES && TEMPLATES[template as TemplateId].kind !== "slide";

/** A Workspace's View Design as a template to offer and fill: by its own name, Slots, size and settings. */
export function designTemplate(design: ViewDesign): TemplateDef {
  return { id: "design", label: design.name, blurb: design.description ?? "", kind: design.kind, slots: designSlots(design), size: design.size, settings: designSettings(design) };
}

/** A widget's template as it is drawn and filled: for a Workspace's View Design, that design's. */
export function templateOf(widget: { template: TemplateId; settings: WidgetSettings }): TemplateDef {
  return widget.template === "design" && widget.settings.design ? designTemplate(widget.settings.design.body) : TEMPLATES[widget.template];
}

/** Whether a view can take a Tag instead of a list: only one whose Metrics are a single "one or more" Slot (a matrix of
 * Metrics, or a View Design asking for exactly that), since a Tag fills the whole list and nothing else. */
export function takesTagSource(widget: Pick<Widget, "template" | "settings">): boolean {
  if (!(widget.template in TEMPLATES)) return false;
  const slots = templateOf(widget).slots;
  return slots.length === 1 && slots[0].multiple;
}

/** A widget's settings without a Tag source and without what drawing added to it: for a copy that records the Metrics of the moment. */
export function withoutTagSource(settings: WidgetSettings): WidgetSettings {
  const { tagSource: _s, tagView: _v, ...rest } = settings;
  void _s; void _v;
  return rest;
}
