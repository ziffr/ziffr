// The Dashboard Template file format, ziffr.dashboard-template/1 (GLOSSARY: Dashboard Template, Slot, Placeholder,
// Pack): a dashboard's widgets with their views, settings, words and places, the Metrics left open as Slots. The schema
// below is the only definition, checked wherever such a file is read; docs/reference is generated from it.
// Security: only settings a template keeps are fields here (no Free Layout documents, no periods or rows of one
// Workspace's data), every word is plain text, and a widget's View Design is checked as any other design.
import { checkFormat, parseJson, under, type FormatCheck, type Schema } from "./json-check";
import { itemKey, plainText, words } from "./file-text";
import { checkViewDesignValue, VIEW_LIMITS, type ViewDesign } from "./view-design";
import { NOT_IN_DASHBOARD_TEMPLATES } from "./team-templates";
import { TEMPLATES } from "./widget-templates";
import type { AnchorRule, MeasureId, PanelType, TemplateId } from "./types";
import type { CompareKey } from "./compare";
import type { DisplayPeriod } from "./display-periods";

/** The format this Ziffr writes; it reads every version in `DASHBOARD_TEMPLATE_FORMATS`. */
export const DASHBOARD_TEMPLATE_FORMAT = "ziffr.dashboard-template/1";
/** Every Dashboard Template file format Ziffr ever published, oldest first. */
export const DASHBOARD_TEMPLATE_FORMATS = [DASHBOARD_TEMPLATE_FORMAT] as const;
/** The exact limits a Dashboard Template file is held to. A widget's View Design is also held to its own. */
export const DASHBOARD_TEMPLATE_LIMITS = { bytes: 262_144, depth: 16, slots: 12, widgets: 40, panels: 6, notes: 12, name: 80, description: 300, label: 60, words: 200 } as const;

/** A note of a story's Panel or a callout, tied to a rule (the highest value, the latest period), never to one period. */
type RuleNote = { rule: AnchorRule; text?: string };
/** One Panel of a story, filled from a Slot. */
export type PanelFile = {
  type: PanelType; slot?: number; measure?: MeasureId; periods?: number; highlight?: "last" | "projection"; projections?: boolean; sharedScale?: boolean;
  refLine?: { kind: "target" | "constant" | "average"; value?: number; label?: string }; bridge?: { mode: "rows" | "variance" }; title?: string;
  annotations?: (RuleNote & { kind: "callout" | "ring" | "note"; arrow?: boolean })[];
};
/** What a widget of a template is set to: the settings a template keeps. */
export type WidgetSettingsFile = {
  window?: number; display?: DisplayPeriod; showTarget?: boolean; showForecast?: boolean; rows?: number; fullPeriods?: boolean; compare?: CompareKey[];
  kicker?: string; headline?: string; subline?: string; footnote?: string; source?: string; callouts?: RuleNote[]; panels?: PanelFile[];
  /** A View Design, written out, or in a Pack the key of one of the Pack's View Designs. */
  design?: ViewDesign | string;
};
/** One widget: its view, the Slots that fill it, and where it sits on the 12-column grid. */
export type TemplateWidgetFile = { view: Exclude<TemplateId, "canvas">; slots: number[]; title?: string; x: number; y: number; w: number; h: number; settings?: WidgetSettingsFile };
/** A Dashboard Template as a file (GLOSSARY: Dashboard Template), in the newest format. */
export type DashboardTemplateFile = {
  format: typeof DASHBOARD_TEMPLATE_FORMAT;
  name: string;
  description?: string;
  slots: { label: string; multiple?: boolean; suggests?: string }[];
  widgets: TemplateWidgetFile[];
};

const L = DASHBOARD_TEMPLATE_LIMITS;
const RULES: AnchorRule[] = ["max", "min", "last", "first", "largest-step"];
const obj = (properties: Record<string, Schema>, required: string[] = [], description?: string): Schema => ({ type: "object", ...(description ? { description } : {}), properties, required, additionalProperties: false });
const list = (items: Schema, maxItems: number, description?: string): Schema => ({ type: "array", maxItems, items, ...(description ? { description } : {}) });
const slotNumber: Schema = { type: "integer", minimum: 0, maximum: L.slots - 1, description: "A Slot of the template, counted from 0." };
const count = (description: string): Schema => ({ type: "integer", minimum: 1, maximum: 120, description });
const note = (extra: Record<string, Schema>): Schema => obj({ ...extra, rule: { enum: RULES, description: "Where it sits: the highest or lowest value, the latest or first period shown, or the biggest change." }, text: words(L.words) }, ["rule", ...Object.keys(extra).filter((k) => k === "kind")]);

/** The JSON Schema of ziffr.dashboard-template/1: the one definition the checks run and docs/reference is generated from. */
export const DASHBOARD_TEMPLATE_SCHEMA: Schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://ziffr.app/schemas/ziffr.dashboard-template-1.json",
  title: "Ziffr Dashboard Template (ziffr.dashboard-template/1)",
  description: "A starting point for a dashboard: its widgets with their views, settings, words and places, with the Metrics left open as Slots. It holds no code.",
  type: "object",
  properties: {
    format: { const: DASHBOARD_TEMPLATE_FORMAT, description: "The format and its version." },
    name: { ...plainText(L.name), minLength: 1 },
    description: plainText(L.description),
    slots: {
      type: "array", minItems: 1, maxItems: L.slots, description: "The Metrics it takes, in order; one Slot can fill several widgets.",
      items: obj({
        label: { ...plainText(L.label), minLength: 1 },
        multiple: { type: "boolean", description: "Takes one or more Metrics (small multiples) instead of exactly one." },
        suggests: itemKey("in a Pack: the key of one of its Metric Catalog entries, offered to fill the Slot"),
      }, ["label"]),
    },
    widgets: {
      type: "array", minItems: 1, maxItems: L.widgets, description: "What it shows, each on the 12-column grid.",
      items: obj({
        view: { enum: (Object.keys(TEMPLATES) as TemplateId[]).filter((t) => !NOT_IN_DASHBOARD_TEMPLATES.includes(t)), description: "The View it is drawn with; “design” for a View Design. Free Layouts stay out of templates." },
        slots: { ...list(slotNumber, 4), description: "The Slots that fill it, in order." },
        title: words(L.words),
        x: { type: "integer", minimum: 0, maximum: 11 },
        y: { type: "integer", minimum: 0, maximum: 400 },
        w: { type: "integer", minimum: 1, maximum: 12 },
        h: { type: "integer", minimum: 2, maximum: 24 },
        settings: { $ref: "#/$defs/settings" },
      }, ["view", "slots", "x", "y", "w", "h"]),
    },
  },
  required: ["format", "name", "slots", "widgets"],
  additionalProperties: false,
  $defs: {
    settings: obj({
      window: count("How many periods it shows."),
      display: { enum: ["week", "month", "quarter", "half", "year"], description: "Show by: a period longer than the Metric's own." },
      showTarget: { type: "boolean" },
      showForecast: { type: "boolean" },
      rows: count("How many rows a table shows."),
      fullPeriods: { type: "boolean", description: "Leave out a period that is not over yet." },
      compare: list({ enum: ["prev", "dod", "wow", "mom", "qoq", "hoh", "yoy"] }, 7, "The Comparisons it shows."),
      kicker: words(L.words), headline: words(L.words), subline: words(L.words), footnote: words(L.words), source: words(L.words),
      callouts: list(note({}), L.notes, "A story's callouts, each at the period a rule picks."),
      panels: list({ $ref: "#/$defs/panel" }, L.panels, "A story's Panels."),
      design: {
        description: "For the view “design”: a View Design (ziffr.view/1) written out, or in a Pack the key of one of its View Designs.",
        oneOf: [itemKey("in a Pack: the key of one of its View Designs"), { type: "object", description: "A View Design (ziffr.view/1), checked as one." }],
      },
    }, [], "What the widget is set to; left out, the view's defaults."),
    panel: obj({
      type: { enum: ["period-bars", "line", "bridge", "ranked", "share", "pictogram"] },
      slot: slotNumber,
      measure: { enum: ["value", "pct-prev", "pct-yoy", "attainment"] },
      periods: count("How many periods it shows."),
      highlight: { enum: ["last", "projection"], description: "Which bars stand out: the latest period, or the Projections." },
      projections: { type: "boolean" },
      sharedScale: { type: "boolean" },
      refLine: obj({ kind: { enum: ["target", "constant", "average"] }, value: { type: "number", minimum: -1e15, maximum: 1e15 }, label: plainText(L.label) }, ["kind"]),
      bridge: obj({ mode: { enum: ["rows", "variance"] } }, ["mode"], "Walk the latest Breakdown's rows, or its change on the period before."),
      title: words(L.words),
      annotations: list(note({ kind: { enum: ["callout", "ring", "note"] }, arrow: { type: "boolean" } }), L.notes),
    }, ["type"]),
  },
};

/** What `meaning` reports through. */
type At = (path: string, message: string) => void;

/** What the schema cannot say: Slots that exist, widgets that do not overlap, View Designs that pass their own checks. */
function meaning(t: DashboardTemplateFile, at: At) {
  const slots = t.slots.length;
  const bad = (n: number) => n >= slots;
  t.widgets.forEach((w, i) => {
    const here = `widgets[${i}]`;
    w.slots.forEach((n, k) => bad(n) && at(`${here}.slots[${k}]`, `is Slot ${n}, but the template has Slots 0 to ${slots - 1}.`));
    w.settings?.panels?.forEach((p, k) => p.slot !== undefined && bad(p.slot) && at(`${here}.settings.panels[${k}].slot`, `is Slot ${p.slot}, but the template has Slots 0 to ${slots - 1}.`));
    if (w.x + w.w > 12) at(here, `reaches column ${w.x + w.w}; the grid has 12.`);
    if (!w.slots.length && !w.settings?.panels?.some((p) => p.slot !== undefined)) at(`${here}.slots`, "fills the widget with no Slot: name at least one.");
    const design = w.settings?.design;
    if ((w.view === "design") !== (design !== undefined)) at(w.view === "design" ? `${here}.settings` : `${here}.settings.design`, w.view === "design" ? "needs “design”: the View Design the widget is drawn with." : "is only for the view “design”.");
    if (design && typeof design === "object") {
      const path = `${here}.settings.design`;
      const size = new TextEncoder().encode(JSON.stringify(design)).length;
      // Held to a design's own size, as if it were pasted on its own.
      const res = size > VIEW_LIMITS.bytes ? { ok: false as const, problems: [{ path: "", line: null, message: `is ${size.toLocaleString("en")} bytes; a View Design may have at most ${VIEW_LIMITS.bytes.toLocaleString("en")}.` }] } : checkViewDesignValue(design, new Map());
      if (!res.ok) for (const p of res.problems) at(under(path, p).path, p.message);
    }
    for (let j = 0; j < i; j++) {
      const o = t.widgets[j];
      if (w.x < o.x + o.w && o.x < w.x + w.w && w.y < o.y + o.h && o.y < w.y + w.h) at(here, `overlaps widget ${j}: two widgets cannot share a place.`);
    }
  });
}

/** The keys of the Pack items a template names: the Metric Catalog entries its Slots suggest, the View Designs its
 * widgets use. A template outside a Pack may name none. */
export function dashboardTemplateReferences(t: DashboardTemplateFile): { metrics: { path: string; key: string }[]; views: { path: string; key: string }[] } {
  return {
    metrics: t.slots.flatMap((s, i) => (s.suggests ? [{ path: `slots[${i}].suggests`, key: s.suggests }] : [])),
    views: t.widgets.flatMap((w, i) => (typeof w.settings?.design === "string" ? [{ path: `widgets[${i}].settings.design`, key: w.settings.design }] : [])),
  };
}

/** Checks a Dashboard Template file's text on its own, outside a Pack, where it can name no other item. */
export function checkDashboardTemplateFile(textIn: string): FormatCheck<DashboardTemplateFile> {
  const parsed = parseJson(textIn, { maxBytes: L.bytes, maxDepth: L.depth });
  if (!parsed.ok) return parsed;
  const res = checkDashboardTemplateFileValue(parsed.value, parsed.lines);
  if (!res.ok) return res;
  const refs = dashboardTemplateReferences(res.value);
  const outside = [...refs.metrics, ...refs.views];
  return outside.length ? { ok: false, problems: outside.map((r) => ({ path: r.path, line: parsed.lines.get(r.path) ?? null, message: `names “${r.key}”, which only a Pack holding it can give.` })) } : res;
}

/** Checks a Dashboard Template file already read from JSON; which Pack items it names is checked by its Pack. */
export function checkDashboardTemplateFileValue(value: unknown, lines: Map<string, number> = new Map()): FormatCheck<DashboardTemplateFile> {
  return checkFormat({ family: "ziffr.dashboard-template", reads: DASHBOARD_TEMPLATE_FORMATS, schema: DASHBOARD_TEMPLATE_SCHEMA, meaning }, value, lines);
}
