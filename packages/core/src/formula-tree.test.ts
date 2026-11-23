// The formula tree (spec 0041, ticket 11): every box a number the core worked out exactly, held to a reference written another way
// (test/reference/formula-tree.ts) on generated formulas, then to hand-worked numbers, every refusal, and what a person who may not see
// an input is given: no box, no number and no name of it, and no "rest" that would hand its value over.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formulaTree, TREE, treeFromData, type TreeLeaf, type TreeModel, type TreeSource } from "./formula-tree";
import { shownSeries } from "./display-periods";
import { evaluate } from "./formula";
import { buildSeries } from "./series";
import { canvas, metric, months } from "./test/fixtures";
import { exactOf, nearestDoubleOf, plus, same, ZERO, type Exact } from "./test/reference/exact";
import { printExpr, referenceTree, type RefExpr } from "./test/reference/formula-tree";
import { referenceNumber, referenceValue } from "./test/reference/write";
import type { Metric, Observation } from "./types";

const runs = Number(process.env.NUMBERS_RUNS ?? 100);
const STYLE = "1,234.5" as const;
const eur = { decimals: 0, unit: "€", unit_position: "after" as const };
const count = { decimals: 0, unit: "", unit_position: "after" as const };
const leaf = (name: string, value: number | null, unit: TreeLeaf["unit"] = eur, note?: string): TreeLeaf => ({ name, value, unit, note });
const source = (formula: string, leaves: Record<string, TreeLeaf | undefined>, over: Partial<TreeSource> = {}): TreeSource => ({ name: "Result", unit: eur, formula, period: "March 2026", leaves, ...over });
const tree = (formula: string, leaves: Record<string, TreeLeaf | undefined>, over: Partial<TreeSource> = {}) => formulaTree(source(formula, leaves, over), STYLE);
const ok = (m: TreeModel) => {
  if (!m.ok) throw new Error(`refused: ${m.refusal}`);
  return m;
};
const refusal = (m: TreeModel) => (m.ok ? "" : m.refusal);
const eurText = (v: number, decimals = 0) => referenceValue({ ...eur, decimals }, v, STYLE);
const pct = (v: number, decimals = 1) => referenceValue({ unit: "%", unit_position: "after", decimals }, v, STYLE);

// ---------------------------------------------------------------------------------------------------- against the reference

const SLUGS = ["a", "b", "c", "d"];
const NUMBERS = ["0", "1", "2", "0.5", "3.25", "100"];
const expr: fc.Arbitrary<RefExpr> = fc.letrec<{ e: RefExpr }>((tie) => ({
  e: fc.oneof(
    { maxDepth: 5, depthSize: "small" },
    fc.constantFrom(...SLUGS).map((slug): RefExpr => ({ t: "m", slug })),
    fc.constantFrom(...NUMBERS).map((text): RefExpr => ({ t: "n", text })),
    fc.tuple(fc.constantFrom("+", "-", "*", "/", "+", "-"), tie("e"), tie("e")).map(([op, l, r]): RefExpr => ({ t: "op", op: op as "+", l, r })),
  ),
})).e;
// A value as the database sends it: whole numbers, decimals of up to three places, zero, negatives; a few Metrics have none.
const value = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: -60, max: 5000 }) },
  { weight: 3, arbitrary: fc.tuple(fc.integer({ min: -999, max: 9999 }), fc.integer({ min: 1, max: 3 })).map(([n, p]) => n / 10 ** p) },
  { weight: 1, arbitrary: fc.constant(0) },
  { weight: 1, arbitrary: fc.constant(null) },
);
const values = fc.record({ a: value, b: value, c: value, d: value });
const UNITS = [eur, count, { decimals: 2, unit: "$", unit_position: "before" as const }];

describe("the formula tree against the reference", () => {
  it(`finds the same boxes, exact values, shares and words as the reference (${runs} formulas)`, () => {
    let drawn = 0;
    fc.assert(
      fc.property(expr, values, fc.integer({ min: 0, max: 2 }), (e, v, u) => {
        const unit = UNITS[u];
        const leaves = Object.fromEntries(SLUGS.map((s) => [s, leaf(s.toUpperCase(), v[s as "a"], unit)]));
        const exact: Record<string, Exact> = Object.fromEntries(SLUGS.flatMap((s) => (v[s as "a"] === null ? [] : [[s, exactOf(v[s as "a"]!)]])));
        const want = referenceTree(e, exact);
        const got = tree(printExpr(e), leaves, { unit });
        if ("refused" in want) {
          expect(got.ok, printExpr(e)).toBe(false);
          return;
        }
        const model = ok(got);
        drawn++;
        expect(model.boxes.length, printExpr(e)).toBe(want.length);
        want.forEach((w, i) => {
          const b = model.boxes[i];
          expect([b.id, b.parent, b.level, b.how, b.taken, b.op], `${printExpr(e)} box ${i}`).toEqual([i, w.parent, w.level, w.how, w.taken, w.op]);
          // The value is the double nearest to the exact one, or none, and a box with none says so rather than 0.
          if (w.value === null) expect([b.value, b.text]).toEqual([null, "no value"]);
          else {
            expect(b.value, `${printExpr(e)} box ${i}`).toBe(nearestDoubleOf(w.value));
            // Never a number that is not 0 written as 0.
            expect(b.value === 0 || /[1-9]/.test(b.text), b.text).toBe(true);
          }
          expect(b.share, `${printExpr(e)} share ${i}`).toBe(w.share === null ? null : nearestDoubleOf(w.share));
          expect(b.scaled).toBe(w.how === "term" || w.how === "root");
          expect(b.shareText === null).toBe(w.share === null);
        });
        // The first box is the Metric; a leaf Metric or the Metric itself is written in its unit with as many decimals as it takes.
        const leafBox = model.boxes.findIndex((_, i) => want[i].expr.t === "m" && want[i].value !== null && i > 0);
        if (leafBox > 0) {
          const x = nearestDoubleOf(want[leafBox].value!);
          let d = unit.decimals;
          while (x !== 0 && !/[1-9]/.test(referenceNumber(x, d, STYLE))) d++;
          expect(model.boxes[leafBox].text).toBe(referenceValue({ ...unit, decimals: d }, x, STYLE));
        }
        // The shares of each sum's parts add up to exactly 1, and the parts with their signs to the sum.
        want.forEach((w, i) => {
          const parts = want.map((p, j) => ({ p, j })).filter(({ p }) => p.parent === i);
          if (w.op !== "sum" || parts.length === 0) return;
          const shares = parts.flatMap(({ p }) => (p.share ? [p.share] : []));
          if (shares.length) expect(same(shares.reduce(plus, ZERO), exactOf(1))).toBe(true);
          if (w.value !== null && parts.every(({ p }) => p.value !== null)) {
            const signed = parts.map(({ p }) => (p.taken ? { num: -p.value!.num, den: p.value!.den } : p.value!));
            expect(same(signed.reduce(plus, ZERO), w.value)).toBe(true);
          }
        });
        // The text alternative has every box's words, and the same tree gives the same bytes.
        for (const b of model.boxes) expect(model.alt).toContain(b.alt);
        expect(JSON.stringify(tree(printExpr(e), leaves, { unit }))).toBe(JSON.stringify(model));
      }),
      { numRuns: runs, seed: 115 },
    );
    expect(drawn).toBeGreaterThan(runs / 4);
  });

  it(`gives the value the formula evaluator gives for the Metric (${runs} formulas)`, () => {
    fc.assert(
      fc.property(expr, values, (e, v) => {
        const leaves = Object.fromEntries(SLUGS.map((s) => [s, leaf(s.toUpperCase(), v[s as "a"])]));
        const model = tree(printExpr(e), leaves);
        if (!model.ok) return;
        const vars = Object.fromEntries(SLUGS.map((s) => [s, v[s as "a"] ?? NaN]));
        expect(model.boxes[0].value).toBe(evaluate(printExpr(e), vars));
      }),
      { numRuns: runs, seed: 116 },
    );
  });

  it("keeps every share when all the parts are scaled by the same number, and gives the same tree for parts in another order", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 900 }), { minLength: 2, maxLength: 6 }), fc.integer({ min: 2, max: 9 }), (xs, k) => {
        const run = (list: number[]) => tree(list.map((_, i) => `{p${i}}`).join(" + "), Object.fromEntries(list.map((x, i) => [`p${i}`, leaf(`P${i}`, x)])));
        const shares = (m: TreeModel) => ok(m).boxes.slice(1).map((b) => b.share);
        expect(shares(run(xs.map((x) => x * k)))).toEqual(shares(run(xs)));
        const reversed = ok(run([...xs].reverse())).boxes.slice(1).map((b) => b.share);
        expect(reversed).toEqual([...shares(run(xs))].reverse());
        expect(ok(run(xs)).boxes[0].value).toBe(ok(run([...xs].reverse())).boxes[0].value);
      }),
      { numRuns: runs, seed: 117 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------- hand-worked

describe("the formula tree, worked by hand", () => {
  it("a difference: the parts by their size with a sign, the total what is left, all words in tree order", () => {
    // 100 − 70 = 30; the parts' sizes are 100 and 70 of 170, so 10/17 and 7/17.
    const m = ok(tree("{rev} - {cost}", { rev: leaf("Revenue", 100), cost: leaf("Cost", 70) }, { name: "Profit" }));
    expect(m.boxes.map((b) => [b.label, b.text, b.how, b.glyph, b.taken, b.op, b.scaled])).toEqual([
      ["Profit", eurText(30), "root", null, false, "sum", true],
      ["Revenue", eurText(100), "term", null, false, null, true],
      ["Cost", eurText(70), "term", "−", true, null, true],
    ]);
    expect(m.boxes.map((b) => b.share)).toEqual([null, nearestDoubleOf({ num: 10n, den: 17n }), nearestDoubleOf({ num: 7n, den: 17n })]);
    expect(m.boxes.map((b) => b.shareText)).toEqual([null, pct(58.8235294117647), pct(41.1764705882353)]);
    expect(m.alt).toContain(`Formula tree of Profit for March 2026.`);
    expect(m.alt).toContain(`Profit ${eurText(30)} is made of: Revenue ${eurText(100)}, added, ${pct(58.8235294117647)} of the parts; Cost ${eurText(70)}, taken away, ${pct(41.1764705882353)} of the parts.`);
    expect(m.rule).toBe("Each box is one number of the formula, worked out exactly. Parts that are added up share the width of the box above them by their size. A part that is taken away is hatched and counts by its size, so its share is of the size of the parts, not of the total.");
  });

  it("is exact where doubles are not", () => {
    expect(ok(tree("{a} + {b}", { a: leaf("A", 0.1, count), b: leaf("B", 0.2, count) })).boxes[0].value).toBe(0.3);
    expect(ok(tree("{a} - {b}", { a: leaf("A", 0.3, count), b: leaf("B", 0.1, count) })).boxes[0].value).toBe(0.2);
    expect(ok(tree("{a} / {b}", { a: leaf("A", 1, count), b: leaf("B", 3, count) })).boxes[0].value).toBe(1 / 3);
  });

  it("a product: its factors side by side, not to scale, with the operator, and no share", () => {
    // 42,000 visits × 0.031 conversion × 89.50 price = 1,302 orders × 89.50 = 116,529.
    const unit3 = { decimals: 3, unit: "", unit_position: "after" as const };
    const m = ok(tree("{v} * {c} * {p}", { v: leaf("Visits", 42000, count), c: leaf("Conversion", 0.031, unit3), p: leaf("Price", 89.5, { decimals: 2, unit: "€", unit_position: "after" }) }, { name: "Revenue" }));
    expect(m.boxes.map((b) => [b.label, b.value, b.how, b.glyph, b.op, b.scaled, b.share, b.shareText])).toEqual([
      ["Revenue", 116529, "root", null, "product", true, null, null],
      ["Visits", 42000, "factor", null, null, false, null, null],
      ["Conversion", 0.031, "factor", "×", null, false, null, null],
      ["Price", 89.5, "factor", "×", null, false, null, null],
    ]);
    expect(m.boxes[2].text).toBe("0.031");
    expect(m.alt).toContain("Revenue 116,529 € is worked out from: Visits 42,000, multiplies; Conversion 0.031, multiplies; Price 89.50 €, multiplies.");
    expect(m.rule).toBe("Each box is one number of the formula, worked out exactly. The factors of a product or a ratio share the width equally and are not to scale: a product is not the sum of its factors.");
  });

  it("a ratio with a sum in it: bracketed parts are boxes of their own, a number is a box named Number, and the divisor says it divides", () => {
    const m = ok(tree("({rev} - {cost}) / {rev} * 100", { rev: leaf("Revenue", 100000), cost: leaf("Cost", 70000) }, { name: "Margin", unit: { decimals: 1, unit: "%", unit_position: "after" } }));
    expect(m.boxes.map((b) => [b.level, b.parent, b.label, b.how, b.glyph, b.op])).toEqual([
      [0, null, "Margin", "root", null, "product"],
      [1, 0, "Revenue − Cost", "factor", null, "sum"],
      [2, 1, "Revenue", "term", null, null],
      [2, 1, "Cost", "term", "−", null],
      [1, 0, "Revenue", "divisor", "÷", null],
      [1, 0, "Number", "factor", "×", null],
    ]);
    // 30,000 / 100,000 × 100 = 30; the bracket 30,000 in euros as both parts are euros.
    expect([m.boxes[0].text, m.boxes[1].text, m.boxes[5].text]).toEqual([pct(30), eurText(30000), "100"]);
    expect(m.boxes[1].alt).toBe(`Revenue − Cost ${eurText(30000)}, multiplies`);
    expect(m.boxes[4].alt).toBe(`Revenue ${eurText(100000)}, divides`);
  });

  it("a formula of one value is a box with that one part, and shares all of itself", () => {
    const m = ok(tree("{a}", { a: leaf("Orders", 12, count) }));
    expect(m.boxes.map((b) => [b.label, b.op, b.share, b.shareText])).toEqual([["Result", "sum", null, null], ["Orders", null, 1, pct(100)]]);
    // A number alone has a box too, written as a number.
    expect(ok(tree("5", {})).boxes.map((b) => [b.label, b.value, b.text])).toEqual([["Result", 5, eurText(5)], ["Number", 5, "5"]]);
  });

  it("a minus sign in front of a value takes it away; a bracket taken away turns its own signs round", () => {
    const m = ok(tree("-{a} + {b}", { a: leaf("A", 2, count), b: leaf("B", 5, count) }));
    expect(m.boxes.map((b) => [b.label, b.taken, b.glyph])).toEqual([["Result", false, null], ["A", true, "−"], ["B", false, "+"]]);
    expect(m.boxes[0].value).toBe(3);
    // a − (b − c) = a − b + c: b taken away, c added.
    const n = ok(tree("{a} - ({b} - {c})", { a: leaf("A", 10, count), b: leaf("B", 4, count), c: leaf("C", 1, count) }));
    expect(n.boxes.map((b) => [b.label, b.taken, b.glyph])).toEqual([["Result", false, null], ["A", false, null], ["B", true, "−"], ["C", false, "+"]]);
    expect(n.boxes[0].value).toBe(7);
    // A part taken away that is itself negative adds: 10 − (−2) = 12, and the −2 keeps its sign.
    const o = ok(tree("{a} - {b}", { a: leaf("A", 10, count), b: leaf("B", -2, count) }));
    expect([o.boxes[0].value, o.boxes[2].text, o.boxes[2].taken]).toEqual([12, referenceNumber(-2, 0, STYLE), true]);
  });

  it("parts that are all 0 have no share to give, and are written as 0", () => {
    const m = ok(tree("{a} + {b}", { a: leaf("A", 0), b: leaf("B", 0) }));
    expect(m.boxes.map((b) => [b.text, b.share, b.shareText])).toEqual([[eurText(0), null, null], [eurText(0), null, null], [eurText(0), null, null]]);
  });

  it("a part with no value is a gap, named, and so is what is made of it; the others still share by their size", () => {
    const m = ok(tree("{rev} - {cost} - {tax}", { rev: leaf("Revenue", 100), cost: leaf("Cost", null), tax: leaf("Tax", 20) }));
    expect(m.boxes.map((b) => [b.label, b.value, b.text, b.why, b.shareText])).toEqual([
      ["Result", null, "no value", "a part of it has no value", null],
      ["Revenue", 100, eurText(100), null, pct(83.3333333333333)],
      ["Cost", null, "no value", null, null],
      ["Tax", 20, eurText(20), null, pct(16.6666666666667)],
    ]);
    expect(m.alt).toContain("Result: no value (a part of it has no value) is made of: Revenue");
    expect(m.alt).toContain("Cost: no value, taken away");
    expect(m.rule).toContain("A box with no value is a gap, never a 0, and shares are of the parts that have a value.");
    // A value that is not a number is no value either.
    expect(ok(tree("{a} + {b}", { a: leaf("A", NaN), b: leaf("B", Infinity) })).boxes.map((b) => b.value)).toEqual([null, null, null]);
    // A gap in a product says so without the sentence about shares.
    expect(ok(tree("{a} * {b}", { a: leaf("A", 2), b: leaf("B", null) })).rule).toBe("Each box is one number of the formula, worked out exactly. The factors of a product or a ratio share the width equally and are not to scale: a product is not the sum of its factors. A box with no value is a gap, never a 0.");
  });

  it("dividing by 0 gives no value, and says so", () => {
    const m = ok(tree("{a} / {b}", { a: leaf("A", 5, count), b: leaf("B", 0, count) }));
    expect([m.boxes[0].value, m.boxes[0].text, m.boxes[0].why]).toEqual([null, "no value", "it divides by 0"]);
    expect(m.alt).toContain("Result: no value (it divides by 0)");
  });

  it("a period that is not whole is named on every box built on it, and the Metric's own note is added", () => {
    const m = ok(tree("{a} - {b}", { a: leaf("Revenue", 61000, eur, "so far"), b: leaf("Cost", 38000, eur, "2 of 3 months") }, { name: "Profit", period: "Q2 2026", note: "so far" }));
    expect(m.boxes.map((b) => b.label)).toEqual(["Profit (so far, 2 of 3 months)", "Revenue (so far)", "Cost (2 of 3 months)"]);
    expect(m.rule).toContain("A note in brackets says why a number is not for a whole period.");
    expect(m.boxes[0].value).toBe(23000);
  });

  it("puts the Metric's own note on the Metric alone, when its parts have none", () => {
    expect(ok(tree("{a} + {b}", { a: leaf("A", 1), b: leaf("B", 2) }, { note: "so far" })).boxes.map((b) => b.label)).toEqual(["Result (so far)", "A", "B"]);
    expect(ok(tree("{a} + {b}", { a: leaf("A", 1), b: leaf("B", 2) })).boxes[0].label).toBe("Result");
  });

  it("writes a number that is not 0 with the decimals it takes, never as 0, and refuses what 20 decimals cannot show", () => {
    const m = ok(tree("{a} + {b}", { a: leaf("A", 1_000_000), b: leaf("B", 0.004) }));
    expect(m.boxes[2].text).toBe(eurText(0.004, 3));
    expect(m.boxes[2].shareText).toBe(pct(0.0000004, 7));
    // The total is written at the Metric's own decimals, as a Metric always is; only a number that would read 0 is widened.
    expect(m.boxes[0].text).toBe(eurText(1_000_000.004, 0));
    expect(refusal(tree("{a} + {b}", { a: leaf("A", 5), b: leaf("B", 1e-25) }))).toBe("Not drawn: some numbers are too small to write out in full.");
    // A share too small for 20 decimals is refused as well.
    expect(refusal(tree("{a} + {b}", { a: leaf("A", 1e15), b: leaf("B", 1e-10) }))).toBe("Not drawn: some numbers are too small to write out in full.");
    expect(ok(tree("{a} + {b}", { a: leaf("A", 5), b: leaf("B", 0) })).boxes[2].text).toBe(eurText(0));
  });

  it("a unit stays only where every part has it, and a ratio has two decimals at least", () => {
    const m = ok(tree("{a} + {b}", { a: leaf("A", 2), b: leaf("B", 3, count) }, { unit: count }));
    expect(m.boxes.map((b) => b.text)).toEqual(["5", eurText(2), "3"]);
    // A ratio inside a sum has two decimals at least, as a Derived Metric made from a ratio does.
    const r = ok(tree("{a} / {c} + {b}", { a: leaf("A", 1), b: leaf("B", 2), c: leaf("C", 4) }, { unit: { decimals: 2, unit: "", unit_position: "after" } }));
    expect(r.boxes.map((b) => b.text)).toEqual(["2.25", "0.25", eurText(1), eurText(4), eurText(2)]);
    const sums = ok(tree("{a} + 5", { a: leaf("A", 2) }, { unit: count }));
    expect(sums.boxes.map((b) => b.text)).toEqual(["7", eurText(2), "5"]);
    // The Number Style is the Workspace's.
    const de = formulaTree(source("{a} + {b}", { a: leaf("A", 1500.5, { decimals: 1, unit: "", unit_position: "after" }), b: leaf("B", 2, { decimals: 1, unit: "", unit_position: "after" }) }, { unit: { decimals: 1, unit: "", unit_position: "after" } }), "1.234,5");
    expect(ok(de).boxes.map((b) => b.text)).toEqual(["1.502,5", "1.500,5", "2,0"]);
  });

  it("names a box that is no Metric by its parts and their operators, in brackets where it stands in another", () => {
    const leaves = Object.fromEntries(["a", "b", "c", "d"].map((k, i) => [k, leaf(k.toUpperCase(), i + 1, count)]));
    const names = (f: string) => ok(tree(f, leaves)).boxes.filter((b) => b.op !== null).map((b) => b.label);
    expect(names("({a} * {b} / {c}) + {d}")).toEqual(["Result", "A × B ÷ C"]);
    expect(names("({a} + {b} - {c}) * {d}")).toEqual(["Result", "A + B − C"]);
    expect(names("(-{a} + {b}) * {c}")).toEqual(["Result", "− A + B"]);
    expect(names("({a} + {b}) * {c} / ({a} - {b})")).toEqual(["Result", "A + B", "A − B"]);
    expect(ok(tree("({a} + {b}) * {c} / ({a} - {b})", leaves)).boxes.map((b) => b.label)).toEqual(["Result", "A + B", "A", "B", "C", "A − B", "A", "B"]);
    // The name of the box above shows them in brackets: it is a bracket of a bracket.
    expect(ok(tree("(({a} + {b}) * {c}) - {d}", leaves)).boxes[1].label).toBe("(A + B) × C");
    expect(ok(tree("{a} / ({b} * {c})", leaves)).boxes.map((b) => [b.label, b.how, b.glyph])).toEqual([["Result", "root", null], ["A", "factor", null], ["B", "divisor", "÷"], ["C", "divisor", "÷"]]);
    // A minus sign in front of a factor is a box of its own with that one part taken away.
    const m = ok(tree("-{a} * {b}", leaves));
    expect(m.boxes.map((b) => [b.label, b.how, b.op, b.taken, b.glyph])).toEqual([["Result", "root", "product", false, null], ["− A", "factor", "sum", false, null], ["A", "term", null, true, "−"], ["B", "factor", null, false, "×"]]);
    expect(m.boxes[0].value).toBe(-2);
  });

  it("writes a sum in a unit only when every part has that unit, on its side, and with the decimals of its most exact part", () => {
    const eur2 = { decimals: 2, unit: "€", unit_position: "after" as const };
    const usd = { decimals: 0, unit: "$", unit_position: "before" as const };
    const usdAfter = { decimals: 0, unit: "$", unit_position: "after" as const };
    const eurBefore = { decimals: 0, unit: "€", unit_position: "before" as const };
    const sums = (a: TreeLeaf, b: TreeLeaf) => ok(tree("({a} + {b}) * 1", { a, b }, { unit: count })).boxes[1].text;
    expect(sums(leaf("A", 1, eur), leaf("B", 2, eur))).toBe(eurText(3));
    // The same unit with more decimals: the sum has the most.
    expect(sums(leaf("A", 1, eur), leaf("B", 0.25, eur2))).toBe(eurText(1.25, 2));
    expect(sums(leaf("A", 1, eur2), leaf("B", 0.25, eur))).toBe(eurText(1.25, 2));
    // Another unit, or the same one on the other side, is no unit: a plain number.
    expect(sums(leaf("A", 1, eur), leaf("B", 2, usd))).toBe("3");
    expect(sums(leaf("A", 1, usd), leaf("B", 2, usdAfter))).toBe("3");
    expect(sums(leaf("A", 1, eur), leaf("B", 2, usdAfter))).toBe("3");
    expect(sums(leaf("A", 1, eur), leaf("B", 2, eurBefore))).toBe("3");
    // A number among the parts takes the unit away, first or not.
    expect(ok(tree("(5 + {a}) * 1", { a: leaf("A", 1) }, { unit: count })).boxes[1].text).toBe("6");
    expect(ok(tree("({a} + 5) * 1", { a: leaf("A", 1) }, { unit: count })).boxes[1].text).toBe("6");
  });

  it("gives a ratio two decimals at least, and a product or a ratio of more exact parts theirs", () => {
    const d3 = { decimals: 3, unit: "", unit_position: "after" as const };
    const text = (f: string, v: Record<string, TreeLeaf>) => ok(tree(`(${f}) + 0`, v, { unit: count })).boxes[1].text;
    expect(text("{a} / {b}", { a: leaf("A", 1, d3), b: leaf("B", 3, d3) })).toBe("0.333");
    expect(text("{a} / {b}", { a: leaf("A", 1, count), b: leaf("B", 3, count) })).toBe("0.33");
    // A product with no divisor keeps the decimals of its parts: 6, not 6.00.
    expect(text("{a} * {b}", { a: leaf("A", 2, count), b: leaf("B", 3, count) })).toBe("6");
    expect(text("{a} * {b}", { a: leaf("A", 1.5, { ...d3, decimals: 1 }), b: leaf("B", 3, count) })).toBe("4.5");
  });

  it("writes the smallest number that 20 decimals show, and refuses the next", () => {
    expect(ok(tree("{a} + {b}", { a: leaf("A", 1, count), b: leaf("B", 1e-20, count) }, { unit: count })).boxes[2].text).toBe("0.00000000000000000001");
    expect(refusal(tree("{a} + {b}", { a: leaf("A", 1, count), b: leaf("B", 1e-21, count) }, { unit: count }))).toBe("Not drawn: some numbers are too small to write out in full.");
    // And a share: 1 of 10^22 is 10^-20 percent, 1 of 10^23 is one decimal beyond.
    const share = (big: number) => tree("{a} + {b}", { a: leaf("A", big, count), b: leaf("B", 1, count) }, { unit: count });
    expect(ok(share(1e22)).boxes[2].shareText).toBe(pct(1e-20, 20));
    expect(refusal(share(1e23))).toBe("Not drawn: some numbers are too small to write out in full.");
  });

  it("a divisor of any size is told apart from a factor: only the factors of a sum's own parts are scaled", () => {
    const m = ok(tree("({a} - {b}) / {c} * 100", { a: leaf("A", 5), b: leaf("B", 2), c: leaf("C", 3) }));
    expect(m.boxes.map((b) => [b.label, b.how, b.scaled])).toEqual([["Result", "root", true], ["A − B", "factor", false], ["A", "term", true], ["B", "term", true], ["C", "divisor", false], ["Number", "factor", false]]);
  });

  it("says a plain sum's rule without the sentence about a part taken away, and a difference's with it", () => {
    const sum = ok(tree("{a} + {b}", { a: leaf("A", 1), b: leaf("B", 2) }));
    expect(sum.rule).toBe("Each box is one number of the formula, worked out exactly. Parts that are added up share the width of the box above them by their size.");
    expect(sum.alt).toBe(`Formula tree of Result for March 2026. ${sum.rule} Result ${eurText(3)} is made of: A ${eurText(1)}, added, ${pct(33.3333333333333)} of the parts; B ${eurText(2)}, added, ${pct(66.6666666666667)} of the parts.`);
    const two = ok(tree("({a} + {b}) * {c}", { a: leaf("A", 1), b: leaf("B", 2), c: leaf("C", 4) }));
    expect(two.alt).toContain(`Result ${eurText(12)} is worked out from: A + B ${eurText(3)}, multiplies; C ${eurText(4)}, multiplies. A + B ${eurText(3)} is made of:`);
  });

  it("a part too fine to work out exactly has no value, and one the doubles cannot tell from 0 is refused, never written as 0", () => {
    const divisors = (n: number) => Object.fromEntries([["a", leaf("A", 1, count)], ...Array.from({ length: n }, (_, i) => [`p${i}`, leaf(`P${i}`, 1e300, count)])]);
    const chain = (n: number) => `{a}${Array.from({ length: n }, (_, i) => ` / {p${i}}`).join("")}`;
    const fine = ok(tree(chain(9), divisors(9), { unit: count }));
    expect([fine.boxes[0].value, fine.boxes[0].why]).toEqual([null, "it cannot be worked out exactly"]);
    // Eight of them is 10^-2400: exact, but 0 as a double.
    expect(refusal(tree(chain(8), divisors(8), { unit: count }))).toBe("Not drawn: some numbers are too small to write out in full.");
    // One of them is a number the 20 decimals cannot show either; with a divisor of 10^10 it is shown.
    expect(refusal(tree(chain(1), divisors(1), { unit: count }))).toBe("Not drawn: some numbers are too small to write out in full.");
    expect(ok(tree("{a} / {b}", { a: leaf("A", 1, count), b: leaf("B", 1e10, count) }, { unit: count })).boxes[0].text).toBe("0.0000000001");
  });

  it("a part too large to write out has no value", () => {
    const big = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`p${i}`, leaf(`P${i}`, 1e300, count)]));
    const m = ok(tree(Object.keys(big).map((k) => `{${k}}`).join(" * "), big));
    expect([m.boxes[0].value, m.boxes[0].why]).toEqual([null, "it cannot be worked out exactly"]);
    const sum = ok(tree(Object.keys(big).map((k) => `{${k}}`).join(" + "), big, { unit: count }));
    expect(sum.boxes[0].value).toBe(2e301);
  });

  it("is limited to 4 levels and 24 boxes, and refuses beyond in words", () => {
    const many = (n: number) => tree(Array.from({ length: n }, (_, i) => `{p${i}}`).join(" + "), Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, leaf(`P${i}`, i + 1)])));
    expect(TREE).toEqual({ levels: 4, boxes: 24 });
    expect(ok(many(23)).boxes).toHaveLength(24);
    expect(refusal(many(24))).toBe("Not drawn: the formula has more than the 24 boxes that read clearly in a chart.");
    const leaves = Object.fromEntries(["a", "b", "c", "d", "e"].map((s) => [s, leaf(s.toUpperCase(), 2, count)]));
    expect(Math.max(...ok(tree("({a} + {b}) * {c} + {d}", leaves)).boxes.map((b) => b.level))).toBe(3);
    expect(refusal(tree("(({a} + {b}) * {c} + {d}) * {e}", leaves))).toBe("Not drawn: the formula has more than the 4 levels that read clearly in a chart.");
  });

  it("refuses a formula that reaches back, one that cannot be read, and says why", () => {
    const leaves = { a: leaf("A", 1), b: leaf("B", 2) };
    expect(refusal(tree("change({a}) + {b}", leaves, { name: "Gain" }))).toBe("Not drawn: Gain is worked out from the period before as well (prev or change), which a tree of parts cannot show.");
    expect(refusal(tree("prev({a})", leaves))).toContain("prev or change");
    expect(refusal(tree("{a} +", leaves, { name: "Gain" }))).toBe("Not drawn: the formula of Gain cannot be read. The formula ends where a value is missing.");
    expect(refusal(tree("", leaves))).toContain("cannot be read");
    expect(refusal(tree(`{a} + ${"1 + ".repeat(60)}1`, leaves))).toContain("more than 50 operations");
  });
});

// ---------------------------------------------------------------------------------------------------- who may see what

const HIDDEN = "Not drawn: Profit is calculated from Metrics that are not all shared here, so its parts are not shown.";
describe("what a person who may not see an input is given", () => {
  it("a formula with an input that is not shared is refused whole: no box for it, none for the rest, no remainder", () => {
    // The remainder would BE the hidden Metric: total 30, shown part 100 → 70 would hand over the Cost.
    const m = tree("{rev} - {cost}", { rev: leaf("Revenue", 100), cost: undefined }, { name: "Profit" });
    expect(m).toEqual({ ok: false, refusal: HIDDEN });
    // Several hidden at once: the sum of them would leak as well, so any hidden input refuses.
    expect(tree("{rev} - {cost} - {tax}", { rev: leaf("Revenue", 100), cost: undefined, tax: undefined }, { name: "Profit" })).toEqual({ ok: false, refusal: HIDDEN });
    // Nothing of the hidden input is in the words: the same sentence whatever the formula says, and no slug.
    expect(refusal(tree("{secret-pool} * 2 + {rev}", { rev: leaf("Revenue", 100), "secret-pool": undefined }, { name: "Profit" }))).toBe(HIDDEN);
  });

  it("the words do not depend on which input is hidden or what it is worth", () => {
    fc.assert(
      fc.property(fc.subarray(SLUGS, { minLength: 1 }), values, (hidden, v) => {
        const leaves = Object.fromEntries(SLUGS.map((s) => [s, hidden.includes(s) ? undefined : leaf(s.toUpperCase(), v[s as "a"])]));
        expect(tree("{a} + {b} * {c} - {d}", leaves, { name: "Profit" })).toEqual({ ok: false, refusal: HIDDEN });
      }),
      { numRuns: runs, seed: 118 },
    );
  });
});

// ---------------------------------------------------------------------------------------------------- from the widget's data

const ob = (m: Metric, period: string, value: number, id: number): Observation => ({ id, metric_id: m.id, period_start: period, value, submitter_id: null, source: "web_form", original_value: null, created_at: "2026-01-01" });
const REV = metric({ id: 1, slug: "revenue", name: "Revenue", decimals: 0 });
const COST = metric({ id: 2, slug: "cost", name: "Operating cost", decimals: 0 });
const PROFIT = metric({ id: 3, slug: "profit", name: "Profit", formula: "{revenue} - {cost}", aggregation: "none" });
const rows = (spec: Record<number, number[]>, start = "2026-01"): Observation[] =>
  Object.entries(spec).flatMap(([id, vs]) => months(start, vs).map((p, i) => ob([REV, COST, PROFIT].find((m) => m.id === Number(id))!, p.period, p.value, Number(id) * 100 + i)));
const dataOf = (metrics: Metric[], observations: Observation[], over = {}) => canvas(metrics, buildSeries(metrics, observations), { today: "2026-06-15", ...over });

describe("the tree from what the widget was given", () => {
  const all = [REV, COST, PROFIT];
  const data = dataOf(all, rows({ 1: [100, 120, 140, 160], 2: [60, 70, 80, 90] }));
  it("is the Metric's own latest value, and each part the value its own Metric shows for that period", () => {
    const m = ok(treeFromData(PROFIT, data));
    const own = shownSeries(PROFIT, data, undefined).points.at(-1)!;
    const rev = shownSeries(REV, data, undefined).points.at(-1)!;
    const cost = shownSeries(COST, data, undefined).points.at(-1)!;
    expect(m.period).toBe("April 2026");
    expect(m.boxes.map((b) => [b.label, b.value])).toEqual([["Profit", own.value], ["Revenue", rev.value], ["Operating cost", cost.value]]);
    expect(own.value).toBe(70);
    expect(m.boxes[0].text).toBe(eurText(70));
  });

  it("is for the day of a Snapshot: later periods are not part of it, whatever the data holds, and the period that day falls in is", () => {
    const feb = ok(treeFromData(PROFIT, data, { asOf: "2026-02-28" }));
    expect([feb.period, ...feb.boxes.map((b) => b.value)]).toEqual(["February 2026", 50, 120, 70]);
    expect(ok(treeFromData(PROFIT, data, { asOf: "2026-02-01" })).period).toBe("February 2026");
    expect(ok(treeFromData(PROFIT, data, { asOf: "2026-01-31" })).period).toBe("January 2026");
    expect(refusal(treeFromData(PROFIT, data, { asOf: "2025-12-31" }))).toBe("There are no values to draw yet.");
  });

  it("is for the Metric's own newest period; a part that runs ahead is not part of it", () => {
    const m = ok(treeFromData(PROFIT, dataOf(all, rows({ 1: [100, 120, 140, 160], 2: [60, 70, 80] }))));
    expect(m.boxes.map((b) => [b.label, b.value])).toEqual([["Profit", 60], ["Revenue", 140], ["Operating cost", 80]]);
    expect(m.period).toBe("March 2026");
  });

  it("falls back to the newest period any part has when the Metric has no value at all, and shows the gaps", () => {
    const m = ok(treeFromData(PROFIT, dataOf(all, rows({ 1: [100, 120, 140, 160] }))));
    expect(m.boxes.map((b) => [b.label, b.value])).toEqual([["Profit", null], ["Revenue", 160], ["Operating cost", null]]);
    expect(m.period).toBe("April 2026");
  });

  it("on a running span adds up exactly what the Metric adds up: its own span, not a part's later value", () => {
    // Revenue to May, cost to April, by quarter with the second quarter running: the Metric's Q2 is April alone.
    const d = dataOf(all, rows({ 1: [100, 120, 140, 160, 180], 2: [60, 70, 80, 90] }), { today: "2026-05-20" });
    const own = shownSeries(PROFIT, d, "quarter").points.at(-1)!;
    const m = ok(treeFromData(PROFIT, d, { display: "quarter" }));
    expect([m.period, m.boxes[0].value, m.boxes[0].value === own.value]).toEqual(["Q2 2026", own.value, true]);
    expect(m.boxes.map((b) => b.value)).toEqual([own.value, 160, 90]);
    expect(m.boxes.map((b) => b.label)).toEqual(["Profit (so far)", "Revenue (so far)", "Operating cost (so far)"]);
  });

  it("says the values are not loaded rather than showing a gap, and takes direction controls out of names", () => {
    expect(refusal(treeFromData(PROFIT, { ...data, series: Object.fromEntries(Object.entries(data.series).filter(([k]) => k !== "cost")) }))).toBe("Not drawn: the values of its parts are not loaded yet.");
    const evil = "\u202eevil";
    const m = ok(tree("{a} - {b}", { a: leaf(evil, 5), b: leaf("B\u2067", 2) }, { name: `Net\u202c${evil}` }));
    expect(m.alt).not.toMatch(/[\u202A-\u202E\u2066-\u2069]/);
    expect(m.boxes.map((b) => b.label)).toEqual(["Netevil", "evil", "B"]);
    expect(refusal(tree("{a}", { a: undefined }, { name: evil }))).toBe("Not drawn: evil is calculated from Metrics that are not all shared here, so its parts are not shown.");
    expect(refusal(tree("{a} +", { a: leaf("A", 1) }, { name: evil }))).toContain("formula of evil cannot");
    expect(refusal(tree("change({a})", { a: leaf("A", 1) }, { name: evil }))).toContain("Not drawn: evil is worked");
    expect(refusal(treeFromData({ ...REV, name: evil }, data))).toBe("Not drawn: evil is not calculated from other Metrics, so it has no formula to draw.");
  });

  it("is shown by a longer period like everything else, with a period still running said on its boxes", () => {
    // Revenue 100..160 over Jan to Apr; with today in May the second quarter has only April, so it is still running.
    const d = dataOf(all, rows({ 1: [100, 120, 140, 160], 2: [60, 70, 80, 90] }), { today: "2026-05-10" });
    const m = ok(treeFromData({ ...PROFIT }, d, { display: "quarter" }));
    const q = shownSeries(PROFIT, d, "quarter").points.at(-1)!;
    expect(m.period).toBe("Q2 2026");
    expect(m.boxes[0].value).toBe(q.value);
    expect(m.boxes.map((b) => b.label)).toEqual(["Profit (so far)", "Revenue (so far)", "Operating cost (so far)"]);
    // The day a Snapshot counts from comes from the widget's own settings: the period it covers is over.
    const longer = dataOf(all, rows({ 1: [100, 120, 140, 160, 180], 2: [60, 70, 80, 90, 100] }), { today: "2026-05-10" });
    expect(ok(treeFromData(PROFIT, longer, { display: "quarter", asOf: "2026-06-30" })).boxes.map((b) => b.label)).toEqual(["Profit (2 of 3 months)", "Revenue (2 of 3 months)", "Operating cost (2 of 3 months)"]);
  });

  it("refuses what is not a Derived Metric, an input that is not in the data, and one its owner withheld, in the same words", () => {
    expect(refusal(treeFromData(undefined, data))).toBe("There is no Metric to draw a tree of.");
    expect(refusal(treeFromData(REV, data))).toBe("Not drawn: Revenue is not calculated from other Metrics, so it has no formula to draw.");
    // What a View Link or a Snapshot leaves out, and what the person may not see, is simply not in the data.
    for (const rest of [[PROFIT, REV], [PROFIT, COST], [PROFIT]]) expect(refusal(treeFromData(PROFIT, canvas(rest, data.series)))).toBe(HIDDEN);
    expect(refusal(treeFromData({ ...PROFIT, inputs_withheld: true }, data))).toBe(HIDDEN);
  });

  it("gives a person who may see only the Derived Metric nothing of its inputs: no name, no number, no remainder", () => {
    const secret = metric({ id: 4, slug: "salaries", name: "Salary pool", decimals: 3 });
    const derived = metric({ id: 5, slug: "margin", name: "Margin", formula: "{revenue} - {salaries}", aggregation: "none" });
    const full = dataOf([REV, secret, derived], [...rows({ 1: [100, 120] }), ...months("2026-01", [123456.789, 987654.321]).map((p, i) => ob(secret, p.period, p.value, 900 + i))]);
    expect(shownSeries(derived, full, undefined).points.at(-1)!.value).toBeCloseTo(120 - 987654.321, 6);
    // The viewer is given the Derived Metric and the part they may see, with their series only: the hidden input is not in the data.
    const seen = { ...full, metrics: [REV, derived], series: { revenue: full.series.revenue, margin: full.series.margin } };
    const m = treeFromData(derived, seen);
    expect(m).toEqual({ ok: false, refusal: "Not drawn: Margin is calculated from Metrics that are not all shared here, so its parts are not shown." });
    const text = JSON.stringify(m);
    for (const leak of ["987654", "Salary", "salaries", "321", "867534"]) expect(text).not.toContain(leak);
    // The Metric's own value is not a leak, as the page shows it anyway, and the tree does not add to it.
    expect(JSON.stringify(seen.series)).toContain("-987534.321");
  });

  it("refuses an input that is a Derived Metric, inputs of different periods, and parts that cannot be shown by one period", () => {
    const inner = metric({ id: 6, slug: "inner", name: "Inner", formula: "{revenue} + 1", aggregation: "none" });
    const outer = metric({ id: 7, slug: "outer", name: "Outer", formula: "{inner} - {cost}", aggregation: "none" });
    expect(refusal(treeFromData(outer, dataOf([REV, COST, inner, outer], rows({ 1: [100], 2: [60] }))))).toContain("Inner is a Derived Metric itself");
    const weekly = metric({ id: 8, slug: "visits", name: "Visits", period: "week" });
    const mixed = metric({ id: 9, slug: "mixed", name: "Mixed", formula: "{revenue} + {visits}", aggregation: "none" });
    expect(refusal(treeFromData(mixed, dataOf([REV, weekly, mixed], rows({ 1: [100] }))))).toContain("counted by different periods");
    // By quarter, an input set to Aggregation none stays by month while its neighbour is by quarter: not set side by side.
    const none = metric({ id: 10, slug: "level", name: "Level", aggregation: "none" });
    const both = metric({ id: 11, slug: "both", name: "Both", formula: "{revenue} + {level}", aggregation: "none" });
    const d = dataOf([REV, none, both], [...rows({ 1: [100, 120, 140] }), ...months("2026-01", [1, 2, 3]).map((p, i) => ob(none, p.period, p.value, 700 + i))]);
    expect(refusal(treeFromData(both, d, { display: "quarter" }))).toBe("Not drawn: the parts of the formula cannot be shown by the same period here, so they cannot be set side by side.");
  });

  it("says so when there is nothing to draw yet, and refuses Condensed Values it cannot place", () => {
    expect(refusal(treeFromData(PROFIT, dataOf(all, [])))).toBe("There are no values to draw yet.");
    const condensed = { period: "2026-01-01", periodEnd: "2026-03-31", into: "quarter" as const, held: 3, of: 3, sum: "300", last: { value: "100", day: "2026-03-01" }, target: null, locked: false, condensedOn: "2026-05-01" };
    const d = { ...dataOf(all, []), condensed: { 1: [condensed], 2: [{ ...condensed, sum: "180" }] } };
    expect(refusal(treeFromData(PROFIT, d))).toContain("Condensed Values");
  });
});
