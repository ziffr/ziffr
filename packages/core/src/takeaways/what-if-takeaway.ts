// The Takeaway of a what-if chain and the Recipe "What if A changes?" (GLOSSARY: Takeaway, Recipe; spec 0041, ticket 5). The Method
// (methods/what-if.ts) gives the change in each Metric reached, worked out from a Derived Metric's formula or estimated from a fit, with
// a range for what is estimated; this writes it in the Metrics' own words and units, and keeps the two apart in the sentence and in each
// row (the data for the picture): "worked out from its formula" has no range, "estimated" has "likely between", and a value outside what
// a Metric has been is only a point with "treat it as a guess". A what-if estimates what has gone together: it never reads as a promise
// or a cause. A refusal carries no number. Pure.
//
// What is held to here: the number in a sentence is the Method's number written in the Metric's unit (at least two significant digits,
// never a number above 0 written as 0, a sign never lost: the direction is a word); a range only where the Method gives one;
// nothing stronger than "moderate" with a caution; the footer once, and only where something is estimated; a Metric that is not
// in the list given (one the person may not see) is never named, used or counted.
import { formulaInputs, inputsProblem, usesPrevious } from "../formula";
import { MIN_PAIRS } from "../correlation";
import { changes } from "../basis";
import { formatNumber } from "../format";
import { fit, type Fit } from "../methods/fit";
import { MOST_METRICS, MOST_STEPS, planOf, whatIf, type NotReached, type Reached, type WhatIf, type WhatIfChange, type WhatIfLink } from "../methods/what-if";
import type { Span } from "../periods";
import type { Resolver } from "../display-periods";
import type { Metric, Point } from "../types";
import { withWork, WORK_BUDGET } from "../work-bound";
import type { StrengthWord } from "./strength";
import { lines, onCommon, outsideText, written, type FitRecipeOptions } from "./fit-takeaway";
import { answerTakeaway, footerText, listOf, refusalTakeaway, wideRefusal, sayIn, strengthWordIn, type Figure, type NumberRow, type Takeaway, type TakeawayContext } from "./takeaway";
import type { CaseKey, Slots } from "./wording";

/** What a row of the picture is: a value worked out from a formula (no range), estimated with a range, estimated with only a point
 * (outside what was seen: a guess), one whose direction cannot be told from chance, or one nothing can be said of. */
export type WhatIfKind = "worked-out" | "estimated" | "guess" | "unclear" | "refused";

/** One Metric a change reaches, in the numbers the picture draws (a bar, with a band only where estimated) and the sentence it is said in. */
export type WhatIfRow = {
  name: string;
  step: 1 | 2;
  kind: WhatIfKind;
  /** The change in the Metric and its "likely between" range, in its own unit; null where nothing is said of the size. */
  effect: number | null;
  lo: number | null;
  hi: number | null;
  strength: StrengthWord | null;
  strengthText: string | null;
  /** The Metrics of the first step the change came through. */
  through: string[];
  sentence: string;
};
/** A what-if's Takeaway with a row for each Metric reached. */
export type WhatIfTakeaway = Takeaway & { rows: WhatIfRow[] };

const text = (k: CaseKey, ctx: TakeawayContext, slots: Slots = {}) => sayIn(k, slots, ctx);
const figure = (label: string, value: number, shown: string): Figure => ({ label, value, text: shown });
const WEAKEST: readonly StrengthWord[] = ["cant-tell", "weak", "moderate", "strong"];

/** The Takeaway of a what-if worked out by `whatIf`. `metrics` are the Metrics named in it (the one changed, those reached, those the
 * change went through) and `fits` the fits of its links, for what it was compared on. */
export function whatIfTakeaway(start: Metric, metrics: Metric[], result: WhatIf, fits: Fit[], ctx: TakeawayContext): WhatIfTakeaway {
  const method = text("numbers-method-what-if", ctx);
  if (!result.ok) return { ...refusalTakeaway(method, lines({ refusals: result.refusals, cautions: [], switches: [] }, ctx).refusals), rows: [] };
  const known = (name: string) => (name === start.name ? start : metrics.find((m) => m.name === name));
  // A Metric that is not among those given is never written in another Metric's unit: nothing is said.
  // Names in the lines a verdict or a refusal carries count too: nothing is written about a Metric that was not given.
  const inSlots = (f: { slots: Record<string, unknown> }) => [...(typeof f.slots.name === "string" ? [f.slots.name] : []), ...(typeof f.slots.names === "string" ? f.slots.names.split(", ") : [])];
  const named = result.reached.flatMap((r) => (r.ok ? [r.name, ...r.through, ...r.outside.map((o) => o.name), ...r.beyond.map((o) => o.name), ...r.verdict.cautions.flatMap(inSlots), ...r.merged.flatMap((g) => [g.kept, ...g.with])] : [r.name, ...inSlots(r.refusal)]));
  if (named.some((n) => known(n) === undefined)) return { ...refusalTakeaway(method, [text("refuse-input", ctx, { what: "the Metrics" })]), rows: [] };
  const metricOf = (name: string) => known(name)!;
  const span = (result.span ?? start.period) as Span;
  const figures: Figure[] = [];
  const numbers: NumberRow[] = [{ label: text("numbers-method", ctx), text: method }];
  const startText = written(start, Math.abs(result.by), ctx);
  if (!legible(start, [Math.abs(result.by)], ctx)) return { ...refusalTakeaway(method, [`${start.name}: ${text("refuse-what-if-small", ctx)}`]), rows: [] };
  figures.push(figure(start.name, Math.abs(result.by), startText));
  // Stryker disable next-line EqualityOperator: the change is never exactly 0 (`whatIf` refuses it), so `>` and `>=` say the same
  numbers.push({ label: text("numbers-change-in", ctx, { name: start.name }), text: `${text(result.by > 0 ? "whatif-goes-up" : "whatif-goes-down", ctx)} ${startText}` });
  const cautions: string[] = [];
  const rows: WhatIfRow[] = result.reached.map((r): WhatIfRow => {
    if (!r.ok) return refusedRow(r, lines({ refusals: [r.refusal], cautions: [], switches: [] }, ctx).refusals[0]);
    const m = metricOf(r.name);
    const through = r.through.length > 0 ? text("whatif-through", ctx, { names: listOf(r.through, ctx) }) : "";
    const base = { name: r.name, step: r.step, through: r.through };
    const kindText = text(r.exact ? "numbers-kind-worked" : "numbers-kind-estimated", ctx);
    numbers.push({ label: text("numbers-kind-on", ctx, { name: r.name }), text: kindText });
    if (r.exact) {
      // Stryker disable next-line EqualityOperator: this value is never exactly 0 here, so `>` and `>=` say the same
      const moves = text(r.effect > 0 ? "whatif-goes-up" : "whatif-goes-down", ctx);
      const shown = written(m, Math.abs(r.effect), ctx);
      if (!legible(m, [Math.abs(r.effect)], ctx)) return refusedRow({ name: r.name, step: r.step }, text("refuse-what-if-small", ctx));
      if (r.effect === 0) numbers.push({ label: text("numbers-effect-on", ctx, { name: r.name }), text: text("whatif-end-none", ctx) });
      else numbers.push({ label: text("numbers-effect-on", ctx, { name: r.name }), text: `${moves} ${shown}` });
      if (r.effect === 0) return { ...base, kind: "worked-out", effect: 0, lo: null, hi: null, strength: null, strengthText: null, sentence: text("whatif-row-worked-same", ctx, { name: r.name }) };
      figures.push(figure(r.name, Math.abs(r.effect), shown));
      return { ...base, kind: "worked-out", effect: r.effect, lo: null, hi: null, strength: null, strengthText: null, sentence: text("whatif-row-worked", ctx, { name: r.name, moves, effect: shown }) };
    }
    const lowest = r.strength ?? "cant-tell";
    const strengthText = strengthWordIn(lowest, ctx);
    cautions.push(...lines(r.verdict, ctx).cautions);
    numbers.push({ label: text("numbers-rests-on", ctx, { name: r.name }), text: formatNumber(r.coefficients, 0, ctx.style) });
    // Strong links whose effects cancel are said as that, with the range; a link that cannot be told from chance is said as that.
    if (lowest !== "cant-tell" && r.effect === 0) return { ...base, kind: "estimated", effect: 0, lo: r.lo, hi: r.hi, strength: lowest, strengthText, sentence: text("whatif-row-cancel", ctx, { name: r.name, through }) };
    if (lowest === "cant-tell") return { ...base, kind: "unclear", effect: null, lo: null, hi: null, strength: "cant-tell", strengthText: strengthWordIn("cant-tell", ctx), sentence: text("whatif-row-unclear", ctx, { name: r.name, start: start.name, through }) };
    // Stryker disable next-line EqualityOperator: an estimated effect of exactly 0 is said as cancelling before this
    const moves = text(r.effect > 0 ? "whatif-go-up" : "whatif-go-down", ctx);
    const [lo, hi] = [r.lo, r.hi];
    // The range is there or not as a whole.
    // Stryker disable next-line ConditionalExpression: a null end counted as 0 is left out when the digits are chosen (zeros are), so the digits are the same
    const like = [Math.abs(r.effect), ...(lo === null ? [] : [Math.abs(lo), Math.abs(hi!)])];
    // Numbers that cannot be told from 0 or from each other in 15 places are not written: the row says so instead.
    if (!legible(m, like, ctx)) return refusedRow({ name: r.name, step: r.step }, text("refuse-what-if-small", ctx));
    const shown = written(m, Math.abs(r.effect), ctx, like);
    figures.push(figure(r.name, Math.abs(r.effect), shown));
    // Stryker disable next-line EqualityOperator: this value is never exactly 0 here, so `>` and `>=` say the same
    numbers.push({ label: text("numbers-effect-on", ctx, { name: r.name }), text: `${text(r.effect > 0 ? "whatif-goes-up" : "whatif-goes-down", ctx)} ${shown}` });
    if (lo === null) {
      // Every driver that was outside is said, each with the edge of what was seen, the sign it has (a limit is a level, which may be below 0).
      const uniq = (os: Reached["outside"]) => os.filter((o, i) => os.findIndex((x) => x.name === o.name && x.side === o.side && x.limit === o.limit) === i);
      const [outs, beyonds] = [uniq(r.outside), uniq(r.beyond)];
      const limitOf = (o: Reached["outside"][number]) => (o.change ? Math.abs(o.limit) : o.limit);
      const kinds = beyonds.map((o) => (o.change ? (o.side === "above" ? "whatif-beyond-rise" : "whatif-beyond-fall") : o.side === "above" ? "whatif-beyond-above" : "whatif-beyond-below") as CaseKey);
      const outside = [...outs.map((o) => outsideText(o, metricOf(o.name), span, ctx)), ...beyonds.map((o, i) => text(kinds[i], ctx, { name: o.name, limit: written(metricOf(o.name), limitOf(o), ctx), span }))].join(". ");
      for (const o of [...outs, ...beyonds]) figures.push(figure(o.name, limitOf(o), written(metricOf(o.name), limitOf(o), ctx)));
      if (r.noRange) return { ...base, kind: "guess", effect: r.effect, lo: null, hi: null, strength: lowest, strengthText, sentence: text("whatif-row-norange", ctx, { name: r.name, moves, effect: shown, through }) };
      return { ...base, kind: "guess", effect: r.effect, lo: null, hi: null, strength: lowest, strengthText, sentence: text("whatif-row-guess", ctx, { name: r.name, moves, effect: shown, through, outside }) };
    }
    const top = hi as number;
    // Where the range reaches 0 or crosses it, each end says which way it goes; else both are sizes in the direction of the effect.
    // Stryker disable next-line ArithmeticOperator: a quotient and a product of the two ends have the same sign wherever the ends are not both 0, and an effect that is not 0 has a range that is not 0 to 0
    const crossing = lo * top <= 0;
    const mag = [Math.abs(lo), Math.abs(top)].sort((a, b) => a - b);
    // Stryker disable next-line EqualityOperator: the end is not 0 here (`v === 0` is the line before)
    const end = (v: number) => (v === 0 ? text("whatif-end-none", ctx) : text(v > 0 ? "whatif-end-up" : "whatif-end-down", ctx, { amount: written(m, Math.abs(v), ctx, like) }));
    const [loText, hiText] = crossing ? [end(lo), end(top)] : [written(m, mag[0], ctx, like), written(m, mag[1], ctx, like)];
    // A range that reaches or crosses 0 keeps the sign of each end in its figure, with the words the sentence uses.
    for (const v of crossing ? [lo, top].filter((v) => v !== 0) : mag) figures.push(figure(`${r.name} ${text("numbers-range", ctx)}`, crossing ? v : Math.abs(v), crossing ? end(v) : written(m, Math.abs(v), ctx, like)));
    numbers.push({ label: text("numbers-range-on", ctx, { name: r.name }), text: `${loText} – ${hiText}` });
    return { ...base, kind: "estimated", effect: r.effect, lo, hi: top, strength: lowest, strengthText, sentence: text("whatif-row-range", ctx, { name: r.name, moves, effect: shown, lo: loText, hi: hiText, through }) };
  });
  const said = rows.filter((r) => r.kind !== "refused");
  if (said.length === 0) return { ...refusalTakeaway(method, rows.map((r) => r.sentence)), rows };
  const first = said.slice(0, 3).map((r) => r.sentence);
  const more = said.length - first.length;
  const estimated = result.reached.filter((r): r is Reached => r.ok && !r.exact);
  // "Next month" belongs on the headline only where every estimated link counts a change; else it is said once as an assumption.
  const byChange = estimated.filter((r) => r.byChange).length;
  const allByChange = byChange === estimated.length && result.reached.every((r) => r.ok && !r.exact);
  // Stryker disable next-line EqualityOperator: this value is never exactly 0 here, so `>` and `>=` say the same
  // Stryker disable next-line ConditionalExpression,StringLiteral: the percent is written only for the percent headline, so a 0 written where there is none is never read
  const slots = { start: start.name, goes: text(result.by > 0 ? "whatif-goes-up" : "whatif-goes-down", ctx), by: startText, when: allByChange ? text("whatif-when-next", ctx, { span }) : "", pct: result.percent === null ? "" : formatNumber(Math.abs(result.percent), percentDigits(Math.abs(result.percent)), ctx.style) };
  const headline = text(result.percent === null ? "whatif-headline" : "whatif-headline-percent", ctx, slots);
  if (result.percent !== null && !/[1-9]/.test(slots.pct)) return { ...refusalTakeaway(method, [`${start.name}: ${text("refuse-what-if-small", ctx)}`]), rows: [] };
  if (result.percent !== null) figures.push(figure(`${start.name} %`, Math.abs(result.percent), slots.pct));
  // The weakest of every estimated row, one that cannot be told from chance included.
  const strength = WEAKEST.find((w) => rows.some((r) => r.strength === w)) ?? null;
  const modes = new Set(fits.map((f) => f.basis));
  const basis = fits.length === 0 ? null : modes.size > 1 ? text("basis-what-if-mixed", ctx) : text(fits[0].basis === "changes" ? "basis-changes" : "basis-values", ctx);
  const distinct = [...new Set(cautions)];
  // Drivers a fit treated as one are said, once each, in the words of the fits.
  const merged = [...new Map(result.reached.flatMap((r) => (r.ok ? r.merged : [])).map((g) => [JSON.stringify(g), g])).values()].map((g) => text("note-merged", ctx, { names: listOf([g.kept, ...g.with], ctx), kept: g.kept }));
  return {
    ...answerTakeaway(method),
    sentence: [headline, ...first, ...(more > 0 ? [text("whatif-more", ctx, { n: more })] : [])].join(" "),
    strength,
    strengthText: strength === null ? null : strengthWordIn(strength, ctx),
    range: null,
    basis,
    assumptions: [text("whatif-assumes-rest", ctx), ...(estimated.some((r) => r.coefficients > 1) ? [text("whatif-assumes-chain", ctx)] : []), ...(byChange > 0 && !allByChange ? [text("whatif-assumes-next", ctx, { span })] : [])],
    cautions: distinct,
    notes: merged,
    footer: estimated.length > 0 ? footerText(ctx) : null,
    figures,
    numbers,
    rows,
  };
}

/** The decimals a percent is written with: none for a whole one, else at least two significant digits (never a percent above 0 written as 0), up to 15. */
function percentDigits(v: number): number {
  return Number.isInteger(v) ? 0 : Math.min(15, Math.max(2, Math.ceil(1 - Math.log10(v))));
}

/** Whether numbers can be written in a Metric's unit so that none above 0 reads as 0 and no two that differ read the same, within 15 places. */
function legible(m: Metric, values: number[], ctx: TakeawayContext): boolean {
  const texts = values.map((v) => written(m, v, ctx, values));
  return values.every((v, i) => v === 0 || /[1-9]/.test(texts[i])) && new Set(values).size === new Set(texts).size;
}

function refusedRow(r: Pick<NotReached, "name" | "step">, sentence: string): WhatIfRow {
  return { name: r.name, step: r.step, kind: "refused", effect: null, lo: null, hi: null, strength: null, strengthText: null, through: [], sentence: `${r.name}: ${sentence}` };
}

// ---- the Recipe ----

/** The one-click question this ticket adds, in the person's words, with what it asks and what Ziffr fills in (spec 0041, "Recipes"). */
export const WHAT_IF_RECIPES = [
  { id: "what-if", question: "What if {A} changes?", asks: ["A", "the change, as an amount or a percent"], fills: "the Metrics that clearly moved with A (a Derived Metric built from A is worked out exactly; the others are read from a straight line through their history), and then the Metrics that clearly moved with those, at most 2 steps and 12 Metrics in all, everything else staying where it was" },
] as const;

/** The most Metrics the first step keeps. */
export const MOST_FIRST = 5;
/** The most Metrics looked at for the first step. */
export const MOST_LOOKED_AT = 20;
/** The most Metrics looked at for each Metric of the first step. */
export const MOST_PER_STEP = 8;

// The levels a formula's inputs are at in the period the change counts from (the changed Metric's latest), by Metric name; null where one has none there.
function levelsOf(inputs: Metric[], series: Map<number, Point[]>, period: string): Record<string, number> | null {
  // Stryker disable next-line ArrayDeclaration: an input with no series has no period to match, whatever is put in its place
  const maps = inputs.map((m) => new Map((series.get(m.id) ?? []).map((p) => [p.period, p.value])));
  return maps.every((m) => m.has(period)) ? Object.fromEntries(inputs.map((m, i) => [m.name, maps[i].get(period)!])) : null;
}

/**
 *
 */
type Found = { target: Metric; link: WhatIfLink; exact: boolean; partial: number; fit: Fit | null };
export type { Found };

/** How closely two series follow each other, as |r| of the values of the periods both have (in doubles: it only chooses which Metrics to look at, and every number
 * given comes from the exact fits); 0 for fewer than `MIN_PAIRS` periods, or where a series does not vary. */
export function closeness(a: Map<string, number>, b: Map<string, number>): number {
  const pairs = [...a].flatMap(([period, x]) => (b.has(period) ? [[x, b.get(period)!]] : []));
  // Stryker disable next-line EqualityOperator,ConditionalExpression: a Metric with so few pairs has too few periods for any fit, so whether it counts as 0 or as its r, it is never followed
  if (pairs.length < MIN_PAIRS) return 0;
  const [mx, my] = [0, 1].map((k) => pairs.reduce((t, p) => t + p[k], 0) / pairs.length);
  // Stryker disable next-line ArithmeticOperator: the sign of the cross sum is lost in |r|, and Σ(x + x̄)(y − ȳ) is Σ(x − x̄)(y − ȳ) since the y about its mean add to 0, so these give the same r
  const [sxx, syy, sxy] = pairs.reduce((t, p) => [t[0] + (p[0] - mx) ** 2, t[1] + (p[1] - my) ** 2, t[2] + (p[0] - mx) * (p[1] - my)], [0, 0, 0]);
  const r = sxy / Math.sqrt(sxx * syy);
  // A series that does not change has no r: it counts as 0.
  return Number.isFinite(r) ? Math.abs(r) : 0;
}

/** How clear a fit's link is: the largest partial link of its drivers (0 to 1). */
export const strongest = (f: Pick<Fit, "drivers">): number => Math.max(...f.drivers.map((d) => Math.abs(d.partial)));

/** The order links are kept in: one worked out from a formula first, then the clearest, then the lower Metric id. */
export const rankOrder = (a: Found, b: Found): number => Number(b.exact) - Number(a.exact) || b.partial - a.partial || a.target.id - b.target.id;

/** Whether a fit's only driver is the Metric changed, so that a Metric fitted on it moves with nothing else (no change runs more than two steps). */
export const isPure = (f: Pick<Fit, "drivers"> | null, start: string): boolean => f !== null && f.drivers.every((d) => d.name === start);

/** The links kept: every first-step one, then the best of the others up to `most` Metrics in all (the changed one included); and the names of those left out. */
export function capLinks(links: Found[], firstIds: ReadonlySet<number>, most: number): { found: Found[]; dropped: string[] } {
  const [sure, more] = [links.filter((f) => firstIds.has(f.target.id)), links.filter((f) => !firstIds.has(f.target.id)).sort(rankOrder)];
  const room = Math.max(0, most - 1 - sure.length);
  return { found: [...sure, ...more.slice(0, room)], dropped: more.slice(room).map((f) => f.target.name) };
}

/** The links without the one of the Metric called `name`. */
export const withoutTarget = (found: Found[], name: string): Found[] => found.filter((f) => f.target.name !== name);

/** Whether any row is estimated (or a guess, or unclear), as against worked out or refused: only then were links picked for standing out from chance. */
export const anyEstimated = (kinds: WhatIfKind[]): boolean => kinds.some((k) => k !== "worked-out" && k !== "refused");

/** What the Recipe says it left out, one note for each kind, naming them in order of their names; none where none. */
export function recipeNotes(o: { left: string[]; cutFirst: string[]; dropped: string[]; gone: string[]; unlooked: number; start: string }, ctx: TakeawayContext): string[] {
  const note = (names: string[], key: CaseKey, slots: Slots = {}): string[] => (names.length > 0 ? [text(key, ctx, { ...slots, names: listOf([...names].sort(), ctx) })] : []);
  return [
    ...note(o.left, "note-what-if-formula"),
    ...note(o.cutFirst, "note-what-if-first", { n: MOST_FIRST, start: o.start }),
    ...note(o.dropped, "note-what-if-left", { most: MOST_METRICS }),
    ...note(o.gone, "note-what-if-deep", { most: MOST_STEPS }),
    ...(o.unlooked > 0 ? [text("note-what-if-unlooked", ctx, { n: o.unlooked, most: MOST_LOOKED_AT, start: o.start })] : []),
  ];
}

/** "What if A changes?": `others` are the Metrics a person may see (nothing else is read or named), the history in `resolve`. The Metrics that
 * clearly moved with `start` (a straight line through each pair's history; a Derived Metric built from it is worked out exactly) are the
 * first step. Each Metric that moved with the first step is then fitted on `start` and the first-step Metrics that move it, so that the
 * effect of `start` direct and the effect through each one are told apart; a driver that cannot be told from chance is left out and the
 * fit made again. The second step is what the Method follows from those links. */
export function whatIfRecipe(start: Metric, change: WhatIfChange, others: Metric[], resolve: Resolver, opts: FitRecipeOptions, budget: number = WORK_BUDGET): WhatIfTakeaway {
  return withWork(() => whatIfRecipeWithin(start, change, others, resolve, opts), budget) ?? { ...refusalTakeaway(text("numbers-method-what-if", opts.ctx), [text("refuse-exact-work", opts.ctx)]), rows: [] };
}

function whatIfRecipeWithin(start: Metric, change: WhatIfChange, others: Metric[], resolve: Resolver, opts: FitRecipeOptions): WhatIfTakeaway {
  const method = text("numbers-method-what-if", opts.ctx);
  const none = (lines: string[], notes: string[] = []): WhatIfTakeaway => ({ ...refusalTakeaway(method, lines), notes, rows: [] });
  const everyone = [start, ...others.filter((m) => m.id !== start.id)];
  const dup = everyone.find((m, i) => everyone.findIndex((o) => o.name === m.name) !== i);
  if (dup) return none([text("refuse-same-names", opts.ctx, { name: dup.name })]);
  // A Metric the changed one is built from does not move when it changes: it is not a candidate.
  const pool = everyone.slice(1).filter((m) => !start.formula?.includes(`{${m.slug}}`));
  if (pool.length === 0) return none([text("drivers-empty", opts.ctx, { target: start.name })]);
  const on = onCommon([start, ...pool], resolve, opts);
  if (typeof on === "string") return none([on]);
  const { span } = on;
  const series = new Map(everyone.slice(0, 1).concat(pool).map((m, i) => [m.id, on.series[i]] as const));
  // Values too wide to work out exactly in reasonable time (work-bound.ts) are refused in words before any arithmetic is done on them.
  const wide = wideRefusal(method, [start, ...pool].map((m, i) => ({ name: m.name, values: on.series[i].map((p) => p.value) })), opts.ctx);
  if (wide) return { ...wide, notes: [], rows: [] };
  const last = on.series[0][on.series[0].length - 1];
  if (last === undefined) return none([text("refuse-what-if-latest", opts.ctx, { name: start.name })]);
  const latest = last.value;
  const left = new Set<string>();

  const builds = (m: Metric, from: Metric) => Boolean(m.formula?.includes(`{${from.slug}}`));
  // Stryker disable next-line ArrayDeclaration: the Metrics only let the fit see where an input is built from another or has no Aggregation, and every set tried here is one of Metrics counted the same way and not built from each other
  const fitOn = (target: Metric, drivers: Metric[]) => fit({ target: { name: target.name, points: series.get(target.id)! }, drivers: drivers.map((d) => ({ name: d.name, points: series.get(d.id)!, id: d.id })), span, metrics: [target, ...drivers] });
  // The Metrics worth fitting against `target`: the ones whose changes follow its own most closely (|r| of the changes, ties by id). This only chooses which
  // to look at, so it is worked out in doubles, once for each Metric's changes: every number given comes from the exact fits.
  const changesOf = new Map<number, Map<string, number>>();
  const changed = (m: Metric) => {
    // Stryker disable next-line ConditionalExpression: the changes of a Metric are kept only to save working them out again
    if (!changesOf.has(m.id)) changesOf.set(m.id, new Map(changes(series.get(m.id)!, span).map((p) => [p.period, p.value])));
    return changesOf.get(m.id)!;
  };
  const closenessOf = (a: Metric, b: Metric): number => closeness(changed(a), changed(b));
  const closest = (target: Metric, among: Metric[], most: number) => {
    const r = new Map(among.map((m) => [m.id, closenessOf(target, m)]));
    return [...among].sort((a, b) => r.get(b.id)! - r.get(a.id)! || a.id - b.id).slice(0, most);
  };
  // The formula of a Derived Metric as a link, where every Metric it names is here, counted by the common period, with none reaching back.
  const worked = (t: Metric): Found | null => {
    const inputs = formulaInputs(t.formula!).map((s) => everyone.find((m) => m.slug === s));
    const have = inputs as Metric[];
    // Its inputs are counted by its own period (`inputsProblem` says where they are not, or are Derived Metrics themselves).
    const levels = inputs.some((m) => m === undefined) || usesPrevious(t.formula!) || t.period !== span || inputsProblem(t, have) !== null ? null : levelsOf(have, series, last.period);
    if (!levels) {
      left.add(t.name);
      return null;
    }
    return { target: t, exact: true, partial: 0, fit: null, link: { kind: "worked", target: t.name, formula: t.formula!, names: Object.fromEntries(have.map((m) => [m.slug, m.name])), levels } };
  };
  const estimated = (t: Metric, f: Fit): Found => ({ target: t, exact: false, partial: strongest(f), fit: f, link: { kind: "fit", fit: f } });

  // The first step: what clearly moved with the Metric changed, each on its own.
  const firstFound: Found[] = [];
  // Stryker disable next-line ConditionalExpression,LogicalOperator,MethodExpression: a Metric built from the changed one is refused by the fit in any case, so it is the same whether it is also tried
  const candidates1 = pool.filter((m) => !builds(m, start) && !builds(start, m));
  for (const t of closest(start, candidates1, MOST_LOOKED_AT)) {
    const f = fitOn(t, [start]);
    if (f.ok && f.drivers[0].strength !== "cant-tell") firstFound.push(estimated(t, f));
  }
  for (const t of pool.filter((m) => builds(m, start))) {
    const w = worked(t);
    if (w) firstFound.push(w);
  }
  const ranked = firstFound.sort(rankOrder);
  const first = ranked.slice(0, MOST_FIRST);
  const cutFirst = ranked.slice(MOST_FIRST).map((f) => f.target.name);
  const firstMetrics = first.map((f) => f.target);

  // Each Metric that may have moved with the first step is fitted on the changed Metric and the first-step Metrics nearer to it, the ones that cannot be told
  // from chance left out and the fit made again. Which of two Metrics that moved with the changed one is upstream is not known: the one whose link to it is
  // closer is read as nearer (ties by Metric id), so a Metric is only ever fitted on those nearer than it and never on one that is fitted on it. A Metric
  // is only fitted on those whose own link has the changed Metric alone as its driver ("pure"), so that no change runs more than two steps.
  const pure: Metric[] = [];
  const linkFor = (t: Metric): Found | null => {
    const chain = [start, ...pure].filter((m) => !builds(m, t));
    if (chain.some((m) => builds(t, m))) return worked(t);
    const drivers = [start, ...closest(t, chain.filter((m) => m.id !== start.id), 2)];
    let f = fitOn(t, drivers);
    // Stryker disable next-line ArrayDeclaration: a fit that was refused has no driver to be clear, and the fit is made again only where it was made
    const clear = f.ok ? f.drivers.filter((d) => d.strength !== "cant-tell").map((d) => d.name) : [];
    // A driver that cannot be told from chance is left out and the fit made again, so that the one that matters is not hidden by it.
    // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: the fit is made again only to leave out drivers that cannot be told from chance; made again with all of them, or with none, it is the same fit or one that is refused
    if (f.ok && clear.length > 0 && clear.length < f.drivers.length) f = fitOn(t, drivers.filter((m) => clear.includes(m.name)));
    // Stryker disable next-line MethodExpression: after the fit is made again its drivers are all clear or all unclear, so `some` and `every` say the same
    return f.ok && f.drivers.some((d) => d.strength !== "cant-tell") ? estimated(t, f) : null;
  };
  const isInFirst = new Set(first.map((f) => f.target.id));
  const inRanked = new Set(ranked.map((f) => f.target.id));
  // Metrics left out of the first step, or not looked at, are not brought back in as the second: the notes say they were left out.
  const looked = new Set(closest(start, candidates1, MOST_LOOKED_AT).map((m) => m.id));
  const pool2 = [...new Map([...firstMetrics, ...firstMetrics.flatMap((b) => closest(b, pool.filter((m) => !inRanked.has(m.id) && !builds(m, start) && looked.has(m.id)), MOST_PER_STEP))].map((m) => [m.id, m])).values()];
  const links: Found[] = [];
  for (const t of pool2) {
    const l = linkFor(t);
    // A first-step Metric keeps its own pair link where no better one is found.
    const mine = l ?? first.find((f) => f.target.id === t.id);
    if (!mine) continue;
    links.push(mine);
    if (isInFirst.has(t.id) && isPure(mine.fit, start.name)) pure.push(t);
  }
  const capped = capLinks(links, isInFirst, MOST_METRICS);
  let found = capped.found;
  // The link of a Metric that is too far is left out, until the rest can be followed (the links made here never drive each other).
  const gone: string[] = [];
  // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator: the loop runs while the links are too far; with none left the plan is `none`, not too far, and `case` is only there on a finding, so each of these conditions says the same
  for (let p = planOf(start.name, found.map((f) => f.link)); found.length > 0 && "case" in p && p.case === "refuse-what-if-deep"; p = planOf(start.name, found.map((f) => f.link))) {
    const name = String(p.slots.name);
    gone.push(name);
    found = withoutTarget(found, name);
  }
  const notes = recipeNotes({ left: [...left], cutFirst, dropped: capped.dropped, gone, unlooked: Math.max(0, candidates1.length - MOST_LOOKED_AT), start: start.name }, opts.ctx);
  const result = whatIf({ start: { name: start.name, latest }, change, links: found.map((f) => f.link) });
  const t = whatIfTakeaway(start, everyone, result, found.flatMap((f) => (f.fit ? [f.fit] : [])), opts.ctx);
  // Which of two Metrics that move together comes first is read, not known: said wherever a Metric is reached through another.
  const chosen = anyEstimated(t.rows.map((r) => r.kind)) ? [text("whatif-assumes-chosen", opts.ctx)] : [];
  const read = t.rows.some((r) => r.through.length > 0) ? [text("whatif-assumes-order", opts.ctx, { start: start.name })] : [];
  return { ...t, assumptions: [...t.assumptions, ...chosen, ...read], notes: [...notes, ...t.notes] };
}
