// The false-claim simulation of the Look-alike, part 1 (spec 0053, Testing Decisions, ticket 2): Metrics that have nothing to do with one another, of four shapes
// (bell-shaped, flat, skewed, heavy-tailed), go through the real, exact path; the kinds are called clear in at most 5 % of the runs of each cell. Seeded; 2,000 runs
// of each cell at full size (NUMBERS_RUNS of 1,000 or more), 100 at a quick size. The other parts are in the files beside this one, so that they run side by side.
import { describe, expect, it } from "vitest";
import { CELLS, falseClaimShare, mostClear, RUNS } from "../test/reference/look-alike-sim";

describe.each(["bell", "flat", "skewed", "heavy"])(`independent %s values (${RUNS} runs of each cell, seeded)`, (shape) => {
  it.each(CELLS)("over %i periods and %i Metrics: at most 5 % called clear", (n, m) => {
    const claimed = Math.round(falseClaimShare(shape, RUNS, n, m) * RUNS);
    expect(claimed, `${shape} ${n} ${m}: ${claimed} of ${RUNS}`).toBeLessThanOrEqual(mostClear(0.05));
  }, 7_200_000);
});
