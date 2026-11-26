// The Definitions Slide Element and the {calculation note} Placeholder (spec 0060; GLOSSARY: Slide Element, Calculation
// Note, Placeholder): only Metrics the viewer may see, entries kept whole, and an unfilled note said as such.
import { describe, expect, it } from "vitest";
import { definitionsLayout, definitionsModel, fillSlideWords, type DefinitionRow } from "./slide-figures";
import { checkedElement, elementSlots } from "./slide-element";
import { fillText } from "./placeholders";
import { canvas, metric } from "./test/fixtures";

const arr = metric({ id: 1, slug: "arr", name: "ARR", description: "What recurs each year.", calculation_note: "One-off fees are left out." });
const plain = metric({ id: 2, slug: "orders", name: "Orders", description: "" });
const data = canvas([arr, plain], { arr: [], orders: [] });

describe("the Definitions element", () => {
  it("reads one to twelve Metrics and takes no settings", () => {
    expect(checkedElement({ kind: "definitions" })).toEqual({ kind: "definitions" });
    expect(() => checkedElement({ kind: "definitions", title: "x" })).toThrow(/not a field here/);
    expect(elementSlots({ kind: "definitions" })).toEqual({ min: 1, max: 12 });
  });

  it("names the Metrics the viewer may see, and nothing of one they may not", () => {
    expect(definitionsModel({ metrics: [arr, null, plain] }).rows).toEqual([
      { name: "ARR", description: "What recurs each year.", note: "One-off fees are left out." },
      { name: "Orders", description: "", note: "" },
    ]);
  });

  const row = (i: number, note: string): DefinitionRow => ({ name: `Metric ${i}`, description: "A short description.", note });

  it("writes large where there is room, and smaller before it leaves one out", () => {
    const few = definitionsLayout([row(1, "Short."), row(2, "Short.")], 1152, 520);
    expect(few).toMatchObject({ size: 17, more: 0 });
    expect(few.columns).toHaveLength(1);
    const many = definitionsLayout(Array.from({ length: 8 }, (_, i) => row(i, "word ".repeat(90))), 1152, 520);
    expect(many.more).toBe(0);
    expect(many.columns).toHaveLength(2);
    expect(many.size).toBeLessThan(17);
    expect(many.columns.flat().map((r) => r.name)).toEqual(Array.from({ length: 8 }, (_, i) => `Metric ${i}`));
  });

  it("counts what does not fit at the smallest size instead of cutting it, and always shows the first", () => {
    const all = Array.from({ length: 12 }, (_, i) => row(i, "word ".repeat(400)));
    const fit = definitionsLayout(all, 1152, 520);
    expect(fit.size).toBe(10);
    expect(fit.more).toBeGreaterThan(0);
    expect(fit.columns.flat().length + fit.more).toBe(12);
    expect(definitionsLayout([row(1, "word ".repeat(400))], 200, 40)).toMatchObject({ more: 0 });
  });
});

describe("the {calculation note} Placeholder", () => {
  it("fills in how the Metric is calculated, by Slot", () => {
    expect(fillText("{calculation note}", [arr], data)).toBe("One-off fees are left out.");
    expect(fillText("{calculation note 2}", [plain, arr], data)).toBe("One-off fees are left out.");
  });

  it("stays written where nothing is written, reads as missing on a slide, and as empty for a hidden Metric", () => {
    expect(fillText("{calculation note}", [plain], data)).toBe("{calculation note}");
    expect(fillSlideWords("{calculation note}", { data, metrics: [plain] })).toMatchObject({ text: "–", missing: true });
    expect(fillSlideWords("{calculation note}", { data, metrics: [null] })).toMatchObject({ text: "", missing: true });
    expect(fillSlideWords("{calculation note}", { data, metrics: [arr] })).toMatchObject({ text: "One-off fees are left out.", missing: false });
  });
});
