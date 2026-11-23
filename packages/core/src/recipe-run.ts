// Running an Analysis Recipe (spec 0024, spec 0022, spec 0041; GLOSSARY: Analysis Recipe): its steps applied in order, each by
// the library's function (recipe-functions.ts, recipe-methods.ts, the Methods), to the series of its Slots and to nothing
// else, so a recipe cannot reach a Metric outside its Slots and every number it gives is one the library computed. Format
// /1 is run by `runRecipe`, format /2 by `runRecipe2`. Pure.
import { FUNCTIONS_2, type AnalysisRecipe, type AnalysisRecipe2, type Step2 } from "./analysis-recipe";
import { basisFor, changes, detrended, readSeries } from "./basis";
import { fit, type FitInput } from "./methods/fit";
import { laggedCorrelation, laggedTakeaway } from "./methods/lagged-correlation";
import { partialCorrelation, partialTakeaway } from "./methods/partial-correlation";
import { usualRange, usualRangeTakeaway } from "./methods/quantiles";
import { spearman, spearmanTakeaway } from "./methods/spearman";
import type { Span } from "./periods";
import { importanceRows, lagRows, percentile, RECIPE_POINTS, usualRows, type RecipeInput, type Result2, type TableRow } from "./recipe-methods";
import { movesTakeaway } from "./takeaways/fit-takeaway";
import { refusalTakeaway, sayIn, type Takeaway, type TakeawayContext } from "./takeaways/takeaway";
import { correlation, difference, growth, linearTrend, mean, movingAverage, seasonalIndex, share, slope, standardDeviation, zScore, type Result } from "./recipe-functions";
import type { Point } from "./types";

/** The output of a recipe, by step id, worked out by the library's functions. */
export type RecipeResults = Record<string, Result>;

/** One step of the /1 library on the series it names (`of`, and `with` where the function takes a second). */
function first(s: { fn: string; of: string; with?: string; window?: number; season?: number }, seriesOf: (id: string) => Point[]): Result {
  const a = seriesOf(s.of);
  return (
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
    : correlation(a, seriesOf(s.with!))
  );
}

/** Applies a checked recipe (checkAnalysisRecipe)'s steps to the series of its Slots, in order (`inputs[i]` fills slot i + 1), and nothing
 * else: a recipe reaches only the Metrics placed in its Slots. A Slot left empty gives empty series. */
export function runRecipe(r: AnalysisRecipe, inputs: Point[][]): RecipeResults {
  // A Slot's kind is never read (seriesOf takes its points), and every function leaves out what is not a finite value.
  // Stryker disable next-line StringLiteral,ArrayDeclaration: the kind of a Slot is never read, and a series of something that is no value is left out like an empty one
  const known = new Map<string, Result>(r.slots.map((_, i) => [`slot${i + 1}`, { kind: "series", points: inputs[i] ?? [] }]));
  // The checks (checkAnalysisRecipe) make sure every input names a Slot or an earlier step that gives a series, and
  // that each function has its parameter and its second series where it takes one.
  const seriesOf = (id: string) => (known.get(id) as Extract<Result, { kind: "series" }>).points;
  const out: RecipeResults = {};
  for (const s of r.steps) {
    const res = first(s, seriesOf);
    known.set(s.id, res);
    out[s.id] = res;
  }
  return out;
}

/** What a /2 recipe gives for each output: a series or one value with its unit, a table, or a Takeaway (written by the Method's own wording). */
export type RunOutput =
  | { shows: "series" | "value"; step: string; label: string; unit: "metric" | "percent" | "number"; result: Result }
  | { shows: "table"; step: string; label: string; rows: TableRow[] }
  | { shows: "takeaway"; step: string; label: string; takeaway: Takeaway; title?: string; note?: string };

/** A /2 recipe's run: every step's result by id, and the outputs in the order the recipe lists them. */
export type Run2 = { steps: Record<string, Result2>; outputs: RunOutput[] };

// The Method a Takeaway of each function names under Show the numbers.
const METHOD = { spearman: "numbers-method-spearman", partialCorrelation: "numbers-method-partial", laggedCorrelation: "numbers-method-lag", usualRange: "numbers-method-usual", fit: "numbers-method-fit" } as const;
const PLAIN = { unit: "", unit_position: "after", decimals: 2 } as const;

// Distinct names for what a step is given, so a fit never takes two drivers for one: a repeat is told apart by a number.
function distinct(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    let name = n;
    // A suffix may itself be a real name ("Visits (2)"): go on until the name is unused.
    for (let k = 2; used.has(name); k++) name = `${n} (${k})`;
    used.add(name);
    return name;
  });
}

/** Applies a checked /2 recipe's steps to its Slots' series, each Slot as the Metric it holds (`inputs[i]` fills slot i + 1), in order, and
 * to nothing else; at most the latest `RECIPE_POINTS` values of each Slot are used. Metrics of different periods are not compared:
 * every output then says so in words, with no number. A Method that has no result for the data gives none (null, no rows, a
 * refused fit, a refusal as the Takeaway), never a quiet number. */
export function runRecipe2(r: AnalysisRecipe2, inputs: RecipeInput[], ctx: TakeawayContext): Run2 {
  const slots = r.slots.map((s, i) => {
    const given = inputs[i];
    // Stryker disable next-line ArrayDeclaration: a Slot that was not given has no values; any element put there is no value (every function leaves out what is not finite), so the series is empty either way
    return { meta: given?.meta, name: given?.name ?? s.label, unit: given?.unit ?? PLAIN, period: given?.period ?? ("month" as Span), points: given ? readSeries(given.points).slice(-RECIPE_POINTS) : [] };
  });
  const names = distinct(slots.map((s) => s.name));
  const filled = slots.filter((s) => s.points.length > 0);
  const span: Span = filled[0]?.period ?? "month";
  const mixed = filled.some((s) => s.period !== span);
  // Stryker disable next-line StringLiteral: the kind of a Slot is never read (seriesOf takes its points)
  const known = new Map<string, Result2>(slots.map((s, i) => [`slot${i + 1}`, { kind: "series", points: s.points }]));
  const slotAt = new Map(slots.map((_, i) => [`slot${i + 1}`, i]));
  const nameOf = (id: string) => {
    const i = slotAt.get(id);
    return i === undefined ? id : names[i];
  };
  const seriesOf = (id: string) => (known.get(id) as Extract<Result2, { kind: "series" }>).points;
  const refusal = () => sayIn("recipe-mixed-periods", { names: names.join(", ") }, ctx);
  const steps: Record<string, Result2> = {};
  for (const s of r.steps) {
    const res = mixed ? emptyResult(s, names) : step2(s, seriesOf, known, nameOf, (id) => { const i = slotAt.get(id); return i === undefined ? undefined : slots[i].meta; }, span, ctx);
    known.set(s.id, res);
    steps[s.id] = res;
  }
  const outputs = r.outputs.map((o): RunOutput => {
    const s = r.steps.find((x) => x.id === o.step)!;
    const res = steps[s.id];
    if (o.shows === "takeaway") {
      const takeaway = mixed ? refusalTakeaway(sayIn(METHOD[s.fn as keyof typeof METHOD], {}, ctx), [refusal()]) : takeawayOf(s, steps, slots, names, span, ctx);
      return { shows: "takeaway", step: o.step, label: o.label, takeaway, ...(o.title !== undefined ? { title: o.title } : {}), ...(o.note !== undefined ? { note: o.note } : {}) };
    }
    if (o.shows === "table") return { shows: "table", step: o.step, label: o.label, rows: (res as { rows: TableRow[] }).rows };
    return { shows: o.shows, step: o.step, label: o.label, unit: o.unit!, result: res as Result };
  });
  return { steps, outputs };
}

// What a step gives when there is nothing to work on: no values, no rows, a refused fit.
function emptyResult(s: Step2, names: string[]): Result2 {
  const gives = FUNCTIONS_2[s.fn].gives;
  if (gives === "series") return { kind: "series", points: [] };
  if (gives === "value") return { kind: "value", value: null };
  if (gives === "table") return { kind: "table", rows: [] };
  return { kind: "model", input: { target: { name: "", points: [] }, drivers: [], span: "month" }, fit: { ok: false, refusals: [{ case: "recipe-mixed-periods", slots: { names: names.join(", ") } }] } };
}

function step2(s: Step2, seriesOf: (id: string) => Point[], known: Map<string, Result2>, nameOf: (id: string) => string, meta: (id: string) => RecipeInput["meta"], span: Span, ctx: TakeawayContext): Result2 {
  const a = () => seriesOf(s.of);
  const b = () => seriesOf(s.with!);
  const value = (v: number | undefined): Result2 => ({ kind: "value", value: Number.isFinite(v) ? (v as number) : null });
  switch (s.fn) {
    // A change too large to be a number (the gap between 1e308 and −1e308) is left out, as every function of the library leaves out what is not finite.
    case "changes": return { kind: "series", points: changes(a(), span).filter((p) => Number.isFinite(p.value)) };
    case "detrended": return { kind: "series", points: detrended(a(), span).filter((p) => Number.isFinite(p.value)) };
    case "spearman": return value(spearman(a(), b())?.rho);
    case "partialCorrelation": {
      const found = partialCorrelation(a(), b(), s.controls!.map(seriesOf));
      return value(found.ok ? found.r : undefined);
    }
    case "laggedCorrelation": return { kind: "table", rows: lagRows(laggedCorrelation(a(), b(), span, s.maxLag!), span, ctx) };
    case "usualRange": return { kind: "table", rows: usualRows(usualRange(a(), span), ctx) };
    case "quantile": return percentile(a(), s.percent!);
    case "fit": {
      const named = distinct([s.of, ...s.drivers!].map(nameOf));
      // Where every series is a Slot's Metric, the fit is told what they are, so it refuses a Metric built from another or of mixed periods as "What moves B?" does.
      const metas = [s.of, ...s.drivers!].map((id) => meta(id));
      const input: FitInput = { target: { name: named[0], points: a() }, drivers: s.drivers!.map((d, i) => ({ name: named[i + 1], points: seriesOf(d) })), span, ...(metas.every((m) => m) ? { metrics: metas.map((m, i) => ({ ...m!, name: named[i] })) } : {}) };
      return { kind: "model", input, fit: fit(input) };
    }
    case "importance": return { kind: "table", rows: importanceRows((known.get(s.of) as Extract<Result2, { kind: "model" }>).fit) };
    default: return first(s, seriesOf);
  }
}

// The Takeaway of a step's Method, written by the Method's own wording from the Slots it works on (the checks make sure they are Slots).
function takeawayOf(s: Step2, steps: Record<string, Result2>, slots: { name: string; unit: RecipeInput["unit"]; points: Point[] }[], names: string[], span: Span, ctx: TakeawayContext): Takeaway {
  const at = (id: string) => Number(id.slice(4)) - 1;
  const [x, y] = [slots[at(s.of)], s.with ? slots[at(s.with)] : undefined];
  // The basis a pair is compared on is the rule's (basisFor), as everywhere: by change where both grow.
  const pair = () => {
    const basis = basisFor(x.points, y!.points, span);
    return { basis, a: basis === "changes" ? changes(x.points, span) : x.points, b: basis === "changes" ? changes(y!.points, span) : y!.points };
  };
  switch (s.fn) {
    case "spearman": { const p = pair(); return spearmanTakeaway(names[at(s.of)], names[at(s.with!)], p.a, p.b, span, p.basis, ctx); }
    case "laggedCorrelation": { const p = pair(); return laggedTakeaway(names[at(s.of)], names[at(s.with!)], p.a, p.b, span, p.basis, ctx); }
    case "partialCorrelation": return partialTakeaway({ a: names[at(s.of)], b: names[at(s.with!)], held: s.controls!.map((c) => names[at(c)]) }, x.points, y!.points, s.controls!.map((c) => slots[at(c)].points), span, ctx);
    case "usualRange": return usualRangeTakeaway(names[at(s.of)], x.points, span, x.unit, ctx);
    default: {
      // Only a fit is left: its Takeaway is "What moves B?" on the target and the drivers as given.
      // The names are the ones the fit was made with (told apart), so each driver is found by its name.
      const model = steps[s.id] as Extract<Result2, { kind: "model" }>;
      const drivers = s.drivers!.map((d, i) => ({ ...slots[at(d)].unit, name: model.input.drivers[i].name }));
      return movesTakeaway({ ...x.unit, name: model.input.target.name }, drivers, model.fit, ctx);
    }
  }
}
