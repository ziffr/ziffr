// @ts-nocheck
// Concentration (GLOSSARY: Breakdown, Takeaway; spec 0041, Methods `topShare` and `pareto`): how much of a whole sits in a few
// rows. `topShare` is the share of the n largest rows, `pareto` the fewest rows that reach a share (80 % unless told
// otherwise). Both are arithmetic, not an estimate, so they are worked out exactly on the rows' text (exact.ts) and the
// Takeaway says "worked out". Pure.
//
// `topShare` is the Extension ziffr/top-share (extensions/ziffr/top-share), read through the registry; `pareto` and the Takeaways are
// here. Rows are never dropped or fixed: a row that is not a number or is below zero, a whole that adds up to nothing and fewer than
// two rows each give no result, in words. Rows of the same size keep the order they were given in.
import { fractionOf, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "../exact";
import { builtInMethod } from "../extensions";
import { formatPercent } from "../format";
import { emptyTakeaway, listOf, refusalTakeaway, sayIn, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";

/** One row of a Breakdown: its label and its value. */
export type Row = { label: string; value: number };

/** Why rows have no share: fewer than 2, one that is not a number, one below zero, or a whole of 0; or an n or a share outside what is asked for. */
export type NoShare = "few" | "not-a-number" | "negative" | "nothing" | "ask";

/** A row of the result: its label, value, share of the whole (0 to 1) and the same in percent, each the double nearest to the exact result. */
export type Part = { label: string; value: number; share: number; percent: number };

/** What the share of the top rows comes to: `share` (0 to 1) of the whole, the `top` rows with each one's share, and the
 * whole's `total`. */
export type TopShare = { ok: true; share: number; percent: number; top: Part[]; rows: number; total: number; tied: boolean } | { ok: false; why: NoShare };

/** The fewest rows (largest first) that together reach the share asked for. `tied` says that a row of the same size as the
 * last one named was left out, so which of those rows is named is arbitrary (the count is not). */
export type Pareto = { ok: true; count: number; share: number; percent: number; top: Part[]; rows: number; target: number; tied: boolean } | { ok: false; why: NoShare };

/** The least number of rows a share means anything for. */
export const LEAST_ROWS = 2;
/** The share a Pareto asks for unless told otherwise. */
export const PARETO_SHARE = 0.8;

type Sorted = { label: string; value: number; exact: Fraction }[];
// The rows largest first (the order given on a tie), with their exact values, and their exact total; or why there is none.
function order(rows: Row[]): { sorted: Sorted; total: Fraction } | NoShare {
  if (rows.length < LEAST_ROWS) return "few";
  if (rows.some((r) => !Number.isFinite(r.value))) return "not-a-number";
  if (rows.some((r) => r.value < 0)) return "negative";
  // Largest first; rows of the same size keep the order they were given in (a sort is stable).
  const sorted = rows.map((r, i) => ({ ...r, exact: fractionOf(r.value), i })).sort((a, b) => Number(b.exact.num * a.exact.den - a.exact.num * b.exact.den));
  const total = sorted.reduce((t, r) => lowestTerms(plus(t, r.exact)), { num: BigInt(0), den: BigInt(1) });
  return total.num === BigInt(0) ? "nothing" : { sorted, total };
}
const isNoShare = (x: ReturnType<typeof order>): x is NoShare => typeof x === "string";

const percentOf = (part: Fraction, total: Fraction) => nearest(times(over(part, total), { num: BigInt(100), den: BigInt(1) }));
const named = (rs: Sorted, total: Fraction) => rs.map((r) => ({ label: r.label, value: r.value, share: nearest(over(r.exact, total)), percent: percentOf(r.exact, total) }));
// Whether a row of the size of the last one taken is left out as well.
const tiedAt = (sorted: Sorted, count: number) => count < sorted.length && sorted[count].exact.num * sorted[count - 1].exact.den === sorted[count - 1].exact.num * sorted[count].exact.den;

// The words the Extension refuses with, and the reason each is: what the Method says and what this module's result says.
const REASONS: Record<string, NoShare> = {
  "needs at least two rows to say how much of the whole the largest make up": "few",
  "a row is not a number, so nothing is worked out": "not-a-number",
  "a row is below zero, so the rows are not parts of one whole": "negative",
  "the rows add up to nothing, so there is no share to give": "nothing",
  "n must be a whole number from 1 to one fewer than the rows": "ask",
};

/** The share of the `n` largest rows of the whole: `n` a whole number from 1 to one fewer than the rows (all of them is 100 %,
 * and says nothing). Exact; `share` is the double nearest to it. The work is the Extension ziffr/top-share's. */
export function topShare(rows: Row[], n: number): TopShare {
  const found = builtInMethod("ziffr/top-share")(rows, n);
  return "refused" in found ? { ok: false, why: REASONS[found.refused] } : { ok: true, ...found };
}

/** The fewest rows, largest first, whose share of the whole reaches `target` (above 0 and at most 1; 80 % unless told otherwise): exactly, so
 * a row set that adds to exactly the target counts as reaching it. */
export function pareto(rows: Row[], target: number = PARETO_SHARE): Pareto {
  const found = order(rows);
  if (isNoShare(found)) return { ok: false, why: found };
  if (!(target > 0 && target <= 1)) return { ok: false, why: "ask" };
  const goal = times(fractionOf(target), found.total);
  let [count, running] = [0, { num: BigInt(0), den: BigInt(1) } as Fraction];
  // Rows of 0 are never needed: the goal is above 0 and is reached by the first rows that add up to it.
  while (minus(running, goal).num < BigInt(0)) running = lowestTerms(plus(running, found.sorted[count++].exact));
  const top = found.sorted.slice(0, count);
  return { ok: true, count, share: nearest(over(running, found.total)), percent: percentOf(running, found.total), top: named(top, found.total), rows: rows.length, target, tied: tiedAt(found.sorted, count) };
}

const refusalFor = (why: NoShare, name: string, rows: number, ctx: TakeawayContext): Takeaway => {
  const key = { few: "refuse-rows", "not-a-number": "refuse-not-a-number", negative: "refuse-negative", nothing: "refuse-nothing", ask: "refuse-ask" }[why] as "refuse-rows";
  return refusalTakeaway(sayIn("numbers-method-share", {}, ctx), [sayIn(key, { name, have: rows, need: LEAST_ROWS }, ctx)]);
};

const shareText = (percent: number, ctx: TakeawayContext) => formatPercent(percent, ctx.style);

// What both Takeaways share: the notes at a tie, the share as a figure, and the numbers (the share and each row's).
function shareAnswer(method: string, sentence: string, result: { tied: boolean; percent: number; top: Part[] }, ctx: TakeawayContext): Takeaway {
  return {
    ...emptyTakeaway(method),
    kind: "answer",
    sentence,
    notes: result.tied ? [sayIn("note-tied", {}, ctx)] : [],
    figures: [{ label: sayIn("numbers-share", {}, ctx), value: result.percent, text: shareText(result.percent, ctx) }],
    numbers: [
      { label: sayIn("numbers-method", {}, ctx), text: method },
      { label: sayIn("numbers-share", {}, ctx), text: shareText(result.percent, ctx) },
      ...result.top.map((r) => ({ label: r.label, text: shareText(r.percent, ctx) })),
    ],
  };
}

/** The Takeaway of the share of the top rows: "Worked out: the top 3 of 8 rows make up 71.0 % of Revenue: A, B and C." A
 * refusal says what is wrong with the rows and carries no number. */
export function topShareTakeaway(name: string, rows: Row[], n: number, ctx: TakeawayContext): Takeaway {
  const result = topShare(rows, n);
  if (!result.ok) return refusalFor(result.why, name, rows.length, ctx);
  const method = sayIn("numbers-method-share", {}, ctx);
  return shareAnswer(method, sayIn("share-top", { name, top: n, rows: result.rows, share: shareText(result.percent, ctx), names: listOf(result.top.map((r) => r.label), ctx) }, ctx), result, ctx);
}

/** The Takeaway of a Pareto: "Worked out: 3 of 8 rows make up 71.0 % of Revenue, the fewest that reach 70.0 %: A, B and C." */
export function paretoTakeaway(name: string, rows: Row[], ctx: TakeawayContext, target: number = PARETO_SHARE): Takeaway {
  const result = pareto(rows, target);
  if (!result.ok) return refusalFor(result.why, name, rows.length, ctx);
  const method = sayIn("numbers-method-pareto", {}, ctx);
  return shareAnswer(method, sayIn("share-pareto", { name, top: result.count, rows: result.rows, share: shareText(result.percent, ctx), target: shareText(result.target * 100, ctx), names: listOf(result.top.map((r) => r.label), ctx) }, ctx), result, ctx);
}
