// Points that stretch a chart (ticket #988): found by a fixed rule, counted, never dropped.
import { describe, expect, it } from "vitest";
import { stretchNote, stretchingPoints } from "./chart-stretch";

const base = Array.from({ length: 12 }, (_, i) => ({ x: i - 6, y: (i * 7) % 11 - 5 }));

describe("stretchingPoints", () => {
  it("counts the points far from the rest on either axis", () => {
    expect(stretchingPoints(base)).toBe(0);
    expect(stretchingPoints([...base, { x: 400, y: 1 }])).toBe(1);
    expect(stretchingPoints([...base, { x: 400, y: 1 }, { x: 2, y: -900 }])).toBe(2);
    // A point far on both axes counts once.
    expect(stretchingPoints([...base, { x: 400, y: -900 }])).toBe(1);
  });
  it("says nothing for few points, no spread, or far points that are the pattern", () => {
    expect(stretchingPoints(base.slice(0, 7))).toBe(0);
    expect(stretchingPoints(Array.from({ length: 10 }, () => ({ x: 1, y: 1 })))).toBe(0);
    const many = [...base.slice(0, 8), ...Array.from({ length: 5 }, (_, i) => ({ x: 1000 + i, y: 1000 + i }))];
    expect(stretchingPoints(many)).toBe(0);
  });
});

describe("stretchNote", () => {
  it("says it in words, in the period's word", () => {
    expect(stretchNote(0, "month")).toBeNull();
    expect(stretchNote(1, "month")).toBe("One month is far from the rest and stretches this chart.");
    expect(stretchNote(2, "month")).toBe("Two months are far from the rest and stretch this chart.");
    expect(stretchNote(12, "week")).toBe("12 weeks are far from the rest and stretch this chart.");
  });
});
