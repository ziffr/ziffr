// freeSpot (#13): a widget added with "+" lands next to what is on the slide, never on top of it.
import { describe, expect, it } from "vitest";
import { freeSpot, type Rect } from "./placement";

const slide = { w: 1280, h: 720 };
const area: Rect = { x: 64, y: 150, w: 1152, h: 506 };
const covers = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, a: Rect) => r.x >= a.x && r.y >= a.y && r.x + r.w <= a.x + a.w && r.y + r.h <= a.y + a.h;

describe("freeSpot", () => {
  it("puts the first widget at the top left of the content area", () => {
    expect(freeSpot(area, [], { w: 560, h: 400 }, slide)).toEqual({ x: 64, y: 150, w: 560, h: 400 });
  });

  it("puts a second widget beside the first, inside the area", () => {
    const first = freeSpot(area, [], { w: 560, h: 400 }, slide);
    const second = freeSpot(area, [first], { w: 560, h: 400 }, slide);
    expect(covers(first, second)).toBe(false);
    expect(inside(second, area)).toBe(true);
    expect(second.y).toBe(150);
  });

  it("makes a widget smaller rather than covering one that fills the area", () => {
    const full = { ...area };
    const next = freeSpot(area, [{ x: 64, y: 150, w: 800, h: 506 }], { w: 1152, h: 506 }, slide);
    expect(next.w).toBeLessThan(full.w);
    expect(covers(next, { x: 64, y: 150, w: 800, h: 506 })).toBe(false);
  });

  it("offsets a widget from the last one when nothing is free, and keeps it on the slide", () => {
    const taken = [{ ...area }];
    const next = freeSpot(area, taken, { w: 1152, h: 506 }, slide);
    expect(next).not.toEqual({ ...area });
    expect(next.x + next.w).toBeLessThanOrEqual(slide.w);
    expect(next.y + next.h).toBeLessThanOrEqual(slide.h);
  });

  it("caps a widget larger than the area at the area's size", () => {
    expect(freeSpot(area, [], { w: 2000, h: 900 }, slide)).toEqual({ ...area });
  });
});
