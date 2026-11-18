// The built-in Analysis Recipes (GLOSSARY: Analysis Recipe): starting points in analysis-recipes/, checked like any
// recipe a person brings in. The forecast stays a built-in Analysis (forecast.ts): Holt's method smooths each value
// into the next, which no composition of the library's functions writes exactly (spec 0024).
import { checkAnalysisRecipeValue, type AnalysisRecipe } from "./analysis-recipe";
import movingAverage from "./analysis-recipes/moving-average.json";
import growth from "./analysis-recipes/growth.json";
import trend from "./analysis-recipes/trend.json";
import seasonality from "./analysis-recipes/seasonality.json";
import zScore from "./analysis-recipes/z-score.json";
import correlation from "./analysis-recipes/correlation.json";
import share from "./analysis-recipes/share.json";

/** The built-in recipes, by file name. */
export const RECIPES = ["moving-average", "growth", "trend", "seasonality", "z-score", "correlation", "share"] as const;
/** The name of a built-in recipe. */
export type BuiltInRecipe = (typeof RECIPES)[number];

const FILES: Record<BuiltInRecipe, unknown> = { "moving-average": movingAverage, growth, trend, seasonality, "z-score": zScore, correlation, share };

/** Each built-in recipe, checked as every recipe is: a file that does not pass stops Ziffr from starting. */
export const BUILT_IN_RECIPES: Record<BuiltInRecipe, AnalysisRecipe> = Object.fromEntries(
  RECIPES.map((id) => {
    const res = checkAnalysisRecipeValue(FILES[id]);
    if (!res.ok) throw new Error(`The built-in Analysis Recipe ${id} does not pass its checks: ${res.problems.map((p) => `${p.path} ${p.message}`).join("; ")}`);
    return [id, res.recipe];
  }),
) as Record<BuiltInRecipe, AnalysisRecipe>;
