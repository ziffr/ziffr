// The Takeaway layer (GLOSSARY: Takeaway; spec 0041, "What every Takeaway must hold to"): the result of an Analysis as
// Ziffr says it: a sentence in the Metrics' own words, a strength in a word, what it is based on, what it assumes, a
// caution or a refusal from the suitability checks, one footer line, and the numbers for Show the numbers. One writer for
// every place a result is shown. Pure.
//
// Rules held here: no number without enough data (a refusal carries no number, no strength and no range); a result with
// a caution is never "strong"; a Method's numbers are written through the Workspace's Number Style; the same footer once;
// nothing says what caused what.
import { basisText } from "../basis";
import { pearson, type Correlation, type Ranked } from "../correlation";
import { formatNumber } from "../format";
import type { NumberStyle } from "../number-style";
import type { YearStart } from "../periods";
import { checkSuitability, type Finding, type Verdict } from "../suitability";
import type { Metric } from "../types";
import { strengthOf, type StrengthWord } from "./strength";
import { say, type CaseKey, type Language, type SayContext } from "./wording";

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

/** The one footer line: what has gone together is not what caused what. */
export function footerText(ctx: TakeawayContext): string {
  return say("footer", {}, ctxOf(ctx));
}

/** A finding of the suitability checks as a line of wording; a far-off finding quotes the result without those periods as a strength word. */
function findingText(f: Finding, ctx: TakeawayContext, pairs: number): string {
  const result = (r: number) => word(strengthOf(r, pairs - Number(f.slots.count)), ctx);
  return say(f.case, f.slots, { ...ctxOf(ctx), result });
}

const empty = (method: string): Takeaway => ({ kind: "refusal", method, sentence: null, refusal: null, strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: null, figures: [], numbers: [] });

/** The start of an answer: nothing said yet, nothing refused. */
export function answerTakeaway(method: string): Takeaway {
  return { ...empty(method), kind: "answer" };
}

/** A refusal in words: no sentence, no number, no strength, no range, no footer (nothing is claimed). */
export function refusalTakeaway(method: string, lines: string[]): Takeaway {
  return { ...empty(method), refusal: lines.join(" ") };
}

/** The verdict of the suitability checks as the lines a person reads: refusals, cautions and what was done differently (a
 * switch to another Method). `pairs` is how many pairs a far-off finding's "without them" strength is judged on. */
export function verdictLines(v: Verdict, ctx: TakeawayContext, pairs: number) {
  return { refusals: v.refusals.map((f) => findingText(f, ctx, pairs)), cautions: v.cautions.map((f) => findingText(f, ctx, pairs)), notes: v.switches.map((f) => findingText(f, ctx, pairs)) };
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
  const lines = verdictLines(verdict, ctx, c.n);
  if (lines.refusals.length > 0) return refusalTakeaway(method, lines.refusals);
  const strength = strengthOf(c.r, c.n, lines.cautions.length > 0);
  const [n, style] = [c.n, ctx.style];
  // Stryker disable next-line EqualityOperator: an r of 0 is "can't tell from chance" before this, so `<` and `<=` never differ.
  const key: CaseKey = strength === "cant-tell" ? "corr-cant-tell" : c.r < 0 ? "corr-opposite" : "corr-together";
  const strengthText = word(strength, ctx);
  const text = (k: CaseKey) => say(k, {}, ctxOf(ctx));
  const periods = c.pairs.map((p) => p.period);
  return {
    ...empty(method),
    kind: "answer",
    sentence: say(key, { a: a.name, b: b.name, n, span: c.period, strength: strengthText }, ctxOf(ctx)),
    strength,
    strengthText,
    basis: basisLine(c, ctx),
    cautions: lines.cautions,
    notes: lines.notes,
    footer: opts.footer === false ? null : footerText(ctx),
    figures: [{ label: text("numbers-pairs"), value: n, text: formatNumber(n, 0, style) }],
    numbers: [
      { label: text("numbers-method"), text: method },
      { label: text("numbers-r"), text: formatNumber(c.r, 2, style) },
      { label: text("numbers-pairs"), text: formatNumber(n, 0, style) },
      { label: text("numbers-periods"), text: `${periods[0]} – ${periods[periods.length - 1]}` },
      { label: text("numbers-basis"), text: basisText(c.basis) },
      { label: text("numbers-strength"), text: strengthText },
    ],
  };
}

/** A list of names in words: "A", "A and B", "A, B and C". */
function listOf(names: string[], ctx: TakeawayContext): string {
  const [and, comma] = [say("list-and", {}, ctxOf(ctx)), say("list-comma", {}, ctxOf(ctx))];
  const last = names[names.length - 1];
  return names.length === 1 ? last : `${names.slice(0, -1).join(comma)}${and}${last}`;
}

/** The Takeaway of Drivers: the Metrics that moved with the target the most (up to three, none that can't be told from
 * chance), each Metric's own strength word and cautions, one footer, and every Metric's numbers under Show the numbers. A
 * Metric whose own checks refuse is a row with its refusal, and never named in the sentence. */
export function driversTakeaway(target: Metric, ranked: Ranked[], ctx: TakeawayContext): DriversTakeaway {
  const method = say("numbers-method-pearson", {}, ctxOf(ctx));
  const rows = ranked.map(({ metric, result }) => ({ metric, result, takeaway: correlationTakeaway(target, metric, result, ctx, { footer: false }) }));
  const text = (k: CaseKey) => say(k, {}, ctxOf(ctx));
  const top = rows.find((r) => r.takeaway.kind === "answer");
  if (!top) return { ...refusalTakeaway(method, [say("drivers-empty", { target: target.name }, ctxOf(ctx))]), rows };
  const named = rows.filter((r) => r.takeaway.strength !== null && r.takeaway.strength !== "cant-tell").slice(0, 3).map((r) => r.metric.name);
  const base = { n: top.result.n, span: top.result.period, target: target.name };
  return {
    ...empty(method),
    kind: "answer",
    sentence: named.length > 0 ? say("drivers-some", { ...base, names: listOf(named, ctx) }, ctxOf(ctx)) : say("drivers-none", base, ctxOf(ctx)),
    strength: top.takeaway.strength,
    strengthText: top.takeaway.strengthText,
    basis: top.takeaway.basis,
    footer: footerText(ctx),
    figures: [{ label: text("numbers-pairs"), value: top.result.n, text: formatNumber(top.result.n, 0, ctx.style) }],
    numbers: rows
      .filter((r) => r.takeaway.kind === "answer")
      .map((r) => ({ label: r.metric.name, text: `${text("numbers-r")} ${formatNumber(r.result.r, 2, ctx.style)}, ${r.takeaway.basis}` })),
    rows: rows.map((r) => ({ metric: r.metric, takeaway: r.takeaway })),
  };
}
