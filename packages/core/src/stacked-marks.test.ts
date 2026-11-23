// The stacked mark (GLOSSARY: View Design, Breakdown): which rows are segments, their order, the sums and every refusal.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { OTHER, STACKED_ROWS, stackedModel, type StackedInput } from "./stacked-marks";
import { shiftPeriod } from "./periods";
import type { BreakdownRow } from "./types";

const month = (i: number) => shiftPeriod("2026-01-01", "month", i);
const rows = (o: Record<string, number>): BreakdownRow[] => Object.entries(o).map(([label, value]) => ({ label, value }));
const input = (byPeriod: Record<string, BreakdownRow[]>, extra: Partial<StackedInput> = {}): StackedInput => ({
  name: "Revenue",
  by: "month",
  to: Object.keys(byPeriod).sort().at(-1) ?? month(0),
  window: 12,
  byPeriod,
  values: {},
  periods: Object.keys(byPeriod),
  label: (p) => p.slice(0, 7),
  write: (v) => `${v} EUR`,
  ...extra,
});
const ok = (m: ReturnType<typeof stackedModel>) => { if (!m.ok) throw new Error(`refused: ${m.reason}`); return m; };

describe("stackedModel", () => {
  it("stacks each period from its rows, the largest rows of the newest period first, in that order in every bar", () => {
    const m = ok(stackedModel(input({ [month(0)]: rows({ A: 5, B: 1 }), [month(1)]: rows({ B: 3, A: 2 }) })));
    // B is the largest of the newest period, so it is the bottom segment in both bars.
    expect(m.segments.map((s) => s.label)).toEqual(["B", "A"]);
    expect(m.bars.map((b) => b.parts)).toEqual([[1, 5], [3, 2]]);
    expect(m.bars.map((b) => [b.label, b.total, b.totalText])).toEqual([["2026-01", 6, "6 EUR"], ["2026-02", 5, "5 EUR"]]);
    expect(m.max).toBe(6);
  });

  it("gives the five largest rows a segment and gathers the rest, and a label the newest period lacks, in Other", () => {
    const six = rows({ a: 60, b: 50, c: 40, d: 30, e: 20, f: 10 });
    const m = ok(stackedModel(input({ [month(0)]: rows({ a: 1, z: 7 }), [month(1)]: six })));
    expect(STACKED_ROWS).toBe(5);
    expect(m.segments.map((s) => s.label)).toEqual(["a", "b", "c", "d", "e", OTHER]);
    expect(m.segments.at(-1)?.other).toBe(true);
    expect(m.bars[0].parts).toEqual([1, 0, 0, 0, 0, 7]);
    expect(m.bars[1].parts).toEqual([60, 50, 40, 30, 20, 10]);
    expect(m.rule).toContain("Other gathers every row that is not one of the 5 largest of 2026-02.");
  });

  it("has no Other segment when every row has a segment of its own", () => {
    const m = ok(stackedModel(input({ [month(0)]: rows({ a: 1, b: 2 }) })));
    expect(m.segments.map((s) => s.label)).toEqual(["b", "a"]);
    expect(m.rule).not.toContain(OTHER);
  });

  it("orders equal rows by label, never by how they arrived", () => {
    const a = ok(stackedModel(input({ [month(0)]: rows({ y: 1, x: 1 }) })));
    const b = ok(stackedModel(input({ [month(0)]: rows({ x: 1, y: 1 }) })));
    expect(a.segments).toEqual(b.segments);
    expect(a.segments.map((s) => s.label)).toEqual(["x", "y"]);
  });

  it("adds up a label that appears twice and leaves out a value that is not a number", () => {
    const m = ok(stackedModel(input({ [month(0)]: [{ label: "a", value: 1 }, { label: "a", value: 2 }, { label: "b", value: Number.NaN }] })));
    expect(m.segments.map((s) => s.label)).toEqual(["a"]);
    expect(m.bars[0].total).toBe(3);
  });

  it("leaves out a period with no breakdown, and says how many", () => {
    const m = ok(stackedModel(input({ [month(0)]: rows({ a: 1 }), [month(2)]: rows({ a: 2 }), [month(3)]: [] }, { periods: [month(0), month(1), month(2), month(3)] })));
    expect(m.bars.map((b) => b.period)).toEqual([month(0), month(2)]);
    expect(m.leftOut).toBe(2);
    expect(m.rule).toContain("2 periods left out: no breakdown.");
    expect(ok(stackedModel(input({ [month(0)]: rows({ a: 1 }) }, { periods: [month(0), month(1)], to: month(1) }))).rule).toContain("1 period left out: no breakdown.");
  });

  it("looks back only `window` periods from the newest, counted as periods", () => {
    const by = Object.fromEntries([0, 1, 2, 5, 6].map((i) => [month(i), rows({ a: i + 1 })]));
    const m = ok(stackedModel(input(by, { window: 3, to: month(6), periods: Object.keys(by) })));
    expect(m.bars.map((b) => b.period)).toEqual([month(5), month(6)]);
    // Month 4 is in the window and has neither a value nor rows: it is not counted as left out.
    expect(m.leftOut).toBe(0);
  });

  it("refuses a negative row in words, and a window that is not a whole number", () => {
    expect(stackedModel(input({ [month(0)]: rows({ a: 5, b: -1 }) }))).toEqual({ ok: false, reason: "This Breakdown has negative rows; stacked bars need positive ones." });
    expect(stackedModel(input({ [month(0)]: rows({ a: 1 }) }, { window: 2.5 })).ok).toBe(false);
    expect(stackedModel(input({ [month(0)]: rows({ a: 0, b: 0 }) })).ok).toBe(false);
    expect(stackedModel(input({})).ok).toBe(false);
  });

  it("says when the rows do not add up to the Metric's value, and only then", () => {
    const by = { [month(0)]: rows({ a: 50, b: 50 }) };
    expect(ok(stackedModel(input(by, { values: { [month(0)]: 100 } }))).rule).not.toContain("do not add up");
    expect(ok(stackedModel(input(by, { values: { [month(0)]: 100.5 } }))).rule).not.toContain("do not add up");
    expect(ok(stackedModel(input(by, { values: { [month(0)]: 140 } }))).rule).toContain("The rows do not add up to Revenue's value in every period, so a bar's height can differ from it.");
  });

  it("writes every value in the text alternative", () => {
    const m = ok(stackedModel(input({ [month(0)]: rows({ a: 1, b: 2 }) })));
    expect(m.alt).toContain("Stacked bars of Revenue, 1 period, 2026-01.");
    expect(m.alt).toContain("Segments from the bottom: b, a.");
    expect(m.alt).toContain("2026-01: total 3 EUR; b 2 EUR; a 1 EUR.");
    expect(m.latest).toEqual([{ label: "b", value: "2 EUR" }, { label: "a", value: "1 EUR" }]);
  });

  it("keeps each bar's segments adding up to its rows, and the same segments in every bar (generated)", () => {
    const row = fc.dictionary(fc.constantFrom("a", "b", "c", "d", "e", "f", "g", "h"), fc.integer({ min: 0, max: 1000 }), { minKeys: 1 });
    fc.assert(fc.property(fc.array(row, { minLength: 1, maxLength: 12 }), (list) => {
      const by = Object.fromEntries(list.map((r, i) => [month(i), rows(r)]));
      const m = stackedModel(input(by));
      if (!m.ok) return;
      expect(m.segments.length).toBeLessThanOrEqual(STACKED_ROWS + 1);
      expect(m.bars).toHaveLength(list.length);
      m.bars.forEach((b, i) => {
        expect(b.parts).toHaveLength(m.segments.length);
        expect(b.parts.reduce((x, y) => x + y, 0)).toBe(Object.values(list[i]).reduce((x, y) => x + y, 0));
      });
    }));
  });
});
