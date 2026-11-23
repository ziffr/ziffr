// @ts-nocheck
// Every path a View Design can sit on in widget settings is checked (spec 0024, #148): a widget's own, the widget a
// Free layout starts from, widgets on an artboard or a slide, as objects or as the text tldraw keeps, at any depth.
import { describe, expect, it } from "vitest";
import { BUILT_IN_DESIGNS } from "./built-in-designs";
import { assertSettingsDesigns, assertWidgetDesigns, checkedDesignSetting, MAX_WIDGET_NESTING } from "./widget-designs";

const good = { id: 1, body: BUILT_IN_DESIGNS.line };
const bad = { id: 1, body: { ...BUILT_IN_DESIGNS.line, parts: [{ mark: "text", content: ["<img src=x onerror=alert(1)>"] }] } };
const onArtboard = (settings: unknown, asText = false) => ({ document: { store: { "shape:w": { type: "ziffr-widget", props: { template: "design", metricIds: [], settings: asText ? JSON.stringify(settings) : settings } } } }, stamp: {} });
const seed = (settings: unknown) => ({ template: "design", metric_ids: [], settings });

// [where it sits, the widget's settings]
const PATHS: [string, (design: unknown) => unknown][] = [
  ["the widget's own design", (d) => ({ design: d })],
  ["a Free layout's seed", (d) => ({ canvasSeed: seed({ design: d }) })],
  ["a seed's seed", (d) => ({ canvasSeed: seed({ canvasSeed: seed({ design: d }) }) })],
  ["a widget on the artboard", (d) => ({ canvas: onArtboard({ design: d }) })],
  ["a widget on the artboard, as text", (d) => ({ canvas: onArtboard({ design: d }, true) })],
  ["a seed on a widget on the artboard", (d) => ({ canvas: onArtboard({ canvasSeed: seed({ design: d }) }) })],
  ["an artboard inside a seed", (d) => ({ canvasSeed: seed({ canvas: onArtboard({ design: d }) }) })],
];

describe("assertSettingsDesigns", () => {
  it.each(PATHS)("refuses a hostile design in %s, and passes a good one", (_, at) => {
    expect(() => assertSettingsDesigns(at(bad))).toThrow("View Design");
    expect(() => assertSettingsDesigns(at(good))).not.toThrow();
  });

  it("refuses settings nested deeper than widgets may nest", () => {
    let s: unknown = { design: good };
    for (let i = 0; i <= MAX_WIDGET_NESTING + 1; i++) s = { canvasSeed: seed(s) };
    expect(() => assertSettingsDesigns(s)).toThrow("too deeply");
  });

  it("refuses a design that is not an object, and settings text that cannot be read", () => {
    expect(() => checkedDesignSetting("x")).toThrow("not one");
    expect(() => checkedDesignSetting([])).toThrow("not one");
    expect(() => assertWidgetDesigns({ store: { a: { type: "ziffr-widget", props: { settings: "{" } } } })).toThrow("could not be read");
    expect(checkedDesignSetting(null)).toBeNull();
    expect(checkedDesignSetting({ id: -3, body: BUILT_IN_DESIGNS.bars })?.id).toBeNull();
  });
});
