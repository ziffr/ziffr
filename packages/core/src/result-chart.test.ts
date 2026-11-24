// The rule that thins a long chart for drawing, and the shape of a chart of lines (ticket #1076): every value drawn is one the result holds, the lowest
// and the highest of each line and the ends are always drawn, a gap stays a gap, and up to the limit nothing is left out.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { linesChart, MOST_DRAWN, thinned } from "./result-chart";
import { months } from "./test/fixtures";

const unit = { name: "A", unit: "", unit_position: "after" as const, decimals: 0 };
const cell = fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: null, freq: 8 });

describe("thinned", () => {
  it("leaves 156 weekly periods (and anything up to the limit) as they are", () => {
    expect(thinned([Array.from({ length: 156 }, (_, i) => i % 7)], MOST_DRAWN)).toEqual(Array.from({ length: 156 }, (_, i) => i));
    expect(thinned([Array.from({ length: MOST_DRAWN }, (_, i) => i)], MOST_DRAWN)).toHaveLength(MOST_DRAWN);
  });

  it("keeps the ends, the lowest and the highest of every line, in order, within the limit plus what is kept by name", () => {
    fc.assert(fc.property(fc.array(fc.array(cell, { minLength: 300, maxLength: 300 }), { minLength: 1, maxLength: 3 }), fc.integer({ min: 40, max: 200 }), (lines, limit) => {
      const kept = thinned(lines, limit);
      expect(kept[0]).toBe(0);
      expect(kept[kept.length - 1]).toBe(299);
      expect([...kept].sort((a, b) => a - b)).toEqual(kept);
      expect(new Set(kept).size).toBe(kept.length);
      for (const line of lines) {
        const have = line.filter((v): v is number => v !== null);
        if (have.length === 0) continue;
        const shown = kept.map((i) => line[i]).filter((v): v is number => v !== null);
        expect(Math.min(...shown)).toBe(Math.min(...have));
        expect(Math.max(...shown)).toBe(Math.max(...have));
      }
      // No more than 2 for each line in each stretch, the ends, and the first of each gap.
      expect(kept.length).toBeLessThanOrEqual(limit + 2 + lines.reduce((n, l) => n + l.filter((v, i) => v === null && (i === 0 || l[i - 1] !== null)).length, 0));
    }));
  });

  it("keeps a gap a gap: the first missing period of every run is still drawn, as empty", () => {
    fc.assert(fc.property(fc.array(cell, { minLength: 260, maxLength: 260 }), (line) => {
      const kept = thinned([line], 60);
      line.forEach((v, i) => { if (v === null && (i === 0 || line[i - 1] !== null)) expect(kept).toContain(i); });
    }));
  });

  it("keeps the periods it is told to (a mark, a level's ends)", () => {
    expect(thinned([Array.from({ length: 500 }, (_, i) => i)], 50, [123, 321])).toEqual(expect.arrayContaining([0, 123, 321, 499]));
  });
});

describe("linesChart", () => {
  it("puts the series on every period between the first and the last, a missing one as a gap and never a zero", () => {
    const a = months("2026-01", [5, 6, 7, 8]);
    const b = months("2026-01", [1, 2, 3, 4, 5]).filter((_, i) => i !== 2);
    const c = linesChart({ about: "pair", span: "month", series: [{ name: "A", unit, role: "values", points: a }, { name: "B", unit, role: "values", points: b, scale: "right" }] });
    expect(c.periods).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"]);
    expect(c.lines[0].values).toEqual([5, 6, 7, 8, null]);
    expect(c.lines[1].values).toEqual([1, 2, null, 4, 5]);
    expect(c.lines.map((l) => l.scale)).toEqual(["left", "right"]);
  });

  it("draws 1000 daily periods with at most the limit and every value drawn one the series holds", () => {
    const days = Array.from({ length: 1000 }, (_, i) => ({ period: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), value: Math.round(Math.sin(i / 9) * 500 + i / 4) }));
    const c = linesChart({ about: "pair", span: "day", series: [{ name: "A", unit, role: "values", points: days }], marks: [{ period: days[500].period, kind: "change" }] });
    expect(c.periods.length).toBeLessThanOrEqual(MOST_DRAWN + 2);
    expect(c.periods).toContain(days[500].period);
    const byPeriod = new Map(days.map((d) => [d.period, d.value]));
    c.periods.forEach((p, i) => expect(c.lines[0].values[i]).toBe(byPeriod.get(p)));
    expect(Math.max(...(c.lines[0].values as number[]))).toBe(Math.max(...days.map((d) => d.value)));
    expect(Math.min(...(c.lines[0].values as number[]))).toBe(Math.min(...days.map((d) => d.value)));
  });
});
