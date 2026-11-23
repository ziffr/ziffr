// @ts-nocheck
// The reference for formulas of Derived Metrics (spec 0022, "Formulas" and "Derived Metrics, exhaustively"; GLOSSARY:
// Derived Metric). Written apart from formula.ts and differently from it: the formula is split into tokens by hand,
// turned into postfix by the shunting-yard method and worked out on a stack of exact fractions. The rules:
// - a formula has numbers written as digits with an optional decimal part ("12", "0.5"; not ".5", "1." or "1e3"),
//   inputs as {slug} with a slug of lower-case letters, digits and "-", the operators + - * /, brackets and white space,
//   and nothing else;
// - * and / bind tighter than + and -, and all four group from the left; a "-" where a value is expected negates it;
// - a formula is at most 500 characters long, with at most 50 operators and at most 20 digits in a number;
// - a formula that does not read whole (anything unknown, a missing or extra bracket, two values side by side, an
//   operator without a value) is refused: no value at all;
// - prev({x}) is x's value in the period before and change({x}) is x's value minus that one (ticket #619): each takes
//   one {slug} alone between its brackets. The reference reads prev({x}) as an input named "prev:x" and change({x}) as
//   ({x} - "prev:x"); a formula that names x has a value only where x has one in this period too, and a period
//   before with no value gives no value;
// - its value is exact; it has none when an input it names has no value or a division is by zero.
import { exactOf, fraction, minus, plus, type Exact } from "./exact";

type Token = { kind: "number"; text: string } | { kind: "input"; slug: string } | { kind: "op"; op: "+" | "-" | "*" | "/" | "neg"; synthetic?: true } | { kind: "open" } | { kind: "close" };

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";
const isSlugChar = (c: string) => (c >= "a" && c <= "z") || isDigit(c) || c === "-";

/** The formula as tokens, or null when a character or a number cannot be read. */
function tokens(formula: string): Token[] | null {
  const out: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const c = formula[i];
    // Any white space, a no-break space too, only separates.
    if (/\s/.test(c)) { i++; continue; }
    if (isDigit(c)) {
      let j = i;
      while (isDigit(formula[j])) j++;
      if (formula[j] === ".") {
        j++;
        if (!isDigit(formula[j])) return null;
        while (isDigit(formula[j])) j++;
      }
      // A number runs into a letter, another point or a brace only when it is not one ("1e3", "1.5.2").
      if (formula[j] === "." || (formula[j] !== undefined && /[a-zA-Z_]/.test(formula[j]))) return null;
      out.push({ kind: "number", text: formula.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "{") {
      const close = formula.indexOf("}", i);
      if (close < 0) return null;
      const slug = formula.slice(i + 1, close);
      if (!slug.length || ![...slug].every(isSlugChar)) return null;
      out.push({ kind: "input", slug });
      i = close + 1;
      continue;
    }
    if (c >= "a" && c <= "z") {
      let j = i;
      while (formula[j] !== undefined && formula[j] >= "a" && formula[j] <= "z") j++;
      const word = formula.slice(i, j);
      if (word !== "prev" && word !== "change") return null;
      while (/\s/.test(formula[j] ?? "x")) j++;
      if (formula[j] !== "(") return null;
      j++;
      while (/\s/.test(formula[j] ?? "x")) j++;
      if (formula[j] !== "{") return null;
      const close = formula.indexOf("}", j);
      if (close < 0) return null;
      const slug = formula.slice(j + 1, close);
      if (!slug.length || ![...slug].every(isSlugChar)) return null;
      j = close + 1;
      while (/\s/.test(formula[j] ?? "x")) j++;
      if (formula[j] !== ")") return null;
      if (word === "prev") out.push({ kind: "input", slug: `prev:${slug}` });
      else out.push({ kind: "open" }, { kind: "input", slug }, { kind: "op", op: "-", synthetic: true }, { kind: "input", slug: `prev:${slug}` }, { kind: "close" });
      i = j + 1;
      continue;
    }
    if (c === "(") out.push({ kind: "open" });
    else if (c === ")") out.push({ kind: "close" });
    else if (c === "+" || c === "-" || c === "*" || c === "/") out.push({ kind: "op", op: c });
    else return null;
    i++;
  }
  return out;
}

const PRECEDENCE = { "+": 1, "-": 1, "*": 2, "/": 2, neg: 3 } as const;

/** The formula in postfix order, or null when it is not one expression. */
function postfix(formula: string): Token[] | null {
  // The bounds a formula is held to: at most 500 characters, 50 operators and 20 digits in a number.
  if (formula.length > 500) return null;
  const ts = tokens(formula);
  if (!ts || !ts.length) return null;
  if (ts.filter((t) => t.kind === "op" && !t.synthetic).length > 50) return null;
  if (ts.some((t) => t.kind === "number" && t.text.replace(".", "").length > 20)) return null;
  const out: Token[] = [];
  const stack: Token[] = [];
  // Whether a value is expected next: at the start, after an operator and after an opening bracket.
  let wantValue = true;
  for (const t of ts) {
    if (t.kind === "number" || t.kind === "input") {
      if (!wantValue) return null;
      out.push(t);
      wantValue = false;
    } else if (t.kind === "open") {
      if (!wantValue) return null;
      stack.push(t);
    } else if (t.kind === "close") {
      if (wantValue) return null;
      while (stack.length && stack[stack.length - 1].kind !== "open") out.push(stack.pop()!);
      if (!stack.length) return null;
      stack.pop();
    } else if (wantValue) {
      // Only a minus may stand where a value is expected: it negates what follows.
      if (t.op !== "-") return null;
      stack.push({ kind: "op", op: "neg" });
    } else {
      const p = PRECEDENCE[t.op];
      while (stack.length) {
        const top = stack[stack.length - 1];
        if (top.kind !== "op" || PRECEDENCE[top.op] < p) break;
        out.push(stack.pop()!);
      }
      stack.push(t);
      wantValue = true;
    }
  }
  if (wantValue) return null;
  while (stack.length) {
    const t = stack.pop()!;
    if (t.kind === "open") return null;
    out.push(t);
  }
  return out;
}

/** The slugs a formula names, each once, in the order they first stand; none when it does not read whole. */
export function referenceInputs(formula: string): string[] {
  const ts = postfix(formula) ?? [];
  return [...new Set(ts.flatMap((t) => (t.kind === "input" ? [t.slug.replace(/^prev:/, "")] : [])))];
}

/** Whether a formula reads whole. */
export function referenceReads(formula: string): boolean {
  return postfix(formula) !== null;
}

/** A formula's exact value for exact inputs: null when refused, when an input is missing or on a division by zero.
 * The inputs one period earlier, for prev and change, are named "prev:slug". */
export function referenceEvaluate(formula: string, inputs: Record<string, Exact>): Exact | null {
  const rpn = postfix(formula);
  if (!rpn) return null;
  const stack: Exact[] = [];
  for (const t of rpn) {
    if (t.kind === "number") stack.push(exactOf(t.text));
    else if (t.kind === "input") {
      if (!Object.hasOwn(inputs, t.slug)) return null;
      // prev:x is x's value a period before, and counts only where x has one in this period too.
      if (t.slug.startsWith("prev:") && !Object.hasOwn(inputs, t.slug.slice(5))) return null;
      stack.push(inputs[t.slug]);
    } else if (t.kind === "op") {
      if (t.op === "neg") {
        const a = stack.pop()!;
        stack.push(fraction(-a.num, a.den));
        continue;
      }
      const b = stack.pop()!;
      const a = stack.pop()!;
      if (t.op === "+") stack.push(plus(a, b));
      else if (t.op === "-") stack.push(minus(a, b));
      else if (t.op === "*") stack.push(fraction(a.num * b.num, a.den * b.den));
      else if (b.num === 0n) return null;
      else stack.push(fraction(a.num * b.den, a.den * b.num));
    }
  }
  return stack[0];
}
