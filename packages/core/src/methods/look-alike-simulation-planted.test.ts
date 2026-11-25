// The planted-structure simulation of the Look-alike (spec 0053, Testing Decisions, ticket 2): kinds put into noise are found where the spec says they are, and kinds
// of one Metric alone are not called clear. Seeded; 2,000 runs of each case at full size (NUMBERS_RUNS of 1,000 or more), 100 at a quick size.
import { describe, expect, it } from "vitest";
import { leastClear, mostClear, plantedShare, RUNS } from "../test/reference/look-alike-sim";

const claimed = (planting: string, apart: number, n: number, m: number) => Math.round(plantedShare(planting, apart, RUNS, n, m) * RUNS);

describe(`planted kinds (${RUNS} runs of each case, seeded)`, () => {
  it("three kinds set apart by 4 spreads on 2 of 2 Metrics over 24 months: clear in at least 9 runs in 10", () => {
    expect(claimed("three", 4, 24, 2)).toBeGreaterThanOrEqual(leastClear(0.9));
  }, 7_200_000);
  it("months 10 to 12 three spreads higher on all of 4 Metrics over 24 months (a kind of 3, the smallest at 24 periods): clear in at least 9 runs in 10", () => {
    expect(claimed("shared", 3, 24, 4)).toBeGreaterThanOrEqual(leastClear(0.9));
  }, 7_200_000);
  it.each([[24, 2], [24, 4], [36, 6]])("months 10 to 12 three spreads higher on the first of the Metrics alone (%i months, %i Metrics): clear in at most 1 run in 10", (n, m) => {
    expect(claimed("alone", 3, n, m)).toBeLessThanOrEqual(mostClear(0.1));
  }, 7_200_000);
  it("the price of a smallest kind of a sixth above 30 periods: a kind of 3 months over 36 months is not found (clear in at most 1 run in 10)", () => {
    expect(claimed("shared", 3, 36, 4)).toBeLessThanOrEqual(mostClear(0.1));
  }, 7_200_000);
});
