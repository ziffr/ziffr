// Test fixtures: a few Metrics and series in the shape the rules expect.
import type { CanvasData, Metric, Point } from "../types";

/** A Metric with sensible defaults; override what a test is about. */
export function metric(over: Partial<Metric> = {}): Metric {
  return {
    id: 1, slug: "revenue", name: "Revenue", owner_id: "sara", formula: null, from_catalog_id: null, created_at: "2026-01-01",
    description: "", unit: "€", format: "currency", decimals: 0, period: "month", submission_rule: "overwrite",
    polarity: "higher", target_min: 100, target_max: null, sources: ["web_form"], aggregation: "sum",
    ...over,
  };
}

/** Monthly points from a start month, one value per month. */
export function months(start: string, values: number[]): Point[] {
  const [y, m] = start.split("-").map(Number);
  return values.map((value, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    return { period: d.toISOString().slice(0, 10), value };
  });
}

/** CanvasData with just metrics and series; everything else empty. */
export function canvas(metrics: Metric[], series: Record<string, Point[]>, over: Partial<CanvasData> = {}): CanvasData {
  return {
    viewer: "sara", metrics, series, people: [], openActions: {}, submitters: {}, targets: {}, projections: {}, breakdowns: {},
    templates: [], themes: [], canEditThemes: false, groups: [], pending: {}, locked: {}, yearStart: 1, ...over,
  };
}
