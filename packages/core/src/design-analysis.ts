// A View Design's Analysis Recipe at work (spec 0024; GLOSSARY: View Design, Analysis Recipe): the recipe a design
// carries, run on the series its widget shows. The recipe's Slots are the design's first Metrics, in order, each by
// the widget's Display Period when the design offers Show by; the recipe gets those series and nothing else.
// Security: only the widget's own Metrics, as the person may see them, ever reach a recipe. Pure.
import { dayAfter, shownSeries } from "./display-periods";
import { formatNumber, formatPercent, formatValue } from "./format";
import { runRecipe, runRecipe2, type RecipeResults, type Run2 } from "./recipe-run";
import { drawnOutputs, type Output } from "./analysis-recipe";
import { DEFAULT_NUMBER_STYLE } from "./number-style";
import { RECIPE_POINTS, type RecipeInput } from "./recipe-methods";
import type { Result } from "./recipe-functions";
import type { ViewDesign } from "./view-design";
import type { CanvasData, Metric, WidgetSettings } from "./types";

/** At most this many of the latest values go into a recipe: enough for two years of weeks or ten of months, and a
 * bound on the work any recipe can ask for (spec 0024 security review). */
export const RECIPE_INPUT_POINTS = RECIPE_POINTS;

/** The series a design's recipe works on: one per recipe Slot, from the widget's Metrics in order, each its latest
 * `RECIPE_INPUT_POINTS` values. */
export function recipeInputs(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, settings: WidgetSettings) {
  const slots = design.analysis?.slots ?? [];
  const today = settings.asOf ? dayAfter(settings.asOf) : undefined;
  return slots.map((_, i) => {
    const m = metrics[i];
    if (!m) return [];
    return shownSeries(m, data, design.options?.display ? settings.display : undefined, { today }).points.slice(-RECIPE_INPUT_POINTS).map((p) => ({ period: p.period, value: p.value }));
  });
}

/** The Slots of a design's recipe as the Metrics they hold, for a recipe in format /2: each with its name, unit and the period it is shown by. */
export function recipeInputs2(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, settings: WidgetSettings): RecipeInput[] {
  const today = settings.asOf ? dayAfter(settings.asOf) : undefined;
  return (design.analysis?.slots ?? []).flatMap((_, i): RecipeInput[] => {
    const m = metrics[i];
    if (!m) return [];
    const shown = shownSeries(m, data, design.options?.display ? settings.display : undefined, { today });
    return [{ name: m.name, unit: m, period: shown.by, points: shown.points.slice(-RECIPE_INPUT_POINTS).map((p) => ({ period: p.period, value: p.value })) }];
  });
}

/** What a design's recipe gives in full, tables and Takeaways included, for a recipe in format /2; null for a design without one, or with one in /1. */
export function designRun(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today"> & Partial<Pick<CanvasData, "numberStyle">>, settings: WidgetSettings): Run2 | null {
  const a = design.analysis;
  if (!a || a.format === "ziffr.analysis/1") return null;
  // A Slot left empty (no Metric placed) is empty, so the inputs keep their places: a missing Metric is a gap, never the next Metric moved up.
  const filled = recipeInputs2(design, metrics, data, settings);
  const inputs = a.slots.map((_, i) => (metrics[i] ? filled.shift() : undefined)) as RecipeInput[];
  return runRecipe2(a, inputs, { style: data.numberStyle ?? DEFAULT_NUMBER_STYLE, yearStart: data.yearStart });
}

/** What a design's recipe gives for a widget as marks draw it (a series or one value by step), or null for a design without one. */
export function designRecipe(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, settings: WidgetSettings): RecipeResults | null {
  const a = design.analysis;
  if (!a) return null;
  if (a.format === "ziffr.analysis/1") return runRecipe(a, recipeInputs(design, metrics, data, settings));
  const run = designRun(design, metrics, data, settings)!;
  return Object.fromEntries(drawnOutputs(a).map((o) => [o.step, run.steps[o.step] as Result]));
}

/** A recipe output's number as text: in the Metric's unit and decimals, as a percentage, or as a plain number with
 * two decimals, always in the Workspace's Number Style. */
export function formatOutput(unit: Output["unit"], metric: Metric, v: number | null | undefined, style: CanvasData["numberStyle"]): string {
  if (unit === "metric") return formatValue(metric, v, style);
  if (unit === "percent") return formatPercent(v, style);
  return formatNumber(v, 2, style);
}
