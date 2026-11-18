// The Attainment reference's own tests (spec 0022, ticket #130): results worked out by hand, so the reference the
// code is checked against is checked itself.
import { describe, expect, it } from "vitest";
import { referenceAttainment as ref } from "./attainment";

describe("the Attainment reference", () => {
  it("by ratio", () => {
    expect(ref("ratio", "higher", 230, 200, null)).toBe(115); // 230 ÷ 200
    expect(ref("ratio", "higher", -5, 10, null)).toBe(-50); // -5 ÷ 10
    expect(ref("ratio", "lower", 5, null, 10)).toBe(200); // 10 ÷ 5
    expect(ref("ratio", "lower", 0.3, null, 0.1)).toBeCloseTo(33.333333333333336, 12); // 0.1 ÷ 0.3, exactly a third
    expect(ref("ratio", "target", 5, 10, 20)).toBe(50); // below the range: 5 ÷ 10
    expect(ref("ratio", "target", 25, 10, 20)).toBe(80); // above it: 20 ÷ 25
    expect(ref("ratio", "target", 15, 10, 20)).toBe(100);
    for (const [p, v, lo, hi] of [["higher", 5, 0, null], ["higher", 5, -10, null], ["lower", 0, null, 10], ["lower", -5, null, 10], ["lower", 5, null, 0], ["target", -5, 0, 10]] as const) {
      expect(ref("ratio", p, v, lo, hi)).toBeNull();
    }
  });
  it("by distance", () => {
    expect(ref("distance", "higher", 230, 200, null)).toBe(115); // 100 + 30/200
    expect(ref("distance", "higher", -5, -10, null)).toBe(150); // 5 ahead of -10, half its size
    expect(ref("distance", "lower", 5, null, 10)).toBe(150); // 5 under 10
    expect(ref("distance", "lower", -5, null, -10)).toBe(50); // 5 over -10
    expect(ref("distance", "target", 25, 10, 20)).toBe(75); // 5 over 20, a quarter of it
    expect(ref("distance", "target", 0.3, 0.1, 0.2)).toBe(50); // 0.1 over 0.2, exactly half (floats give 49.99…)
    expect(ref("distance", "higher", 5, 0, null)).toBeNull();
    expect(ref("distance", "lower", 5, null, 0)).toBeNull();
  });
  it("has no percentage without a target", () => {
    for (const m of ["ratio", "distance"] as const) for (const p of ["higher", "lower", "target"] as const) expect(ref(m, p, 5, null, null)).toBeNull();
  });
});
