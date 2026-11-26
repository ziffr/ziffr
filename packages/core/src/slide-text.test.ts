// Live words in a slide's text boxes (GLOSSARY: Placeholder, Slide; ticket #1172): which Metrics a box names, what a
// viewer reads of it, and what a deck, its Share and its View Links count it as.
import { describe, expect, it } from "vitest";
import { addTextValue, filledRichText, namedSlots, renumberSlots, richRuns, textBoxMetricIds, textMetricIds } from "./slide-text";
import { keptRequests, liveDocument, withoutKeptNumbers } from "./snapshot-parts";
import { allDeckMetricIds, deckMetricIds, deckMetricIdsAdded } from "./visibility";
import { deckAsOf, deckForLink } from "./view-links";
import { canvas, metric, months } from "./test/fixtures";

const revenue = metric();
const orders = metric({ id: 2, slug: "orders", name: "Orders", format: "number", unit: "" });
const data = canvas([revenue, orders], { revenue: months("2026-09", [100, 120]), orders: months("2026-09", [6, 7]) }, { breakdowns: { 1: { "2026-10-01": [{ label: "Northwind", value: 90 }, { label: "Other", value: 30 }] } } });

const rich = (...paragraphs: string[]) => ({ type: "doc", content: paragraphs.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] })) });
const box = (words: string, metrics?: unknown, type = "text") => ({ type, props: { richText: rich(words) }, ...(metrics === undefined ? {} : { meta: { metrics } }) });
const said = (words: string, metrics: number[], seen = data, page?: number) => richRuns(filledRichText(box(words, metrics), seen, page)).join("\n");

describe("what a text box reads", () => {
  it("is filled from the data each time, by the box's own list", () => {
    expect(said("{metric}: {latest} in {period}", [1])).toBe("Revenue: 120 € in October 2026");
    expect(said("{metric 2} {latest 2}, {change 2}, {difference 1 2}", [1, 2])).toBe("Orders 7, +1, 113 €");
    expect(said("{top row}", [1])).toBe("Northwind");
    expect(said("Page {slide}", [], data, 3)).toBe("Page 3");
  });

  it("keeps a box without a list, and a Placeholder beyond it, as written", () => {
    expect(filledRichText(box("{latest}"), data)).toBeUndefined();
    expect(said("{latest 2} {metric}", [1])).toBe("{latest 2} Revenue");
    // Only text, boxes, notes and arrow labels are text boxes.
    expect(filledRichText(box("{latest}", [1], "frame"), data)).toBeUndefined();
  });

  it("shows a viewer nothing of a Metric they may not see: no name, value, period or row, and no other in its place", () => {
    const seen = canvas([orders], { orders: months("2026-09", [6, 7]) });
    const out = said("A {metric} B {latest} C {period} D {top row} E {target} F {change yoy} G {difference 1 2} H {metric 2} I {metrics}", [1, 2], seen);
    expect(out).toBe("A  B  C  D  E  F  G  H Orders I Orders");
  });
});

describe("the Metrics a text box names", () => {
  it("are those of its list that its words ask for", () => {
    expect(textMetricIds(box("{latest 2}", [1, 2]))).toEqual([2]);
    expect(textMetricIds(box("{gap}", [1, 2]))).toEqual([1, 2]);
    expect(textMetricIds(box("{metrics}", [1, 2]))).toEqual([1, 2]);
    expect(textMetricIds(box("Plain words, page {slide}", [1, 2]))).toEqual([]);
    expect(textMetricIds(box("{latest}"))).toEqual([]);
    expect([...namedSlots(["{quarter week}", "{difference 2 3}"], 3)].sort()).toEqual([0, 1, 2]);
  });

  it("are unreadable when the list is, so no check accepts them", () => {
    for (const list of ["1", { 0: 1 }, Array.from({ length: 10 }, () => 1)]) expect(textMetricIds(box("{latest}", list))).toEqual([Number.NaN]);
    expect(textMetricIds(box("{latest}", ["1"]))).toEqual([Number.NaN]);
    expect(textMetricIds(box("{latest}", [-1]))).toEqual([Number.NaN]);
  });

  const shape = (id: string, words: string, metrics: number[], more: object = {}) => [id, { id, typeName: "shape", parentId: "page:p", ...box(words, metrics), ...more }] as const;

  it("count for a deck, as a widget's do: for saving, for its Share and for knowing a Metric is on it", () => {
    const before = { store: Object.fromEntries([shape("shape:a", "{latest}", [1, 2])]) };
    const after = { store: Object.fromEntries([shape("shape:a", "{latest} {latest 2}", [1, 2]), shape("shape:b", "{metric}", [3], { type: "geo" })]) };
    expect(textBoxMetricIds(before)).toEqual([1]);
    expect(deckMetricIds(after).sort()).toEqual([1, 2, 3]);
    expect(allDeckMetricIds(after).sort()).toEqual([1, 2, 3]);
    // What a save newly names must be seen by whoever saves, also a Metric the box listed before without asking for it.
    expect(deckMetricIdsAdded(before, after).sort()).toEqual([2, 3]);
  });

  it("keep a Snapshot's numbers on a slide that keeps them, open nothing there, and stay off View Links", () => {
    const frame = ["shape:s", { id: "shape:s", typeName: "shape", type: "frame", parentId: "page:p", meta: { snapshot: 7 }, props: {} }] as const;
    const document = { store: Object.fromEntries([frame, shape("shape:k", "{latest}", [1], { parentId: "shape:s" }), shape("shape:w", "Next steps", [], { parentId: "shape:s" }), shape("shape:l", "{latest}", [2])]) };
    expect(keptRequests(document)).toEqual([{ snapshotId: 7, parts: [], metricIds: [1] }]);
    expect(deckMetricIds(document)).toEqual([2]);
    expect(allDeckMetricIds(document).sort()).toEqual([1, 2]);
    expect(Object.keys((liveDocument(document) as typeof document).store).sort()).toEqual(["shape:l", "shape:s", "shape:w"]);
    expect(Object.keys(withoutKeptNumbers(document).document.store).sort()).toEqual(["shape:l", "shape:s", "shape:w"]);
  });
});

describe("Insert value", () => {
  it("writes the Placeholder and lists the Metric it needs", () => {
    expect(addTextValue([], [], "latest", [1])).toEqual({ list: [1], words: "{latest}" });
    expect(addTextValue(["{latest}"], [1], "change prev", [2])).toEqual({ list: [1, 2], words: "{change prev 2}" });
    expect(addTextValue(["{latest}"], [1], "metric", [1])).toEqual({ list: [1], words: "{metric}" });
    expect(addTextValue(["{latest}"], [1], "difference", [1, 2])).toEqual({ list: [1, 2], words: "{difference 1 2}" });
  });

  it("uses a place nothing asks for once the list is full, and refuses when all are asked for", () => {
    const full = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(addTextValue(["{latest}"], full, "latest", [10])).toEqual({ list: [1, 10, 3, 4, 5, 6, 7, 8, 9], words: "{latest 2}" });
    expect(addTextValue(["{metrics}"], full, "latest", [10])).toBeNull();
  });

  it("moves Slot numbers, and writes “…” for a Metric that is gone", () => {
    expect(renumberSlots("{latest 2} {difference 2 1} {slide} {metric 3}", 2, (i) => 1 - i)).toBe("{latest} {difference 1 2} {slide} {metric 3}");
    expect(renumberSlots("{latest 2}", 2, () => null)).toBe("…");
  });
});

describe("a View Link", () => {
  const shape = (id: string, words: string, metrics?: number[]) => [id, { id, typeName: "shape", ...box(words, metrics) }] as const;
  const document = {
    store: Object.fromEntries([
      shape("shape:plain", "Next steps"),
      shape("shape:shown", "{latest}", [1, 2]),
      shape("shape:hidden", "Stock: {latest 2}", [1, 2]),
      ["binding:a", { id: "binding:a", typeName: "binding", type: "arrow", fromId: "shape:arrow", toId: "shape:hidden" }],
    ]),
  };

  it("leaves a text box that names a left-out Metric out whole, with what was bound to it", () => {
    const out = deckForLink(document, new Set([1]), null) as typeof document;
    expect(Object.keys(out.store)).toEqual(["shape:plain", "shape:shown"]);
    expect(JSON.stringify(out)).not.toContain("Stock");
    // The shown box carries no id of a Metric the link does not show.
    expect(out.store["shape:shown"]).toMatchObject({ meta: { metrics: [1, 0] } });
  });

  it("shows only the boxes the deck had when it was made", () => {
    expect(Object.keys((deckForLink(document, new Set([1, 2]), ["shape:plain"]) as typeof document).store)).toEqual(["shape:plain"]);
  });

  it("sends a Metric a text box reads whole, whatever day a widget draws it up to", () => {
    const widget = { typeName: "shape", type: "ziffr-widget", props: { metricIds: [1, 3], settings: JSON.stringify({ asOf: "2026-10-31" }) } };
    expect([...deckAsOf({ store: { ...document.store, "shape:w": widget } }).keys()]).toEqual([3]);
  });
});
