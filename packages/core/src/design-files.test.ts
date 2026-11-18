// View Design files to take away (spec 0024, #148): any View as a design, Duplicate as View Design with the widget's
// settings as defaults, and Sample Data that fits the design's Slots and holds nothing of a Workspace.
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS, DESIGNED_VIEWS } from "./built-in-designs";
import { designFileName, designOf, duplicateAsDesign, sampleDesignWidget, sampleFile, SAMPLE_FORMAT } from "./design-files";
import { sampleData } from "./sample-data";
import { checkViewDesign, writeViewDesign } from "./view-design";

describe("designOf", () => {
  it("gives a built-in View's design, a Workspace design's copy, and none for a Finding or a Free layout", () => {
    expect(designOf({ template: "line", settings: {} })).toBe(BUILT_IN_DESIGNS.line);
    expect(designOf({ template: "design", settings: { design: { id: 3, body: BUILT_IN_DESIGNS.bars } } })).toBe(BUILT_IN_DESIGNS.bars);
    expect(designOf({ template: "design", settings: {} })).toBeNull();
    expect(designOf({ template: "ranked", settings: {} })).toBeNull();
    expect(designOf({ template: "canvas", settings: {} })).toBeNull();
  });
});

describe("duplicateAsDesign", () => {
  it("makes the widget's settings the defaults and names the copy after it", () => {
    const d = duplicateAsDesign({ template: "line", settings: { window: 24, showTarget: false, showForecast: true }, title: "Revenue (net)" }, BUILT_IN_DESIGNS.line);
    expect(d.name).toBe("Revenue (net) (copy)");
    expect(d.options).toMatchObject({ window: { default: 24 }, showTarget: { default: false }, showForecast: { default: true } });
    expect(checkViewDesign(writeViewDesign(d)).ok).toBe(true);
  });

  it("keeps the design's name when the title would not pass the checks, and options within their limits", () => {
    const d = duplicateAsDesign({ template: "table", settings: { rows: 9999 }, title: "<b>see https://x</b>" }, BUILT_IN_DESIGNS.table);
    expect(d.name).toBe("History table (copy)");
    expect(d.options?.rows?.default).toBe(120);
    expect(checkViewDesign(writeViewDesign(d)).ok).toBe(true);
    expect(duplicateAsDesign({ template: "gauge", settings: {}, title: null }, BUILT_IN_DESIGNS.gauge).options).toEqual(BUILT_IN_DESIGNS.gauge.options);
  });
});

describe("sampleFile", () => {
  it.each(DESIGNED_VIEWS)("fills every Slot of %s with Sample Data and nothing else", (id) => {
    const f = JSON.parse(sampleFile(BUILT_IN_DESIGNS[id]));
    expect(f.format).toBe(SAMPLE_FORMAT);
    const slots = new Set(f.metrics.map((m: { slot: number }) => m.slot));
    expect(slots.size).toBe(BUILT_IN_DESIGNS[id].slots.length);
    const sampleNames = new Set(sampleData().metrics.map((m) => m.name));
    for (const m of f.metrics) {
      expect(sampleNames.has(m.name)).toBe(true);
      // No id, owner or slug: nothing that names anything in a Workspace.
      expect(Object.keys(m)).not.toContain("id");
      expect(Object.keys(m)).not.toContain("owner_id");
      expect(m.values.length).toBeGreaterThan(0);
    }
  });

  it("names the files after the design", () => {
    expect(designFileName({ ...BUILT_IN_DESIGNS.number, name: "Umsatz – Übersicht!" }, "view")).toBe("umsatz-ubersicht.view.json");
    expect(designFileName({ ...BUILT_IN_DESIGNS.number, name: "–" }, "sample")).toBe("view-design.sample.json");
  });

  it("draws a design's Preview with Sample Data", () => {
    const w = sampleDesignWidget(BUILT_IN_DESIGNS.correlation);
    expect(w.template).toBe("design");
    expect(w.metric_ids.length).toBe(2);
    expect(w.metric_ids.every((id) => id < 0)).toBe(true);
  });
});
