// Formulas of Derived Metrics (GLOSSARY: Derived Metric), like "({revenue} - {cost}) / {revenue} * 100": + - * /,
// brackets, numbers such as 12 or 0.5, and {slug} for another Metric. A formula is read whole or refused (spec 0022):
// anything it cannot read gives no value, never a number from the part it could read.
import { fractionOf, fractionOfText, minus, nearest, over, plus, times, type Fraction } from "./exact";
import type { Metric } from "./types";

/** The slugs of the metrics a Derived Metric's formula reads, each once. */
export function formulaInputs(formula: string): string[] {
  return [...new Set([...formula.matchAll(/\{([a-z0-9-]+)\}/g)].map((m) => m[1]))];
}

type Node = { k: "num"; v: string } | { k: "ref"; slug: string } | { k: "neg"; a: Node } | { k: "op"; op: "+" | "-" | "*" | "/"; a: Node; b: Node };
type Token = { t: string; at: number };

/** A formula read into a tree, or why it cannot be read, in words for the person writing it. */
function parse(formula: string): { ok: true; node: Node } | { ok: false; reason: string } {
  const tokens: Token[] = [];
  const re = /\s+|\{[a-z0-9-]+\}|\d+(?:\.\d+)?|[()+\-*/]/y;
  for (let at = 0; at < formula.length; ) {
    re.lastIndex = at;
    const m = re.exec(formula);
    if (!m) {
      const ch = formula[at];
      if (ch === "{") return { ok: false, reason: `"${formula.slice(at, formula.indexOf("}", at) + 1 || undefined)}" does not name a Metric: write its slug in lower case, such as {revenue}.` };
      if (/\d/.test(formula[at - 1] ?? "") || ch === ".") return { ok: false, reason: `"${ch}" is not part of a number here: write numbers such as 12 or 0.5.` };
      return { ok: false, reason: `"${ch}" cannot be read: a formula has + - * /, brackets, numbers and {metric}.` };
    }
    if (!/^\s/.test(m[0])) tokens.push({ t: m[0], at });
    at += m[0].length;
  }
  if (!tokens.length) return { ok: false, reason: "The formula is empty." };
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
    if (/^\d/.test(tok.t)) return { k: "num", v: tok.t };
    return fail(tok.t === ")" ? "A bracket is closed that was not opened." : `"${tok.t}" stands where a value is missing.`);
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

class FormulaError extends Error {}

// Worked out exactly on the inputs' text and the formula's numbers (exact.ts), so {a} - {b} for 0.3 and 0.1 is 0.2 and
// a margin is the double nearest to the exact one; a division by zero or an input that is not a number gives none.
function run(n: Node, vars: Record<string, number>): Fraction {
  switch (n.k) {
    case "num": return fractionOfText(n.v);
    case "ref": {
      const v = vars[n.slug];
      if (v === undefined || !Number.isFinite(v)) throw new FormulaError("missing");
      return fractionOf(v);
    }
    case "neg": {
      const a = run(n.a, vars);
      return { num: -a.num, den: a.den };
    }
    case "op": {
      const a = run(n.a, vars), b = run(n.b, vars);
      if (n.op === "/" && b.num === BigInt(0)) throw new FormulaError("division by zero");
      return n.op === "+" ? plus(a, b) : n.op === "-" ? minus(a, b) : n.op === "*" ? times(a, b) : over(a, b);
    }
  }
}

/** A formula's value for the given inputs; null when the formula cannot be read whole, an input is missing, or the
 * result is not a finite number (a division by zero). */
export function evaluate(formula: string, vars: Record<string, number>): number | null {
  const p = parse(formula);
  if (!p.ok) return null;
  try {
    const v = nearest(run(p.node, vars));
    // −0 is 0; a result beyond the doubles (a division by a tiny value) is none.
    return Number.isFinite(v) ? v || 0 : null;
  } catch {
    return null;
  }
}

/** The Metrics a Derived Metric may be computed from: what `checkFormula` needs to know of each. */
export type FormulaInput = Pick<Metric, "slug" | "name" | "period" | "aggregation" | "formula">;

/** Why a Derived Metric's inputs cannot be combined, or null: one is a Derived Metric itself (series are computed one
 * level deep, so it has no values here), or they are counted by different periods, or by another period than the
 * Derived Metric itself, so no period has a value of each. Inputs not among `inputs` are skipped (a
 * View Link leaves them out); `checkFormula` refuses those. Shown on the Metric's page and in widgets. */
export function inputsProblem(metric: Pick<Metric, "formula" | "period">, inputs: FormulaInput[]): string | null {
  if (!metric.formula) return null;
  const bySlug = new Map(inputs.map((m) => [m.slug, m]));
  const used = formulaInputs(metric.formula).flatMap((s) => bySlug.get(s) ?? []);
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
  const bySlug = new Map(inputs.map((m) => [m.slug, m]));
  return formulaInputs(formula).flatMap((s) => bySlug.get(s) ?? []).filter((m) => !m.formula && m.aggregation === "none").map((m) => m.name);
}

const noneWords = (names: string[]) => `${names.join(" and ")} ${names.length === 1 ? "is" : "are"} set to Aggregation none`;

/** Why a Derived Metric's inputs cannot be combined into longer periods (a quarter of months), or null: an input
 * set to Aggregation none has no quarter, so neither has the Derived Metric. */
export function inputsNotCombined(metric: Pick<Metric, "formula">, inputs: FormulaInput[]): string | null {
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
    const m = bySlug.get(s);
    if (!m) return `{${s}} is not a Metric of this Workspace.`;
    // Series are computed from Metrics that take values (workspace-data.ts), one level deep.
    if (m.formula) return `${m.name} is a Derived Metric itself: compute from the Metrics it is made of.`;
  }
  const own = metric?.period ?? bySlug.get(slugs[0])!.period;
  const periods = inputsProblem({ formula, period: own }, inputs);
  if (periods) return periods;
  const none = notCombining(formula, inputs);
  return none.length ? `${noneWords(none)}: set ${none.length === 1 ? "it" : "them"} to sum, average or last value, so this Metric can be combined into longer periods.` : null;
}
