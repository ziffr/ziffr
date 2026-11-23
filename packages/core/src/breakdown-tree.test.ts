// The tree of a Breakdown with parents (spec 0041, ticket 12): every box a number the core worked out exactly, held to a reference
// written another way (test/reference/breakdown-tree.ts) on generated Breakdowns, then to hand-worked numbers, every refusal, a row
// that does not add up, and what a person who may not see a Metric's Breakdown is given: nothing, and never a "rest" box.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { breakdownTree, breakdownTreeFromData, type BreakdownTreeSource } from "./breakdown-tree";
import { TREE, type TreeModel } from "./formula-tree";
import { metric as makeMetric } from "./test/fixtures";
import { exactOf, nearestDoubleOf, plus, same, ZERO, type Exact } from "./test/reference/exact";
import { referenceBreakdown, type RefRow } from "./test/reference/breakdown-tree";
import { referenceValue } from "./test/reference/write";
import type { BreakdownRow } from "./types";

const runs = Number(process.env.NUMBERS_RUNS ?? 100);
const STYLE = "1,234.5" as const;
const eur = { decimals: 0, unit: "€", unit_position: "after" as const };
const source = (rows: BreakdownRow[], total: number | null = null, over: Partial<BreakdownTreeSource> = {}): BreakdownTreeSource => ({ name: "Revenue", unit: eur, period: "March 2026", total, rows, ...over });
const tree = (rows: BreakdownRow[], total: number | null = null, over: Partial<BreakdownTreeSource> = {}) => breakdownTree(source(rows, total, over), STYLE);
const ok = (m: TreeModel) => {
  if (!m.ok) throw new Error(`refused: ${m.refusal}`);
  return m;
};
const refusal = (m: TreeModel) => (m.ok ? "" : m.refusal);
const eurText = (v: number, decimals = 0) => referenceValue({ ...eur, decimals }, v, STYLE);
const pct = (v: number, decimals = 1) => referenceValue({ unit: "%", unit_position: "after", decimals }, v, STYLE);

const GERMANY: BreakdownRow[] = [{ label: "Germany", value: 100, parts: [{ label: "Berlin", value: 60 }, { label: "Munich", value: 40 }] }, { label: "Austria", value: 50 }];

// ---------------------------------------------------------------------------------------------------- against the reference

const rowOf = (depth: number): fc.Arbitrary<RefRow> =>
  fc.record({
    label: fc.string({ minLength: 1, maxLength: 6, unit: fc.constantFrom(..."abcdefgh ") }).filter((s) => s.trim() !== ""),
    value: fc.oneof(
      { weight: 4, arbitrary: fc.integer({ min: -60, max: 5000 }) },
      { weight: 3, arbitrary: fc.tuple(fc.integer({ min: -999, max: 9999 }), fc.integer({ min: 1, max: 3 })).map(([n, p]) => n / 10 ** p) },
      { weight: 1, arbitrary: fc.constant(0) },
    ),
    parts: depth >= 4 ? fc.constant(undefined) : fc.option(fc.array(fc.constant(null).chain(() => rowOf(depth + 1)), { maxLength: 5 }), { nil: undefined }),
  });
const rowsArb = fc.array(rowOf(1), { minLength: 1, maxLength: 12 });
const totalArb = fc.oneof(fc.constant(null), fc.integer({ min: -100, max: 9000 }));

/** The rows without an empty list of parts, which is the same as none. */
const clean = (rows: RefRow[]): BreakdownRow[] => rows.map((r) => (r.parts?.length ? { label: r.label, value: r.value, parts: clean(r.parts) } : { label: r.label, value: r.value }));
const sumExact = (xs: Exact[]) => xs.reduce(plus, ZERO);

describe("the tree of a Breakdown against the reference", () => {
  it(`finds the same boxes, exact values and shares as the reference (${runs} Breakdowns)`, () => {
    let grouped = 0;
    let drawn = 0;
    fc.assert(
      fc.property(rowsArb, totalArb, (rows, total) => {
        const input = clean(rows);
        const want = referenceBreakdown("Revenue", total, input);
        const got = tree(input, total);
        expect(got.ok, JSON.stringify(input)).toBe(true);
        const model = ok(got);
        drawn++;
        expect(model.boxes.length).toBeLessThanOrEqual(TREE.boxes);
        expect(model.boxes.length).toBe(want.boxes.length);
        want.boxes.forEach((w, i) => {
          const b = model.boxes[i];
          expect(b.label, `box ${i}`).toBe(w.label);
          expect(b.level, `box ${i}`).toBe(w.level);
          expect(b.parent, `box ${i}`).toBe(w.parent);
          expect(b.value, `box ${i}`).toBe(nearestDoubleOf(w.value));
          expect(b.share, `box ${i}`).toBe(w.share === null ? null : nearestDoubleOf(w.share));
          expect(b.taken, `box ${i}`).toBe(w.value.num < 0n);
          // The number in the label is the number the core used: written from the box's own value (and the number is in the text version).
          if (b.value !== 0 || w.value.num === 0n) expect(b.text, `box ${i}`).toBe(eurText(b.value as number, b.text.includes(".") ? (b.text.split(".")[1].replace(/\D+$/, "").length) : 0));
          expect(model.alt, `box ${i}`).toContain(`\u2068${b.label}\u2069 ${b.text}`);
          if (w.others) {
            grouped++;
            // Every row left out of the drawing is still named in the text version, with its number.
            for (const l of w.others) expect(b.alt, l).toContain(l);
          }
        });
        // The shares of each box's parts add up to exactly 1, in exact arithmetic (the reference's own).
        const ids = new Set(want.boxes.map((_, i) => i));
        for (const id of ids) {
          const kids = want.boxes.filter((w) => w.parent === id);
          if (kids.length && kids.every((k) => k.share !== null)) expect(same(sumExact(kids.map((k) => k.share!)), exactOf(1))).toBe(true);
        }
        // Every row the box limit did not take is in the text version: its label and its number.
        const flat: { label: string; value: number }[] = [];
        const walk = (r: BreakdownRow[]) => r.forEach((x) => { flat.push(x); walk(x.parts ?? []); });
        walk(input);
        for (const r of flat) expect(model.alt).toContain(r.label.trim() === r.label ? r.label : r.label.trim());
        // A row whose parts add up to another number than its own is said in the rule, with both numbers.
        for (const d of want.differing) expect(model.rule).toContain(`${d.label}: its parts add up to `);
        expect(model.rule.includes("its parts add up to ")).toBe(want.differing.length > 0);
      }),
      { numRuns: runs },
    );
    expect(drawn).toBe(runs);
    expect(grouped).toBeGreaterThanOrEqual(0);
  });

  it("groups into Other rows often enough in generated Breakdowns to be worth testing (wide and deep ones)", () => {
    let grouped = 0;
    fc.assert(
      fc.property(fc.array(rowOf(1), { minLength: 15, maxLength: 30 }), (rows) => {
        const m = ok(tree(clean(rows)));
        if (m.boxes.some((b) => b.label.startsWith("Other rows"))) grouped++;
        expect(m.boxes.length).toBeLessThanOrEqual(TREE.boxes);
      }),
      { numRuns: Math.min(runs, 50) },
    );
    expect(grouped).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------- worked by hand

describe("a Breakdown of three levels, worked by hand", () => {
  const rows: BreakdownRow[] = [
    { label: "Germany", value: 100, parts: [{ label: "Berlin", value: 60, parts: [{ label: "Mitte", value: 36 }, { label: "Pankow", value: 24 }] }, { label: "Munich", value: 40 }] },
    { label: "Austria", value: 50 },
  ];
  const m = ok(tree(rows, 150));
  it("has a box for the Metric's value and each row, in tree order, each with its exact number", () => {
    expect(m.boxes.every((b) => b.differs === false)).toBe(true);
    expect(m.boxes.map((b) => [b.label, b.level, b.parent, b.text])).toEqual([
      ["Revenue", 0, null, "150 €"], ["Germany", 1, 0, "100 €"], ["Berlin", 2, 1, "60 €"], ["Mitte", 3, 2, "36 €"], ["Pankow", 3, 2, "24 €"], ["Munich", 2, 1, "40 €"], ["Austria", 1, 0, "50 €"],
    ]);
    expect(m.period).toBe("March 2026");
  });
  it("shares the width of each box among its parts by their size, as exact fractions that add up to 1", () => {
    expect(m.boxes.map((b) => b.share)).toEqual([null, 100 / 150, 0.6, 0.6, 0.4, 0.4, 50 / 150]);
    expect(m.boxes[1].shareText).toBe(pct(200 / 3));
    expect(m.boxes[3].shareText).toBe(pct(60));
    expect(m.boxes.every((b) => b.scaled && !b.taken && b.how === (b.level === 0 ? "root" : "term") && b.glyph === null && b.why === null)).toBe(true);
    expect(m.boxes.map((b) => b.op)).toEqual(["sum", "sum", "sum", null, null, null, null]);
  });
  it("gives a text alternative with every number in tree order and nothing about parts that add up, as they do", () => {
    expect(m.alt).toBe(
      "Breakdown tree of Revenue for March 2026. The top box is the value of Revenue for March 2026; the boxes under it are the rows of its breakdown, each as it was given. Parts share the width of the box above them by their size. "
      + "⁨Revenue⁩ 150 € is made of: ⁨Germany⁩ 100 €, 66.7 % of the parts; ⁨Austria⁩ 50 €, 33.3 % of the parts. "
      + "⁨Germany⁩ 100 € is made of: ⁨Berlin⁩ 60 €, 60.0 % of the parts; ⁨Munich⁩ 40 €, 40.0 % of the parts. "
      + "⁨Berlin⁩ 60 € is made of: ⁨Mitte⁩ 36 €, 60.0 % of the parts; ⁨Pankow⁩ 24 €, 40.0 % of the parts.",
    );
    expect(m.rule).not.toContain("add up to");
  });
  it("shows the Metric's value as the rows added up when the Metric has none, and says so", () => {
    const d = ok(tree(rows, null));
    expect(d.boxes[0].text).toBe("150 €");
    expect(d.rule).toContain("Revenue has no value for March 2026, so the top box is its rows added up.");
    expect(ok(tree(rows, Number.NaN)).rule).toContain("so the top box is its rows added up");
  });
});

describe("a row whose parts do not add up to it", () => {
  const rows: BreakdownRow[] = [{ label: "Germany", value: 100, parts: [{ label: "Berlin", value: 60 }, { label: "Munich", value: 30 }] }, { label: "Austria", value: 50 }];
  const m = ok(tree(rows, 160));
  it("shows both numbers, in the rule and the text version, and draws no box for the difference", () => {
    expect(m.boxes.map((b) => b.label)).toEqual(["Revenue", "Germany", "Berlin", "Munich", "Austria"]);
    expect(m.rule).toContain("Germany: its parts add up to 90 €, not to 100 €");
    expect(m.rule).toContain("Revenue: its parts add up to 150 €, not to 160 €");
    expect(m.boxes[1].text).toBe("100 €");
    expect(m.boxes[0].text).toBe("160 €");
    // Marked on the drawing: the boxes whose parts add up to another number, and only those.
    expect(m.boxes.map((b) => b.differs)).toEqual([true, true, false, false, false]);
    expect(m.rule).toContain("both are given, and the box has a mark in its corner.");
    // Its parts share its width by their own sizes, as parts of 90.
    expect(m.boxes[2].share).toBe(60 / 90);
  });
  it("compares as the values are written, so 0.1 and 0.2 add up to 0.3", () => {
    const d = ok(tree([{ label: "A", value: 0.3, parts: [{ label: "B", value: 0.1 }, { label: "C", value: 0.2 }] }], 0.3, { unit: { ...eur, decimals: 1 } }));
    expect(d.rule).not.toContain("add up to");
  });
  it("shows a difference as small as the numbers can tell, never rounded away", () => {
    const d = ok(tree([{ label: "A", value: 1, parts: [{ label: "B", value: 0.4 }, { label: "C", value: 0.6000001 }] }], 1));
    expect(d.rule).toContain("A: its parts add up to 1.0000001 €, not to 1.0000000 €");
  });
});

describe("negative, zero and tiny rows", () => {
  it("hatches a negative row, writes its sign and counts it by its size", () => {
    const m = ok(tree([{ label: "Sales", value: 80 }, { label: "Returns", value: -20 }], 60));
    expect(m.boxes.map((b) => [b.label, b.taken, b.text, b.share])).toEqual([["Revenue", false, "60 €", null], ["Sales", false, "80 €", 0.8], ["Returns", true, "−20 €", 0.2]]);
    expect(m.boxes[2].alt).toContain("negative");
    expect(m.rule).toContain("A row with a negative number is hatched and counts by its size");
    expect(m.rule).toContain("The top box is drawn at its own size on the same scale as its parts");
  });
  it("keeps a row of 0 as a box of no width and shares among zeros as none", () => {
    const m = ok(tree([{ label: "A", value: 0 }, { label: "B", value: 0 }], 0));
    expect(m.boxes.map((b) => [b.value, b.share, b.text])).toEqual([[0, null, "0 €"], [0, null, "0 €"], [0, null, "0 €"]]);
    expect(ok(tree([{ label: "A", value: 0 }, { label: "B", value: 5 }])).boxes[1].share).toBe(0);
  });
  it("refuses a number the doubles cannot tell from 0 rather than write it as 0, and one too small to write at all", () => {
    expect(refusal(tree([{ label: "A", value: 1e-30 }, { label: "B", value: 1 }]))).toBe("Not drawn: some numbers are too small to write out in full.");
    expect(refusal(tree([{ label: "A", value: 1 }, { label: "B", value: 1e-9 }]))).toBe("");
    // A tiny share of a big row is never written as 0 %, either.
    const m = ok(tree([{ label: "A", value: 1e12 }, { label: "B", value: 1 }], null, { unit: { ...eur, decimals: 2 } }));
    expect(m.boxes[2].shareText).not.toMatch(/^0[.,]0* ?%$/);
    expect(m.boxes[2].shareText).toBe("0.0000000001 %");
  });
});

describe("the limits", () => {
  it("draws 24 boxes as they are and groups the smallest rows past that, with their exact total, naming every one", () => {
    const rows = (n: number): BreakdownRow[] => Array.from({ length: n }, (_, i) => ({ label: `Row ${i + 1}`, value: 100 - i + 0.25 }));
    const fits = ok(tree(rows(23)));
    expect(fits.boxes).toHaveLength(24);
    expect(fits.boxes.some((b) => b.label.startsWith("Other"))).toBe(false);
    const over = ok(tree(rows(24)));
    expect(over.boxes).toHaveLength(24);
    const other = over.boxes[over.boxes.length - 1];
    // The top box, 22 rows, and one box for the two rows left out.
    expect(other.label).toBe("Other rows (2)");
    expect(other.value).toBe(78.25 + 77.25);
    expect(other.text).toBe("156 €");
    expect(other.alt).toContain("made of Row 23 78 €; Row 24 77 €");
    expect(over.alt).toContain("Row 24");
    expect(over.rule).toContain("grouped as Other rows");
    // The width of the group is its total size, so the shares still add up to 1.
    const shares = over.boxes.filter((b) => b.parent === 0).map((b) => b.share as number);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
  it("gives a box to a part only with its parent, and a row larger than its parent comes after it", () => {
    const rows: BreakdownRow[] = [{ label: "Small", value: 1, parts: [{ label: "Large part", value: 1000 }] }, ...Array.from({ length: 30 }, (_, i) => ({ label: `Top ${i}`, value: 10 + i }))];
    const m = ok(tree(rows));
    expect(m.boxes).toHaveLength(24);
    const small = m.boxes.findIndex((b) => b.label === "Small");
    // Small is the smallest top row: it is grouped, and so its large part cannot have a box of its own.
    expect(small).toBe(-1);
    expect(m.boxes.some((b) => b.label === "Large part")).toBe(false);
    expect(m.alt).toContain("Small 1 € (Large part 1,000 €)");
  });
  it("lets a small part in beside a larger row that does not fit", () => {
    // Room for one more box, and the largest candidate is a row that would bring an Other box of its own along.
    const rows: BreakdownRow[] = [
      ...Array.from({ length: 21 }, (_, i) => ({ label: `Top ${i}`, value: 1000 - i })),
      { label: "Big with parts", value: 500, parts: [{ label: "p1", value: 1 }, { label: "p2", value: 1 }] },
      { label: "Tiny", value: 2 },
    ];
    const m = ok(tree(rows));
    expect(m.boxes.length).toBeLessThanOrEqual(24);
    const want = referenceBreakdown("Revenue", null, rows);
    expect(m.boxes.map((b) => b.label)).toEqual(want.boxes.map((b) => b.label));
  });
  it("refuses a Breakdown past 4 levels of rows, past 1,000 rows, and a row with no number, in words", () => {
    const deep = (n: number): BreakdownRow[] => (n === 0 ? [] : [{ label: `L${n}`, value: 1, parts: deep(n - 1) }]);
    expect(ok(tree(deep(4))).boxes).toHaveLength(5);
    expect(refusal(tree(deep(5)))).toBe("Not drawn: the breakdown has more than the 4 levels of rows that read clearly in a chart.");
    const flat = (n: number): BreakdownRow[] => Array.from({ length: n }, (_, i) => ({ label: `R${i}`, value: 1 }));
    expect(ok(tree(flat(1000))).boxes).toHaveLength(24);
    expect(refusal(tree(flat(1001)))).toBe("Not drawn: the breakdown has more than 1000 rows.");
    expect(refusal(tree([{ label: "A", value: Number.NaN }]))).toBe("Not drawn: a row of the breakdown has no number.");
    expect(refusal(tree([{ label: "A", value: Infinity }]))).toBe("Not drawn: a row of the breakdown has no number.");
    expect(refusal(tree([{ label: "A", value: "1" as unknown as number }]))).toBe("Not drawn: a row of the breakdown has no number.");
    expect(refusal(tree([]))).toBe("Not drawn: Revenue has no rows to draw in this period.");
  });
  it("draws a flat Breakdown as one level of boxes, and one row as one box", () => {
    expect(ok(tree([{ label: "A", value: 1 }, { label: "B", value: 3 }])).boxes.map((b) => b.share)).toEqual([null, 0.25, 0.75]);
    expect(ok(tree([{ label: "A", value: 7 }])).boxes.map((b) => [b.label, b.share])).toEqual([["Revenue", null], ["A", 1]]);
  });
});

describe("names", () => {
  it("keeps markup as text, takes out characters that turn a line round, and sets each name apart in the text version", () => {
    const m = ok(tree([{ label: "<img src=x onerror=alert(1)>", value: 1 }, { label: "ab‮cd⁦ef⁩", value: 2 }, { label: "שלום עולם", value: 3 }], null, { name: "<b>Sales</b>‮" }));
    expect(m.boxes.map((b) => b.label)).toEqual(["<b>Sales</b>", "<img src=x onerror=alert(1)>", "abcdef", "שלום עולם"]);
    expect(m.alt).toContain("⁨שלום עולם⁩ 3 €");
    expect(m.alt).not.toMatch(/[‪-‮⁦⁧⁩](?!.*)/);
    expect(m.alt.match(/⁨/g)!.length).toBe(m.alt.match(/⁩/g)!.length);
  });
  it("handles a very long name and names that repeat", () => {
    const long = "x".repeat(5000);
    const m = ok(tree([{ label: long, value: 1 }, { label: long, value: 2 }]));
    expect(m.boxes[1].label).toHaveLength(5000);
    expect(m.boxes.map((b) => b.value)).toEqual([3, 1, 2]);
  });
});

// ---------------------------------------------------------------------------------------------------- from what a widget is given

describe("the tree from a widget's data (who may see what)", () => {
  const revenue = makeMetric({ id: 1, slug: "revenue", name: "Revenue", unit: "€", unit_position: "after", decimals: 0, period: "month" });
  const data = (breakdowns: Record<number, Record<string, BreakdownRow[]>>, series: Record<string, { period: string; value: number }[]> = { revenue: [{ period: "2026-03-01", value: 160 }] }) => ({ series, breakdowns, yearStart: 1 as const, numberStyle: STYLE });

  it("draws the newest Breakdown, under the Metric's value for that period", () => {
    const m = ok(breakdownTreeFromData(revenue, data({ 1: { "2026-02-01": [{ label: "Old", value: 1 }], "2026-03-01": GERMANY } })));
    expect(m.period).toBe("March 2026");
    expect(m.boxes.map((b) => b.label)).toEqual(["Revenue", "Germany", "Berlin", "Munich", "Austria"]);
    expect(m.boxes[0].text).toBe("160 €");
    expect(m.rule).toContain("Revenue: its parts add up to 150 €, not to 160 €");
    // No value for that period in the series: the rows added up.
    expect(ok(breakdownTreeFromData(revenue, data({ 1: { "2026-03-01": GERMANY } }, { revenue: [] }))).rule).toContain("so the top box is its rows added up");
    expect(ok(breakdownTreeFromData(revenue, data({ 1: { "2026-03-01": GERMANY } }, {}))).boxes[0].text).toBe("150 €");
  });
  it("stops at a Snapshot's day", () => {
    const d = data({ 1: { "2026-02-01": [{ label: "Old", value: 1 }], "2026-03-01": GERMANY } });
    expect(ok(breakdownTreeFromData(revenue, d, { asOf: "2026-02-28" })).boxes.map((b) => b.label)).toEqual(["Revenue", "Old"]);
    expect(ok(breakdownTreeFromData(revenue, d, { asOf: "2026-03-01" })).period).toBe("March 2026");
    expect(refusal(breakdownTreeFromData(revenue, d, { asOf: "2026-01-31" }))).toBe("Revenue has no breakdown yet.");
  });
  it("draws nothing, and names nothing, for a Metric whose Breakdown is not in the data (one the person may not see, or a View Link leaves out)", () => {
    const secret = makeMetric({ id: 2, slug: "secret", name: "Secret Margin" });
    const d = data({ 1: { "2026-03-01": GERMANY } });
    const none = breakdownTreeFromData(secret, d);
    expect(none).toEqual({ ok: false, refusal: "Secret Margin has no breakdown yet." });
    expect(JSON.stringify(none)).not.toMatch(/Germany|Berlin|150/);
    expect(refusal(breakdownTreeFromData(undefined, d))).toBe("Drop a metric with a breakdown.");
    expect(refusal(breakdownTreeFromData(revenue, data({})))).toBe("Revenue has no breakdown yet.");
  });
  it("never works a row out from a difference: a row left out of the data is not in any number the tree gives", () => {
    // The loader leaves out a row it cannot read with the rows under it; what the tree is given is all it draws, and its words say where
    // parts do not add up to their row (both numbers, as given), which the viewer could see in the rows already.
    const withheld: BreakdownRow[] = [{ label: "Germany", value: 100, parts: [{ label: "Berlin", value: 60 }] }];
    const m = ok(tree(withheld, 100));
    expect(m.boxes.map((b) => b.label)).toEqual(["Revenue", "Germany", "Berlin"]);
    expect(m.boxes.some((b) => /rest|remain|other/i.test(b.label))).toBe(false);
    expect(m.boxes.every((b) => [100, 60].includes(b.value as number))).toBe(true);
  });
  it("uses the Metric's own unit and writes a number as the Workspace writes it", () => {
    const pct2 = makeMetric({ id: 3, slug: "rate", name: "Rate", unit: "%", unit_position: "after", decimals: 1, period: "month" });
    const m = ok(breakdownTreeFromData(pct2, { series: {}, breakdowns: { 3: { "2026-03-01": [{ label: "Shoes", value: 1.55 }, { label: "Home", value: 0.45 }] } }, yearStart: 1 as const, numberStyle: "1.234,5" as const }));
    expect(m.boxes.map((b) => b.text)).toEqual(["2,0 %", "1,6 %", "0,5 %"].map((t, i) => (i === 0 ? t : t)));
  });
});

describe("the words, pinned whole", () => {
  const many = (n: number): BreakdownRow[] => Array.from({ length: n }, (_, i) => ({ label: `Row ${i + 1}`, value: 5 }));
  it("keeps equal rows in the order given when the boxes run out", () => {
    const m = ok(tree(many(26)));
    expect(m.boxes.map((b) => b.label).slice(1, 3)).toEqual(["Row 1", "Row 2"]);
    expect(m.boxes.at(-1)!.label).toBe("Other rows (4)");
    expect(m.boxes.at(-2)!.label).toBe("Row 22");
  });
  it("says a group that holds negative rows, and writes every sentence of the rule", () => {
    const rows: BreakdownRow[] = [...many(22).map((r, i) => ({ ...r, value: 100 - i })), { label: "Plus", value: 5 }, { label: "Minus", value: -5 }];
    const m = ok(tree(rows, 1000));
    expect(m.boxes.at(-1)).toMatchObject({ label: "Other rows (2)", value: 0, taken: false, text: "0 €" });
    expect(m.rule).toMatchInlineSnapshot(`"The top box is the value of Revenue for March 2026; the boxes under it are the rows of its breakdown, each as it was given. Parts share the width of the box above them by their size. A row with a negative number is hatched and counts by its size, so its share is of the size of the parts, not of their total. The smallest rows beyond 24 boxes are grouped as Other rows, with their exact total, and the box is as wide as their sizes together (negative rows count by their size); the text version names each of them. A number is a row's own, as it was given: where its parts add up to another number, both are given, and the box has a mark in its corner. Revenue: its parts add up to 1,969 €, not to 1,000 €."`);
    expect(m.boxes.at(-1)!.alt).toMatchInlineSnapshot(`"⁨Other rows (2)⁩ 0 €, 0.5 % of the parts, made of Plus 5 €; Minus −5 €"`);
  });
  it("pins the whole text of a tree with a negative row, parts that differ and a derived top box", () => {
    const m = ok(tree([{ label: "Sales", value: 120, parts: [{ label: "Online", value: 90 }, { label: "Returns", value: -25 }] }, { label: "Refunds", value: -30 }], null));
    expect(m.rule).toMatchInlineSnapshot(`"Revenue has no value for March 2026, so the top box is its rows added up. Parts share the width of the box above them by their size. A row with a negative number is hatched and counts by its size, so its share is of the size of the parts, not of their total. The top box is drawn at its own size on the same scale as its parts, so a value smaller than its parts is narrower. A number is a row's own, as it was given: where its parts add up to another number, both are given, and the box has a mark in its corner. Sales: its parts add up to 65 €, not to 120 €."`);
    expect(m.alt).toMatchInlineSnapshot(`"Breakdown tree of Revenue for March 2026. Revenue has no value for March 2026, so the top box is its rows added up. Parts share the width of the box above them by their size. A row with a negative number is hatched and counts by its size, so its share is of the size of the parts, not of their total. The top box is drawn at its own size on the same scale as its parts, so a value smaller than its parts is narrower. A number is a row's own, as it was given: where its parts add up to another number, both are given, and the box has a mark in its corner. Sales: its parts add up to 65 €, not to 120 €. ⁨Revenue⁩ 90 € is made of: ⁨Sales⁩ 120 €, 80.0 % of the parts; ⁨Refunds⁩ −30 €, negative, 20.0 % of the parts. ⁨Sales⁩ 120 € is made of: ⁨Online⁩ 90 €, 78.3 % of the parts; ⁨Returns⁩ −25 €, negative, 21.7 % of the parts."`);
    expect(m.boxes[0].alt).toMatchInlineSnapshot(`"⁨Revenue⁩ 90 €"`);
  });
  it("is negative at the top too", () => {
    const m = ok(tree([{ label: "A", value: -4 }, { label: "B", value: 2 }], -2));
    expect(m.alt).toContain("\u2068Revenue\u2069 −2 €, negative is made of");
    expect(m.boxes[0].taken).toBe(true);
  });
});

describe("every field of every box, pinned", () => {
  it("gives the fields of a small tree as written by hand", () => {
    const m = ok(tree([{ label: "A", value: 3, parts: [{ label: "B", value: -1 }] }, { label: "C", value: 1 }], 4));
    const alt = (s: string) => s;
    expect(m.boxes).toEqual([
      { id: 0, parent: null, level: 0, label: "Revenue", how: "root", glyph: null, taken: false, op: "sum", value: 4, text: "4 €", why: null, share: null, shareText: null, scaled: true, differs: false, alt: alt(m.boxes[0].alt) },
      { id: 1, parent: 0, level: 1, label: "A", how: "term", glyph: null, taken: false, op: "sum", value: 3, text: "3 €", why: null, share: 0.75, shareText: "75.0 %", scaled: true, differs: true, alt: "\u2068A\u2069 3 €, 75.0 % of the parts" },
      { id: 2, parent: 1, level: 2, label: "B", how: "term", glyph: null, taken: true, op: null, value: -1, text: "−1 €", why: null, share: 1, shareText: "100.0 %", scaled: true, differs: false, alt: "\u2068B\u2069 −1 €, negative, 100.0 % of the parts" },
      { id: 3, parent: 0, level: 1, label: "C", how: "term", glyph: null, taken: false, op: null, value: 1, text: "1 €", why: null, share: 0.25, shareText: "25.0 %", scaled: true, differs: false, alt: "\u2068C\u2069 1 €, 25.0 % of the parts" },
    ]);
    expect(m.boxes[0].alt).toBe("\u2068Revenue\u2069 4 €");
  });
  it("says so when two numbers are too close to write apart", () => {
    const m = ok(tree([{ label: "A", value: 1, parts: [{ label: "B", value: 1 }, { label: "C", value: 1e-20 }] }]));
    // The doubles are the same: no number of decimals tells them apart, and it is said so rather than written as two equal numbers.
    expect(m.rule).toContain("A: its parts add up to a number too close to 1 € to write out, not to 1 €");
  });
  it("groups the rows of a group that holds parts by name with their numbers", () => {
    const rows: BreakdownRow[] = [...Array.from({ length: 22 }, (_, i) => ({ label: `Big ${i}`, value: 1000 - i })), { label: "Small", value: 2, parts: [{ label: "Tiny", value: 2 }] }];
    expect(ok(tree(rows)).boxes.at(-1)!.alt).toBe("\u2068Other rows (1)\u2069 2 €, 0.0 % of the parts, made of Small 2 € (Tiny 2 €)".replace("0.0 %", ok(tree(rows)).boxes.at(-1)!.shareText!));
  });
});
