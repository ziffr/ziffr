// The reference for the formula tree (spec 0041, ticket 11; GLOSSARY: Formula Tree, Derived Metric). Written apart from formula-tree.ts:
// a formula is held here as a structure it was printed from, so the tree is found without reading any text, and each box's value is the
// reference formula evaluator's (formula.ts in this folder: shunting-yard, exact) on the box's own printed formula, never a fold of its parts.
// - A sum's terms are every operand reached through + and - (and a minus sign), a term taken away where an odd number of minus signs lie on
//   the way; a product's factors are every operand reached through * and /, a divisor where an odd number of / lie on the way.
// - A formula that is a single value is a box of one part. The first box is the Metric; a box's parts are its operands, left to right.
// - A part's share of a sum is its size over the sum of the sizes, exactly, for the parts that have a value; the shares add up to 1.
// - More than 24 boxes, or a box on a 5th level, is refused.
import { fraction, ZERO, plus, type Exact } from "./exact";
import { referenceEvaluate } from "./formula";

/** A formula as a structure: a number as written, a Metric by slug, or two operands with an operator. */
export type RefExpr = { t: "n"; text: string } | { t: "m"; slug: string } | { t: "op"; op: "+" | "-" | "*" | "/"; l: RefExpr; r: RefExpr };

/** The formula's text: every operation in its own brackets, so it reads back as this structure. */
export function printExpr(e: RefExpr, top = true): string {
  if (e.t === "n") return e.text;
  if (e.t === "m") return `{${e.slug}}`;
  const s = `${printExpr(e.l, false)} ${e.op} ${printExpr(e.r, false)}`;
  return top ? s : `(${s})`;
}

/** One box the reference finds. */
export type RefBox = { parent: number | null; level: number; how: "root" | "term" | "factor" | "divisor"; taken: boolean; op: "sum" | "product" | null; expr: RefExpr; value: Exact | null; share: Exact | null };

const additive = (e: RefExpr): e is Extract<RefExpr, { t: "op" }> => e.t === "op" && (e.op === "+" || e.op === "-");

// The operands of a sum from left to right, each with whether it is taken away: walked with a stack.
function addends(e: RefExpr): { e: RefExpr; taken: boolean }[] {
  const out: { e: RefExpr; taken: boolean }[] = [];
  const stack = [{ e, taken: false }];
  while (stack.length) {
    const top = stack.pop()!;
    if (additive(top.e)) {
      stack.push({ e: top.e.r, taken: top.e.op === "-" ? !top.taken : top.taken });
      stack.push({ e: top.e.l, taken: top.taken });
    } else out.push(top);
  }
  return out;
}

// The operands of a product from left to right, each with whether it divides.
function multiplicands(e: RefExpr): { e: RefExpr; divides: boolean }[] {
  const out: { e: RefExpr; divides: boolean }[] = [];
  const stack = [{ e, divides: false }];
  while (stack.length) {
    const top = stack.pop()!;
    if (top.e.t === "op" && (top.e.op === "*" || top.e.op === "/")) {
      stack.push({ e: top.e.r, divides: top.e.op === "/" ? !top.divides : top.divides });
      stack.push({ e: top.e.l, divides: top.divides });
    } else out.push(top);
  }
  return out;
}

/** Every box of the formula's tree in tree order, with its exact value (null where an input has none or it divides by 0) and exact share, or a refusal. `inputs` leaves out a Metric with no value. */
export function referenceTree(e: RefExpr, inputs: Record<string, Exact>): RefBox[] | { refused: "boxes" | "levels" } {
  const boxes: RefBox[] = [];
  let refused: "boxes" | "levels" | null = null;
  const visit = (expr: RefExpr, parent: number | null, level: number, how: RefBox["how"], taken: boolean, share: Exact | null, asSum: boolean) => {
    if (level > 3) refused ??= "levels";
    const sum = asSum || additive(expr);
    const operands: { e: RefExpr; how: RefBox["how"]; taken: boolean }[] = sum
      ? addends(expr).map((a) => ({ e: a.e, how: "term", taken: a.taken }))
      : (expr as RefExpr).t === "op"
        ? multiplicands(expr).map((m) => ({ e: m.e, how: m.divides ? "divisor" : "factor", taken: false }))
        : [];
    const id = boxes.length;
    boxes.push({ parent, level, how, taken, op: expr.t === "op" || asSum ? (sum ? "sum" : "product") : null, expr, value: referenceEvaluate(printExpr(expr), inputs), share });
    // The sizes of the parts of a sum that have a value, and their total.
    const values = operands.map((o) => referenceEvaluate(printExpr(o.e), inputs));
    const sizes = values.map((v) => (v === null ? null : fraction(v.num < 0n ? -v.num : v.num, v.den)));
    const total = sizes.reduce<Exact>((a, s) => (s === null ? a : plus(a, s)), ZERO);
    operands.forEach((o, i) => visit(o.e, id, level + 1, o.how, o.taken, sum && sizes[i] !== null && total.num !== 0n ? fraction(sizes[i]!.num * total.den, sizes[i]!.den * total.num) : null, false));
  };
  visit(e, null, 0, "root", false, null, e.t !== "op");
  if (boxes.length > 24) refused ??= "boxes";
  return refused ? { refused } : boxes;
}
