// The work units follow the time (spec 0041, Analysis Recipe format /2): a wall-clock check in its own file, because Stryker's
// instrumented run (which leaves this file out, vitest.mutation.config.ts) slows the kinds unevenly and would fail it there.
import { describe, expect, it } from "vitest";
import { ANALYSIS_FORMAT_2, FUNCTIONS_2, type AnalysisRecipe2 } from "./analysis-recipe";
import { runRecipe2 } from "./recipe-run";
import { RECIPE_POINTS, type RecipeInput } from "./recipe-methods";
import type { TakeawayContext } from "./takeaways/takeaway";
import type { Point } from "./types";

const ctx: TakeawayContext = { style: "1,234.5" };
const UNIT = { unit: "€", unit_position: "after" as const, decimals: 0 };
const month = (i: number, from = 2020) => `${from + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;
const at = (vs: number[], from = 2020): Point[] => vs.map((value, i) => ({ period: month(i, from), value }));
// A steady wobble that is the same on every run: no randomness in a test of the numbers.
const wobble = (n: number, k: number) => Array.from({ length: n }, (_, i) => Math.round((100 + ((i * 37 + k * 11) % 23) * 3 + Math.sin(i * k) * 9 + i * 0.5) * 100) / 100);
const input = (name: string, vs: number[], period: RecipeInput["period"] = "month"): RecipeInput => ({ name, unit: UNIT, period, points: at(vs) });
const rec = (steps: AnalysisRecipe2["steps"], outputs: AnalysisRecipe2["outputs"], slots = 3): AnalysisRecipe2 => ({ format: ANALYSIS_FORMAT_2, name: "t", slots: Array.from({ length: slots }, (_, i) => ({ label: `S${i + 1}` })), steps, outputs });

describe("the work units follow the time (calibration guard)", () => {
  // Each kind of step and of Takeaway on 120 values, timed in this process (the best of five runs, so a busy machine does not count against
  // one kind): microseconds per work unit may not be more than three times the median of all kinds. A kind charged too little would
  // let a recipe take far longer than the budget says; the table of measured times is in docs/guides/analysis-recipes.md.
  const slots = [1, 2, 3, 4, 5, 6, 7].map((k) => input(`M${k}`, wobble(RECIPE_POINTS, k + 1)));
  const others = (n: number, from = 2) => Array.from({ length: n }, (_, i) => `slot${from + i}`);
  const kinds: [string, AnalysisRecipe2["steps"][number], boolean][] = [
    ["changes", { id: "x", fn: "changes", of: "slot1" }, false],
    ["detrended", { id: "x", fn: "detrended", of: "slot1" }, false],
    ["movingAverage", { id: "x", fn: "movingAverage", of: "slot1", window: 12 }, false],
    ["quantile", { id: "x", fn: "quantile", of: "slot1", percent: 30 }, false],
    ["spearman", { id: "x", fn: "spearman", of: "slot1", with: "slot2" }, true],
    ["lagged, 6 delays", { id: "x", fn: "laggedCorrelation", of: "slot1", with: "slot2", maxLag: 6 }, true],
    ["partial, 2 controls", { id: "x", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: others(2, 3) }, true],
    ["partial, 4 controls", { id: "x", fn: "partialCorrelation", of: "slot1", with: "slot2", controls: others(4, 3) }, true],
    ["usual range", { id: "x", fn: "usualRange", of: "slot1" }, true],
    ["fit, 2 drivers", { id: "x", fn: "fit", of: "slot1", drivers: others(2) }, true],
    ["fit, 4 drivers", { id: "x", fn: "fit", of: "slot1", drivers: others(4) }, true],
    ["fit, 6 drivers", { id: "x", fn: "fit", of: "slot1", drivers: others(6) }, true],
  ];
  // Opt in (RECIPE_CALIBRATION=1): wall-clock times on a shared or instrumented machine are too noisy for the normal run.
  it.skipIf(!process.env.RECIPE_CALIBRATION)("no kind of step or Takeaway takes more than three times the median microseconds per unit", () => {
    const perUnit = kinds.map(([name, step, takeaway]) => {
      const gives = FUNCTIONS_2[step.fn].gives;
      const shows: AnalysisRecipe2["outputs"] = [takeaway ? { step: "x", label: "t", shows: "takeaway" } : gives === "value" ? { step: "x", label: "t", shows: "value", unit: "number" } : { step: "x", label: "t", shows: "series", unit: "metric" }];
      const r = rec([step], shows, 7);
      let best = Infinity;
      let spent = 0;
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        const run = runRecipe2(r, slots, ctx, 1_000_000);
        best = Math.min(best, performance.now() - t);
        spent = run.spent;
      }
      return { name, us: (best * 1000) / spent };
    });
    const sorted = perUnit.map((p) => p.us).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    for (const p of perUnit) expect(p.us, `${p.name}: ${p.us.toFixed(1)} µs per unit, median ${median.toFixed(1)}`).toBeLessThanOrEqual(3 * median);
  });
});
