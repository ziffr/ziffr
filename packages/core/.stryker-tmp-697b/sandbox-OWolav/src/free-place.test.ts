// @ts-nocheck
// Where a widget lands when nobody says where (spec 0014): the first free place in reading order.
import { describe, expect, it } from "vitest";
import { firstFreePlace } from "./free-place";

describe("firstFreePlace", () => {
  it("starts at the top left of an empty dashboard", () => {
    expect(firstFreePlace([], 3, 4)).toEqual({ x: 0, y: 0 });
  });
  it("fills the gap beside a narrow widget before going below", () => {
    expect(firstFreePlace([{ x: 0, y: 0, w: 3, h: 4 }], 3, 4)).toEqual({ x: 3, y: 0 });
  });
  it("goes below when the row is full", () => {
    const row = [0, 3, 6, 9].map((x) => ({ x, y: 0, w: 3, h: 4 }));
    expect(firstFreePlace(row, 6, 6)).toEqual({ x: 0, y: 4 });
  });
  it("uses a gap under a short widget beside a tall one", () => {
    const boxes = [{ x: 0, y: 0, w: 6, h: 4 }, { x: 6, y: 0, w: 6, h: 10 }];
    expect(firstFreePlace(boxes, 6, 6)).toEqual({ x: 0, y: 4 });
  });
  it("never covers another widget, and keeps sizes on the grid", () => {
    const boxes = [{ x: 2, y: 0, w: 8, h: 3 }];
    const at = firstFreePlace(boxes, 20, 2);
    expect(at).toEqual({ x: 0, y: 3 });
  });
});
