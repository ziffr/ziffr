// How a Metric is calculated, the pure rules (spec 0060; GLOSSARY: Calculation Note, Derived Metric): how the text is
// stored, that a formula is written in words only for someone who sees every Metric it reads, and what never goes out.
import { describe, expect, it } from "vitest";
import { CALCULATION_NOTE_MAX, calculationNoteFrom, formulaInWords } from "./calculation-note";
import { shownData } from "./view-links";
import { canvas, metric } from "./test/fixtures";

describe("calculationNoteFrom", () => {
  it("keeps line breaks, trims, limits, and reads nothing as null", () => {
    expect(calculationNoteFrom("  One\r\ntwo\rthree  ")).toBe("One\ntwo\nthree");
    expect(calculationNoteFrom("x".repeat(CALCULATION_NOTE_MAX + 5))).toHaveLength(CALCULATION_NOTE_MAX);
    for (const none of [undefined, null, "", "  \n "]) expect(calculationNoteFrom(none)).toBeNull();
  });
});

describe("formulaInWords", () => {
  const seen = [{ slug: "revenue", name: "Revenue" }, { slug: "orders", name: "Orders" }];
  it("writes the inputs' names, also inside change()", () => {
    expect(formulaInWords("change({revenue}) / {orders}", seen)).toBe("change(Revenue) / Orders");
  });
  it("says nothing when one input is not among the Metrics seen", () => {
    expect(formulaInWords("{revenue} / {payroll}", seen)).toBeNull();
  });
});

describe("what goes out with a View Link or a Snapshot", () => {
  it("carries neither the description nor how it is calculated", () => {
    const m = metric({ description: "Inside", calculation_note: "Inside too" });
    const out = shownData(canvas([m], { revenue: [] }), new Set([m.id]), null);
    expect(out.metrics[0]).toMatchObject({ name: "Revenue", description: "", calculation_note: null });
  });
});
