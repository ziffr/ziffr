// The false-claim simulation of the Look-alike, part 2 (spec 0053, ticket 2): counted values (Poisson, with many ties), Metrics that only move together in a line
// (r = 0.8, and skewed and linked), each at most 5 % called clear; values that follow their own past (AR(1) 0.5), at most 10 %. Seeded; see part 1.
import { describe, expect, it } from "vitest";
import { CELLS, falseClaimShare, mostClear, RUNS } from "../test/reference/look-alike-sim";

describe.each([["counts", 0.05], ["line", 0.05], ["ar5", 0.1]] as const)(`%s (${RUNS} runs of each cell, seeded)`, (shape, rate) => {
  it.each(CELLS)("over %i periods and %i Metrics: no more called clear than its limit", (n, m) => {
    const claimed = Math.round(falseClaimShare(shape, RUNS, n, m) * RUNS);
    expect(claimed, `${shape} ${n} ${m}: ${claimed} of ${RUNS}`).toBeLessThanOrEqual(mostClear(rate));
  }, 7_200_000);
});
