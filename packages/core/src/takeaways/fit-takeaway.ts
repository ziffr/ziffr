// The Takeaways of a multiple fit and the Recipes "What moves B?" and "What does B need?" (GLOSSARY: Takeaway, Recipe; spec
// 0041, ticket 4). The Methods (methods/fit.ts) give numbers or refusals; this writes them in the Metrics' own words and
// units: which drivers moved with the target the most and how much each explains, what a change in a driver has gone with
// "with the others held the same", what a target is likely to be for given values, and what a driver would need to be to reach
// a goal, with "treat it as a guess" where the value is outside what the driver has been. A refusal carries no number. Pure.
//
// What is held to here: no forbidden word (wording.ts); a number in a sentence is the Method's number written in the
// Metric's unit (at least two significant digits, so a small effect is not rounded to 0); a range only where the Method
// gives one; nothing stronger than "moderate" with a caution; one footer, once.
import { changePct } from "../exact";
import { formatNumber, formatValue, type ValueUnit } from "../format";
import { builtFrom, commonPeriod } from "../correlation";
import { seriesBy, type Resolver } from "../display-periods";
import { fit, needs, partialPeriods, type Fit, type Needed, type Outside, type Predicted, type Refused } from "../methods/fit";
import { basisText } from "../basis";
import type { Span, YearStart } from "../periods";
import type { Verdict } from "../suitability";
import type { Metric, Point } from "../types";
import { strengthOf, type StrengthWord } from "./strength";
import { footerText, refusalTakeaway, type Figure, type NumberRow, type Takeaway, type TakeawayContext } from "./takeaway";
import { say, type CaseKey, type Slots, type SayContext } from "./wording";

/** One driver's line under a fit's Takeaway: its share, its strength and, where there is one, what its effect has been. */
export type DriverRow = { name: string; share: string; strength: StrengthWord; strengthText: string; line: string; sentence: string | null };
/** A fit's Takeaway with a line for each driver. */
export type MovesTakeaway = Takeaway & { rows: DriverRow[] };
/** What a driver needs to be to reach a goal: the Takeaway of the first driver, with one for each driver that moved with the target. */
export type NeedsTakeaway = Takeaway & { rows: { name: string; takeaway: Takeaway }[] };

// Stryker disable next-line ObjectLiteral: the Number Style reaches only the numbers `say` writes itself, and those are whole counts below 1,000 (periods), which every style writes the same; every other number is written before it is a slot
const ctxOf = (ctx: TakeawayContext): SayContext => ({ style: ctx.style, language: ctx.language, yearStart: ctx.yearStart });
const text = (k: CaseKey, ctx: TakeawayContext, slots: Slots = {}) => say(k, slots, ctxOf(ctx));

// Decimals that show a value to at least two significant digits, never fewer than the Metric's own: an effect of 0.8 per step is
// not written as "1".
/** The decimals that show every one of `values` to at least two significant digits, never fewer than the Metric's own. */
export function decimalsFor(m: ValueUnit, ...values: number[]): number {
  const small = Math.min(...values.map(Math.abs).filter((v) => v > 0 && Number.isFinite(v)));
  const need = Number.isFinite(small) ? Math.ceil(1 - Math.log10(small)) : 0;
  return Math.min(6, Math.max(m.decimals, need));
}

/** A value in a Metric's unit with `decimals` places (widened to show two significant digits of every number in `like`). */
/** A value in a Metric's unit with decimals widened to show two significant digits of every number in `like`. */
export function written(m: ValueUnit, v: number, ctx: TakeawayContext, like: number[] = [v]): string {
  return formatValue({ ...m, decimals: decimalsFor(m, ...like) }, v, ctx.style);
}

// A step to speak of an effect in: the power of ten at or below the driver's own spread, so "per 1,000 Visits" and not per one.
const stepOf = (spread: number) => 10 ** Math.floor(Math.log10(spread));

function listOf(names: string[], ctx: TakeawayContext): string {
  const [and, comma] = [text("list-and", ctx), text("list-comma", ctx)];
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(comma)}${and}${names[names.length - 1]}`;
}

/** A share of what is explained in a few words: "nearly all", "about half", "little". The thresholds are one table. */
export const SHARE_WORDS: readonly [number, CaseKey][] = [[0.85, "share-nearly-all"], [0.6, "share-most"], [0.4, "share-half"], [0.27, "share-third"], [0.18, "share-quarter"], [0.08, "share-some"], [0, "share-little"]];
/** The words for a share (0 to 1). */
export function shareWord(share: number): CaseKey {
  return SHARE_WORDS.find(([from]) => share >= from)![1];
}

const figure = (label: string, value: number, shown: string): Figure => ({ label, value, text: shown });
// What a result was compared on and over how many periods, in one line.
const basisLine = (m: Pick<Fit, "basis" | "n" | "span">, ctx: TakeawayContext) => say("basis-over", { basis: text(m.basis === "changes" ? "basis-changes" : "basis-values", ctx), n: m.n, span: m.span }, ctxOf(ctx));
const periodRange = (f: Fit) => `${f.from} – ${f.to}`;

// The lines of a verdict, written; a far-off finding quotes the effect of the top driver without those periods.
function lines(v: Verdict, ctx: TakeawayContext, result?: (value: number) => string) {
  const one = (f: { case: CaseKey; slots: Slots }) => say(f.case, f.slots, { ...ctxOf(ctx), result });
  return { refusals: v.refusals.map(one), cautions: v.cautions.map(one), notes: v.switches.map(one) };
}

// Stryker disable next-line ArrayDeclaration: the lines of the refusal are cleared on the next token, as an answer has none
const blank = (method: string, ctx: TakeawayContext): Takeaway => ({ ...refusalTakeaway(method, []), refusal: null, footer: footerText(ctx) });

/** The words for a value outside what a driver has been, with the driver's own unit. */
function outsideText(o: Outside, m: ValueUnit, span: Span, ctx: TakeawayContext): string {
  const key: CaseKey = o.change ? (o.side === "above" ? "outside-rise" : "outside-fall") : o.side === "above" ? "outside-above" : "outside-below";
  return say(key, { name: o.name, limit: written(m, o.change ? Math.abs(o.limit) : o.limit, ctx), span }, ctxOf(ctx));
}

/** The Takeaway of "What moves B?": the drivers that moved with the target the most (up to three, none that can't be told from
 * chance), each one's share of what moved, strength and what its effect has been with the others held the same, the cautions
 * above, what was treated as one, the footer, and the numbers for Show the numbers. A refusal says what is missing. */
export function movesTakeaway(target: Metric, drivers: Metric[], f: Fit | Refused, ctx: TakeawayContext): MovesTakeaway {
  const method = text("numbers-method-fit", ctx);
  if (!f.ok) return { ...refusalTakeaway(method, lines({ refusals: f.refusals, cautions: [], switches: [] }, ctx).refusals), rows: [] };
  const metricOf = (name: string) => drivers.find((d) => d.name === name)!;
  // Stryker disable next-line EqualityOperator: two drivers with exactly the same share are a tie, and the earlier is the one named
  const top = f.drivers.reduce((a, d) => (d.share > a.share ? d : a), f.drivers[0]);
  const stepFor = (name: string) => stepOf(f.drivers.find((d) => d.name === name)!.spread);
  const topMetric = metricOf(top.name);
  const effectText = (v: number) => `${written(target, v * stepOf(top.spread), ctx)} per ${written(topMetric, stepOf(top.spread), ctx)}`;
  const said = lines(f.verdict, ctx, effectText);
  const merged = f.merged.map((m) => text("note-merged", ctx, { names: listOf([m.kept, ...m.with], ctx) }));
  const capped = said.cautions.length > 0;
  const figures: Figure[] = [figure(text("numbers-pairs", ctx), f.n, formatNumber(f.n, 0, ctx.style))];
  const numbers: NumberRow[] = [
    { label: text("numbers-method", ctx), text: method },
    { label: text("numbers-periods", ctx), text: periodRange(f) },
    { label: text("numbers-basis", ctx), text: basisLine(f, ctx) },
    { label: text("numbers-explained", ctx), text: `${formatNumber(f.explained * 100, 0, ctx.style)} %` },
    { label: text("numbers-miss", ctx), text: written(target, f.miss, ctx) },
  ];
  const rows: DriverRow[] = f.drivers.map((d) => {
    const strength = strengthOf(d.partial, partialPeriods(f.n, f.drivers.length), capped);
    const m = metricOf(d.name);
    const step = stepFor(d.name);
    const [effect, lo, hi] = [d.effect * step, d.lo * step, d.hi * step];
    const stepText = written(m, step, ctx);
    // An effect is said only where it can be told from chance and its range stays on one side of 0.
    // Stryker disable next-line ArithmeticOperator,ConditionalExpression,EqualityOperator: a link that clears the chance rule (about t ≥ 1.9) has an 80 % range (t ≤ 1.42 from 7 degrees on) that excludes 0, so the second test only guards the first; a product and a quotient have the same sign; a range edge of exactly 0 is the knife-edge of that
    const clear = strength !== "cant-tell" && lo * hi > 0;
    const others = f.drivers.filter((o) => o.name !== d.name).map((o) => o.name);
    const [mag1, mag2] = [Math.abs(lo), Math.abs(hi)].sort((a, b) => a - b);
    const like = [effect, lo, hi];
    const shown = { effect: written(target, Math.abs(effect), ctx, like), lo: written(target, mag1, ctx, like), hi: written(target, mag2, ctx, like) };
    // Stryker disable next-line EqualityOperator: an effect of exactly 0 is never said (its range holds 0)
    const direction = text(effect > 0 ? "word-up" : "word-down", ctx);
    // Stryker disable next-line ArithmeticOperator,ConditionalExpression,EqualityOperator: as above, a link that cannot be told from chance has a range that holds 0 or sits clear of it; a clear one never has a range holding 0
    const straddles = lo * hi <= 0 && strength === "cant-tell";
    const sentence = clear
      ? say("moves-effect", { driver: d.name, step: stepText, target: target.name, direction, ...shown, held: others.length > 0 ? text("moves-held", ctx, { others: listOf(others, ctx) }) : "" }, ctxOf(ctx))
      : straddles
        ? say("moves-unclear", { driver: d.name, target: target.name }, ctxOf(ctx))
        : null;
    if (clear) figures.push(figure(`${d.name} ${text("numbers-effect", ctx, { step: stepText })}`, Math.abs(effect), shown.effect), figure(`${d.name} ${text("numbers-range", ctx)}`, mag1, shown.lo), figure(`${d.name} ${text("numbers-range", ctx)}`, mag2, shown.hi), figure(d.name, step, stepText));
    numbers.push(
      { label: `${d.name}: ${text("numbers-effect", ctx, { step: stepText })}`, text: written(target, effect, ctx, like) },
      { label: `${d.name}: ${text("numbers-range", ctx)}`, text: `${written(target, lo, ctx, like)} – ${written(target, hi, ctx, like)}` },
      { label: `${d.name}: ${text("numbers-explained-share", ctx)}`, text: `${formatNumber(d.share * 100, 0, ctx.style)} %` },
      { label: `${d.name}: ${text("numbers-moves-with", ctx)}`, text: formatNumber(d.inflation, 2, ctx.style) },
    );
    const share = text(shareWord(d.share), ctx);
    const strengthText = text(`strength-${strength}`, ctx);
    return { name: d.name, share, strength, strengthText, line: text("moves-row", ctx, { name: d.name, share, strength: strengthText }), sentence };
  });
  const order = f.drivers.map((_, i) => i).sort((a, b) => f.drivers[b].share - f.drivers[a].share);
  const named = order.filter((i) => rows[i].strength !== "cant-tell").slice(0, 3).map((i) => f.drivers[i].name);
  const base = { n: f.n, span: f.span, target: target.name };
  const sentence = named.length === 0 ? text("moves-none", ctx, base) : text(f.drivers.length > 1 ? "moves-some" : "moves-one", ctx, { ...base, names: listOf(named, ctx) });
  const topRow = rows[order[0]];
  const topDriver = f.drivers[order[0]];
  const topStep = stepFor(topDriver.name);
  return {
    ...blank(method, ctx),
    kind: "answer",
    sentence,
    strength: topRow.strength,
    strengthText: topRow.strengthText,
    range: topRow.sentence && topRow.strength !== "cant-tell" ? { lo: topDriver.lo * topStep, hi: topDriver.hi * topStep, text: `${written(target, topDriver.lo * topStep, ctx)} – ${written(target, topDriver.hi * topStep, ctx)}` } : null,
    basis: basisLine(f, ctx),
    cautions: said.cautions,
    notes: [...merged, ...said.notes],
    figures,
    numbers,
    rows: order.map((i) => rows[i]),
  };
}

/** A list of values the drivers were given, in words: "Visits at 60,000 and Price at 9 €". */
function givenText(drivers: Metric[], values: number[], ctx: TakeawayContext): string {
  return listOf(drivers.map((d, i) => text("given-at", ctx, { name: d.name, value: written(d, values[i], ctx) })), ctx);
}

/** The Takeaway of a value read from a fit: what the target is likely to be for the values given, with its range, or only the
 * point and "treat it as a guess" where a value is outside what its driver has been. */
export function predictTakeaway(target: Metric, drivers: Metric[], model: Fit, values: number[], p: Predicted, ctx: TakeawayContext): Takeaway {
  const method = text("numbers-method-predict", ctx);
  if (!p.ok) return refusalTakeaway(method, lines({ refusals: p.refusals, cautions: [], switches: [] }, ctx).refusals);
  const said = lines(p.verdict, ctx);
  const given = givenText(drivers, values, ctx);
  // Stryker disable next-line ArrayDeclaration,ConditionalExpression: a null end is not a number to widen the digits by (it is left out like any value that is not above 0), so either way the digits are the same
  const like = [p.value, ...(p.lo === null ? [] : [p.lo, p.hi!])];
  const shown = (v: number) => written(target, v, ctx, like);
  const guess = p.lo === null;
  const metricOf = (name: string) => drivers.find((d) => d.name === name)!;
  return {
    ...blank(method, ctx),
    kind: "answer",
    sentence: guess ? text("predict-guess", ctx, { given, target: target.name, value: shown(p.value), outside: outsideText(p.outside[0], metricOf(p.outside[0].name), model.span, ctx) }) : text("predict-range", ctx, { given, target: target.name, lo: shown(p.lo!), hi: shown(p.hi!) }),
    range: guess ? null : { lo: p.lo!, hi: p.hi!, text: `${shown(p.lo!)} – ${shown(p.hi!)}` },
    basis: basisLine(model, ctx),
    cautions: said.cautions,
    figures: [figure(text("numbers-given", ctx), p.value, shown(p.value)), ...(guess ? [] : [figure(text("numbers-range", ctx), p.lo!, shown(p.lo!)), figure(text("numbers-range", ctx), p.hi!, shown(p.hi!))])],
    numbers: [
      { label: text("numbers-method", ctx), text: method },
      { label: text("numbers-given", ctx), text: given },
      { label: text("numbers-periods", ctx), text: periodRange(model) },
      { label: text("numbers-miss", ctx), text: written(target, model.miss, ctx) },
    ],
  };
}

/** The Takeaway of what a driver would need to be to reach a goal: the value, its range, how far it is from today; where the value
 * is outside what the driver has been, or the effect cannot be told from chance, only the point and "treat it as a guess". */
export function needsTakeaway(target: Metric, driver: Metric, model: Fit, goal: number, n: Needed, ctx: TakeawayContext, all: Metric[]): Takeaway {
  const method = text("numbers-method-needs", ctx);
  if (!n.ok) return refusalTakeaway(method, lines({ refusals: n.refusals, cautions: [], switches: [] }, ctx).refusals);
  const said = lines(n.verdict, ctx);
  // Stryker disable next-line ArrayDeclaration,ConditionalExpression: a null end is not a number to widen the digits by (it is left out like any value that is not above 0), so either way the digits are the same
  const like = [n.value, ...(n.lo === null ? [] : [n.lo, n.hi!])];
  const shown = (v: number) => written(driver, v, ctx, like);
  const pct = changePct(n.value, n.current);
  // Stryker disable next-line EqualityOperator: a change of exactly 0 is the line before
  const compared = pct === null ? text("compared-zero", ctx) : pct === 0 ? text("compared-same", ctx) : text(pct > 0 ? "compared-above" : "compared-below", ctx, { pct: `${formatNumber(Math.abs(pct), 0, ctx.style)} %` });
  const d = model.drivers.find((x) => x.name === driver.name)!;
  const strength = strengthOf(d.partial, partialPeriods(model.n, model.drivers.length), said.cautions.length > 0);
  const slots = { goal: written(target, goal, ctx), driver: driver.name, value: shown(n.value), compared };
  const sentence = n.lo !== null ? text("needs-range", ctx, { ...slots, lo: shown(n.lo), hi: shown(n.hi!) }) : n.outside.length > 0 ? text("needs-guess", ctx, { ...slots, outside: outsideText(n.outside[0], all.find((m) => m.name === n.outside[0].name)!, model.span, ctx) }) : text("needs-point", ctx, slots);
  return {
    ...blank(method, ctx),
    kind: "answer",
    sentence,
    strength,
    strengthText: text(`strength-${strength}`, ctx),
    range: n.lo === null ? null : { lo: n.lo, hi: n.hi!, text: `${shown(n.lo)} – ${shown(n.hi!)}` },
    basis: basisLine(model, ctx),
    cautions: said.cautions,
    figures: [figure(text("numbers-goal", ctx), goal, written(target, goal, ctx)), figure(text("numbers-needed", ctx), n.value, shown(n.value))],
    numbers: [
      { label: text("numbers-method", ctx), text: method },
      { label: text("numbers-goal", ctx), text: written(target, goal, ctx) },
      { label: text("numbers-needed", ctx), text: shown(n.value) },
      { label: text("numbers-periods", ctx), text: periodRange(model) },
      { label: text("numbers-basis", ctx), text: basisText(model.basis) },
    ],
  };
}

// ---- the Recipes ----

/** The one-click questions this ticket adds, in the person's words, with what each asks and what Ziffr fills in (spec 0041,
 * "Recipes"). */
export const FIT_RECIPES = [
  { id: "what-moves", question: "What moves {B}?", asks: ["B"], fills: "every other Metric you may see that fits the history, compared by change where both grow, with the others held the same" },
  { id: "what-needs", question: "What does {B} need?", asks: ["B", "the value you want"], fills: "each driver that moved with B, one at a time, with the others held at their latest values" },
] as const;

/** What the recipes need from the world: where the series are and how to write them. */
export type FitRecipeOptions = { yearStart: YearStart; ctx: TakeawayContext; today?: string };

// The series of each Metric on the common (longest) period, whole periods only; the reason where one cannot be combined.
function onCommon(metrics: Metric[], resolve: Resolver, opts: FitRecipeOptions): { span: Span; series: Point[][] } | string {
  const span = metrics.map((m) => m.period as Span).reduce((a, b) => commonPeriod(a, b));
  const series: Point[][] = [];
  for (const m of metrics) {
    const s = seriesBy(m, resolve, span, opts);
    if (!s.ok) return s.reason;
    series.push(s.points.filter((p) => !p.toDate).map((p) => ({ period: p.period, value: p.value })));
  }
  return { span, series };
}

// The Metrics a fit can use: the others, but not one that is built from the target or the target from it.
const candidates = (target: Metric, others: Metric[]) => others.filter((m) => m.id !== target.id && !builtFrom(target, m));

function fitOf(target: Metric, others: Metric[], resolve: Resolver, opts: FitRecipeOptions): { f: Fit | Refused; drivers: Metric[]; series: Point[][] } | string {
  const drivers = candidates(target, others);
  if (drivers.length === 0) return text("drivers-empty", opts.ctx, { target: target.name });
  const on = onCommon([target, ...drivers], resolve, opts);
  if (typeof on === "string") return on;
  const f = fit({ target: { name: target.name, points: on.series[0] }, drivers: drivers.map((d, i) => ({ name: d.name, points: on.series[i + 1] })), span: on.span, metrics: [target, ...drivers] });
  return { f, drivers, series: on.series };
}

/** "What moves B?": the target and the other Metrics a person may see, the history in `resolve`; the Takeaway of the fit. The
 * Metrics are only those given: nothing is read that the person may not see. */
export function whatMoves(target: Metric, others: Metric[], resolve: Resolver, opts: FitRecipeOptions): MovesTakeaway {
  const made = fitOf(target, others, resolve, opts);
  if (typeof made === "string") return { ...refusalTakeaway(text("numbers-method-fit", opts.ctx), [made]), rows: [] };
  return movesTakeaway(target, made.drivers, made.f, opts.ctx);
}

/** "What does B need?": the same fit, and for each driver that moved with the target, what it would need to be for the target to
 * reach `goal`, the others at their latest values. The Takeaway is the one of the driver that explains most; a goal more than
 * 1,000 times the largest value the target has had is not worked out. */
export function whatNeeds(target: Metric, others: Metric[], goal: number, resolve: Resolver, opts: FitRecipeOptions): NeedsTakeaway {
  const method = text("numbers-method-needs", opts.ctx);
  const none = (lines: string[]): NeedsTakeaway => ({ ...refusalTakeaway(method, lines), rows: [] });
  const made = fitOf(target, others, resolve, opts);
  if (typeof made === "string") return none([made]);
  const { f, drivers, series } = made;
  if (!f.ok) return none(lines({ refusals: f.refusals, cautions: [], switches: [] }, opts.ctx).refusals);
  const largest = Math.max(...series[0].map((p) => Math.abs(p.value)));
  if (!Number.isFinite(goal) || Math.abs(goal) > 1000 * largest) return none([Number.isFinite(goal) ? text("refuse-goal-far", opts.ctx, { goal: written(target, goal, opts.ctx), target: target.name }) : text("refuse-goal-input", opts.ctx)]);
  const clear = f.drivers.map((_, i) => i).filter((i) => f.drivers[i].strength !== "cant-tell").sort((a, b) => f.drivers[b].share - f.drivers[a].share);
  if (clear.length === 0) return none([text("needs-none", opts.ctx, { n: f.n, span: f.span, target: target.name, goal: written(target, goal, opts.ctx) })]);
  const rows = clear.slice(0, 3).map((i) => {
    const metric = drivers.find((d) => d.name === f.drivers[i].name)!;
    return { name: metric.name, takeaway: needsTakeaway(target, metric, f, goal, needs(f, { goal, driver: i }), opts.ctx, drivers) };
  });
  return { ...rows[0].takeaway, rows };
}
