// Partial correlation (GLOSSARY: Analysis, Takeaway; spec 0041, Method `partialCorrelation`): whether two Metrics move
// together once one to four other Metrics are held the same. The correlation of what is left of each after the others'
// straight-line share is taken out. Pure.
//
// Worked out exactly on the values' text (exact.ts): with S the sums of products about the means, the part of A left after
// the controls C is S_aa·C = S_aa − S_aC · S_CC⁻¹ · S_Ca, and in the same way S_bb·C and S_ab·C, so r² = S_ab·C² ÷
// (S_aa·C · S_bb·C), with the sign of S_ab·C. S_CC⁻¹ is found by Gauss-Jordan elimination on fractions. Only the square root
// of the double nearest to r² is a double's. A control that is a straight-line mix of the other controls has no inverse:
// the Method says so, and gives no number.
import { readSeries } from "../basis";
import { fractionOf, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "../exact";
import { formatNumber } from "../format";
import { MIN_PAIRS } from "../correlation";
import type { Span } from "../periods";
import { checkSuitability } from "../suitability";
import { strengthOf, type StrengthWord } from "../takeaways/strength";
import { listOf, pairsAnswer, refusalTakeaway, sayIn, strengthWordIn, verdictLines, wideRefusal, type Takeaway, type TakeawayContext } from "../takeaways/takeaway";
import type { Point } from "../types";

/** How many other Metrics can be held the same: at least 1, at most 4. */
export const CONTROLS = { least: 1, most: 4 } as const;

/** Why a partial correlation has no number: too few common periods, the wrong number of controls, controls that move so
 * closely they cannot be told apart, or a Metric that the controls explain completely (nothing left to compare). */
export type NoPartial = "controls" | "too-few" | "collinear" | "explained";

/** A partial correlation, or why there is none. `n` is the periods all the series have; `held` how many were held the same. */
export type PartialResult = { ok: true; r: number; n: number; held: number; periods: string[] } | { ok: false; why: NoPartial; n: number };

const ZERO = BigInt(0);
const ONE = BigInt(1);
const whole = (n: number): Fraction => ({ num: BigInt(n), den: ONE });
const exact = (f: (a: Fraction, b: Fraction) => Fraction) => (a: Fraction, b: Fraction) => lowestTerms(f(a, b));
const [add, sub, mul, div] = [exact(plus), exact(minus), exact(times), exact(over)];
const sumOf = (fs: Fraction[]) => fs.reduce(add, whole(0));

// The inverse of a square matrix of fractions by Gauss-Jordan elimination, null where it has none (a column with no pivot).
function inverse(m: Fraction[][]): Fraction[][] | null {
  const k = m.length;
  const rows = m.map((row, i) => [...row, ...Array.from({ length: k }, (_, j) => whole(i === j ? 1 : 0))]);
  for (let col = 0; col < k; col++) {
    const pivot = rows.findIndex((row, i) => i >= col && row[col].num !== ZERO);
    if (pivot < 0) return null;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const lead = rows[col][col];
    rows[col] = rows[col].map((v) => div(v, lead));
    for (let i = 0; i < k; i++) {
      if (i === col) continue;
      const factor = rows[i][col];
      rows[i] = rows[i].map((v, j) => sub(v, mul(factor, rows[col][j])));
    }
  }
  return rows.map((row) => row.slice(k));
}

/** The word for a partial correlation over `n` periods with `held` Metrics held the same: the controls use up degrees of freedom,
 * so the chance rule is read on the pairs less the Metrics held. */
export function partialStrength(r: number, n: number, held: number, capped = false): StrengthWord {
  return strengthOf(r, n - held, capped);
}

/** The partial correlation of `a` and `b` with `controls` (1 to 4 series) held the same, on the periods all of them have
 * (a value that is not a number is no value; a period given twice counts once with the value given last). Fewer than
 * `MIN_PAIRS` + the number of controls common periods, or the wrong number of controls, gives no number, and so do
 * controls that cannot be told apart and an `a` or `b` that the controls explain completely. */
export function partialCorrelation(a: Point[], b: Point[], controls: Point[][]): PartialResult {
  const held = controls.length;
  if (held < CONTROLS.least || held > CONTROLS.most) return { ok: false, why: "controls", n: 0 };
  const all = [a, b, ...controls].map((s) => new Map(readSeries(s).map((p) => [p.period, p.value])));
  // The first series is read oldest first, so the periods all have come out oldest first too.
  const periods = [...all[0].keys()].filter((p) => all.every((m) => m.has(p)));
  const n = periods.length;
  if (n < MIN_PAIRS + held) return { ok: false, why: "too-few", n };
  const columns = all.map((m) => periods.map((p) => fractionOf(m.get(p)!)));
  const count = whole(n);
  // Sums of products about the means, times n (the factor n cancels in r²): n·Σxy − Σx·Σy.
  const scatter = (x: Fraction[], y: Fraction[]) => sub(mul(count, sumOf(x.map((v, i) => mul(v, y[i])))), mul(sumOf(x), sumOf(y)));
  const s = columns.map((x) => columns.map((y) => scatter(x, y)));
  const at = (rows: number[], cols: number[]) => rows.map((i) => cols.map((j) => s[i][j]));
  const cs = Array.from({ length: held }, (_, i) => i + 2);
  const inv = inverse(at(cs, cs));
  if (!inv) return { ok: false, why: "collinear", n };
  // S_xy·C = S_xy − S_xC · S_CC⁻¹ · S_Cy, for x and y each of a and b.
  const left = (x: number, y: number) => {
    const sxc = at([x], cs)[0];
    const scy = at(cs, [y]).map((r) => r[0]);
    return sub(s[x][y], sumOf(sxc.map((v, i) => mul(v, sumOf(inv[i].map((w, j) => mul(w, scy[j])))))));
  };
  const [saa, sbb, sab] = [left(0, 0), left(1, 1), left(0, 1)];
  if (saa.num === ZERO || sbb.num === ZERO) return { ok: false, why: "explained", n };
  const r2 = nearest(div(mul(sab, sab), mul(saa, sbb)));
  return { ok: true, r: (sab.num < ZERO ? -1 : 1) * Math.sqrt(r2), n, held, periods };
}

/** The Takeaway of a partial correlation: `a` and `b` with `held` (named) held the same. The suitability checks run on the
 * periods all the series have (the fit's minimum for the Metrics weighed, 8 + 4 per Metric, and at most one Metric per 6
 * periods): a refusal says what is missing, a caution is said above the answer and keeps the strength below "strong". */
export function partialTakeaway(names: { a: string; b: string; held: string[] }, a: Point[], b: Point[], controls: Point[][], span: Span, ctx: TakeawayContext): Takeaway {
  const method = sayIn("numbers-method-partial", {}, ctx);
  // Values too wide to work out exactly are refused before the exact arithmetic is started (work-bound.ts).
  // Stryker disable next-line ArrayDeclaration,ArrowFunction: without these values the check below refuses with the same words; this only saves the exact work before it.
  const wide = wideRefusal(method, [{ name: names.a, points: a }, { name: names.b, points: b }, ...controls.map((c, i) => ({ name: names.held[i], points: c }))].map((s) => ({ name: s.name, values: readSeries(s.points).map((p) => p.value) })), ctx);
  // Stryker disable next-line ConditionalExpression: without this return the check below refuses with the same words; this only saves the exact work before it.
  if (wide) return wide;
  const result = partialCorrelation(a, b, controls);
  const refuse = (key: "refuse-controls" | "refuse-collinear" | "refuse-explained") => refusalTakeaway(method, [sayIn(key, { name: names.a, other: names.b, have: controls.length, least: CONTROLS.least, most: CONTROLS.most }, ctx)]);
  if (!result.ok && result.why === "controls") return refuse("refuse-controls");
  // The periods every series has, for the checks; with too few the checks refuse in the Method's words.
  const common = readSeries(a).filter((p) => [b, ...controls].every((s) => readSeries(s).some((q) => q.period === p.period))).map((p) => p.period);
  const keep = (s: Point[]) => readSeries(s).filter((p) => common.includes(p.period));
  const [xs, ys, cs] = [keep(a), keep(b), controls.map(keep)];
  const verdict = checkSuitability("partial", {
    series: [{ name: names.a, points: xs }, { name: names.b, points: ys }, ...cs.map((c, i) => ({ name: names.held[i], points: c }))],
    span,
    periods: common.length,
    drivers: controls.length + 1,
    scale: 1,
    rerun: (left) => {
      const r = partialCorrelation(xs.filter((p) => !left.has(p.period)), ys, cs);
      return r.ok ? { value: r.r } : null;
    },
  });
  const lines = verdictLines(verdict, ctx, common.length, (r, n) => partialStrength(r, n, controls.length));
  if (lines.refusals.length > 0) return refusalTakeaway(method, lines.refusals);
  // Past the checks there are enough periods, so the only refusals left are the two the numbers themselves find.
  if (!result.ok) return refuse(result.why === "collinear" ? "refuse-collinear" : "refuse-explained");
  const { r, n, held } = result;
  const strength = partialStrength(r, n, held, lines.cautions.length > 0);
  const strengthText = strengthWordIn(strength, ctx);
  // Stryker disable next-line EqualityOperator: an r of 0 is "can't tell from chance" before this, so `<` and `<=` never differ.
  const key = strength === "cant-tell" ? "partial-cant-tell" : r < 0 ? "partial-opposite" : "partial-together";
  const listed = listOf(names.held, ctx);
  const answer = pairsAnswer(method, ctx, { sentence: sayIn(key, { a: names.a, b: names.b, held: listed, n, span, strength: strengthText }, ctx), strength, basis: sayIn("basis-over", { basis: sayIn("basis-held", { held: listed }, ctx), n, span }, ctx), lines, n });
  return {
    ...answer,
    numbers: [
      { label: sayIn("numbers-method", {}, ctx), text: method },
      { label: sayIn("numbers-r", {}, ctx), text: formatNumber(r, 2, ctx.style) },
      { label: sayIn("numbers-held", {}, ctx), text: listed },
      { label: sayIn("numbers-pairs", {}, ctx), text: formatNumber(n, 0, ctx.style) },
      { label: sayIn("numbers-strength", {}, ctx), text: strengthText },
    ],
  };
}
