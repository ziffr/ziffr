// @ts-nocheck
// The outside fixture of the library's first Methods (spec 0041, ticket 3) and the limits they declare: the fixture was made by
// the script as it is now, names its tools, holds the normal curve's points the chance rule reads, and the minimums and
// checks of each Method are the ones written in the spec, one step either side.
import { describe, expect, it } from "vitest";
import { APPLIES, minimumPeriods } from "../suitability";
import { CHANCE_BY_TRIES, strengthOf } from "../takeaways/strength";
import { FIXTURE, HASHES, series } from "../test/reference/methods-fixture";
import { bridgeTakeaway } from "./bridge";
import { paretoTakeaway, topShareTakeaway } from "./concentration";
import { laggedTakeaway } from "./lagged-correlation";
import { partialTakeaway } from "./partial-correlation";
import { usualRangeTakeaway } from "./quantiles";
import { spearmanTakeaway } from "./spearman";

describe("the SciPy and NumPy fixture of the first Methods", () => {
  it("was made by the current script (methods.py), and names the tools", () => {
    expect(HASHES.fixture, "run python3 packages/core/src/test/reference/fixtures/methods.py again").toBe(HASHES.script);
    expect(FIXTURE.version).toBe(1);
    expect(Object.keys(FIXTURE.tools).sort()).toEqual(["numpy", "scipy"]);
  });
  it("holds the normal curve's points for a chance shared among 1 to 7 looks, which the strength words read", () => {
    expect([...CHANCE_BY_TRIES]).toEqual(FIXTURE.chanceByTries);
  });
});

describe("strengthOf at the bar for the number of looks", () => {
  // The r at which n pairs just clear a bar z: tanh(z ÷ √(n − 3)) by the exponential formula (no Math.tanh or Math.atanh).
  const critical = (n: number, z: number) => { const k = z / Math.sqrt(n - 3); return (Math.exp(2 * k) - 1) / (Math.exp(2 * k) + 1); };
  it.each([1, 2, 3, 4, 5, 6, 7])("%i looks: a step either side of the critical r at 30 and 60 pairs", (tries) => {
    for (const n of [30, 60]) {
      const rc = critical(n, FIXTURE.chanceByTries[tries - 1]);
      expect(strengthOf(rc * (1 - 1e-9), n, false, tries), `n=${n}`).toBe("cant-tell");
      expect(strengthOf(rc * (1 + 1e-9), n, false, tries), `n=${n}`).not.toBe("cant-tell");
    }
  });
  it("is stricter with more looks: an r that clears one look but not seven", () => {
    const r = critical(30, (FIXTURE.chanceByTries[0] + FIXTURE.chanceByTries[6]) / 2);
    expect(strengthOf(r, 30, false, 1)).not.toBe("cant-tell");
    expect(strengthOf(r, 30, false, 7)).toBe("cant-tell");
  });
  it("claims no strength for a number of looks that is not a whole number from 1 to 7", () => {
    for (const t of [0, -4, NaN, 2.5, 1.5, 7.5, 8, 99, Infinity]) expect(strengthOf(0.99, 100, false, t), String(t)).toBe("cant-tell");
    expect(strengthOf(0.99, 100, false, 1)).toBe("strong");
    expect(strengthOf(0.99, 100, false, 7)).toBe("strong");
  });
});

describe("the limits of the first Methods", () => {
  it("are the minimums the spec gives: rank correlation 6 pairs, a lag 12 periods, partial correlation as a fit of the Metrics weighed, a usual range 8", () => {
    expect(minimumPeriods("spearman")).toBe(6);
    expect(minimumPeriods("lag")).toBe(12);
    expect([1, 2, 3, 4].map((held) => minimumPeriods("partial", { drivers: held + 1 }))).toEqual([16, 20, 24, 28]);
    expect(minimumPeriods("usualRange")).toBe(8);
  });
  it("run the checks the spec's table gives them", () => {
    expect(APPLIES.spearman).toEqual(["periods", "vary", "gaps", "far-off", "changing"]);
    expect(APPLIES.partial).toEqual(["periods", "vary", "gaps", "far-off", "too-many"]);
    expect(APPLIES.lag).toContain("changing");
    expect(APPLIES.usualRange).toEqual(["periods", "vary", "gaps", "level-shift"]);
  });
});

describe("which Takeaways carry the footer", () => {
  const ctx = { style: "1,234.5" } as const;
  const unit = { unit: "€", unit_position: "after", decimals: 0 } as const;
  const wavy = (n: number, step = 7) => Array.from({ length: n }, (_, i) => 10 + ((i * step * 5) % 97) + (i % 7));
  const FOOTER = "This shows what has gone together, not what caused what.";
  it("belongs to the Takeaways about two Metrics together (rank, partial, lagged correlation) and to no other", () => {
    const [a, b, c] = [series(wavy(30, 7)), series(wavy(30, 7).map((v) => 2 * v)), series(wavy(30, 3))];
    expect(spearmanTakeaway("A", "B", a, b, "month", "values", ctx).footer).toBe(FOOTER);
    expect(partialTakeaway({ a: "A", b: "B", held: ["C"] }, a, b, [c], "month", ctx).footer).toBe(FOOTER);
    expect(laggedTakeaway("A", "B", a, b, "month", "values", ctx).footer).toBe(FOOTER);
    expect(usualRangeTakeaway("A", a, "month", unit, ctx).footer).toBeNull();
    const rows = [{ label: "X", value: 5 }, { label: "Y", value: 3 }, { label: "Z", value: 2 }];
    expect(topShareTakeaway("A", rows, 1, ctx).footer).toBeNull();
    expect(paretoTakeaway("A", rows, ctx).footer).toBeNull();
    expect(bridgeTakeaway("A", [{ label: "X", before: 1, after: 2 }], unit, ctx).footer).toBeNull();
  });
});
