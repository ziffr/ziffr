// Tiny evaluator for Derived Metric formulas like "({revenue} - {cost}) / {revenue} * 100".
// Supports + - * / parentheses, numbers and {slug} references. PROTOTYPE: no error recovery.

/** The slugs of the metrics a Derived Metric's formula reads, each once. */
export function formulaInputs(formula: string): string[] {
  return [...new Set([...formula.matchAll(/\{([a-z0-9-]+)\}/g)].map((m) => m[1]))];
}

/** A formula's value for the given inputs; null when an input is missing or the result is not a number. */
export function evaluate(formula: string, vars: Record<string, number>): number | null {
  const tokens = formula.match(/\{[a-z0-9-]+\}|\d+(?:\.\d+)?|[()+\-*/]/g) ?? [];
  let i = 0;
  const peek = () => tokens[i];
  const next = () => tokens[i++];
  function primary(): number {
    const t = next();
    if (t === "(") {
      const v = expr();
      next();
      return v;
    }
    if (t === "-") return -primary();
    if (t?.startsWith("{")) {
      const v = vars[t.slice(1, -1)];
      if (v === undefined) throw new Error("missing");
      return v;
    }
    return Number(t);
  }
  function term(): number {
    let v = primary();
    while (peek() === "*" || peek() === "/") v = next() === "*" ? v * primary() : v / primary();
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") v = next() === "+" ? v + term() : v - term();
    return v;
  }
  try {
    const v = expr();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
