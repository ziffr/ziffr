// A deck made from a Snapshot sends only the values of its period through a View Link (spec 0013, second security
// review): which Metrics are cut, and at which day.
import { describe, expect, it } from "vitest";
import { deckAsOf } from "./view-links";
import { dataAsOfEach } from "./snapshot-periods";

const widget = (metricIds: number[], settings: Record<string, unknown>, asString = true) => ({ type: "ziffr-widget", props: { metricIds, settings: asString ? JSON.stringify(settings) : settings } });

describe("a deck's Metrics drawn as of a day", () => {
  it("cuts a Metric only when every widget of it has a day, at the latest one", () => {
    const doc = { store: {
      a: widget([1], { asOf: "2026-09-30" }), b: widget([1], { asOf: "2026-10-31" }, false),
      c: widget([2], { asOf: "2026-10-31" }), d: widget([2], {}),
      e: widget([3], { asOf: "not a day" }),
      f: widget([4], { asOf: "2026-10-31", canvas: { document: { store: {} } } }),
      g: { type: "text", props: {} },
    } };
    expect([...deckAsOf(doc).entries()]).toEqual([[1, "2026-10-31"]]);
    expect(deckAsOf(null).size).toBe(0);
    // Only the deck as the link shows it counts: the same deck without widget d, as a link made before d, cuts cost too.
    const { d: _added, ...shown } = doc.store;
    void _added;
    expect([...deckAsOf({ store: shown }).entries()].sort()).toEqual([[1, "2026-10-31"], [2, "2026-10-31"]]);
  });

  it("sends a cut Metric's values, Breakdowns, Approvals and Locks only up to its day, and the others whole", () => {
    const data = {
      metrics: [{ id: 1, slug: "rev", period: "month" }, { id: 2, slug: "cost", period: "month" }],
      series: { rev: [{ period: "2026-10-01", value: 1 }, { period: "2026-11-01", value: 2 }], cost: [{ period: "2026-11-01", value: 3 }] },
      breakdowns: { 1: { "2026-11-01": [] } }, pending: { 1: ["2026-11-01"] }, locked: { 1: ["2026-10-01"] },
    } as never;
    const out = dataAsOfEach(data, new Map([[1, "2026-10-31"]]));
    expect(out.series.rev).toEqual([{ period: "2026-10-01", value: 1 }]);
    expect(out.series.cost).toEqual([{ period: "2026-11-01", value: 3 }]);
    expect(out.breakdowns[1]).toEqual({});
    expect(out.pending[1]).toEqual([]);
    expect(out.locked[1]).toEqual(["2026-10-01"]);
  });
});
