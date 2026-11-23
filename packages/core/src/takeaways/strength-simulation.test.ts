// The false-claim simulation of the plain correlation Takeaway (spec 0041, ticket 17): pairs of Metrics that have nothing to do with
// one another, drawn from white noise, AR(1) noise (0.5, 0.8, 0.95), random walks and a yearly sine with a random phase, go through the real path
// (correlate with its basis choice, then correlationTakeaway). Without allowing for a Metric following its own past the chance rule
// (Fisher's z on n pairs) claims a strength for a third of the pairs at AR(1) 0.8 and for most seasonal ones; with it, about 5 %. The
// full size (2,000 pairs per cell, the table in docs/guides/methods.md) runs where NUMBERS_RUNS is 1,000 or more; a plain test run uses
// a quick size. Seeded, so each size gives the same answer every time.
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { falseClaimRate, FAMILIES } from "../test/reference/strength-simulation";

const FULL = Number(process.env.NUMBERS_RUNS) >= 1000;
const PAIRS = FULL ? 2000 : 150;
const SIZES = [12, 24, 36, 60];

/** The false-claim rate that may be seen for a kind of series at n months (the chance rule's own level is 5 %, and a rate is read from a sample). */
const LIMIT = (family: string, n: number): number | null => {
  if (family === "white" || family === "ar0.5") return 0.08;
  if (family === "ar0.8") return n >= 24 ? 0.08 : 0.09;
  if (family === "ar0.95" || family === "walk") return 0.1;
  // Yearly seasons: with one cycle (12 months) or three, two series with the same season cannot be told apart from one that is shared.
  return n === 24 ? 0.1 : null;
};

describe(`independent pairs through the real Takeaway (${PAIRS} pairs per cell, seeded)`, () => {
  const cells = (FULL ? SIZES : [24, 36]).flatMap((n) => Object.keys(FAMILIES).map((family): [string, number] => [family, n]));
  it.each(cells)("%s over %i months: the false-claim rate is within its limit", (family, n) => {
    const r = falseClaimRate(family, n, PAIRS);
    const limit = LIMIT(family, n);
    if (limit !== null) expect(r.claimed, `${family} ${n}`).toBeLessThanOrEqual(limit);
  });
  it("claims far less than the uncorrected rule where Metrics follow their own past: AR(1) 0.8 and seasons over 36 months", () => {
    const [ar, seasonal] = [falseClaimRate("ar0.8", 36, PAIRS), falseClaimRate("seasonal", 36, PAIRS)];
    expect(ar.before).toBeGreaterThan(0.2);
    expect(ar.claimed).toBeLessThan(ar.before / 3);
    expect(seasonal.before).toBeGreaterThan(0.5);
    expect(seasonal.claimed).toBeLessThan(seasonal.before / 3);
  });
  it.skipIf(!process.env.SIM_OUT)("writes the table (for the guide)", () => {
    const row = (f: string) => SIZES.map((n) => { const r = falseClaimRate(f, n, PAIRS); return `${(r.before * 100).toFixed(1)} -> ${(r.claimed * 100).toFixed(1)} %`; });
    writeFileSync(process.env.SIM_OUT!, Object.keys(FAMILIES).map((f) => `${f.padEnd(9)} ${row(f).join("  |  ")}`).join("\n") + "\n");
  });
});
