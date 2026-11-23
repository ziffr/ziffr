// Every analysis runs on Sample Data (ticket #987; GLOSSARY: Sample Data, Method, Takeaway): the Analysis Canvas's playground and the Previews of a Pack
// draw the five sample Metrics, so each entry of the method picker has to give a Takeaway (an answer, not a refusal) on a canvas made of them, at every
// period a Preview can be drawn at. The canvas chosen for each entry is in the table below.
import { describe, expect, it } from "vitest";
import { ENTRIES, entryOf, type EntryId } from "./method-picker";
import { fitList, type CanvasFact } from "./method-picker-fit";
import { runEntry, type PickWorld } from "./method-picker-run";
import { periodsBetween } from "./periods";
import { JANUARY } from "./periods";
import { sampleData, samplePeriods, SAMPLE_PERIODS } from "./sample-data";
import type { Period } from "./types";

// For each entry: the Metrics in its Slots (by sample slug) and its settings. The sample Metrics are Revenue (with a Breakdown), Orders, Active customers,
// Churn rate (a Target Range) and Operating cost: Revenue, Orders and Operating cost share one swing, so they move together; Churn rate and Active customers do not.
const TABLE: Record<EntryId, { slots: Record<string, string[]>; settings?: Record<string, number | string>; why: string }> = {
  forecast: { slots: { metric: ["revenue"] }, why: "one Metric with a trend" },
  "reach-target": { slots: { metric: ["churn"] }, why: "the Metric with a Target Range" },
  correlation: { slots: { first: ["revenue"], second: ["orders"] }, why: "two Metrics that share a swing" },
  rank: { slots: { first: ["revenue"], second: ["orders"] }, why: "the same pair" },
  partial: { slots: { first: ["revenue"], second: ["orders"], held: ["cost"] }, why: "a pair with a third held the same" },
  lag: { slots: { first: ["revenue"], second: ["orders"] }, why: "the same pair" },
  moves: { slots: { metric: ["revenue"], drivers: ["orders", "cost"] }, why: "Revenue explained by two Metrics" },
  needs: { slots: { metric: ["revenue"], drivers: ["orders"] }, settings: { goal: 150000 }, why: "Revenue reaching a value, through Orders" },
  "what-if": { slots: { metric: ["orders"], others: ["revenue"] }, settings: { percent: 10 }, why: "Orders up 10 %, and what follows for Revenue" },
  "after-date": { slots: { metric: ["revenue"], beside: ["churn"] }, settings: { date: "2025-06-01" }, why: "a day a year before the last period, Churn rate beside" },
  "change-point": { slots: { metric: ["revenue"] }, why: "one Metric" },
  bridge: { slots: { metric: ["revenue"] }, why: "the Metric with a Breakdown" },
  usual: { slots: { metric: ["orders"] }, settings: { value: 1500 }, why: "one Metric and a value to check" },
  "top-share": { slots: { metric: ["revenue"] }, why: "the Metric with a Breakdown" },
  pareto: { slots: { metric: ["revenue"] }, why: "the Metric with a Breakdown" },
};

const GRAINS: Period[] = ["month", "week", "day", "quarter"];

function worldAt(period: Period): { world: PickWorld; slug: (s: string) => ReturnType<typeof sampleData>["metrics"][number] } {
  const data = sampleData(period);
  const world: PickWorld = { metrics: data.metrics, series: data.series, breakdowns: data.breakdowns, ctx: { style: "1,234.5" }, yearStart: JANUARY, today: "2030-01-01" };
  return { world, slug: (s) => data.metrics.find((m) => m.slug === `sample-${s}`)! };
}

describe("every analysis runs on Sample Data", () => {
  it("has a canvas chosen for every entry", () => {
    expect(Object.keys(TABLE).sort()).toEqual(ENTRIES.map((e) => e.id).sort());
  });

  for (const grain of GRAINS) {
    describe(`at ${grain}`, () => {
      for (const entry of ENTRIES) {
        it(`${entry.id} gives a Takeaway, not a refusal`, () => {
          const { world, slug } = worldAt(grain);
          const t = TABLE[entry.id];
          const slots = Object.fromEntries(Object.entries(t.slots).map(([k, v]) => [k, v.map(slug)]));
          // A day to ask about that falls inside the sample's periods, a year before the last at the monthly grain.
          const settings = { ...t.settings, ...(entry.id === "after-date" ? { date: samplePeriods(grain)[Math.floor(SAMPLE_PERIODS / 2)] } : {}) };
          const takeaway = runEntry(entryOf(entry.id)!, world, { slots, settings });
          expect(takeaway.refusal).toBeNull();
          expect(takeaway.kind).toBe("answer");
          expect(takeaway.sentence).toBeTruthy();
        });
      }

      it("fits every entry to a canvas of the five Metrics, none greyed", () => {
        const { world } = worldAt(grain);
        const facts: CanvasFact[] = world.metrics.map((m) => ({
          id: m.id, name: m.name, period: m.period, aggregation: m.aggregation, periods: world.series[m.slug].length,
          hasTarget: m.target_min !== null || m.target_max !== null, breakdownLatest: Object.keys(world.breakdowns[m.id] ?? {}).length > 0,
          breakdownBefore: Object.keys(world.breakdowns[m.id] ?? {}).length > 1, builtFrom: [],
        }));
        const fits = fitList(facts);
        expect(fits.filter((f) => !f.ok).map((f) => (f.ok ? "" : `${f.entry}: ${f.reason}`))).toEqual([]);
        expect(periodsBetween(samplePeriods(grain)[0], samplePeriods(grain)[SAMPLE_PERIODS - 1], grain)).toBe(SAMPLE_PERIODS - 1);
      });
    });
  }
});
