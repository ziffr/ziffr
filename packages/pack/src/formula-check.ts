// A Derived Metric's formula in a Pack (GLOSSARY: Derived Metric, Metric Catalog): + - * /, brackets, numbers such as
// 12 or 0.5, and {key} for another entry of the same Pack. Only read here, never worked out: whether it can be read
// whole, within Ziffr's bounds, and whether the entries it names can be combined. Ziffr checks it again, against the
// Workspace's Metrics, when a Metric is made from the entry.

/** The longest formula, the most operations and the most digits in a number Ziffr reads. */
export const FORMULA_LIMITS = { length: 500, operations: 50, digits: 20 } as const;

const TOKEN = /\s+|\{[a-z0-9-]+\}|\d+(?:\.\d+)?|[()+\-*/]/y;

/** The keys a formula names, each once, in the order it names them. */
export function formulaKeys(formula: string): string[] {
  return [...new Set([...formula.matchAll(/\{([a-z0-9-]+)\}/g)].map((m) => m[1]))];
}

/** Why a formula cannot be read whole, or null. Its grammar: a sum of products of factors, a factor being a number, a
 * {key}, a minus sign before a factor, or a bracketed formula. */
export function formulaSyntaxProblem(formula: string): string | null {
  if (formula.length > FORMULA_LIMITS.length) return `The formula is longer than ${FORMULA_LIMITS.length} characters.`;
  const tokens: string[] = [];
  for (let at = 0; at < formula.length;) {
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(formula);
    if (!m) return `"${formula[at]}" cannot be read: a formula has + - * /, brackets, numbers and {key}.`;
    if (m[0].trim()) tokens.push(m[0]);
    at += m[0].length;
  }
  if (!tokens.length) return "The formula is empty.";
  if (tokens.some((t) => /^\d/.test(t) && t.replace(".", "").length > FORMULA_LIMITS.digits)) return `A number has more than ${FORMULA_LIMITS.digits} digits.`;
  if (tokens.filter((t) => "+-*/".includes(t)).length > FORMULA_LIMITS.operations) return `The formula has more than ${FORMULA_LIMITS.operations} operations.`;
  // Each token may follow only some others: after a value an operator or a closing bracket, else a value.
  let depth = 0;
  let wantValue = true;
  for (const t of tokens) {
    if (wantValue) {
      if (t === "(") depth++;
      else if (t === "-") continue;
      else if (/^[\d{]/.test(t)) wantValue = false;
      else return `"${t}" stands where a value is missing.`;
    } else if (t === ")") {
      if (--depth < 0) return "A bracket is closed that was not opened.";
    } else if ("+-*/".includes(t)) wantValue = true;
    else return `"${t}" follows a value without an operator between them.`;
  }
  if (wantValue) return "The formula ends where a value is missing.";
  return depth ? "A bracket is opened and not closed." : null;
}

/** What a formula's check needs to know of each entry it may name. */
export type FormulaEntry = { key: string; name: string; period: string; aggregation: string; derived: boolean };

/** Why a Derived Metric's formula is refused in a Pack, or null: it is read whole, names only other entries of the
 * Pack, none of them derived, all of its own period, and none set to Aggregation none (as Ziffr refuses for Metrics). */
export function checkPackFormula(formula: string, entries: FormulaEntry[], self: { key: string; period: string }): string | null {
  const syntax = formulaSyntaxProblem(formula);
  if (syntax) return syntax;
  const keys = formulaKeys(formula);
  if (!keys.length) return "The formula names no entry: a Derived Metric is computed from others, such as {revenue} / {orders}.";
  const byKey = new Map(entries.map((e) => [e.key, e]));
  for (const k of keys) {
    if (k === self.key) return `{${k}} is this entry itself: a formula cannot read its own value.`;
    if (!byKey.has(k)) return `{${k}} is not a Metric Catalog entry of this Pack.`;
  }
  const used = keys.map((k) => byKey.get(k)!);
  const derived = used.filter((e) => e.derived).map((e) => e.name);
  if (derived.length) return `${derived.join(" and ")} ${derived.length === 1 ? "is a Derived Metric itself" : "are Derived Metrics themselves"}: compute from the entries ${derived.length === 1 ? "it is" : "they are"} made of.`;
  const periods = new Set(used.map((e) => e.period));
  if (periods.size > 1) return "Its inputs are counted by different periods, so no period has a value of each. Give them the same period.";
  const [p] = periods;
  if (p !== self.period) return `Its inputs are counted by ${p}, it by ${self.period}. Give it the period of its inputs.`;
  const none = used.filter((e) => e.aggregation === "none").map((e) => e.name);
  return none.length ? `${none.join(" and ")} ${none.length === 1 ? "is" : "are"} set to Aggregation none: set ${none.length === 1 ? "it" : "them"} to sum, average or last value, so this entry can be combined into longer periods.` : null;
}
