// Running an Analysis Recipe (spec 0024, spec 0022; GLOSSARY: Analysis Recipe): its steps applied in order, each by
// the library's function (recipe-functions.ts), to the series of its Slots and to nothing else, so a recipe cannot
// reach a Metric outside its Slots and every number it gives is one the library computed. Pure.
import type { AnalysisRecipe } from "./analysis-recipe";
import { correlation, difference, growth, linearTrend, mean, movingAverage, seasonalIndex, share, slope, standardDeviation, zScore, type Result } from "./recipe-functions";
import type { Point } from "./types";

/** The output of a recipe, by step id, worked out by the library's functions. */
export type RecipeResults = Record<string, Result>;

/** Applies a checked recipe (checkAnalysisRecipe)'s steps to the series of its Slots, in order (`inputs[i]` fills slot i + 1), and nothing
 * else: a recipe reaches only the Metrics placed in its Slots. A Slot left empty gives empty series. */
export function runRecipe(r: AnalysisRecipe, inputs: Point[][]): RecipeResults {
  const known = new Map<string, Result>(r.slots.map((_, i) => [`slot${i + 1}`, { kind: "series", points: inputs[i] ?? [] }]));
  // The checks (checkAnalysisRecipe) make sure every input names a Slot or an earlier step that gives a series, and
  // that each function has its parameter and its second series where it takes one.
  const seriesOf = (id: string) => (known.get(id) as Extract<Result, { kind: "series" }>).points;
  const out: RecipeResults = {};
  for (const s of r.steps) {
    const a = seriesOf(s.of);
    const res: Result =
      s.fn === "movingAverage" ? movingAverage(a, s.window!)
      : s.fn === "difference" ? difference(a)
      : s.fn === "growth" ? growth(a)
      : s.fn === "share" ? share(a, seriesOf(s.with!))
      : s.fn === "linearTrend" ? linearTrend(a)
      : s.fn === "slope" ? slope(a)
      : s.fn === "mean" ? mean(a)
      : s.fn === "standardDeviation" ? standardDeviation(a)
      : s.fn === "zScore" ? zScore(a)
      : s.fn === "seasonalIndex" ? seasonalIndex(a, s.season!)
      : correlation(a, seriesOf(s.with!));
    known.set(s.id, res);
    out[s.id] = res;
  }
  return out;
}
