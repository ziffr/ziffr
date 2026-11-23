// The bump mark (GLOSSARY: View Design, Breakdown): ranks with ties, missing rows, periods without a Breakdown, the
// choice of at most 8 rows and the biggest mover.
import { describe, expect, it } from "vitest";
import { BUMP_ROWS, bumpModel, upWords, type BumpInput } from "./bump-marks";
import { shiftPeriod } from "./periods";
import type { BreakdownRow } from "./types";

const month = (i: number) => shiftPeriod("2026-01-01", "month", i);
const rows = (o: Record<string, number>): BreakdownRow[] => Object.entries(o).map(([label, value]) => ({ label, value }));
const input = (byPeriod: Record<string, BreakdownRow[]>, extra: Partial<BumpInput> = {}): BumpInput => ({
  name: "Revenue",
  by: "month",
  to: Object.keys(byPeriod).sort().at(-1) ?? month(0),
  window: 12,
  byPeriod,
  periods: Object.keys(byPeriod),
  label: (p) => p.slice(0, 7),
  write: (v) => `${v} EUR`,
  ...extra,
});
const ok = (m: ReturnType<typeof bumpModel>) => { if (!m.ok) throw new Error(`refused: ${m.reason}`); return m; };
const ranks = (m: ReturnType<typeof ok>, label: string) => m.rows.find((r) => r.label === label)!.ranks;

describe("bumpModel", () => {
  it("ranks each row per period, 1 for the highest value, and keeps the periods oldest first", () => {
    const m = ok(bumpModel(input({ [month(1)]: rows({ A: 1, B: 9 }), [month(0)]: rows({ A: 5, B: 1 }) })));
    expect(m.periods.map((p) => p.label)).toEqual(["2026-01", "2026-02"]);
    expect(ranks(m, "A")).toEqual([1, 2]);
    expect(ranks(m, "B")).toEqual([2, 1]);
    expect(m.rows.find((r) => r.label === "B")!.values).toEqual([1, 9]);
  });

  it("gives rows with the same value the better rank, and the next row the rank after them", () => {
    const m = ok(bumpModel(input({ [month(0)]: rows({ A: 5, B: 5, C: 1 }), [month(1)]: rows({ A: 3, B: 2, C: 2 }) })));
    expect(ranks(m, "A")).toEqual([1, 1]);
    expect(ranks(m, "B")).toEqual([1, 2]);
    expect(ranks(m, "C")).toEqual([3, 2]);
    expect(m.rule).toContain("share the better rank");
  });

  it("ranks negative values like any other", () => {
    const m = ok(bumpModel(input({ [month(0)]: rows({ A: -5, B: -1, C: 3 }), [month(1)]: rows({ A: 1, B: -9, C: -2 }) })));
    expect(ranks(m, "A")).toEqual([3, 1]);
    expect(ranks(m, "B")).toEqual([2, 3]);
    expect(ranks(m, "C")).toEqual([1, 2]);
  });

  it("leaves a gap for a row a period does not have, never ranks it last, and says so", () => {
    const m = ok(bumpModel(input({ [month(0)]: rows({ A: 9, B: 5, C: 1 }), [month(1)]: rows({ A: 9, C: 1 }), [month(2)]: rows({ A: 9, B: 5, C: 1 }) })));
    expect(ranks(m, "B")).toEqual([2, null, 2]);
    expect(ranks(m, "C")).toEqual([3, 2, 3]);
    expect(m.rows.find((r) => r.label === "B")!.values).toEqual([5, null, 5]);
    expect(m.rule).toContain("B was missing in some periods and has no dot there, never a last place.");
    expect(m.alt).toContain("2026-02 missing");
  });

  it("puts the label of a row that is missing in the newest period at its last rank and says when it was last seen", () => {
    const m = ok(bumpModel(input({ [month(0)]: rows({ A: 9, B: 5 }), [month(1)]: rows({ A: 9, B: 4, C: 1 }), [month(2)]: rows({ A: 9, C: 1 }) })));
    const b = m.rows.find((r) => r.label === "B")!;
    expect(b.end).toEqual({ rank: 2, value: "4 EUR", seen: "2026-02" });
    expect(m.rows.find((r) => r.label === "A")!.end).toEqual({ rank: 1, value: "9 EUR", seen: null });
  });

  it("skips a period without a Breakdown and counts it, a period with a value only included", () => {
    const m = ok(bumpModel(input({ [month(0)]: rows({ A: 2, B: 1 }), [month(1)]: [], [month(3)]: rows({ A: 1, B: 2 }) }, { periods: [month(0), month(1), month(2), month(3)] })));
    expect(m.periods.map((p) => p.label)).toEqual(["2026-01", "2026-04"]);
    expect(m.leftOut).toBe(2);
    expect(m.rule).toContain("2 periods without a breakdown were left out.");
  });

  it("only looks back the window's periods from the newest", () => {
    const by = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [month(i), rows({ A: i, B: 3 })]));
    const m = ok(bumpModel(input(by, { window: 3 })));
    expect(m.periods.map((p) => p.label)).toEqual(["2026-04", "2026-05", "2026-06"]);
    // Periods outside the window are not counted as left out.
    expect(m.leftOut).toBe(0);
  });

  it("refuses with no Breakdown, with one period, with one row and with a window that is not a whole number", () => {
    expect(bumpModel(input({}))).toEqual({ ok: false, reason: "No period shown has a breakdown to draw." });
    expect(bumpModel(input({ [month(0)]: rows({ A: 1, B: 2 }) }))).toMatchObject({ ok: false, reason: expect.stringContaining("at least 2 periods") });
    expect(bumpModel(input({ [month(0)]: rows({ A: 1 }), [month(1)]: rows({ A: 2 }) }))).toMatchObject({ ok: false, reason: expect.stringContaining("at least 2 rows") });
    expect(bumpModel(input({ [month(0)]: rows({ A: 1, B: 2 }), [month(1)]: rows({ A: 2, B: 1 }) }, { window: 0 }))).toMatchObject({ ok: false });
  });

  it("adds up a label that appears twice and leaves out a value that is not a number", () => {
    const m = ok(bumpModel(input({ [month(0)]: [{ label: "A", value: 1 }, { label: "A", value: 2 }, { label: "B", value: 2 }, { label: "C", value: Number.NaN }], [month(1)]: rows({ A: 1, B: 2 }) })));
    expect(m.rows.map((r) => r.label).sort()).toEqual(["A", "B"]);
    expect(ranks(m, "A")).toEqual([1, 2]);
  });

  describe("more than 8 rows", () => {
    const labels = Array.from({ length: 11 }, (_, i) => `R${String(i + 1).padStart(2, "0")}`);
    // R01 is always first, R11 always last: the average rank is the position.
    const by = (swap = false) => ({
      [month(0)]: rows(Object.fromEntries(labels.map((l, i) => [l, 100 - i]))),
      [month(1)]: rows(Object.fromEntries(labels.map((l, i) => [l, 100 - i - (swap && l === "R11" ? -50 : 0)]))),
    });

    it("draws the 8 with the best average rank and counts the rest", () => {
      const m = ok(bumpModel(input(by())));
      expect(BUMP_ROWS).toBe(8);
      expect(m.rows.map((r) => r.label)).toEqual(labels.slice(0, 8));
      expect(m.rowsLeftOut).toBe(3);
      expect(m.rule).toContain("3 rows with a worse average rank are not drawn.");
      expect(m.lowest).toBe(8);
    });

    it("keeps the true rank among all rows, so a row ranked below 8 stretches the axis", () => {
      // R11 jumps to first in the newest period: its average rank (6) gets it into the 8, and its ranks stay 11 then 1.
      const m = ok(bumpModel(input(by(true))));
      expect(m.rows.map((r) => r.label)).toContain("R11");
      expect(ranks(m, "R11")).toEqual([11, 1]);
      expect(m.lowest).toBe(11);
    });

    it("breaks a tie of average rank by the latest value, then by label", () => {
      const m = ok(bumpModel(input({ [month(0)]: rows({ A: 3, B: 2 }), [month(1)]: rows({ A: 2, B: 3 }) })));
      // Both average 1.5: B has the higher latest value.
      expect(m.rows.map((r) => r.label)).toEqual(["B", "A"]);
      const same = ok(bumpModel(input({ [month(0)]: rows({ y: 1, x: 1 }), [month(1)]: rows({ x: 1, y: 1 }) })));
      expect(same.rows.map((r) => r.label)).toEqual(["x", "y"]);
    });
  });

  describe("the biggest mover", () => {
    it("is the row that gained the most places from the first to the last period drawn, named in words", () => {
      const m = ok(bumpModel(input({
        [month(0)]: rows({ A: 9, B: 8, C: 7, D: 1 }),
        [month(1)]: rows({ A: 1, B: 9, C: 8, D: 7 }),
        [month(2)]: rows({ D: 9, A: 8, B: 7, C: 1 }),
      })));
      // D: 4 -> 1 (up 3 places); C: 3 -> 4; A: 1 -> 2.
      expect(m.rows.filter((r) => r.up !== null).map((r) => [r.label, r.up])).toEqual([["D", 3]]);
      expect(m.alt).toContain("D: 2026-01 4, 2026-02 3, 2026-03 1; up 3 places.");
    });

    it("goes to the better last rank when two rows gained the same", () => {
      const m = ok(bumpModel(input({ [month(0)]: rows({ A: 9, B: 8, C: 1, D: 0 }), [month(1)]: rows({ A: 1, B: 0, C: 9, D: 8 }) })));
      // C 3 -> 1 (up 2), D 4 -> 2 (up 2): C ends better.
      expect(m.rows.filter((r) => r.up !== null).map((r) => r.label)).toEqual(["C"]);
    });

    it("is nobody when no row gained, and the caption says so", () => {
      const m = ok(bumpModel(input({ [month(0)]: rows({ A: 2, B: 1 }), [month(1)]: rows({ A: 2, B: 1 }) })));
      expect(m.rows.every((r) => r.up === null)).toBe(true);
      expect(m.rule).toContain("No drawn row gained places");
    });

    it("needs a rank in both the first and the last period, so a row that came or went is no mover", () => {
      const m = ok(bumpModel(input({ [month(0)]: rows({ A: 3, B: 2 }), [month(1)]: rows({ A: 3, B: 2, C: 9 }), [month(2)]: rows({ A: 3, B: 2, C: 9 }) })));
      expect(m.rows.find((r) => r.label === "C")!.up).toBeNull();
    });
  });

  it("writes the words of a gain, one place or more", () => {
    expect(upWords(1)).toBe("up 1 place");
    expect(upWords(3)).toBe("up 3 places");
  });

  it("has a text alternative that gives every rank in order", () => {
    const m = ok(bumpModel(input({ [month(0)]: rows({ A: 2, B: 1 }), [month(1)]: rows({ A: 1, B: 2 }) })));
    expect(m.alt).toContain("Bump chart of Revenue: the rank of each row from 2026-01 to 2026-02, 1 being the highest value.");
    expect(m.alt).toContain("A: 2026-01 1, 2026-02 2.");
  });
});
