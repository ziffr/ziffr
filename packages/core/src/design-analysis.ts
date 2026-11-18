// A View Design's Analysis Recipe at work (spec 0024; GLOSSARY: View Design, Analysis Recipe): the recipe a design
// carries, run on the series its widget shows. The recipe's Slots are the design's first Metrics, in order, each by
// the widget's Display Period when the design offers Show by; the recipe gets those series and nothing else.
// Security: only the widget's own Metrics, as the person may see them, ever reach a recipe. Pure.
import { dayAfter, shownSeries } from "./display-periods";
import { formatNumber, formatPercent, formatValue } from "./format";
import { runRecipe, type RecipeResults } from "./recipe-run";
import type { Output } from "./analysis-recipe";
import type { ViewDesign } from "./view-design";
import type { CanvasData, Metric, WidgetSettings } from "./types";

/** The series a design's recipe works on: one per recipe Slot, from the widget's Metrics in order. */
export function recipeInputs(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, settings: WidgetSettings) {
  const slots = design.analysis?.slots ?? [];
  const today = settings.asOf ? dayAfter(settings.asOf) : undefined;
  return slots.map((_, i) => {
    const m = metrics[i];
    if (!m) return [];
    return shownSeries(m, data, design.options?.display ? settings.display : undefined, { today }).points.map((p) => ({ period: p.period, value: p.value }));
  });
}

/** What a design's recipe gives for a widget, or null for a design without one. */
export function designRecipe(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, settings: WidgetSettings): RecipeResults | null {
  return design.analysis ? runRecipe(design.analysis, recipeInputs(design, metrics, data, settings)) : null;
}

/** A recipe output's number as text: in the Metric's unit and decimals, as a percentage, or as a plain number with
 * two decimals, always in the Workspace's Number Style. */
export function formatOutput(unit: Output["unit"], metric: Metric, v: number | null | undefined, style: CanvasData["numberStyle"]): string {
  if (unit === "metric") return formatValue(metric, v, style);
  if (unit === "percent") return formatPercent(v, style);
  return formatNumber(v, 2, style);
}
