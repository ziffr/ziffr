// Where the boxes of a formula tree go (spec 0041, ticket 11): a rectangle's width is its value's share of the box above it, to well within a pixel,
// the parts of a sum fill their box exactly, and the factors of a product are equal, so a drawing never says more than the numbers do.
import { describe, expect, it } from "vitest";
import { formulaTree, type TreeBox, type TreeLeaf } from "@ziffr/core/formula-tree";
import { GAP_SHARE, layoutTree, OPERATOR_WIDTH, ROW, TREE_WIDTH, treeHeight } from "./tree-layout";

const eur = { decimals: 0, unit: "€", unit_position: "after" as const };
const leaf = (name: string, value: number | null): TreeLeaf => ({ name, value, unit: eur });
const boxesOf = (formula: string, leaves: Record<string, TreeLeaf>): TreeBox[] => {
  const m = formulaTree({ name: "Result", unit: eur, formula, period: "p", leaves }, "1,234.5");
  if (!m.ok) throw new Error(m.refusal);
  return m.boxes;
};
const sumOf = (xs: number[]) => boxesOf(xs.map((_, i) => `{p${i}}`).join(" + "), Object.fromEntries(xs.map((x, i) => [`p${i}`, leaf(`P${i}`, x)])));

describe("layoutTree", () => {
  it("makes a rectangle's width its value's share of the whole, within a pixel, on any width", () => {
    // A fixed pseudo-random walk (no dependency): 200 sums of 1 to 20 parts of 1 to 100,000, on widths from 200 to 2,000.
    let seed = 115;
    const next = (max: number) => ((seed = (seed * 1103515245 + 12345) % 2147483648), 1 + (seed % max));
    for (let run = 0; run < 200; run++) {
      const xs = Array.from({ length: next(20) }, () => next(100000));
      const width = 199 + next(1801);
      const placed = layoutTree(sumOf(xs), width);
      const total = xs.reduce((a, b) => a + b, 0);
      expect(placed[0].w).toBe(width);
      xs.forEach((x, i) => expect(Math.abs(placed[i + 1].w - (width * x) / total)).toBeLessThan(1e-9 * width));
      // Side by side from the left edge of the box above, filling it exactly, and a row lower.
      let at = 0;
      xs.forEach((_, i) => {
        expect(placed[i + 1].x).toBeCloseTo(at, 6);
        at += placed[i + 1].w;
        expect(placed[i + 1].y).toBe(ROW.h + ROW.gap);
      });
      expect(at).toBeCloseTo(width, 6);
    }
  });

  it("scales a tree of sums to one scale from the top to the bottom: every box is its value's share of the Metric", () => {
    // (a + b) + (c + d): the inner sums are boxes of their own; their parts' widths are their values over the whole.
    const boxes = boxesOf("{a} + {b} + ({c} - {d}) * {e}", { a: leaf("A", 10), b: leaf("B", 20), c: leaf("C", 7), d: leaf("D", 3), e: leaf("E", 5) });
    const placed = layoutTree(boxes, 640);
    // A (10), B (20) and the product (20) share 640 as 10 : 20 : 20.
    expect(boxes.map((b) => b.label)).toEqual(["Result", "A", "B", "(C − D) × E", "C − D", "C", "D", "E"]);
    expect([placed[1].w, placed[2].w, placed[3].w]).toEqual([128, 256, 256]);
    // Factors of the product are equal, and apart by the operator.
    const [sum, e] = [placed[4], placed[7]];
    expect(sum.w).toBeCloseTo(e.w, 9);
    expect(e.x - (sum.x + sum.w)).toBeCloseTo(OPERATOR_WIDTH, 9);
    expect(sum.w + e.w + OPERATOR_WIDTH).toBeCloseTo(placed[3].w, 9);
    // The parts of the bracket fill it by their size (7 : 3).
    expect(placed[5].w).toBeCloseTo((sum.w * 7) / 10, 9);
    expect(placed[6].w).toBeCloseTo((sum.w * 3) / 10, 9);
  });

  it("gives a box taken away the width of its size, like any other", () => {
    const placed = layoutTree(boxesOf("{a} - {b}", { a: leaf("A", 100), b: leaf("B", 70) }), 340);
    expect([placed[1].w, placed[2].w]).toEqual([200, 140]);
  });

  it("draws a result smaller than its parts at its own size on their scale, left-aligned", () => {
    const placed = layoutTree(boxesOf("{a} - {b} - {c}", { a: leaf("A", 100), b: leaf("B", 70), c: leaf("C", 8) }), 356);
    // Sizes 100 + 70 + 8 = 178 fill 356; the result 22 is 22 / 178 of it.
    expect([placed[0].x, placed[0].w, placed[1].w]).toEqual([0, 44, 200]);
    // A gap among the parts, or a plain sum, keeps the result as wide as its parts.
    expect(layoutTree(boxesOf("{a} + {b}", { a: leaf("A", 1), b: leaf("B", 3) }), 400)[0].w).toBe(400);
    expect(layoutTree(boxesOf("{a} - {b}", { a: leaf("A", 5), b: leaf("B", null) }), 400)[0].w).toBe(400);
    expect(layoutTree(boxesOf("{a} - {b}", { a: leaf("A", 0), b: leaf("B", 0) }), 400)[0].w).toBe(400);
  });

  it("keeps a gap a small place of its own, and shares the rest by size; all gaps share equally", () => {
    const placed = layoutTree(boxesOf("{a} + {b} + {c}", { a: leaf("A", 30), b: leaf("B", null), c: leaf("C", 10) }), 500);
    expect(placed[2].w).toBeCloseTo(500 * GAP_SHARE, 9);
    expect(placed[1].w + placed[3].w).toBeCloseTo(500 * (1 - GAP_SHARE), 9);
    expect(placed[1].w / placed[3].w).toBeCloseTo(3, 9);
    const nothing = layoutTree(boxesOf("{a} + {b}", { a: leaf("A", null), b: leaf("B", null) }), 500);
    expect([nothing[1].w, nothing[2].w]).toEqual([250, 250]);
    // However many gaps, together they take at most half.
    const many = layoutTree(boxesOf("{a} + {b} + {c} + {d} + {e} + {f} + {g} + {h} + {i} + {j}", Object.fromEntries("abcdefghij".split("").map((k, i) => [k, leaf(k, i === 0 ? 5 : null)]))), 600);
    expect(many[1].w).toBeCloseTo(300, 9);
  });

  it("splits a sum of zeros equally, as there is no size to share by", () => {
    const placed = layoutTree(sumOf([0, 0, 0, 0]), 400);
    expect(placed.slice(1).map((p) => p.w)).toEqual([100, 100, 100, 100]);
  });

  it("puts every level in a row of its own, and says how high the drawing is", () => {
    const boxes = boxesOf("({a} + {b}) * {c}", { a: leaf("A", 1), b: leaf("B", 2), c: leaf("C", 3) });
    expect(layoutTree(boxes).map((p) => p.y)).toEqual([0, 1, 2, 2, 1].map((l) => l * (ROW.h + ROW.gap)));
    expect(treeHeight(boxes)).toBe(3 * ROW.h + 2 * ROW.gap);
    expect(layoutTree(boxes)[0].w).toBe(TREE_WIDTH);
  });
});
