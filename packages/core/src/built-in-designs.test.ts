// The built-in Views as View Designs (spec 0024, #147): each file passes the checks every design passes, round-trips,
// keeps its Widget Template as it was, and goes into PowerPoint as it did before it was a design.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS, DESIGNED_VIEWS } from "./built-in-designs";
import { nativeForm } from "./design-export";
import { SHOWN_BY } from "./display-periods";
import { checkViewDesign, writeViewDesign } from "./view-design";
import { TEMPLATES, templatesFor } from "./widget-templates";

describe("the built-in View Designs", () => {
  it.each(DESIGNED_VIEWS)("%s passes the checks as a file", (id) => {
    const text = readFileSync(new URL(`./view-designs/${id}.json`, import.meta.url), "utf8");
    const res = checkViewDesign(text);
    expect(res.ok ? [] : res.problems).toEqual([]);
  });

  it.each(DESIGNED_VIEWS)("%s round-trips: written, read and written again gives the same file", (id) => {
    const once = writeViewDesign(BUILT_IN_DESIGNS[id]);
    const back = checkViewDesign(once);
    expect(back.ok && writeViewDesign(back.design)).toBe(once);
  });

  it("keep their Widget Templates' names, sizes, Slots and settings", () => {
    const view = (id: (typeof DESIGNED_VIEWS)[number]) => ({ label: TEMPLATES[id].label, size: TEMPLATES[id].size, slots: TEMPLATES[id].slots.length, settings: TEMPLATES[id].settings });
    expect(view("number")).toEqual({ label: "Number + sparkline", size: { w: 3, h: 4 }, slots: 1, settings: { window: 12 } });
    expect(view("line")).toEqual({ label: "Line chart", size: { w: 6, h: 6 }, slots: 1, settings: { window: 12, showTarget: true, showForecast: false } });
    expect(view("bars")).toEqual({ label: "Bars per period", size: { w: 6, h: 6 }, slots: 1, settings: { window: 12, showTarget: true } });
    expect(view("table")).toEqual({ label: "History table", size: { w: 3, h: 6 }, slots: 1, settings: { rows: 6 } });
    // The gauge always scaled itself to the last 12 periods, and the forecast always honoured "show target": the
    // designs now say so as options with those defaults.
    expect(view("gauge")).toEqual({ label: "Gauge vs. target", size: { w: 3, h: 4 }, slots: 1, settings: { window: 12 } });
    expect(view("forecast")).toEqual({ label: "Forecast", size: { w: 6, h: 7 }, slots: 1, settings: { window: 18, showTarget: true } });
    expect(TEMPLATES.correlation.slots.map((s) => s.label)).toEqual(["First metric", "Second metric"]);
    expect(TEMPLATES.matrix.slots).toEqual([{ label: "Metrics", multiple: true }]);
    // Drivers compares a Metric with others: its second Slot names them.
    expect(TEMPLATES.drivers.slots).toEqual([{ label: "Metric", multiple: false }, { label: "Compared with", multiple: true }]);
  });

  it("offer the stacked bars only for a Metric that has a Breakdown", () => {
    expect(TEMPLATES.stacked).toMatchObject({ label: "Stacked bars over time", kind: "metric", needsBreakdown: true, size: { w: 6, h: 6 }, settings: { window: 12 } });
    expect(templatesFor(true).map((t) => t.id)).toContain("stacked");
    expect(templatesFor(false).map((t) => t.id)).not.toContain("stacked");
    expect(templatesFor(false).map((t) => t.id)).toContain("bars");
  });

  it("offer Show by exactly where the Views did", () => {
    expect(DESIGNED_VIEWS.filter((id) => BUILT_IN_DESIGNS[id].options?.display)).toEqual([...SHOWN_BY]);
  });

  it("go into PowerPoint as before: lines, bars, numbers and tables natively, the rest as pictures", () => {
    const form = Object.fromEntries(DESIGNED_VIEWS.map((id) => [id, nativeForm(BUILT_IN_DESIGNS[id], TEMPLATES[id].settings)]));
    expect(form).toEqual({ number: "number", line: "line", bars: "bar", gauge: "picture", table: "table", forecast: "picture", correlation: "picture", matrix: "picture", drivers: "picture", scoreboard: "picture", progress: "picture", stacked: "picture", pareto: "picture", slope: "picture" });
    // A line with its forecast or target switched on is still a native line, the forecast and band left out as before.
    expect(nativeForm(BUILT_IN_DESIGNS.line, { showForecast: true, showTarget: true })).toBe("line");
    expect(nativeForm(BUILT_IN_DESIGNS.bars, { showTarget: false })).toBe("bar");
  });

  it("decide the native form by the marks, so a team's design gets one too", () => {
    const d = BUILT_IN_DESIGNS.line;
    const plot = d.parts[0] as Extract<(typeof d.parts)[number], { mark: "plot" }>;
    expect(nativeForm({ ...d, parts: [{ ...plot, marks: [{ mark: "bar", show: "values" }] }] }, {})).toBe("bar");
    expect(nativeForm({ ...d, parts: [{ ...plot, marks: [{ mark: "line", show: "values" }, { mark: "rule", show: "target.max" }] }] }, {})).toBe("picture");
    expect(nativeForm({ ...d, parts: [{ ...plot, marks: [{ mark: "area", show: "forecast.range" }] }] }, {})).toBe("picture");
    expect(nativeForm({ ...d, parts: [{ mark: "text", content: ["Now ", { show: "latest.value" }] }] }, {})).toBe("number");
    expect(nativeForm({ ...d, parts: [{ mark: "text", content: [{ show: "metric.name" }] }] }, {})).toBe("picture");
    expect(nativeForm({ ...d, parts: [{ mark: "gauge", show: "latest" }] }, {})).toBe("picture");
  });
});
