// The pure rules of deleting Metrics (spec 0065): the words that confirm, the order, and what a widget or a slide keeps
// when it lets go of a Metric.
import { describe, expect, it } from "vitest";
import { confirms, confirmWords, deckWithout, deletionOrder, listWithout } from "./metric-delete-rules";
import { allDeckMetricIds } from "./visibility";

describe("the words that confirm", () => {
  it("are the name for one Metric, exactly, and a count for several, in any case", () => {
    expect(confirmWords(["Revenue"])).toBe("Revenue");
    expect(confirms(" Revenue ", ["Revenue"])).toBe(true);
    expect(confirms("revenue", ["Revenue"])).toBe(false);
    expect(confirmWords(["A", "B"])).toBe("delete 2 Metrics");
    expect(confirms("DELETE 2 METRICS", ["A", "B"])).toBe(true);
    expect(confirms("delete 3 Metrics", ["A", "B"])).toBe(false);
    expect(confirms("", [])).toBe(false);
  });
});

describe("the order of a deletion", () => {
  const readers = new Map([[1, [2]], [2, [3]]]);
  it("puts every Metric after all that read it", () => expect(deletionOrder([1, 2, 3], readers)).toEqual([3, 2, 1]));
  it("keeps a Metric whose reader stays, and what that one reads in turn", () => expect(deletionOrder([1, 2], readers)).toEqual([]));
  it("keeps Metrics that read each other", () => expect(deletionOrder([1, 2, 5], new Map([[1, [2]], [2, [1]]]))).toEqual([5]));
});

describe("a widget that lets go of a Metric", () => {
  it("keeps its other Metrics only where it shows one list and enough are left", () => {
    expect(listWithout({ template: "progress", metric_ids: [1, 2], settings: {} }, new Set([1]))).toEqual([2]);
    expect(listWithout({ template: "progress", metric_ids: [1], settings: {} }, new Set([1]))).toBeNull();
    expect(listWithout({ template: "line", metric_ids: [1], settings: {} }, new Set([1]))).toBeNull();
    expect(listWithout({ template: "scoreboard", metric_ids: [1, 2, 3], settings: {} }, new Set([1]))).toBeNull();
    expect(listWithout({ template: "matrix", metric_ids: [1, 2, 3], settings: {} }, new Set([1]))).toEqual([2, 3]);
    // A Metric named in its settings too cannot be taken out of the list alone.
    expect(listWithout({ template: "progress", metric_ids: [1, 2], settings: { panels: [{ type: "period-bars", metricIds: [1] }] } as never }, new Set([1]))).toBeNull();
  });
});

describe("a deck that lets go of a Metric", () => {
  const text = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{latest} and {latest 2}" }] }] };
  const widget = (id: string, template: string, metricIds: number[]) => ({ id, typeName: "shape", type: "ziffr-widget", props: { template, metricIds, settings: "{}" } });
  const document = { store: {
    "shape:one": widget("shape:one", "line", [1]),
    "shape:two": widget("shape:two", "progress", [1, 2]),
    "shape:other": widget("shape:other", "line", [2]),
    "shape:t": { id: "shape:t", typeName: "shape", type: "text", props: { richText: text }, meta: { metrics: [1, 2] } },
    "binding:a": { id: "binding:a", typeName: "binding", fromId: "shape:arrow", toId: "shape:one" },
  } };
  it("drops what must go, shortens what can, empties its place in a text, and names it nowhere after", () => {
    const out = deckWithout(document, new Set([1]));
    expect([out.removed, out.trimmed, out.emptied]).toEqual([1, 1, 1]);
    const store = (out.document as typeof document).store;
    expect(Object.keys(store).sort()).toEqual(["shape:other", "shape:t", "shape:two"]);
    expect(store["shape:t"].meta.metrics).toEqual([0, 2]);
    expect(allDeckMetricIds(out.document)).toEqual([2]);
  });
  it("is the same document when it names none of them", () => expect(deckWithout(document, new Set([9])).document).toBe(document));
});
