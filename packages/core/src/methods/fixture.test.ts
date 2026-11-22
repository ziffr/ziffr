// The outside fixture of the library's first Methods (spec 0041, ticket 3) and the limits they declare: the fixture was made by
// the script as it is now, names its tools, holds the normal curve's points the chance rule reads, and the minimums and
// checks of each Method are the ones written in the spec, one step either side.
import { describe, expect, it } from "vitest";
import { APPLIES, minimumPeriods } from "../suitability";
import { CHANCE_BY_TRIES, strengthOf } from "../takeaways/strength";
import { FIXTURE, HASHES } from "../test/reference/methods-fixture";

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
  it("reads fewer than 1 look as 1, and more than 7 as 7", () => {
    const r = critical(30, 2.3);
    for (const t of [0, -4, NaN]) expect(strengthOf(r, 30, false, t), String(t)).toBe(strengthOf(r, 30, false, 1));
    expect(strengthOf(r, 30, false, 99)).toBe(strengthOf(r, 30, false, 7));
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
