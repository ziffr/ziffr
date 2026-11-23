// View Design files to take away (spec 0024, GLOSSARY: View Design, Sample Data): any View as a design, a widget's
// View with its settings as the defaults (Duplicate as View Design), and Sample Data that fits the design's Slots.
// Security: a file made here holds the design and made-up Sample Data only, never a Workspace's Metrics or values.
import { BUILT_IN_DESIGNS, designSettings, designSlots, isDesignedView } from "./built-in-designs";
import { sampleData, sampleFills, type SampleWidget } from "./sample-data";
import { VIEW_DESIGN_SCHEMA, VIEW_FORMAT, writeViewDesign, VIEW_LIMITS, type Part, type PlotMark, type ViewDesign } from "./view-design";
import { checkSchema } from "./json-check";
import { drawnOutputs, type AnyAnalysisRecipe } from "./analysis-recipe";
import type { Period, Widget } from "./types";

/** The format of a Sample Data file that comes with an exported design. */
export const SAMPLE_FORMAT = "ziffr.sample/1";

/** The View Design a widget is drawn with, or null for a Finding or a Free layout, which are not designs. */
export function designOf(widget: Pick<Widget, "template" | "settings">): ViewDesign | null {
  if (isDesignedView(widget.template)) return BUILT_IN_DESIGNS[widget.template];
  if (widget.template === "design") return widget.settings.design?.body ?? null;
  return null;
}

/** A widget's View as a new design: its settings become the defaults, and it is named after the widget. */
export function duplicateAsDesign(widget: Pick<Widget, "template" | "settings" | "title">, design: ViewDesign): ViewDesign {
  const s = widget.settings;
  const o = { ...(design.options ?? {}) };
  if (o.window && s.window !== undefined) o.window = { ...o.window, default: Math.min(120, Math.max(1, Math.round(s.window))) };
  if (o.rows && s.rows !== undefined) o.rows = { ...o.rows, default: Math.min(120, Math.max(1, Math.round(s.rows))) };
  if (o.showTarget && s.showTarget !== undefined) o.showTarget = { ...o.showTarget, default: !!s.showTarget };
  if (o.showForecast && s.showForecast !== undefined) o.showForecast = { ...o.showForecast, default: !!s.showForecast };
  // The widget's title is the person's own words: kept only while it is plain text that fits, else the design's name.
  // Held to the format's own rule for names, and cut by characters, never inside one.
  const cut = (t: string) => [...t].slice(0, VIEW_LIMITS.name).join("");
  const base = cut(`${(widget.title ?? "").trim()} (copy)`);
  const name = (widget.title ?? "").trim() && checkSchema(VIEW_DESIGN_SCHEMA.properties!.name, base).length === 0 ? base : cut(`${design.name} (copy)`);
  return { ...design, name, ...(design.options ? { options: o } : {}) };
}

/** A design filled with Sample Data, as its Preview draws it: never with a Workspace's Metrics. */
export function sampleDesignWidget(d: ViewDesign, period: Period = "month"): SampleWidget {
  return { template: "design", metric_ids: sampleFills(designSlots(d), period).flat(), settings: { ...designSettings(d), design: { id: null, body: d } }, title: null };
}

/** A starting design for an Analysis Recipe: the first Metric's values with the recipe's series in the Metric's unit
 * on one plot, its other series on a second, and its single values as words. */
export function designWithRecipe(r: AnyAnalysisRecipe): ViewDesign {
  // Only a series or one value has a mark so far: a table or a Takeaway output stays in the recipe, undrawn.
  const outputs = drawnOutputs(r);
  const series = outputs.filter((o) => o.gives === "series");
  const inUnit = series.filter((o) => o.unit === "metric");
  const other = series.filter((o) => o.unit !== "metric");
  const values = outputs.filter((o) => o.gives === "value");
  const line = (step: string): PlotMark => ({ mark: "line", show: `recipe.${step}`, tone: "muted", dash: true, weight: "regular" });
  const parts: Part[] = [
    { mark: "plot", axes: "regular", grid: "horizontal", scale: "padded", marks: [{ mark: "line", show: "values", tone: "data", weight: "strong", detail: "full" }, ...inUnit.map((o) => line(o.step))] },
  ];
  if (other.length) parts.push({ mark: "plot", axes: "regular", grid: "horizontal", scale: "auto", marks: other.map((o) => ({ ...line(o.step), tone: "data", dash: false })) });
  if (values.length) parts.push({ mark: "text", style: "body", content: values.flatMap((o, i) => [`${i ? ", " : ""}${o.label}: `, { show: `recipe.${o.step}` as const }]) });
  return {
    format: VIEW_FORMAT,
    name: r.name,
    ...(r.description ? { description: r.description } : {}),
    kind: "analysis",
    slots: r.slots.map((s) => ({ label: s.label, metrics: "one" as const })),
    size: { w: 6, h: 7 },
    options: { window: { label: "Periods", default: 12 }, display: { label: "Show by" } },
    analysis: r,
    parts,
  };
}

/** A design's file name, from its name: letters, digits and dashes only. */
export function designFileName(d: ViewDesign, suffix: "view" | "sample"): string {
  const slug = d.name.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "view-design";
  return `${slug.slice(0, 60)}.${suffix}.json`;
}

/** The text of a design's file, as Ziffr writes it. */
export const designFile = (d: ViewDesign) => writeViewDesign(d);

/** A Sample Data file for a design's Slots: made-up Metrics and values, the same for everyone (GLOSSARY: Sample Data). */
export function sampleFile(d: ViewDesign, period: Period = "month"): string {
  const data = sampleData(period);
  const fills = sampleFills(designSlots(d), period);
  const metrics = fills.flatMap((ids, slot) =>
    ids.map((id) => {
      const m = data.metrics.find((x) => x.id === id)!;
      return {
        slot,
        name: m.name, unit: m.unit, unit_position: m.unit_position, format: m.format, decimals: m.decimals, polarity: m.polarity,
        period: m.period, aggregation: m.aggregation, target_min: m.target_min, target_max: m.target_max,
        values: data.series[m.slug] ?? [],
        targets: data.targets[id] ?? [],
      };
    }),
  );
  return `${JSON.stringify({ format: SAMPLE_FORMAT, about: "Made-up Sample Data for trying this design. It holds no Workspace's values.", metrics }, null, 2)}\n`;
}
