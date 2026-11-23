// Running an Analysis Recipe (spec 0024, spec 0022, spec 0041; GLOSSARY: Analysis Recipe): its steps applied in order, each by
// the library's function (recipe-functions.ts, recipe-methods.ts, the Methods), to the series of its Slots and to nothing
// else, so a recipe cannot reach a Metric outside its Slots and every number it gives is one the library computed. Format
// /1 is run by `runRecipe`, format /2 by `runRecipe2`. Pure.
import { FUNCTIONS_2, type AnalysisRecipe, type AnalysisRecipe2, type Step2 } from "./analysis-recipe";
import { basisFor, basisText, changes, detrended, readSeries, type Basis } from "./basis";
import { fractionOf } from "./exact";
import { fit, type FitInput } from "./methods/fit";
import { laggedCorrelation, laggedTakeaway } from "./methods/lagged-correlation";
import { partialCorrelation, partialTakeaway } from "./methods/partial-correlation";
import { usualRange, usualRangeTakeaway } from "./methods/quantiles";
import { spearman, spearmanTakeaway } from "./methods/spearman";
import type { Span } from "./periods";
import { bridgeRows, effectRows, importanceRows, lagRows, percentile, RECIPE_POINTS, usualRows, type RecipeInput, type Result2, type TableRow } from "./recipe-methods";
import { movesTakeaway } from "./takeaways/fit-takeaway";
import { refusalTakeaway, sayIn, type Takeaway, type TakeawayContext } from "./takeaways/takeaway";
import type { Finding } from "./suitability";
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
  | { shows: "series" | "value"; step: string; label: string; unit: "metric" | "percent" | "number"; result: Result; basis?: string; refusal?: string }
  | { shows: "table"; step: string; label: string; rows: TableRow[]; basis?: string; refusal?: string }
  | { shows: "takeaway"; step: string; label: string; takeaway: Takeaway; title?: string; note?: string };

/** A /2 recipe's run: every step's result by id, and the outputs in the order the recipe lists them. */
export type Run2 = { steps: Record<string, Result2>; outputs: RunOutput[]; /** The work units this run used, at most its limit. */ spent: number; /** Whether the limit stopped it. */ limited: boolean };

// The Method a Takeaway of each function names under Show the numbers.
const METHOD = { spearman: "numbers-method-spearman", partialCorrelation: "numbers-method-partial", laggedCorrelation: "numbers-method-lag", usualRange: "numbers-method-usual", fit: "numbers-method-fit" } as const;
const PLAIN = { unit: "", unit_position: "after", decimals: 2 } as const;

/** The most decimal places a value of a recipe may need, and its largest size: beyond them the exact arithmetic of the steps (BigInt sums
 * of every value at one scale) grows without a bound that is worth its answer, and the recipe says so instead. */
export const MOST_PLACES = 20;
/** The largest absolute value a series of a recipe may hold, a Slot's or what a step made of one (the API's own limit for a Metric's value is 1e15). */
export const MOST_SIZE = 1e20;
/** The widest spread between the largest and the smallest value that is not 0 in one series. */
export const MOST_SPREAD = 1e20;
/** The work one recipe may ask for in one run, in work units: a unit is about 10 microseconds of one core (measured, see docs/guides/analysis-recipes.md),
 * so 12,000 units are about 120 ms. Units are counted from the steps and the series' length alone, never the clock, so the same recipe on the same
 * data stops at the same step on every machine. */
export const WORK_BUDGET = 12_000;
/** The work all the recipes drawn on one page may ask for together (a dashboard, a View Link, a Snapshot): about half a second. */
export const PAGE_BUDGET = 50_000;

/** Whether a series is beyond what the steps work out exactly in a fair time: a value that is not a number, more than `MOST_PLACES` decimal
 * places, or above `MOST_SIZE`. Held to every series, those of the Slots and those a step makes (a difference of two admitted values, a
 * z-score of small ones, a line's misses), so that no step reads what another could not. */
export function tooWide(points: Point[]): boolean {
  if (points.some((p) => !Number.isFinite(p.value) || Math.abs(p.value) > MOST_SIZE || fractionOf(p.value).den.toString().length - 1 > MOST_PLACES)) return true;
  // The spread: the largest value over the smallest that is not 0 may not pass `MOST_SPREAD` (1e20 beside 1e-4 needs 24 digits at one scale).
  // A series of 0 only has no sizes: its largest over its smallest is not a number, which is not above the limit.
  const sizes = points.map((p) => Math.abs(p.value)).filter((v) => v > 0);
  return Math.max(...sizes) / Math.min(...sizes) > MOST_SPREAD;
}

// How wide the numbers are, as digits at one scale: the most decimal places any value needs and the digits before the point of the largest. The
// exact arithmetic of the steps costs more than in proportion to this (BigInt products of every pair), so work units are scaled by it.
function digitsOf(points: Point[]): number {
  let places = 0;
  let largest = 0;
  for (const p of points) {
    places = Math.max(places, fractionOf(p.value).den.toString().length - 1);
    largest = Math.max(largest, Math.abs(p.value));
  }
  return places + Math.max(1, Math.floor(Math.log10(Math.max(largest, 1))) + 1);
}
/** The factor, over series of 6 digits or fewer (a 2-place value in the thousands is 6), by which the work grows with the width of the numbers: (digits ÷ 6)², as a pair. */
const widthOf = (digits: number): number => Math.max(36, digits * digits);

// What a step asks for, in work units (10 microseconds each, measured on every kind: docs/guides/analysis-recipes.md); n is the longest Slot.
function cost(s: Step2, n: number, width: number): number {
  const base = s.fn === "fit" ? (n * (s.drivers!.length + 1) ** 2 * 3) / 2 : s.fn === "partialCorrelation" ? (n * (s.controls!.length + 2) * 3) / 2 : s.fn === "laggedCorrelation" ? n * (s.maxLag! + 2) : s.fn === "detrended" ? 5 * n : s.fn === "spearman" ? 2 * n : n;
  return Math.ceil((base * width) / 36);
}
// What a Takeaway asks for, in the same units: the Method's suitability checks and wording run on top of the step. The usual range's checks
// (far-off values by leaving values out) are the dearest, about 100 ms on 120 values.
function takeawayCost(s: Step2, n: number, width: number): number {
  // Its checks run on the pairs of every series held fixed, so a partial correlation's cost grows with the square of the series it weighs.
  const base = s.fn === "fit" ? 10 * n : s.fn === "laggedCorrelation" ? 55 * n : s.fn === "partialCorrelation" ? 9 * n * (s.controls!.length + 1) ** 2 : s.fn === "usualRange" ? 83 * n : 5 * n;
  return Math.ceil((base * width) / 36);
}

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
export function runRecipe2(r: AnalysisRecipe2, inputs: RecipeInput[], ctx: TakeawayContext, limit: number = WORK_BUDGET): Run2 {
  const slots = r.slots.map((s, i) => {
    const given = inputs[i];
    // Stryker disable next-line ArrayDeclaration: a Slot that was not given has no values; any element put there is no value (every function leaves out what is not finite), so the series is empty either way
    return { meta: given?.meta, name: given?.name ?? s.label, unit: given?.unit ?? PLAIN, period: given?.period ?? ("month" as Span), points: given ? readSeries(given.points).slice(-RECIPE_POINTS) : [] };
  });
  const names = distinct(slots.map((s) => s.name));
  const filled = slots.filter((s) => s.points.length > 0);
  const span: Span = filled[0]?.period ?? "month";
  const names2 = names.join(", ");
  // Why nothing is worked out, in words: Metrics of different periods, or values the exact arithmetic should not be asked for.
  const stop: Finding | null = filled.some((s) => s.period !== span) ? { case: "recipe-mixed-periods", slots: { names: names2 } } : filled.some((s) => tooWide(s.points)) ? { case: "recipe-too-wide", slots: { names: names2 } } : null;
  const longest = Math.max(1, ...slots.map((s) => s.points.length));
  // The widest numbers any series has so far, Slots' or made by a step: the cost of every step after is scaled by it.
  let width = widthOf(Math.max(...slots.map((s) => digitsOf(s.points))));
  let spent = 0;
  // A limit below the recipe's own is the page's share: the words say the page asks for too much, not the recipe.
  const tooMuch: Finding = { case: limit < WORK_BUDGET ? "recipe-page-too-much" : "recipe-too-much", slots: { names: names2 } };
  // Stryker disable next-line StringLiteral: the kind of a Slot is never read (seriesOf takes its points)
  const known = new Map<string, Result2>(slots.map((s, i) => [`slot${i + 1}`, { kind: "series", points: s.points }]));
  const slotAt = new Map(slots.map((_, i) => [`slot${i + 1}`, i]));
  const nameOf = (id: string) => {
    const i = slotAt.get(id);
    return i === undefined ? id : names[i];
  };
  const seriesOf = (id: string) => (known.get(id) as Extract<Result2, { kind: "series" }>).points;
  const refusal = (f: Finding) => sayIn(f.case, f.slots, ctx);
  const steps: Record<string, Result2> = {};
  const bases: Record<string, Basis> = {};
  // Why a step has no result, in words: what stops the whole run, or the work spent, or an input that was too wide to read.
  const refused: Record<string, Finding> = {};
  const wide: Finding = { case: "recipe-too-wide", slots: { names: names2 } };
  for (const s of r.steps) {
    // Stryker disable next-line ArrayDeclaration: a step without controls or drivers names none; an id put there is no refused step, so nothing changes
    const inputs = [s.of, s.with ?? s.of, ...(s.controls ?? []), ...(s.drivers ?? []), ...(s.parts ?? [])];
    // A step that reads a refused series does no work, so it is not charged; it is refused for the reason that series was.
    const blocked = inputs.some((id) => id in refused);
    if (!blocked) spent += cost(s, longest, width);
    const why = stop ?? (blocked ? wide : null) ?? (spent > limit ? tooMuch : null);
    let res = why ? emptyResult(s, why) : step2(s, seriesOf, known, nameOf, (id) => { const i = slotAt.get(id); return i === undefined ? undefined : slots[i].meta; }, span, ctx, (b) => (bases[s.id] = b));
    let found = why;
    // What a step makes is held to the same limits as what it was given.
    if (!found && res.kind === "series" && tooWide(res.points)) {
      found = wide;
      res = emptyResult(s, wide);
    }
    if (found) refused[s.id] = found;
    else if (res.kind === "series") width = Math.max(width, widthOf(digitsOf(res.points)));
    known.set(s.id, res);
    steps[s.id] = res;
  }
  const reason = (id: string) => (id in refused ? { refusal: refusal(refused[id]) } : {});
  const outputs = r.outputs.map((o): RunOutput => {
    const s = r.steps.find((x) => x.id === o.step)!;
    const res = steps[s.id];
    if (o.shows === "takeaway") {
      spent += takeawayCost(s, longest, width);
      const w = stop ?? (spent > limit ? tooMuch : null);
      const takeaway = w ? refusalTakeaway(sayIn(METHOD[s.fn as keyof typeof METHOD], {}, ctx), [refusal(w)]) : takeawayOf(s, steps, slots, names, span, ctx);
      return { shows: "takeaway", step: o.step, label: o.label, takeaway, ...(o.title !== undefined ? { title: o.title } : {}), ...(o.note !== undefined ? { note: o.note } : {}) };
    }
    if (o.shows === "table") return { shows: "table", step: o.step, label: o.label, rows: (res as { rows: TableRow[] }).rows, ...(bases[s.id] ? { basis: basisText(bases[s.id]) } : {}), ...(!(s.id in refused) && (res as { refusal?: string }).refusal ? { refusal: (res as { refusal: string }).refusal } : {}), ...reason(s.id) };
    return { shows: o.shows, step: o.step, label: o.label, unit: o.unit!, result: res as Result, ...(bases[s.id] ? { basis: basisText(bases[s.id]) } : {}), ...reason(s.id) };
  });
  return { steps, outputs, spent: Math.min(spent, limit), limited: spent > limit };
}

// What a step gives when there is nothing to work on: no values, no rows, a refused fit.
function emptyResult(s: Step2, why: Finding): Result2 {
  const gives = FUNCTIONS_2[s.fn].gives;
  if (gives === "series") return { kind: "series", points: [] };
  if (gives === "value") return { kind: "value", value: null };
  if (gives === "table") return { kind: "table", rows: [] };
  return { kind: "model", input: { target: { name: "", points: [] }, drivers: [], span: "month" }, fit: { ok: false, refusals: [why] } };
}

function step2(s: Step2, seriesOf: (id: string) => Point[], known: Map<string, Result2>, nameOf: (id: string) => string, meta: (id: string) => RecipeInput["meta"], span: Span, ctx: TakeawayContext, basisUsed: (b: Basis) => void): Result2 {
  const a = () => seriesOf(s.of);
  const b = () => seriesOf(s.with!);
  const value = (v: number | undefined): Result2 => ({ kind: "value", value: Number.isFinite(v) ? (v as number) : null });
  switch (s.fn) {
    // Values are held to MOST_SIZE before any step runs, so a change or a miss from a line is always a number.
    case "changes": return { kind: "series", points: changes(a(), span) };
    case "detrended": return { kind: "series", points: detrended(a(), span) };
    // Two series are compared on the basis the rule gives (by change where both grow), the one the Takeaway of the same step uses; the output says which.
    case "spearman": { const p = pairOn(a(), b(), span); basisUsed(p.basis); return value(spearman(p.a, p.b)?.rho); }
    case "partialCorrelation": {
      const found = partialCorrelation(a(), b(), s.controls!.map(seriesOf));
      return value(found.ok ? found.r : undefined);
    }
    case "laggedCorrelation": { const p = pairOn(a(), b(), span); basisUsed(p.basis); return { kind: "table", rows: lagRows(laggedCorrelation(p.a, p.b, span, s.maxLag!), span, ctx) }; }
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
    case "effects": {
      // Where the fit was refused, the table says why in the fit's own words.
      const f = (known.get(s.of) as Extract<Result2, { kind: "model" }>).fit;
      return { kind: "table", rows: effectRows(f), ...(f.ok ? {} : { refusal: sayIn(f.refusals[0].case, f.refusals[0].slots, ctx) }) };
    }
    // The whole and its parts are Slots (the checks), so each is named by its Metric.
    case "bridge": return { kind: "table", ...bridgeRows({ name: nameOf(s.of), points: a() }, s.parts!.map((id) => ({ name: nameOf(id), points: seriesOf(id) })), span, ctx) };
    default: return first(s, seriesOf);
  }
}

// The basis a pair is compared on is the rule's (basisFor), as everywhere: by change where both grow. Steps and Takeaways share it.
function pairOn(a: Point[], b: Point[], span: Span): { basis: Basis; a: Point[]; b: Point[] } {
  const basis = basisFor(a, b, span);
  return { basis, a: basis === "changes" ? changes(a, span) : a, b: basis === "changes" ? changes(b, span) : b };
}

// The Takeaway of a step's Method, written by the Method's own wording from the Slots it works on (the checks make sure they are Slots).
function takeawayOf(s: Step2, steps: Record<string, Result2>, slots: { name: string; unit: RecipeInput["unit"]; points: Point[] }[], names: string[], span: Span, ctx: TakeawayContext): Takeaway {
  const at = (id: string) => Number(id.slice(4)) - 1;
  const [x, y] = [slots[at(s.of)], s.with ? slots[at(s.with)] : undefined];
  const pair = () => pairOn(x.points, y!.points, span);
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
