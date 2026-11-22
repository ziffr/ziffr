// "All Metrics tagged X" as a widget's source, without a database (GLOSSARY: Tag; spec 0038): which views take a Tag, and how it becomes a Slot and back.
import { describe, expect, it } from "vitest";
import { tagSourceId, takesTagSource, withoutTagSource } from "./tag-source";
import { fillsComplete, fromDashboardTemplate, tagFillable, toDashboardTemplate } from "./team-templates";
import { metric } from "./test/fixtures";

const TAG = "3f2b8c9e-1d4a-4b6f-9a7e-5c0d2e8f1a34";
const widget = (template: "matrix" | "number", over: object = {}) => ({ template, title: null, metric_ids: [] as number[], settings: {}, x: 0, y: 0, w: 4, h: 4, ...over });

describe("a Tag as a widget's source", () => {
  it("is a Tag id or nothing", () => {
    expect(tagSourceId({ tagSource: { id: TAG.toUpperCase() } })).toBe(TAG);
    expect(tagSourceId({ tagSource: { id: "finance" } })).toBeNull();
    expect(tagSourceId({ tagSource: null })).toBeNull();
    expect(tagSourceId(undefined)).toBeNull();
  });
  it("is taken only by a view whose Metrics are one list of several", () => {
    expect(takesTagSource({ template: "matrix", settings: {} })).toBe(true);
    expect(takesTagSource({ template: "number", settings: {} })).toBe(false);
    expect(takesTagSource({ template: "drivers", settings: {} })).toBe(false);
    expect(takesTagSource({ template: "nonsense" as never, settings: {} })).toBe(false);
  });
  it("is left out of a copy that records the Metrics of the moment", () => {
    expect(withoutTagSource({ window: 6, tagSource: { id: TAG }, tagView: { name: "x", more: 0, removed: false } })).toEqual({ window: 6 });
  });
});

describe("a Tag widget in a Dashboard Template", () => {
  const tagged = widget("matrix", { settings: { tagSource: { id: TAG } } });
  it("becomes a Slot of one or more named after the Tag, with no Metric of the original", () => {
    const t = toDashboardTemplate([tagged, widget("number", { metric_ids: [1], x: 4 })], [metric()], [], new Map([[TAG, "shop"]]));
    expect(t.slots).toEqual([{ label: "shop", multiple: true, exampleIds: [] }, { label: "Metric 2", multiple: false, exampleIds: [1] }]);
    expect(JSON.stringify(t.body)).not.toContain(TAG);
    expect(tagFillable(t.slots, t.body)).toEqual([true, false]);
  });
  it("leaves out a widget whose Tag the person may not name", () => {
    const t = toDashboardTemplate([tagged], [metric()], [], new Map());
    expect(t.body.widgets).toEqual([]);
    expect(t.leftOut).toHaveLength(1);
  });
  it("is made again as a Tag widget when a Tag fills the Slot, and as a list when Metrics do", () => {
    const t = toDashboardTemplate([tagged], [metric()], [], new Map([[TAG, "shop"]]));
    expect(fillsComplete(t.slots, [[]], [TAG])).toBe(true);
    expect(fillsComplete(t.slots, [[]], [])).toBe(false);
    const [viaTag] = fromDashboardTemplate(t.body, [[]], [TAG]);
    expect(viaTag).toMatchObject({ metric_ids: [], settings: { tagSource: { id: TAG } } });
    const [byHand] = fromDashboardTemplate(t.body, [[1, 2]]);
    expect(byHand.metric_ids).toEqual([1, 2]);
    expect(byHand.settings.tagSource).toBeUndefined();
  });
  it("is not offered a Tag for a Slot that other widgets use, or for one Metric", () => {
    const t = toDashboardTemplate([tagged, widget("number", { metric_ids: [1], x: 4 })], [metric()], [], new Map([[TAG, "shop"]]));
    const [first, second] = t.body.widgets;
    expect(tagFillable([{ label: "shop", multiple: true }], { widgets: [first, { ...second, metricSlots: [0] }] })).toEqual([false]);
    expect(tagFillable([{ label: "Metric", multiple: false }], { widgets: [second] })).toEqual([false]);
  });
});
