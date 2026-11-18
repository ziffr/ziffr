// View Design files to take away (spec 0024, GLOSSARY: View Design, Sample Data): any View as a design, a widget's
// View with its settings as the defaults (Duplicate as View Design), and Sample Data that fits the design's Slots.
// Security: a file made here holds the design and made-up Sample Data only, never a Workspace's Metrics or values.
import { BUILT_IN_DESIGNS, designSettings, designSlots, isDesignedView } from "./built-in-designs";
import { sampleData, sampleFills, type SampleWidget } from "./sample-data";
import { writeViewDesign, VIEW_LIMITS, type ViewDesign } from "./view-design";
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
  const base = (widget.title ?? "").trim();
  const plain = base && /^[\p{L}\p{M}\p{N} .,;:!?'"’‘“”«»()%€$£¥+\-–—/&#*=_·…°]*$/u.test(base) && !/:\/\/|www\./i.test(base);
  const name = `${plain ? base : design.name} (copy)`.slice(0, VIEW_LIMITS.name);
  return { ...design, name, ...(design.options ? { options: o } : {}) };
}

/** A design filled with Sample Data, as its Preview draws it: never with a Workspace's Metrics. */
export function sampleDesignWidget(d: ViewDesign, period: Period = "month"): SampleWidget {
  return { template: "design", metric_ids: sampleFills(designSlots(d), period).flat(), settings: { ...designSettings(d), design: { id: null, body: d } }, title: null };
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
