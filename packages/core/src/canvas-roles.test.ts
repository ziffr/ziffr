// Which Metric of the Analysis Canvas is the one to explain (ticket #988): a mark of its own, never the order.
import { describe, expect, it } from "vitest";
import { explainedFirst, explainedOf, markAfterRemoval } from "./canvas-roles";

const CANVAS = [10, 20, 30];

describe("the Metric to explain", () => {
  // Every canvas order against every mark: the marked Metric is explained, whatever its place; none marked means the first.
  const orders = [[10, 20, 30], [20, 30, 10], [30, 10, 20], [30, 20, 10]];
  for (const order of orders) {
    for (const marked of [10, 20, 30, null, 99]) {
      it(`order ${order.join(",")}, mark ${marked}`, () => {
        const want = marked !== null && order.includes(marked) ? marked : order[0];
        expect(explainedOf(order, marked)).toBe(want);
        const first = explainedFirst(order, marked);
        expect(first[0]).toBe(want);
        expect([...first].sort()).toEqual([...order].sort());
        // The others keep their own order.
        expect(first.slice(1)).toEqual(order.filter((i) => i !== want));
      });
    }
  }

  it("is the only Metric when there is one, and nothing when the canvas is empty", () => {
    expect(explainedOf([7], null)).toBe(7);
    expect(explainedOf([7], 99)).toBe(7);
    expect(explainedOf([], 7)).toBeNull();
    expect(explainedFirst([], 7)).toEqual([]);
  });

  it("does not change when the Metrics are reordered", () => {
    expect(explainedOf([10, 20, 30], 20)).toBe(explainedOf([30, 20, 10], 20));
    expect(explainedOf([20, 10, 30], 20)).toBe(20);
  });

  it("moves to the next Metric when the marked one leaves, to the one before when it was last, and stays otherwise", () => {
    expect(markAfterRemoval(CANVAS, 20, 20)).toBe(30);
    expect(markAfterRemoval(CANVAS, 30, 30)).toBe(20);
    expect(markAfterRemoval(CANVAS, 10, 10)).toBe(20);
    expect(markAfterRemoval(CANVAS, 20, 30)).toBe(20);
    expect(markAfterRemoval(CANVAS, null, 10)).toBe(20);
    expect(markAfterRemoval(CANVAS, null, 30)).toBe(10);
    expect(markAfterRemoval([10], 10, 10)).toBeNull();
  });
});
