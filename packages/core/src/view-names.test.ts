// A view's name comes from a browser or an imported file: only a view that exists is one.
import { describe, expect, it } from "vitest";
import { cleanSlideShapes } from "./templates";
import type { TemplateId } from "./types";
import { isDashboardView, isView, takesTagSource } from "./widget-templates";

// Names every object has.
const INHERITED = ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"];

describe("view names", () => {
  it.each(INHERITED)("%s is no view", (name) => {
    expect(isView(name)).toBe(false);
    expect(isDashboardView(name)).toBe(false);
    expect(takesTagSource({ template: name as TemplateId, settings: {} })).toBe(false);
    expect(() => cleanSlideShapes([{ type: "ziffr-widget", x: 0, y: 0, rotation: 0, opacity: 1, props: { template: name, metricIds: [], settings: "{}" } }])).toThrow();
  });

  it("knows the views there are", () => {
    expect([isView("line"), isDashboardView("line"), isView("slide"), isDashboardView("slide"), isView("nothing")]).toEqual([true, true, true, false, false]);
  });
});
