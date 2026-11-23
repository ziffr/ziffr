// A View Design's Analysis Recipe at work (spec 0024; GLOSSARY: View Design, Analysis Recipe): the recipe a design
// carries, run on the series its widget shows. The recipe's Slots are the design's first Metrics, in order, each by
// the widget's Display Period when the design offers Show by; the recipe gets those series and nothing else.
// Security: only the widget's own Metrics, as the person may see them, ever reach a recipe. Pure.
import { dayAfter, shownSeries } from "./display-periods";
import { formatNumber, formatPercent, formatValue } from "./format";
import { PAGE_BUDGET, runRecipe, runRecipe2, WORK_BUDGET, type RecipeResults, type Run2 } from "./recipe-run";
import { sayIn } from "./takeaways/takeaway";
import { drawnOutputs, type AnalysisRecipe2, type Output } from "./analysis-recipe";
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
    return [{ meta: m, name: m.name, unit: m, period: shown.by, points: shown.points.slice(-RECIPE_INPUT_POINTS).map((p) => ({ period: p.period, value: p.value })) }];
  });
}

/** The recipe of a design with only what its marks draw: the series and values it shows, and the steps they are worked out from. A table, a
 * Takeaway or a step nothing drawn needs is left out, so drawing a widget never runs a Method for words nobody sees yet. */
export function drawnPart(a: AnalysisRecipe2): AnalysisRecipe2 {
  const drawn = drawnOutputs(a).map((o) => o.step);
  const needed = new Set<string>();
  const need = (id: string) => {
    const s = a.steps.find((x) => x.id === id);
    if (!s || needed.has(id)) return;
    needed.add(id);
    for (const src of [s.of, s.with, ...(s.controls ?? []), ...(s.drivers ?? [])]) if (src !== undefined) need(src);
  };
  drawn.forEach(need);
  return { ...a, steps: a.steps.filter((s) => needed.has(s.id)), outputs: a.outputs.filter((o) => (o.shows === "series" || o.shows === "value") && drawn.includes(o.step)) };
}

function inputsFor(design: ViewDesign, a: AnalysisRecipe2, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, settings: WidgetSettings): RecipeInput[] {
  // A Slot left empty (no Metric placed) is empty, so the inputs keep their places: a missing Metric is a gap, never the next Metric moved up.
  const filled = recipeInputs2(design, metrics, data, settings);
  return a.slots.map((_, i) => (metrics[i] ? filled.shift() : undefined)) as RecipeInput[];
}

/** What a design's recipe gives in full, tables and Takeaways included, for a recipe in format /2; null for a design without one, or with one in /1. */
export function designRun(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today"> & Partial<Pick<CanvasData, "numberStyle">>, settings: WidgetSettings): Run2 | null {
  const a = design.analysis;
  if (!a || a.format === "ziffr.analysis/1") return null;
  return runRecipe2(a, inputsFor(design, a, metrics, data, settings), { style: data.numberStyle ?? DEFAULT_NUMBER_STYLE, yearStart: data.yearStart });
}

/** What the recipes drawn on one page may still ask for, in work units: one object made for each page or render (a React context in the app)
 * and charged by every widget in the order they are drawn, so what is refused is the same every time. */
export type RecipeBudget = { left: number };

/** A fresh budget for one page. */
export const newRecipeBudget = (): RecipeBudget => ({ left: PAGE_BUDGET });

/** What a design's recipe gives for a widget as marks draw it, or why it was not worked out: the page has spent its share (`refusal`, in words),
 * or the recipe asked for too much, which the results then leave out. Only the steps the drawn outputs need are worked out, and never a Takeaway:
 * none is drawn yet. `budget` is the page's, charged by what this recipe used. */
export function drawRecipe(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, settings: WidgetSettings, budget?: RecipeBudget): { results: RecipeResults | null; refusal: string | null } {
  const a = design.analysis;
  if (!a) return { results: null, refusal: null };
  const page = () => ({ results: null, refusal: sayIn("recipe-page-too-much", {}, { style: DEFAULT_NUMBER_STYLE, yearStart: data.yearStart }) });
  if (a.format === "ziffr.analysis/1") {
    const inputs = recipeInputs(design, metrics, data, settings);
    // A recipe of the first format is linear in its series: each step costs one pass over the longest Slot.
    const used = a.steps.length * Math.max(1, ...inputs.map((i) => i.length));
    if (budget && used > budget.left) return page();
    if (budget) budget.left -= used;
    return { results: runRecipe(a, inputs), refusal: null };
  }
  const part = drawnPart(a);
  if (part.outputs.length === 0) return { results: {}, refusal: null };
  const limit = Math.min(WORK_BUDGET, budget?.left ?? WORK_BUDGET);
  if (limit <= 0) return page();
  const run = runRecipe2(part, inputsFor(design, a, metrics, data, settings), { style: DEFAULT_NUMBER_STYLE, yearStart: data.yearStart }, limit);
  if (budget) budget.left -= run.spent;
  if (run.limited && limit < WORK_BUDGET) return page();
  return { results: Object.fromEntries(drawnOutputs(a).map((o) => [o.step, run.steps[o.step] as Result])), refusal: null };
}

/** What a design's recipe gives for a widget as marks draw it (a series or one value by step), or null for a design without one or one not worked out. */
export function designRecipe(design: ViewDesign, metrics: Metric[], data: Pick<CanvasData, "metrics" | "series" | "targets" | "yearStart" | "today">, settings: WidgetSettings, budget?: RecipeBudget): RecipeResults | null {
  return drawRecipe(design, metrics, data, settings, budget).results;
}

/** A recipe output's number as text: in the Metric's unit and decimals, as a percentage, or as a plain number with
 * two decimals, always in the Workspace's Number Style. */
export function formatOutput(unit: Output["unit"], metric: Metric, v: number | null | undefined, style: CanvasData["numberStyle"]): string {
  if (unit === "metric") return formatValue(metric, v, style);
  if (unit === "percent") return formatPercent(v, style);
  return formatNumber(v, 2, style);
}
