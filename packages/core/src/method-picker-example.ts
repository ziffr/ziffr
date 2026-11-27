// "See an example" of a question on the Analysis Canvas (GLOSSARY: Sample Data, Method, Takeaway): the picked Method run on the sample
// Metrics only, so a person with little history sees what the answer will look like. Pure: it is handed nothing of a Workspace but how
// numbers are written, reads nothing and saves nothing, so a sample value can never stand beside a real one.
import { entryOf, type EntryId } from "./method-picker";
import { runEntry, type PickWorld } from "./method-picker-run";
import type { NumberStyle } from "./number-style";
import { JANUARY, shiftPeriod } from "./periods";
import { sampleData, samplePeriods, SAMPLE_PERIODS } from "./sample-data";
import type { Takeaway } from "./takeaways/takeaway";
import type { Period } from "./types";

// For each question: the sample Metrics in its Slots (by sample slug) and its settings. Revenue (with a Breakdown), Orders and Operating
// cost share one swing, so they move together; Churn rate has a Target Range.
const CANVAS: Record<EntryId, { slots: Record<string, string[]>; settings?: Record<string, number | string> }> = {
  matrix: { slots: { metrics: ["revenue", "orders", "cost"] } },
  forecast: { slots: { metric: ["revenue"] } },
  "reach-target": { slots: { metric: ["churn"] } },
  correlation: { slots: { first: ["revenue"], second: ["orders"] } },
  rank: { slots: { first: ["revenue"], second: ["orders"] } },
  partial: { slots: { first: ["revenue"], second: ["orders"], held: ["cost"] } },
  lag: { slots: { first: ["revenue"], second: ["orders"] } },
  moves: { slots: { metric: ["revenue"], drivers: ["orders", "cost"] } },
  needs: { slots: { metric: ["revenue"], drivers: ["orders"] }, settings: { goal: 150000 } },
  "what-if": { slots: { metric: ["orders"], others: ["revenue"] }, settings: { percent: 10 } },
  "after-date": { slots: { metric: ["revenue"], beside: ["churn"] } },
  "change-point": { slots: { metric: ["revenue"] } },
  bridge: { slots: { metric: ["revenue"] } },
  usual: { slots: { metric: ["orders"] }, settings: { value: 1500 } },
  "top-share": { slots: { metric: ["revenue"] } },
  pareto: { slots: { metric: ["revenue"] } },
};

/** One question run on Sample Data: its answer, and the names of the sample Metrics it is about. */
export type Example = { takeaway: Takeaway; about: string[] };

/** The question run on the sample Metrics counted at `period`, written in `style`, with the picture of its result. */
export function exampleRun(id: EntryId, period: Period, style: NumberStyle): Example {
  const data = sampleData(period);
  const periods = samplePeriods(period);
  // "Today" is the period after the last sample one, so the answer reads the same on any day.
  const world: PickWorld = { metrics: data.metrics, series: data.series, breakdowns: data.breakdowns, ctx: { style, charts: true }, yearStart: JANUARY, today: shiftPeriod(periods[SAMPLE_PERIODS - 1], period, 1) };
  const { slots, settings } = CANVAS[id];
  const chosen = Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, v.map((s) => data.metrics.find((m) => m.slug === `sample-${s}`)!)]));
  // "Did it work?" asks about a day: one in the middle of the sample's periods.
  const asked = { ...settings, ...(id === "after-date" ? { date: periods[Math.floor(SAMPLE_PERIODS / 2)] } : {}) };
  return { takeaway: runEntry(entryOf(id)!, world, { slots: chosen, settings: asked }), about: [...new Set(Object.values(chosen).flat().map((m) => m.name))] };
}
