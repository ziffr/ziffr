// Every analysis runs on Sample Data (ticket #987; GLOSSARY: Sample Data, Method, Takeaway): the Analysis Canvas's playground and the Previews of a Pack
// draw the five sample Metrics, so each entry of the method picker has to give a Takeaway (an answer, not a refusal) on a canvas made of them, at every
// period a Preview can be drawn at.
import { describe, expect, it } from "vitest";
import { ENTRIES } from "./method-picker";
import { exampleRun } from "./method-picker-example";
import { fitList, type CanvasFact } from "./method-picker-fit";
import type { PickWorld } from "./method-picker-run";
import { periodsBetween } from "./periods";
import { JANUARY } from "./periods";
import { sampleData, samplePeriods, SAMPLE_PERIODS } from "./sample-data";
import type { Period } from "./types";

// Each entry's canvas of sample Metrics is the one "See an example" runs (method-picker-example.ts), so what a person is shown is what is checked.
const GRAINS: Period[] = ["month", "week", "day", "quarter", "year"];

function worldAt(period: Period): { world: PickWorld } {
  const data = sampleData(period);
  const world: PickWorld = { metrics: data.metrics, series: data.series, breakdowns: data.breakdowns, ctx: { style: "1,234.5" }, yearStart: JANUARY, today: "2030-01-01" };
  return { world };
}

describe("every analysis runs on Sample Data", () => {
  for (const grain of GRAINS) {
    describe(`at ${grain}`, () => {
      for (const entry of ENTRIES) {
        it(`${entry.id} gives a Takeaway, not a refusal`, () => {
          const { takeaway, about } = exampleRun(entry.id, grain, "1,234.5");
          expect(takeaway.refusal).toBeNull();
          expect(takeaway.kind).toBe("answer");
          expect(takeaway.sentence).toBeTruthy();
          expect(about.length).toBeGreaterThan(0);
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
