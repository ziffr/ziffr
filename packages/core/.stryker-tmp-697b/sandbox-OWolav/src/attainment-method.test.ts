// @ts-nocheck
// The Attainment method (spec 0022, #130; GLOSSARY: Attainment): which method a Metric uses, what a Snapshot kept,
// and how the tooltip names it.
import { describe, expect, it } from "vitest";
import { ATTAINMENT_METHODS, attainmentMethodNote, DEFAULT_ATTAINMENT_METHOD, isAttainmentMethod, keptMethod, methodFor } from "./attainment-method";

describe("the Attainment method", () => {
  it("is the Metric's own, else the Workspace's", () => {
    expect(methodFor({ attainment_method: "distance" }, "ratio")).toBe("distance");
    expect(methodFor({ attainment_method: null }, "distance")).toBe("distance");
    expect(methodFor({}, "ratio")).toBe("ratio");
    expect(methodFor({ attainment_method: "percent" }, "distance")).toBe("distance");
  });
  it("is ratio for a Snapshot made before it could be chosen, else the one it kept", () => {
    expect(keptMethod(undefined)).toBe("ratio");
    expect(keptMethod("nonsense")).toBe(DEFAULT_ATTAINMENT_METHOD);
    expect(keptMethod("distance")).toBe("distance");
  });
  it("knows its two keys and names each", () => {
    expect(ATTAINMENT_METHODS.every(isAttainmentMethod)).toBe(true);
    expect([1, null, "Ratio"].some(isAttainmentMethod)).toBe(false);
    expect(attainmentMethodNote("ratio")).toBe("Attainment by ratio: value ÷ target, or target ÷ value when lower is better.");
    expect(attainmentMethodNote("distance")).toBe("Attainment by distance: 100 % plus the distance to the target, in steps of the target's size.");
  });
});
