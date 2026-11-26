// Formulas of Derived Metrics (GLOSSARY: Derived Metric), like "({revenue} - {cost}) / {revenue} * 100": + - * /,
// brackets, numbers such as 12 or 0.5, and {slug} for another Metric. Two functions reach back one period:
// prev({odometer}) is the input's value in the period before, change({odometer}) this period's minus the previous
// one's (ticket #619). target({commit}) reads a Metric's target for the period (spec 0062). A formula is read
// whole or refused (spec 0022): anything it cannot read gives no value, never a number from the part it could read.
import { bitLength, fractionOf, fractionOfText, lowestTerms, minus, nearest, over, plus, times, type Fraction } from "./exact";
import type { Metric, Point } from "./types";
import { spendOn, widthOf } from "./work-bound";

/** The slugs of the metrics a Derived Metric's formula reads, each once. */
export function formulaInputs(formula: string): string[] {
  return [...new Set([...formula.matchAll(/\{([a-z0-9-]+)\}/g)].map((m) => m[1]))];
}

/** Whether a formula reaches back to the previous period (prev or change): such a Derived Metric has a value for a
 * period only, never for a longer span, since "the previous quarter" of a monthly Metric is not what it was asked for. */
export function usesPrevious(formula: string): boolean {
  return /\b(?:prev|change)\s*\(/.test(formula);
}

/** The slugs of the Metrics whose target a formula reads with target(), each once. Each is an input too (formulaInputs). */
export function targetInputs(formula: string): string[] {
  return [...new Set([...formula.matchAll(/\btarget\s*\(\s*\{([a-z0-9-]+)\}\s*\)/g)].map((m) => m[1]))];
}

/** Whether a formula reads a target. */
export function usesTarget(formula: string): boolean {
  return targetInputs(formula).length > 0;
}

/** The one number of a Target Range: its only bound, or the number both bounds are; none for a band between two numbers
 * or no range. Never one end of a band and never its middle (spec 0062): which one a person meant would be a guess. */
export function rangeNumber(metric: Pick<Metric, "target_min" | "target_max">): number | undefined {
  const ends = [metric.target_min, metric.target_max].filter((v) => v !== null && v !== undefined).map(Number);
  const [first] = ends;
  return Number.isFinite(first) && ends.every((v) => v === first) ? first : undefined;
}

/** What target() gives for each of a Metric's periods: the period's Target Series value (the one given last), else the
 * Target Range's number. A series value that is not a number gives none, never the range instead. */
export function targetReader(metric: Pick<Metric, "target_min" | "target_max">, series: readonly Point[]): (period: string) => number | undefined {
  const own = new Map(series.map((p) => [p.period, p.value]));
  const range = rangeNumber(metric);
  return (period) => {
    if (!own.has(period)) return range;
    const v = own.get(period);
    return Number.isFinite(v) ? v : undefined;
  };
}

/** Why a Derived Metric that reads a target may have no value at all, or null: an input has neither a Target Series nor
 * a Target Range with one number. `inputs` are the Metrics the viewer was given; `targets` their Target Series. */
export function targetProblem(metric: Pick<Metric, "formula">, inputs: readonly Pick<Metric, "id" | "slug" | "name" | "target_min" | "target_max">[], targets: Record<number, readonly Point[]>): string | null {
  const without = targetInputs(metric.formula ?? "")
    .flatMap((s) => inputs.find((m) => m.slug === s) ?? [])
    .filter((m) => !targets[m.id]?.length && rangeNumber(m) === undefined)
    .map((m) => m.name);
  return without.length ? `It reads the target of ${without.join(" and ")}, which has no number to read: set a Target Range with one bound, such as “at least 500”, or Target Series values.` : null;
}

/** The longest formula read, in characters: a formula is a short expression, and these bounds keep the exact
 * arithmetic below from growing without limit on one written to burn time (#126). */
export const FORMULA_MAX_LENGTH = 500;
/** The most operations (+ − × ÷ and minus signs) a formula may have. */
export const FORMULA_MAX_OPERATIONS = 50;
/** The most digits a number in a formula may have. */
export const FORMULA_MAX_DIGITS = 20;
/** The most bits a numerator or denominator may reach while a formula is worked out; beyond, there is no value. With
 * the bounds above and values of at most 10^15 with six decimals, as values are kept, no formula comes near it. */
export const FORMULA_MAX_BITS = 8192;

/** A formula read into a tree: a number, a Metric, a Metric's value one period back, a Metric's target, a minus sign in front of a value, or two values with an operator between them. */
export type FormulaNode = Node;
type Node = { k: "num"; v: string } | { k: "ref"; slug: string } | { k: "back"; slug: string; change: boolean } | { k: "target"; slug: string } | { k: "neg"; a: Node } | { k: "op"; op: "+" | "-" | "*" | "/"; a: Node; b: Node };
type Token = { t: string; at: number };

/** A formula read into a tree, or why it cannot be read, in words for the person writing it. */
function parse(formula: string): { ok: true; node: Node } | { ok: false; reason: string } {
  if (formula.length > FORMULA_MAX_LENGTH) return { ok: false, reason: `The formula is longer than ${FORMULA_MAX_LENGTH} characters.` };
  const tokens: Token[] = [];
  // Stryker disable next-line Regex: white space is read one character or a run at a time, and left out either way
  const re = /\s+|(?:prev|change|target)\s*\(\s*\{[a-z0-9-]+\}\s*\)|\{[a-z0-9-]+\}|\d+(?:\.\d+)?|[()+\-*/]/y;
  for (let at = 0; at < formula.length; ) {
    re.lastIndex = at;
    const m = re.exec(formula);
    if (!m) {
      const ch = formula[at];
      const fn = /^(prev|change|target)\b/.exec(formula.slice(at));
      if (fn) return { ok: false, reason: `${fn[1]} takes one Metric: write ${fn[1]}(${fn[1] === "target" ? "{commit}" : "{odometer}"}), with the Metric's slug in lower case.` };
      if (ch === "{") return { ok: false, reason: `"${formula.slice(at, formula.indexOf("}", at) + 1 || undefined)}" does not name a Metric: write its slug in lower case, such as {revenue}.` };
      // Right after a digit, or a point: written as part of a number.
      if (/\d$/.test(formula.slice(0, at)) || ch === ".") return { ok: false, reason: `"${ch}" is not part of a number here: write numbers such as 12 or 0.5.` };
      return { ok: false, reason: `"${ch}" cannot be read: a formula has + - * /, brackets, numbers and {metric}.` };
    }
    // White space only separates.
    if (m[0].trim()) tokens.push({ t: m[0], at });
    at += m[0].length;
  }
  if (!tokens.length) return { ok: false, reason: "The formula is empty." };
  const long = tokens.find((t) => /^\d/.test(t.t) && t.t.replace(".", "").length > FORMULA_MAX_DIGITS);
  if (long) return { ok: false, reason: `"${long.t.slice(0, 24)}…" has more than ${FORMULA_MAX_DIGITS} digits.` };
  if (tokens.filter((t) => OPERATORS.has(t.t)).length > FORMULA_MAX_OPERATIONS) return { ok: false, reason: `The formula has more than ${FORMULA_MAX_OPERATIONS} operations.` };
  let i = 0;
  const fail = (reason: string): never => { throw new FormulaError(reason); };
  function primary(): Node {
    const tok = tokens[i++];
    if (!tok) return fail("The formula ends where a value is missing.");
    if (tok.t === "(") {
      const node = expr();
      if (tokens[i]?.t !== ")") return fail("A bracket is opened and not closed.");
      i++;
      return node;
    }
    if (tok.t === "-") return { k: "neg", a: primary() };
    if (tok.t.startsWith("{")) return { k: "ref", slug: tok.t.slice(1, -1) };
    if (/^[a-z]/.test(tok.t)) {
      const slug = tok.t.slice(tok.t.indexOf("{") + 1, tok.t.indexOf("}"));
      return tok.t.startsWith("target") ? { k: "target", slug } : { k: "back", change: tok.t.startsWith("change"), slug };
    }
    if (tok.t === ")") return fail("A bracket is closed that was not opened.");
    if (OPERATORS.has(tok.t)) return fail(`"${tok.t}" stands where a value is missing.`);
    // What is left is a number.
    return { k: "num", v: tok.t };
  }
  function term(): Node {
    let node = primary();
    while (tokens[i]?.t === "*" || tokens[i]?.t === "/") {
      const op = tokens[i++].t as "*" | "/";
      node = { k: "op", op, a: node, b: primary() };
    }
    return node;
  }
  function expr(): Node {
    let node = term();
    while (tokens[i]?.t === "+" || tokens[i]?.t === "-") {
      const op = tokens[i++].t as "+" | "-";
      node = { k: "op", op, a: node, b: term() };
    }
    return node;
  }
  try {
    const node = expr();
    const rest = tokens[i];
    // What can be left after a whole expression: an operator would have been read with it, so a closing bracket
    // or a value.
    if (rest) return { ok: false, reason: rest.t === ")" ? "A bracket is closed that was not opened." : `Two values stand side by side without + - * or / between them, before "${rest.t}".` };
    return { ok: true, node };
  } catch (e) {
    // Only `fail` throws while reading.
    return { ok: false, reason: (e as FormulaError).message };
  }
}

/** A formula read into a tree, or why it cannot be read (the same reading `evaluate` and `checkFormula` go by): for what draws the formula's parts, such as the formula tree of a View Design. */
export function readFormula(formula: string): { ok: true; node: FormulaNode } | { ok: false; reason: string } {
  return parse(formula);
}

class FormulaError extends Error {}

// The operators a formula may have; a minus where a value stands negates it.
const OPERATORS = new Set(["+", "-", "*", "/"]);

// Worked out exactly on the inputs' text and the formula's numbers (exact.ts), so {a} - {b} for 0.3 and 0.1 is 0.2 and
// a margin is the double nearest to the exact one. Null for no value: an input that is missing or not a number, a
// division by zero, or a result past FORMULA_MAX_BITS.
function run(n: Node, vars: Record<string, number>, before: Record<string, number>, targets: Record<string, number>): Fraction | null {
  switch (n.k) {
    case "num": return fractionOfText(n.v);
    case "ref": {
      const v = vars[n.slug];
      return Number.isFinite(v) ? fractionOf(v) : null;
    }
    case "back": {
      // Both this period's value and the previous one's are needed, for prev as for change: a Derived Metric has a
      // value only in a period where each of its inputs has one.
      const was = before[n.slug];
      const now = vars[n.slug];
      if (!Number.isFinite(was) || !Number.isFinite(now)) return null;
      return n.change ? minus(fractionOf(now), fractionOf(was)) : fractionOf(was);
    }
    case "target": {
      // The Metric needs a value in the period too, as every input does: a period without one has no result, so one
      // whose values and targets a Retention removed is never worked out from today's Target Range (spec 0062).
      const goal = targets[n.slug];
      return Number.isFinite(goal) && Number.isFinite(vars[n.slug]) ? fractionOf(goal) : null;
    }
    case "neg": {
      const a = run(n.a, vars, before, targets);
      return a && { num: -a.num, den: a.den };
    }
    case "op": {
      const a = run(n.a, vars, before, targets), b = run(n.b, vars, before, targets);
      if (!a || !b || (n.op === "/" && b.num === BigInt(0))) return null;
      // Kept in lowest terms after every step, and stopped past FORMULA_MAX_BITS, so nothing grows without limit.
      const r = lowestTerms(n.op === "+" ? plus(a, b) : n.op === "-" ? minus(a, b) : n.op === "*" ? times(a, b) : over(a, b));
      // A numerator past the bound with a denominator within it is a value past the doubles, which `evaluate` refuses
      // anyway; the bound on both is what keeps the work small.
      // Stryker disable next-line EqualityOperator,ConditionalExpression: a safety bound, not a rule of results; no value Ziffr keeps comes to exactly 8,192 bits, and a numerator past it alone means no double
      return bitLength(r.num) > FORMULA_MAX_BITS || bitLength(r.den) > FORMULA_MAX_BITS ? null : r;
    }
  }
}

/** A formula's value for the given inputs; null when the formula cannot be read whole, an input is missing, or the
 * result is not a finite number (a division by zero). `before` holds the inputs' values one period earlier, for prev
 * and change; left out, a formula that uses them has no value. `targets` holds what target() gives for each Metric it
 * names (targetReader); left out, a formula that reads a target has no value. */
export function evaluate(formula: string, vars: Record<string, number>, before: Record<string, number> = {}, targets: Record<string, number> = {}): number | null {
  const p = parse(formula);
  if (!p.ok) return null;
  const v = run(p.node, vars, before, targets);
  if (!v) return null;
  const x = nearest(v);
  // −0 is 0; a result beyond the doubles (a division by a tiny value) is none.
  return Number.isFinite(x) ? x || 0 : null;
}

/** A range of exact values, both ends included. */
export type Bounds = { lo: Fraction; hi: Fraction };

// A formula worked out on ranges of values (interval arithmetic) on exact fractions: every operation returns the range that
// holds the result for any values within the ranges, and for a formula that names each Metric once it is the range itself. Null
// where a range holds 0 under a division, where a Metric is not given or the formula reaches back (prev, change) or reads a target, and past the bits bound.
function runBounds(n: Node, vars: Record<string, Bounds>): Bounds | null {
  switch (n.k) {
    case "num": {
      const v = fractionOfText(n.v);
      return { lo: v, hi: v };
    }
    case "ref": return Object.prototype.hasOwnProperty.call(vars, n.slug) ? vars[n.slug] : null;
    case "back": case "target": return null;
    case "neg": {
      const a = runBounds(n.a, vars);
      return a && { lo: { num: -a.hi.num, den: a.hi.den }, hi: { num: -a.lo.num, den: a.lo.den } };
    }
    case "op": {
      const a = runBounds(n.a, vars), b = runBounds(n.b, vars);
      if (!a || !b) return null;
      // The four products (or sums) of the ends are charged to the work budget of the Method that asked, by the size of their operands.
      spendOn(2 * Math.max(widthOf(a.lo), widthOf(a.hi)), 2 * Math.max(widthOf(b.lo), widthOf(b.hi)));
      let out: Bounds;
      if (n.op === "+") out = { lo: plus(a.lo, b.lo), hi: plus(a.hi, b.hi) };
      else if (n.op === "-") out = { lo: minus(a.lo, b.hi), hi: minus(a.hi, b.lo) };
      else {
        // A product has its ends among the products of the ends; a quotient is the product with the divisor's reciprocal, whose
        // range is bounded only where the divisor is wholly above or wholly below 0.
        let d = b;
        if (n.op === "/") {
          const zero = BigInt(0);
          if (b.lo.num <= zero && b.hi.num >= zero) return null;
          d = { lo: over({ num: BigInt(1), den: BigInt(1) }, b.hi), hi: over({ num: BigInt(1), den: BigInt(1) }, b.lo) };
        }
        const ends = [times(a.lo, d.lo), times(a.lo, d.hi), times(a.hi, d.lo), times(a.hi, d.hi)];
        // Stryker disable next-line EqualityOperator: of two equal products either is the end
        const below = (x: Fraction, y: Fraction) => x.num * y.den < y.num * x.den;
        out = { lo: ends.reduce((x, y) => (below(y, x) ? y : x)), hi: ends.reduce((x, y) => (below(x, y) ? y : x)) };
      }
      const r = { lo: lowestTerms(out.lo), hi: lowestTerms(out.hi) };
      // Stryker disable next-line EqualityOperator,ConditionalExpression: a safety bound, as in `run`
      return [r.lo, r.hi].some((f) => bitLength(f.num) > FORMULA_MAX_BITS || bitLength(f.den) > FORMULA_MAX_BITS) ? null : r;
    }
  }
}

/** A formula's range of values for ranges of its inputs ({slug}: lo and hi), exact: where each Metric is named once it is the range
 * the result takes; where a Metric is named more than once it holds every result the formula can give (never less). Null where it
 * cannot be given: the formula cannot be read whole, an input has no range, a division is by a range that holds 0, it reaches back or it reads a target. */
export function evaluateRange(formula: string, vars: Record<string, Bounds>): Bounds | null {
  const p = parse(formula);
  return p.ok ? runBounds(p.node, vars) : null;
}

/** The Metrics a Derived Metric may be computed from: what `checkFormula` needs to know of each. */
export type FormulaInput = Pick<Metric, "slug" | "name" | "period" | "aggregation" | "formula">;

/** Why a Derived Metric's inputs cannot be combined, or null: one is a Derived Metric itself (series are computed one
 * level deep, so it has no values here), or they are counted by different periods, or by another period than the
 * Derived Metric itself, so no period has a value of each. Inputs not among `inputs` are skipped (a
 * View Link leaves them out); `checkFormula` refuses those. Shown on the Metric's page and in widgets. */
export function inputsProblem(metric: Pick<Metric, "formula" | "period" | "inputs_withheld">, inputs: FormulaInput[]): string | null {
  if (!metric.formula) return null;
  // Its owner may no longer share one of its inputs (ticket #619): no values, and no word of which input it is.
  if (metric.inputs_withheld) return "Its owner can no longer share one of the Metrics it is calculated from, so it shows no values.";
  const used = known(metric.formula, inputs);
  // Series are computed one level deep (workspace-data.ts): a Derived Metric among the inputs has no values here.
  const derived = used.filter((m) => m.formula).map((m) => m.name);
  if (derived.length) return `${derived.join(" and ")} ${derived.length === 1 ? "is a Derived Metric itself" : "are Derived Metrics themselves"}: compute from the Metrics ${derived.length === 1 ? "it is" : "they are"} made of.`;
  const periods = new Set(used.map((m) => m.period));
  if (periods.size > 1) return "Its inputs are counted by different periods, so no period has a value of each. Give them the same period.";
  const [p] = periods;
  if (p && p !== metric.period) return `Its inputs are counted by ${p}, it by ${metric.period}. Give it the period of its inputs.`;
  return null;
}

/** The inputs of a formula set to Aggregation none, by name; they have no quarter of months. */
function notCombining(formula: string, inputs: FormulaInput[]): string[] {
  return known(formula, inputs).filter((m) => !m.formula && m.aggregation === "none").map((m) => m.name);
}

/** The inputs a formula names that are among `inputs`, in the order it names them. */
function known(formula: string, inputs: FormulaInput[]): FormulaInput[] {
  return formulaInputs(formula).map((s) => inputs.find((m) => m.slug === s)).filter((m): m is FormulaInput => m !== undefined);
}

const noneWords = (names: string[]) => `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} set to Aggregation none`;

/** Why a Derived Metric's inputs cannot be combined into longer periods (a quarter of months), or null: an input
 * set to Aggregation none has no quarter, so neither has the Derived Metric. */
export function inputsNotCombined(metric: Pick<Metric, "formula">, inputs: FormulaInput[]): string | null {
  if (metric.formula && usesPrevious(metric.formula)) return "Shown by its own period: it reaches back to the previous period (prev or change), so it cannot be combined into longer periods.";
  const names = metric.formula ? notCombining(metric.formula, inputs) : [];
  return names.length ? `Shown by its own period: ${noneWords(names)}, so it cannot be combined into longer periods.` : null;
}

/** Why a formula is refused for a Derived Metric, or null when it can be written. Checks that it is read whole, that
 * every {slug} is one of `inputs` (the Workspace's Metrics) and not the Metric itself or another Derived Metric, and
 * that its inputs can be combined: one period, the Metric's own, and none set to Aggregation none. Called wherever
 * the core writes a formula. */
export function checkFormula(formula: string, inputs: FormulaInput[], metric?: Pick<Metric, "slug" | "period">): string | null {
  const p = parse(formula);
  if (!p.ok) return p.reason;
  const slugs = formulaInputs(formula);
  if (!slugs.length) return "The formula names no Metric: a Derived Metric is computed from others, such as {revenue} / {orders}.";
  const bySlug = new Map(inputs.map((m) => [m.slug, m]));
  for (const s of slugs) {
    if (metric && s === metric.slug) return `{${s}} is this Metric itself: a formula cannot read its own value.`;
    if (!bySlug.has(s)) return `{${s}} is not a Metric of this Workspace.`;
  }
  // A Derived Metric among the inputs, or inputs of another period: inputsProblem says which.
  const own = metric?.period ?? bySlug.get(slugs[0])!.period;
  const periods = inputsProblem({ formula, period: own }, inputs);
  if (periods) return periods;
  // A formula that reaches back is never combined into longer periods, so an input without an Aggregation is fine.
  const none = usesPrevious(formula) ? [] : notCombining(formula, inputs);
  return none.length ? `${noneWords(none)}: set ${none.length === 1 ? "it" : "them"} to sum, average or last value, so this Metric can be combined into longer periods.` : null;
}
