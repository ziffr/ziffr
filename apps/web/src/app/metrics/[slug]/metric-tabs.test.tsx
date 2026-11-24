// The Metric page's tab strip (ticket #1104): which side is clipped and where the open tab is scrolled to.
import { describe, expect, it } from "vitest";
import { centredScroll, clippedSides } from "./metric-tabs";

describe("clippedSides", () => {
  it("shows nothing when the strip fits", () => {
    expect(clippedSides(0, 390, 390)).toEqual({ left: false, right: false });
  });
  it("marks the right side at the start of a long strip", () => {
    expect(clippedSides(0, 342, 520)).toEqual({ left: false, right: true });
  });
  it("marks both sides in the middle and only the left at the end", () => {
    expect(clippedSides(80, 342, 520)).toEqual({ left: true, right: true });
    expect(clippedSides(178, 342, 520)).toEqual({ left: true, right: false });
  });
});

describe("centredScroll", () => {
  it("never scrolls before the start or past the end", () => {
    expect(centredScroll(0, 80, 342, 520)).toBe(0);
    expect(centredScroll(440, 80, 342, 520)).toBe(178);
  });
  it("centres a tab in the middle", () => {
    expect(centredScroll(200, 100, 300, 800)).toBe(100);
  });
});
