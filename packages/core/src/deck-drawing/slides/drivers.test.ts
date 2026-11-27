import { describe, expect, it } from "vitest";

import { STARTER_THEME } from "../../themes";
import type { BreakdownRow, CanvasData, Metric, Point } from "../../types";
import { drawDeck } from "../draw-deck";
import { flatten, type Obj } from "../objects";
import type { DeckFacts, SlideSource, SlideType } from "../slide-type";
import { bridge, BRIDGE_STEPS, type BridgeContent } from "./bridge";
import { DRIVER_TREE, driverTree, type TreeContent } from "./driver-tree";
import { gapTable } from "./gap-table";
import { SLIDE_TYPES } from "./index";
import { NOT_THERE } from "./listed";
import { mosaic, type MosaicContent } from "./mosaic";

const DECK: DeckFacts = { name: "Review", period: "September 2026", date: "9 October 2026", footer: "", agenda: [] };
const AUG = "2026-08-01";
const SEP = "2026-09-01";

const metric = (id: number, name: string, more: Partial<Metric> = {}) =>
  ({ id, slug: `m${id}`, name, formula: null, polarity: "higher", period: "month", decimals: 0, unit: "", unit_position: "after", ...more }) as Metric;

const months = (before: number | null, after: number | null): Point[] =>
  [before === null ? null : { period: AUG, value: before }, after === null ? null : { period: SEP, value: after }].filter((p): p is Point => !!p);

const data = (metrics: Metric[], values: Record<number, [number | null, number | null]> = {}, more: Partial<CanvasData> = {}) =>
  ({
    metrics,
    series: Object.fromEntries(metrics.map((m) => [m.slug, months(...(values[m.id] ?? [null, null]))])),
    targets: {},
    projections: {},
    breakdowns: {},
    yearStart: 1,
    numberStyle: "en",
    ...more,
  }) as unknown as CanvasData;

const slide = (type: string, metrics: number[], options: Record<string, unknown> = {}): SlideSource => ({ id: `sl_${type}`, type, metrics, options, headline: null });

function filled<C>(type: SlideType<C>, source: SlideSource, from: CanvasData) {
  const out = type.fill(source, from, DECK);
  if (!("content" in out)) throw new Error(out.cannot);
  return out;
}
function refused<C>(type: SlideType<C>, source: SlideSource, from: CanvasData): string {
  const out = type.fill(source, from, DECK);
  if (!("cannot" in out)) throw new Error("It was drawn.");
  // A refused slide says no figure.
  expect(out.headline).not.toMatch(/\d/);
  return out.cannot;
}
const breakdown = (id: number, periods: Record<string, BreakdownRow[]>) => ({ breakdowns: { [id]: periods } });
const text = (objects: Obj[]) =>
  flatten(objects)
    .flatMap((o) => (o.type === "text" ? o.body.paras.map((p) => p.runs.map((r) => r.t).join("")) : []))
    .join(" ");

describe("a slide reads only the Metrics it lists", () => {
  const all = data([metric(1, "Revenue"), metric(2, "Secret plan")], { 1: [1, 2], 2: [3, 4] });
  it.each([gapTable, bridge, mosaic, driverTree])("$id says nothing of any Metric where one it lists is not there", (type) => {
    const out = (type as SlideType).fill(slide(type.id, [1, 9]), all, DECK);
    expect(out).toBe(NOT_THERE);
    expect(JSON.stringify(out)).not.toContain("Revenue");
  });
  it.each([gapTable, bridge, mosaic, driverTree])("$id lists none", (type) => {
    expect((type as SlideType).fill(slide(type.id, []), all, DECK)).toBe(NOT_THERE);
  });
});

describe("the gap table", () => {
  const rows = (n: number, value: (i: number) => number): BreakdownRow[] => Array.from({ length: n }, (_, i) => ({ label: `Person ${i + 1}`, value: value(i) }));
  const two = (actual: BreakdownRow[], goal: BreakdownRow[]) =>
    data([metric(1, "Bookings"), metric(2, "Quota")], {}, { breakdowns: { 1: { [SEP]: actual }, 2: { [SEP]: goal } } });

  it("counts the rows below, with negative and zero values and a row without a goal", () => {
    const actual = [
      { label: "Anna", value: -5 },
      { label: "Ben", value: 10 },
      { label: "Cleo", value: 0 },
    ];
    const out = filled(gapTable, slide("gap-table", [1, 2]), two(actual, [{ label: "Anna", value: 10 }, { label: "Ben", value: 10 }]));
    expect(out.headline).toBe("Bookings: 1 of 2 rows is below Quota");
    expect(out.content.rows.map((r) => r.gap)).toEqual([0, -15, null]);
    expect(out.source).toMatch(/^Ziffr; Bookings, Quota; .*2026/);
  });

  it("goes on to more slides and drops no row", () => {
    const many = rows(27, (i) => i);
    const drawn = drawDeck(
      {
        name: "Review",
        design: "band",
        emphasis: "strong",
        slides: [slide("gap-table", [1, 2]), { ...slide("mosaic", [1]), id: "sl_after" }],
        data: two(many, rows(27, () => 9)),
        theme: { ...STARTER_THEME, slides: { ...STARTER_THEME.slides, show_slide_number: true } },
        period: DECK.period,
        date: DECK.date,
      },
      SLIDE_TYPES,
    );
    const table = drawn.slides.filter((s) => s.type === "gap-table");
    expect(table.length).toBeGreaterThan(1);
    expect(table.map((s) => s.part)).toEqual(table.map((_, i) => i || undefined));
    const shown = table.flatMap((s) => flatten(s.objects).flatMap((o) => (o.type === "table" ? o.rows.slice(1).map((r) => r.cells[0]!.body.paras[0]!.runs[0]!.t) : [])));
    expect(new Set(shown).size).toBe(27);
    expect(text(table.at(-1)!.objects)).toContain("of 27");
    // The slide after it is numbered after all of them.
    expect(text(drawn.slides.at(-1)!.objects).split(" ")).toContain(String(table.length + 1));
  });

  const parts = [metric(1, "Commit", { total: { targets: "own", open: true } }), metric(2, "Commit, Anna"), metric(3, "Commit, Ben")];
  const list = (more: object = {}) => ({ totalLists: { 1: { parts: [2, 3].map((part) => ({ part, first: AUG, last: null })), others: [], hidden: false, ...more } } });
  const total = () => data(parts, { 1: [10, 12], 2: [4, 5], 3: [6, 7] }, list());

  it("shows a Total's parts", () => {
    const out = filled(gapTable, slide("gap-table", [1, 2, 3], { total: true }), total());
    expect(out.content.rows.map((r) => r.label).sort()).toEqual(["Anna", "Ben"]);
  });
  it("is not drawn where the Total adds up a Metric the slide does not list", () => {
    const why = refused(gapTable, slide("gap-table", [1, 2], { total: true }), total());
    expect(why).toContain("does not list");
    expect(why).not.toContain("Ben");
  });
  it("says that others are not shown, and adds up nothing", () => {
    const from = data(parts.slice(0, 2), { 1: [10, 12], 2: [4, 5] }, { totalLists: { 1: { parts: [{ part: 2, first: AUG, last: null }], others: [SEP], hidden: true } } });
    const out = filled(gapTable, slide("gap-table", [1, 2], { total: true }), from);
    expect(out.note).toContain("not shown to you");
    expect(out.content.rows).toHaveLength(1);
  });
  it("is refused in words without rows, and for a count of Metrics it cannot take", () => {
    expect(refused(gapTable, slide("gap-table", [1, 2]), two([], []))).toContain("No Breakdown");
    expect(refused(gapTable, slide("gap-table", [1]), two([], []))).toContain("two Metrics");
  });
});

describe("the bridge", () => {
  const sum = (formula: string, more: Partial<Metric> = {}) => [metric(1, "Margin", { formula, ...more }), metric(2, "Revenue"), metric(3, "Cost", { polarity: "lower" })];
  const values: Record<number, [number, number]> = { 1: [40, 20], 2: [100, 90], 3: [60, 70] };
  const kinds = (c: BridgeContent) => c.columns.map((x) => x.kind);
  const ends = (c: BridgeContent) => {
    // Every step starts where the one before it ends, and the last reaches the new value.
    for (let i = 2; i < c.columns.length - 1; i++) expect(c.columns[i]!.from).toBeCloseTo(c.columns[i - 1]!.to);
    expect(c.columns.at(-2)!.to).toBeCloseTo(c.columns.at(-1)!.to);
  };

  it("takes the inputs of a formula with their signs", () => {
    const out = filled(bridge, slide("bridge", [1, 2, 3]), data(sum("{m2} - {m3}"), values));
    expect(out.headline).toBe("Margin fell from 40 to 20");
    expect(kinds(out.content)).toEqual(["end", "part", "part", "end"]);
    expect(out.content.columns.slice(1, 3).map((c) => c.to - c.from)).toEqual([-10, -10]);
    ends(out.content);
  });
  it("gives what the parts leave out a step of its own", () => {
    const out = filled(bridge, slide("bridge", [1, 2, 3]), data(sum("{m2} - {m3} + 5"), { ...values, 1: [45, 20] }));
    expect(kinds(out.content)).toContain("rest");
    ends(out.content);
  });
  it("is refused whole where the formula changed to read a Metric the slide does not list", () => {
    const why = refused(bridge, slide("bridge", [1, 2]), data(sum("{m2} - {m3}"), values));
    expect(why).toContain("does not list");
    expect(why).not.toMatch(/Cost|\d/);
  });
  it("is refused for a formula that multiplies, withheld inputs or a missing value", () => {
    expect(refused(bridge, slide("bridge", [1, 2, 3]), data(sum("{m2} * {m3}"), values))).toContain("not only added");
    expect(refused(bridge, slide("bridge", [1, 2, 3]), data(sum("{m2} - {m3}", { inputs_withheld: true }), values))).toContain("not shown to you");
    expect(refused(bridge, slide("bridge", [1, 2, 3]), data(sum("{m2} - {m3}"), { ...values, 3: [60, null] }))).toContain("both periods");
    expect(refused(bridge, slide("bridge", [1, 2, 3]), data(sum("{m2} - {m3}"), { ...values, 1: [null, 20] }))).toContain("no value for");
    expect(refused(bridge, slide("bridge", [1]), data([metric(1, "Margin")], values))).toContain("cannot be split");
  });

  const total = [metric(1, "Commit", { total: { targets: "own", open: true } }), metric(2, "Anna"), metric(3, "Ben")];
  const list = (more: object = {}) => ({ totalLists: { 1: { parts: [2, 3].map((part) => ({ part, first: AUG, last: null })), others: [], hidden: false, ...more } } });
  const totals: Record<number, [number, number]> = { 1: [10, 12], 2: [4, 5], 3: [6, 7] };

  it("takes a Total's parts", () => {
    ends(filled(bridge, slide("bridge", [1, 2, 3]), data(total, totals, list())).content);
  });
  it.each([
    ["a part hidden from the viewer", [1, 2], total.slice(0, 2), list({ parts: [{ part: 2, first: AUG, last: null }], others: [SEP], hidden: true })],
    ["a part the slide does not list", [1, 2], total, list()],
    ["a part hidden in the period before only", [1, 2, 3], total, list({ others: [AUG] })],
    ["no list of parts", [1, 2, 3], total, {}],
  ])("is refused whole for a Total with %s", (_, ids, metrics, more) => {
    const why = refused(bridge, slide("bridge", ids), data(metrics, totals, more));
    expect(why).toContain("not shown to you");
    expect(why).not.toMatch(/Ben|\d/);
  });

  it("takes a Breakdown's rows, adds the smallest together and keeps the sum", () => {
    const rows = (factor: number) => Array.from({ length: 14 }, (_, i) => ({ label: `Row ${i}`, value: (i - 4) * factor }));
    const out = filled(bridge, slide("bridge", [1]), data([metric(1, "Sales")], { 1: [-100, 3000] }, breakdown(1, { [AUG]: rows(1), [SEP]: [...rows(100).slice(1), { label: "New", value: 7 }] })));
    expect(out.content.columns.filter((c) => c.kind === "part")).toHaveLength(BRIDGE_STEPS);
    expect(out.note).toContain("counted as 0");
    ends(out.content);
  });
  it("says that a number stayed", () => {
    const out = filled(bridge, slide("bridge", [1]), data([metric(1, "Sales")], { 1: [0, 0] }, breakdown(1, { [AUG]: [{ label: "A", value: 0 }], [SEP]: [{ label: "A", value: 0 }] })));
    expect(out.headline).toBe("Sales stayed at 0");
    expect(kinds(out.content)).toEqual(["end", "part", "end"]);
  });
});

describe("the mosaic", () => {
  const row = (label: string, value: number, parts?: [string, number][]): BreakdownRow => ({ label, value, parts: parts?.map(([l, v]) => ({ label: l, value: v })) });
  const from = (rows: BreakdownRow[], own: number | null = null) => data([metric(1, "Sales")], { 1: [null, own] }, breakdown(1, { [SEP]: rows }));
  const source = slide("mosaic", [1]);
  const full = (c: MosaicContent) => {
    for (const column of c.columns.filter((x) => x.share > 0)) expect(column.pieces.reduce((a, p) => a + p.share, 0)).toBeCloseTo(1);
    expect(c.columns.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1);
  };

  it("keeps six columns and five parts, the rest as Other", () => {
    const parts = Array.from({ length: 9 }, (_, i): [string, number] => [`Part ${i}`, i + 1]);
    const out = filled(mosaic, source, from(Array.from({ length: 11 }, (_, i) => row(`Row ${i}`, 45, parts))));
    expect(out.content.columns).toHaveLength(6);
    expect(out.content.parts).toHaveLength(5);
    expect(out.content.parts.at(-1)).toBe("Other");
    expect(out.content.columns.at(-1)!.name).toBe("Other (6 rows)");
    full(out.content);
  });
  it("says where parts do not add up to their row, or the rows not to the Metric", () => {
    const out = filled(mosaic, source, from([row("Short", 10, [["A", 4]]), row("Over", 10, [["A", 15]]), row("None", 5)], 100));
    expect(out.note).toContain("do not add up to their row in: Short, Over, None.");
    expect(out.note).toContain("not to the 100");
    expect(out.content.columns.map((c) => c.pieces.map((p) => p.part))).toEqual([[0, null], [0], [null]]);
    full(out.content);
  });
  it("draws very uneven rows and a row of 0, and names the narrow ones", () => {
    const out = filled(mosaic, source, from([row("Huge", 1e9, [["A", 1e9]]), row("Tiny", 1, [["A", 1]]), row("Nothing", 0, [["A", 0]])]));
    full(out.content);
    expect(out.headline).toMatch(/^Huge holds /);
  });
  it.each([
    ["negative rows", [row("A", -1, [["x", -1]])], "negative"],
    ["a negative part", [row("A", 5, [["x", 6], ["y", -1]])], "negative"],
    ["no parts", [row("A", 5)], "no parts"],
    ["only zeros", [row("A", 0, [["x", 0]])], "is 0"],
    ["no rows", [], "no Breakdown"],
  ])("is refused in words for %s", (_, rows, words) => {
    expect(refused(mosaic, source, from(rows))).toContain(words);
  });
});

describe("the driver tree", () => {
  const metrics = (formula = "{m2} * {m3}", more: Partial<Metric> = {}) => [
    metric(1, "Revenue", { formula, ...more }),
    metric(2, "Deals", { total: { targets: "own", open: true } }),
    metric(3, "Average price"),
    metric(4, "North"),
    metric(5, "Lost - not won", { polarity: "lower" }),
  ];
  const values: Record<number, [number | null, number | null]> = { 1: [80, 100], 2: [32, 50], 3: [10, null], 4: [20, 30], 5: [12, 20] };
  const list = (more: object = {}) => ({ totalLists: { 2: { parts: [4, 5].map((part) => ({ part, first: AUG, last: null })), others: [], hidden: false, ...more } } });
  const all = slide("driver-tree", [1, 2, 3, 4, 5]);
  const flat = (c: TreeContent) => {
    const walk = (n: TreeContent["root"]): TreeContent["root"][] => [n, ...n.inputs.flatMap(walk)];
    return walk(c.root);
  };
  const names = (c: TreeContent) => flat(c).map((n) => n.name);

  it("opens three levels, in words, and never takes a missing value as 0", () => {
    const out = filled(driverTree, all, data(metrics(), values, list()));
    expect(names(out.content)).toEqual(["Revenue", "Deals", "North", "Lost - not won", "Average price"]);
    expect(out.content.root.formula).toBe("Deals × Average price");
    expect(out.content.root.inputs[0]!.formula).toBe("North + Lost - not won");
    expect(out.content.root.inputs[1]!.value).toBe("no value");
    expect(flat(out.content).find((n) => n.name.startsWith("Lost"))!.signal).toBe("bad");
  });
  it("opens two where asked", () => {
    const out = filled(driverTree, slide("driver-tree", all.metrics, { levels: 2 }), data(metrics(), values, list()));
    expect(names(out.content)).toEqual(["Revenue", "Deals", "Average price"]);
  });
  it.each([
    ["a part is not listed", slide("driver-tree", [1, 2, 3, 4]), list()],
    ["a part is hidden from the viewer", slide("driver-tree", [1, 2, 3, 4]), list({ parts: [{ part: 4, first: AUG, last: null }], hidden: true, others: [SEP] })],
    ["a part was hidden in the period before", all, list({ others: [AUG] })],
  ])("keeps a Total closed where %s", (_, source, more) => {
    const out = filled(driverTree, source, data(metrics(), values, more));
    expect(names(out.content)).toEqual(["Revenue", "Deals", "Average price"]);
    expect(JSON.stringify(out)).not.toContain("North +");
  });
  it.each([
    ["the slide lists too few", slide("driver-tree", [1, 2]), data(metrics(), values)],
    ["the formula changed to read another Metric", slide("driver-tree", [1, 2, 3]), data(metrics("{m2} * {m4}"), values)],
    ["the inputs are withheld", all, data(metrics(undefined, { inputs_withheld: true }), values)],
  ])("is refused whole where %s", (_, source, from) => {
    const why = refused(driverTree, source, from);
    expect(why).toContain("does not list");
    expect(why).not.toMatch(/Lost|\d/);
  });
  it("is refused by the Formula Tree's rules, without a formula, without a value and beyond its boxes", () => {
    expect(refused(driverTree, slide("driver-tree", [3]), data(metrics(), values))).toContain("not calculated");
    expect(refused(driverTree, all, data(metrics()))).toContain("no value");
    expect(refused(driverTree, all, data(metrics("prev({m3}) + {m2}"), values))).toContain("period before");
    const derived = [metric(1, "Sum", { formula: "{m2}" }), metric(2, "Half", { formula: "{m3}" }), metric(3, "Whole")];
    expect(refused(driverTree, slide("driver-tree", [1, 2, 3]), data(derived, { 1: [1, 2] }))).toContain("Derived Metric itself");
    const many = Array.from({ length: DRIVER_TREE.boxes }, (_, i) => metric(i + 2, `Input ${i}`));
    const root = metric(1, "Sum", { formula: many.map((m) => `{${m.slug}}`).join(" + ") });
    const from = data([root, ...many], Object.fromEntries([root, ...many].map((m) => [m.id, [1, 2]])));
    expect(refused(driverTree, slide("driver-tree", [1, ...many.map((m) => m.id)]), from)).toContain("boxes");
  });
});
