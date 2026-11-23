// The Takeaway layer (GLOSSARY: Takeaway; spec 0041, "What every Takeaway must hold to"): the result of an Analysis as
// Ziffr says it: a sentence in the Metrics' own words, a strength in a word, what it is based on, what it assumes, a
// caution or a refusal from the suitability checks, one footer line, and the numbers for Show the numbers. One writer for
// every place a result is shown. Pure.
//
// Rules held here: no number without enough data (a refusal carries no number, no strength and no range); a result with
// a caution is never "strong"; a Method's numbers are written through the Workspace's Number Style; the same footer once;
// nothing says what caused what.
import { basisText } from "../basis";
import { autocorrelations, effectiveCount } from "../effective-count";
import { pearson, type Correlation, type Ranked } from "../correlation";
import { formatNumber } from "../format";
import type { NumberStyle } from "../number-style";
import type { Span, YearStart } from "../periods";
import { checkSuitability, type Finding, type Verdict } from "../suitability";
import type { Metric, Point } from "../types";
import { latestCommon, wideColumns, withWork } from "../work-bound";
import { strengthOf, type StrengthWord } from "./strength";
import { say, type CaseKey, type Language, type SayContext, type Slots } from "./wording";

/** How Takeaways are written: the Workspace's Number Style, the language and the Fiscal Year start. */
export type TakeawayContext = { style: NumberStyle; language?: Language; yearStart?: YearStart };

/** A number written in a sentence: what it is, its value and the text it was written as, so a test can hold the text to the value. */
export type Figure = { label: string; value: number; text: string };
/** One line of Show the numbers: the number or name and how it is written. */
export type NumberRow = { label: string; text: string };

/** The result of an Analysis as Ziffr says it. A refusal has a `refusal` text and no sentence, strength, range or numbers. */
export type Takeaway = {
  kind: "answer" | "refusal";
  /** The Method that worked it out, named under Show the numbers. */
  method: string;
  sentence: string | null;
  refusal: string | null;
  strength: StrengthWord | null;
  /** The strength as a person reads it: "strong", "moderate", "weak" or "can't tell from chance". */
  strengthText: string | null;
  /** The range the Method gives ("likely between"); a correlation gives none. */
  range: { lo: number; hi: number; text: string } | null;
  /** What it was compared on and over how many periods. */
  basis: string | null;
  assumptions: string[];
  /** The plain lines above an answer that passed with a caution. */
  cautions: string[];
  /** What was done differently, said: another Method used because the data did not suit this one. */
  notes: string[];
  /** How the Method did on the periods already known (a forecast's track record), one line; null where a Method has none. */
  track: string | null;
  /** The one footer line, on an answer. */
  footer: string | null;
  /** The numbers in the sentence. */
  figures: Figure[];
  /** The numbers for Show the numbers. */
  numbers: NumberRow[];
};

/** A Drivers result as one Takeaway, with one Takeaway for each Metric compared. */
export type DriversTakeaway = Takeaway & { rows: { metric: Metric; takeaway: Takeaway }[] };

const ctxOf = (ctx: TakeawayContext): SayContext => ({ style: ctx.style, language: ctx.language, yearStart: ctx.yearStart });
const word = (key: StrengthWord, ctx: TakeawayContext) => say(`strength-${key}`, {}, ctxOf(ctx));

/** A line of wording written in the Workspace's Number Style and language: how every Method's own Takeaway says its case. */
export function sayIn(key: CaseKey, slots: Slots, ctx: TakeawayContext): string {
  return say(key, slots, ctxOf(ctx));
}

/** A strength word as a person reads it. */
export function strengthWordIn(key: StrengthWord, ctx: TakeawayContext): string {
  return word(key, ctx);
}

/** The one footer line: what has gone together is not what caused what. */
export function footerText(ctx: TakeawayContext): string {
  return say("footer", {}, ctxOf(ctx));
}

/** The Method's own rule for the strength of a result on `n` pairs: Pearson's by default, the rank, partial or lag rule where the answer uses it. */
export type StrengthFor = (r: number, n: number) => StrengthWord;

/** A finding of the suitability checks as a line of wording; a far-off finding quotes the result without those periods as a strength word. */
function findingText(f: Finding, ctx: TakeawayContext, pairs: number, strength: StrengthFor): string {
  const result = (r: number) => word(strength(r, pairs - Number(f.slots.count)), ctx);
  return say(f.case, f.slots, { ...ctxOf(ctx), result });
}

/** A Takeaway with nothing in it, for a Method to fill in: a refusal until it says otherwise. */
export const emptyTakeaway = (method: string): Takeaway => ({ kind: "refusal", method, sentence: null, refusal: null, strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: null, figures: [], numbers: [] });
const empty = emptyTakeaway;

/** The start of an answer: nothing said yet, nothing refused. */
export function answerTakeaway(method: string): Takeaway {
  return { ...empty(method), kind: "answer" };
}

/** A refusal in words: no sentence, no number, no strength, no range, no footer (nothing is claimed). */
export function refusalTakeaway(method: string, lines: string[]): Takeaway {
  return { ...emptyTakeaway(method), refusal: lines.join(" ") };
}

/** A refusal in words when some values are too wide to work out exactly in reasonable time (work-bound.ts: more than 40 decimal
 * places, or more than 30 orders of magnitude), else null. For the Methods that work out a number before, or without, the suitability checks. */
export function wideRefusal(method: string, columns: { name: string; values: readonly (number | null)[] }[], ctx: TakeawayContext): Takeaway | null {
  const wide = wideColumns(columns.map((c) => c.name), columns.map((c) => c.values));
  return wide.length > 0 ? refusalTakeaway(method, wide.map((f) => sayIn(f.case, f.slots, ctx))) : null;
}

/** The Takeaway `f` works out under the work budget of work-bound.ts, or a refusal in words, with the Method's name, when the budget is spent first. */
export function withinBudget(method: CaseKey, ctx: TakeawayContext, f: () => Takeaway): Takeaway {
  return withWork(f) ?? refusalTakeaway(sayIn(method, {}, ctx), [sayIn("refuse-exact-work", {}, ctx)]);
}

/** A Takeaway of Methods whose series can be long: the series are cut to the latest 120 periods they have in common (and the Takeaway says so,
 * as a note), and `f` works on those under the work allowance of work-bound.ts, or is a refusal in words when that is spent first. */
export function onLatest(method: CaseKey, ctx: TakeawayContext, span: Span, series: Point[][], f: (cut: Point[][]) => Takeaway): Takeaway {
  const { series: used, cut } = latestCommon(series);
  const t = withinBudget(method, ctx, () => f(used));
  return cut === null || t.kind !== "answer" ? t : { ...t, notes: [...t.notes, sayIn("note-latest-used", { n: cut, span }, ctx)] };
}

/** The verdict of the suitability checks as the lines a person reads: refusals, cautions and what was done differently (a
 * switch to another Method). `pairs` is how many pairs a far-off finding's "without them" strength is judged on. */
export function verdictLines(v: Verdict, ctx: TakeawayContext, pairs: number, strength: StrengthFor = (r, n) => strengthOf(r, n)) {
  return { refusals: v.refusals.map((f) => findingText(f, ctx, pairs, strength)), cautions: v.cautions.map((f) => findingText(f, ctx, pairs, strength)), notes: v.switches.map((f) => findingText(f, ctx, pairs, strength)) };
}

/** What a correlation was compared on, and over how many periods, in one line. */
function basisLine(c: Extract<Correlation, { ok: true }>, ctx: TakeawayContext): string {
  const basis = say(c.basis === "changes" ? "basis-changes" : "basis-values", {}, ctxOf(ctx));
  return c.combined ? say("basis-combined", { basis, n: c.n, span: c.period }, ctxOf(ctx)) : say("basis-over", { basis, n: c.n, span: c.period }, ctxOf(ctx));
}

/** The Takeaway of two Metrics' correlation: after the suitability checks (a refusal says what is missing, a caution is
 * said above the answer and keeps the strength below "strong"), the sentence, the strength word, its basis, the footer
 * (`footer: false` for a row inside a longer Takeaway) and the numbers for Show the numbers. */
export function correlationTakeaway(a: Metric, b: Metric, c: Correlation, ctx: TakeawayContext, opts: { footer?: boolean } = {}): Takeaway {
  const method = say("numbers-method-pearson", {}, ctxOf(ctx));
  if (!c.ok) return refusalTakeaway(method, [c.reason]);
  const point = (side: "x" | "y") => c.pairs.map((p) => ({ period: p.period, value: p[side] }));
  const [xs, ys] = [point("x"), point("y")];
  const verdict = checkSuitability("correlation", {
    series: [{ name: a.name, points: xs }, { name: b.name, points: ys }],
    span: c.period,
    periods: c.n,
    scale: 1,
    // Leaving periods out is a question to the Method; the pairs themselves are not changed.
    rerun: (left) => {
      // Pairing xs with the kept periods of ys leaves just the pairs that are kept.
      const r = pearson(xs, ys.filter((p) => !left.has(p.period)));
      return r && Number.isFinite(r.r) ? { value: r.r } : null;
    },
  });
  // Monthly Metrics follow their own past, so n pairs are worth fewer independent ones (effective-count.ts): the chance rule is judged on
  // that count, over as many delays as the Heads-ups allow for and up to a third of the pairs (a year of months and more where there are
  // more months). The sentence and the basis still say the real number of periods.
  const delays = Math.floor(c.n / 3);
  const nEff = effectiveCount(c.n, autocorrelations(c.pairs.map((p) => p.x), delays), autocorrelations(c.pairs.map((p) => p.y), delays));
  const lines = verdictLines(verdict, ctx, c.n, (r, left) => strengthOf(r, left * (nEff / c.n)));
  if (lines.refusals.length > 0) return refusalTakeaway(method, lines.refusals);
  const capped = lines.cautions.length > 0;
  const strength = strengthOf(c.r, nEff, capped);
  // Where allowing for it changed the word, it says so, and the numbers hold the count.
  const allowed = strength !== strengthOf(c.r, c.n, capped);
  const [n, style] = [c.n, ctx.style];
  // Stryker disable next-line EqualityOperator: an r of 0 is "can't tell from chance" before this, so `<` and `<=` never differ.
  const key: CaseKey = strength === "cant-tell" ? "corr-cant-tell" : c.r < 0 ? "corr-opposite" : "corr-together";
  const strengthText = word(strength, ctx);
  const text = (k: CaseKey) => say(k, {}, ctxOf(ctx));
  const periods = c.pairs.map((p) => p.period);
  return {
    ...emptyTakeaway(method),
    kind: "answer",
    sentence: say(key, { a: a.name, b: b.name, n, span: c.period, strength: strengthText }, ctxOf(ctx)),
    strength,
    strengthText,
    basis: basisLine(c, ctx),
    cautions: lines.cautions,
    notes: allowed ? [...lines.notes, say("note-effective", { a: a.name, b: b.name, n, eff: formatNumber(nEff, 1, style), span: c.period }, ctxOf(ctx))] : lines.notes,
    footer: opts.footer === false ? null : footerText(ctx),
    figures: [{ label: text("numbers-pairs"), value: n, text: formatNumber(n, 0, style) }],
    numbers: [
      { label: text("numbers-method"), text: method },
      { label: text("numbers-r"), text: formatNumber(c.r, 2, style) },
      { label: text("numbers-pairs"), text: formatNumber(n, 0, style) },
      ...(allowed ? [{ label: say("numbers-effective", { span: c.period }, ctxOf(ctx)), text: formatNumber(nEff, 1, style) }] : []),
      { label: text("numbers-periods"), text: `${periods[0]} – ${periods[periods.length - 1]}` },
      { label: text("numbers-basis"), text: basisText(c.basis) },
      { label: text("numbers-strength"), text: strengthText },
    ],
  };
}

/** The answer of a Method that compares periods in pairs: the sentence, the strength, what it was compared on over how many
 * pairs, the lines of the suitability checks and the footer once. The caller adds its own `numbers` for Show the numbers. */
export function pairsAnswer(method: string, ctx: TakeawayContext, o: { sentence: string; strength: StrengthWord; basis: string; lines: ReturnType<typeof verdictLines>; n: number }): Takeaway {
  return {
    ...emptyTakeaway(method),
    kind: "answer",
    sentence: o.sentence,
    strength: o.strength,
    strengthText: word(o.strength, ctx),
    basis: o.basis,
    cautions: o.lines.cautions,
    notes: o.lines.notes,
    footer: footerText(ctx),
    figures: [{ label: say("numbers-pairs", {}, ctxOf(ctx)), value: o.n, text: formatNumber(o.n, 0, ctx.style) }],
  };
}

/** A list of names in words: "A", "A and B", "A, B and C". */
export function listOf(names: string[], ctx: TakeawayContext): string {
  const [and, comma] = [say("list-and", {}, ctxOf(ctx)), say("list-comma", {}, ctxOf(ctx))];
  const last = names[names.length - 1];
  return names.length === 1 ? last : `${names.slice(0, -1).join(comma)}${and}${last}`;
}

/** The Takeaway of Drivers: the Metrics that moved with the target the most (up to three, none that can't be told from
 * chance), each Metric's own strength word and cautions, one footer, and every Metric's numbers under Show the numbers. A
 * Metric whose own checks refuse is a row with its refusal, and never named in the sentence. With `notCompared` (the ranking ran out of work) it says
 * that the answer is among the Metrics that were compared. */
export function driversTakeaway(target: Metric, ranked: Ranked[], ctx: TakeawayContext, notCompared = false): DriversTakeaway {
  const method = say("numbers-method-pearson", {}, ctxOf(ctx));
  const rows = ranked.map(({ metric, result }) => ({ metric, result, takeaway: correlationTakeaway(target, metric, result, ctx, { footer: false }) }));
  const text = (k: CaseKey) => say(k, {}, ctxOf(ctx));
  const top = rows.find((r) => r.takeaway.kind === "answer");
  if (!top) return { ...refusalTakeaway(method, [say("drivers-empty", { target: target.name }, ctxOf(ctx))]), rows };
  const named = rows.filter((r) => r.takeaway.strength !== null && r.takeaway.strength !== "cant-tell").slice(0, 3).map((r) => r.metric.name);
  const base = { n: top.result.n, span: top.result.period, target: target.name };
  return {
    ...emptyTakeaway(method),
    kind: "answer",
    sentence: named.length > 0 ? say("drivers-some", { ...base, names: listOf(named, ctx) }, ctxOf(ctx)) : say("drivers-none", base, ctxOf(ctx)),
    strength: top.takeaway.strength,
    strengthText: top.takeaway.strengthText,
    basis: top.takeaway.basis,
    footer: footerText(ctx),
    // Where the ranking ran out of work (work-bound.ts) the answer is among the Metrics that were compared, which is said.
    notes: notCompared ? [text("note-among-compared")] : [],
    figures: [{ label: text("numbers-pairs"), value: top.result.n, text: formatNumber(top.result.n, 0, ctx.style) }],
    numbers: rows
      .filter((r) => r.takeaway.kind === "answer")
      .map((r) => ({ label: r.metric.name, text: `${text("numbers-r")} ${formatNumber(r.result.r, 2, ctx.style)}, ${r.takeaway.basis}` })),
    rows: rows.map((r) => ({ metric: r.metric, takeaway: r.takeaway })),
  };
}
