// GLOSSARY: Sample Data. Made-up Metrics that a Preview of a Widget Template draws, because a template has no
// metrics of its own. Never a workspace's data: built here from a fixed seed, so every viewer, every test and every
// render sees the same numbers, and a Preview needs no Share check and fetches nothing (spec 0011).
import { DEFAULT_ATTAINMENT_METHOD } from "./attainment-method";
import type { NumberStyle } from "./number-style";
import { JANUARY, periodStart, shiftPeriod } from "./periods";
import { fromDashboardTemplate, fromTemplate } from "./team-templates";
import { TEMPLATES } from "./widget-templates";
import type { BreakdownRow, CanvasData, DashboardTemplateBody, Metric, MetricDescription, Period, Point, Slot, TemplateId, WidgetSettings, WidgetTemplate } from "./types";

// mulberry32: a tiny seeded generator of numbers from 0 to 1, the same numbers for the same seed.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Who owns the sample Metrics: no person has this id. */
export const SAMPLE_OWNER = "sample";
/** How many periods each sample series has. */
export const SAMPLE_PERIODS = 24;
// The last period drawn. Fixed rather than "now", so a Preview never changes from one day to the next.
const LAST = "2026-06-01";

type Shape = { slug: string; desc: Omit<MetricDescription, "period" | "sources" | "submission_rule" | "description" | "aggregation">; start: number; growth: number; noise: number; target?: number; breakdown?: string[] };

// Five Metrics are enough for every built-in template: a correlation needs two that move together, a matrix and
// Drivers need several, and the Finding templates need one with a Breakdown (the first).
const SHAPES: Shape[] = [
  { slug: "revenue", desc: { name: "Revenue", unit: "€", unit_position: "after", format: "currency", decimals: 0, polarity: "higher", target_min: null, target_max: null, attainment_method: null }, start: 82000, growth: 0.025, noise: 0.05, target: 1.02, breakdown: ["North", "South", "West", "East", "Online"] },
  { slug: "orders", desc: { name: "Orders", unit: "", unit_position: "after", format: "number", decimals: 0, polarity: "higher", target_min: null, target_max: null, attainment_method: null }, start: 1150, growth: 0.022, noise: 0.03 },
  { slug: "customers", desc: { name: "Active customers", unit: "", unit_position: "after", format: "number", decimals: 0, polarity: "higher", target_min: null, target_max: null, attainment_method: null }, start: 640, growth: 0.015, noise: 0.02, target: 1.01 },
  { slug: "churn", desc: { name: "Churn rate", unit: "%", unit_position: "after", format: "percent", decimals: 1, polarity: "lower", target_min: null, target_max: 2.5, attainment_method: null }, start: 3.4, growth: -0.012, noise: 0.08 },
  { slug: "cost", desc: { name: "Operating cost", unit: "€", unit_position: "after", format: "currency", decimals: 0, polarity: "lower", target_min: null, target_max: null, attainment_method: null }, start: 61000, growth: 0.012, noise: 0.04 },
];

/** The periods a sample series covers, oldest first, as yyyy-mm-dd; quarters and years of the calendar year. */
export function samplePeriods(period: Period = "month"): string[] {
  // The period LAST falls in: a quarter or year starts before it.
  const last = periodStart(LAST, period, JANUARY);
  return Array.from({ length: SAMPLE_PERIODS }, (_, i) => shiftPeriod(last, period, i - (SAMPLE_PERIODS - 1)));
}

/** The parts of a canvas's data that Sample Data fills. */
export type SampleData = Pick<CanvasData, "metrics" | "series" | "targets" | "projections" | "breakdowns">;

const cache = new Map<Period, SampleData>();

/** Sample Metrics of one grain with their series, Target Series, Projections and Breakdowns. Ids are negative, so
 * nothing that saves can take one for a real Metric (the core keeps positive ids only). */
export function sampleData(period: Period = "month"): SampleData {
  const hit = cache.get(period);
  if (hit) return hit;
  const periods = samplePeriods(period);
  const out: SampleData = { metrics: [], series: {}, targets: {}, projections: {}, breakdowns: {} };
  // One shared swing makes the series move together, so a correlation between them has something to find.
  const swing = (() => { const r = seeded(7); return periods.map(() => r() - 0.5); })();
  SHAPES.forEach((s, i) => {
    const id = -(i + 1);
    const rand = seeded(101 + i);
    const metric: Metric = {
      ...s.desc,
      id,
      slug: `sample-${s.slug}`,
      owner_id: SAMPLE_OWNER,
      formula: null,
      from_catalog_id: null,
      created_at: `${periods[0]}T00:00:00Z`,
      description: "Sample data",
      aggregation: s.desc.format === "percent" ? "none" : "sum",
      period,
      submission_rule: "overwrite",
      sources: [],
    };
    const round = (v: number) => Number(v.toFixed(s.desc.decimals));
    const values = periods.map((_, k) => s.start * (1 + s.growth) ** k * (1 + s.noise * (1.4 * swing[k] + 0.6 * (rand() - 0.5))));
    out.metrics.push(metric);
    out.series[metric.slug] = periods.map((p, k): Point => ({ period: p, value: round(values[k]) }));
    if (s.target) out.targets[id] = periods.map((p, k): Point => ({ period: p, value: round(s.start * s.target! ** k * (1 + s.growth / 2) ** k) }));
    // Three periods ahead, continuing the trend: what a Projection looks like.
    const ahead = Array.from({ length: 3 }, (_, k) => shiftPeriod(LAST, period, k + 1));
    out.projections[id] = ahead.map((p, k): Point => ({ period: p, value: round(values[values.length - 1] * (1 + s.growth) ** (k + 1)) }));
    if (s.breakdown) {
      const weights = [0.34, 0.24, 0.18, 0.14, 0.1];
      out.breakdowns[id] = Object.fromEntries(periods.map((p, k) => {
        const r = seeded(500 + k);
        const raw = weights.map((w) => w * (0.85 + 0.3 * r()));
        const sum = raw.reduce((a, b) => a + b, 0);
        const rows: BreakdownRow[] = s.breakdown!.map((label, j) => ({ label, value: round((values[k] * raw[j]) / sum) }));
        return [p, rows];
      }));
    }
  });
  cache.set(period, out);
  return out;
}

/** Sample Metrics for a template's Slots: one each, or three for a "one or more" slot, the first slot getting the
 * Metric with a Breakdown. Different slots get different Metrics while there are enough. */
export function sampleFills(slots: Pick<Slot, "multiple">[], period: Period = "month"): number[][] {
  const ids = sampleData(period).metrics.map((m) => m.id);
  let next = 0;
  const take = () => ids[next++ % ids.length];
  return slots.map((s) => (s.multiple ? [take(), take(), take()] : [take()]));
}

/** A whole canvas's data made of Sample Data only, for drawing a Preview without anything of the workspace. */
export function sampleCanvasData(viewer: string, numberStyle: NumberStyle, period: Period = "month"): CanvasData {
  return {
    ...sampleData(period),
    viewer,
    people: [],
    openActions: {},
    submitters: {},
    templates: [],
    themes: [],
    canEditThemes: false,
    groups: [],
    pending: {},
    locked: {},
    // Sample Data belongs to no workspace: its quarters are calendar ones.
    yearStart: JANUARY,
    // Written the way the workspace looking at it writes numbers.
    numberStyle,
    // Sample Data has no targets to attain; the default keeps the type whole.
    attainmentMethod: DEFAULT_ATTAINMENT_METHOD,
  };
}

/** A widget a Preview draws: what WidgetFrame takes, with Sample Data's metric ids. */
export type SampleWidget = { template: TemplateId; metric_ids: number[]; settings: WidgetSettings; title: string | null };

// A few built-ins start blank and only say something once a person writes into them; their Previews get a
// sample of what a team would write, so the Preview shows what the template is for.
function sampleSettings(id: TemplateId, fills: number[][], period: Period): WidgetSettings {
  const periods = samplePeriods(period);
  if (id === "story") {
    return {
      kicker: "{metric}, {period}",
      headline: "{metric} {change yoy} on last year",
      subline: "Change against the same period a year earlier, in %",
      panels: [{ type: "period-bars", metricIds: fills[0] ?? [], measure: "pct-yoy", periods: 6, highlight: "last", annotations: [{ kind: "ring", anchor: { type: "rule", rule: "max" } }] }],
    };
  }
  // A slope chart of Sample Data compares the rows of the first Metric's Breakdown: the others are of different units.
  if (id === "slope") return { slope: "previous" };
  if (id === "story-line") return { callouts: [{ period: periods[periods.length - 7], text: "Price change" }, { period: periods[periods.length - 2], text: "New region" }] };
  return {};
}

/** A built-in template filled with Sample Data, as its Preview draws it. */
export function sampleWidget(id: TemplateId, period: Period = "month"): SampleWidget {
  const t = TEMPLATES[id];
  const fills = sampleFills(t.slots, period);
  return { template: id, metric_ids: fills.flat(), settings: { ...t.settings, ...sampleSettings(id, fills, period) }, title: null };
}

/** A Dashboard Template's widgets filled with Sample Data, where they sit (spec 0014). Never with the Metrics it was
 * made with, for the same reason as a team template's. */
export function sampleDashboard(t: { slots: Pick<Slot, "multiple">[]; body: DashboardTemplateBody }, period: Period = "month"): (SampleWidget & { x: number; y: number; w: number; h: number })[] {
  return fromDashboardTemplate(t.body, sampleFills(t.slots, period));
}

/** A team template filled with Sample Data. Never with the metrics it was made with (its Slots' exampleIds): the
 * viewer may not see them, and a Preview must not show what placing it would not. */
export function sampleTeamWidget(t: Pick<WidgetTemplate, "view" | "body" | "slots">, period: Period = "month"): SampleWidget {
  return fromTemplate(t, sampleFills(t.slots, period));
}
