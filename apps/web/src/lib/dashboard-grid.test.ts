// The dashboard grid's geometry (#1338): the empty card stands in the next free place, and a grid drawn smaller beside
// the Add widget panel still reads a drop where the pointer is.
import { describe, expect, it } from "vitest";
import { addCardBox, BESIDE_PANEL, dropOffset, fitGrid, GRID, ONE_COLUMN_BELOW } from "./dashboard-grid";

const size = { w: 3, h: 4 };
const at = (x: number, y: number, w = 3, h = 4) => ({ i: `${x}-${y}`, x, y, w, h });
// 12 columns of 60 px with the gaps and the space around them.
const WIDTH = 2 * GRID.padding + 12 * 60 + 11 * GRID.margin;

describe("fitGrid", () => {
  it("draws a narrow dashboard smaller instead of squeezing it, only beside the panel", () => {
    expect(fitGrid(420, true)).toEqual({ gridWidth: BESIDE_PANEL, scale: 0.5 });
    // Never one column beside the panel, so there is always a place to drag to.
    expect(BESIDE_PANEL).toBeGreaterThanOrEqual(ONE_COLUMN_BELOW);
    expect(fitGrid(384, false)).toEqual({ gridWidth: 384, scale: 1 });
    expect(fitGrid(900, true)).toEqual({ gridWidth: 900, scale: 1 });
    // Not measured yet.
    expect(fitGrid(0, true)).toEqual({ gridWidth: 0, scale: 1 });
  });
});

describe("dropOffset", () => {
  it("turns a pointer's place on screen into the grid's own pixels", () => {
    const grid = { left: 100, top: 50 };
    const { dragOffsetX, dragOffsetY } = dropOffset(400, 350, grid, 0.5);
    expect(400 - grid.left + dragOffsetX).toBe((400 - grid.left) / 0.5);
    expect(350 - grid.top + dragOffsetY).toBe((350 - grid.top) / 0.5);
  });
  it("adds nothing to a grid drawn at its own size", () => {
    expect(dropOffset(400, 350, { left: 100, top: 50 }, 1)).toEqual({ dragOffsetX: 0, dragOffsetY: 0 });
  });
});

describe("addCardBox", () => {
  it("stands at the start of an empty dashboard", () => {
    expect(addCardBox([], WIDTH, false, size)).toEqual({ left: 16, top: 16, width: 3 * 60 + 2 * 16, height: 4 * 52 - 16 });
  });
  it("stands beside one number", () => {
    expect(addCardBox([at(0, 0)], WIDTH, false, size)).toMatchObject({ left: 16 + 3 * 76, top: 16 });
  });
  it("goes below a row that is full, and counts places as the grid shows them, moved up", () => {
    expect(addCardBox([at(0, 0, 12, 4)], WIDTH, false, size)).toMatchObject({ left: 16, top: 16 + 4 * 52 });
    // A widget kept further down is drawn at the top, so the card stands beside it, not above it.
    expect(addCardBox([at(0, 20, 12, 4)], WIDTH, false, size)).toMatchObject({ left: 16, top: 16 + 4 * 52 });
  });
  it("stands below the last widget, as wide as the screen, where the dashboard is one column", () => {
    expect(addCardBox([at(0, 0, 1, 5), at(0, 5, 1, 5)], 358, true, size)).toEqual({ left: 16, top: 16 + 10 * 52, width: 358 - 32, height: 4 * 52 - 16 });
  });
});
