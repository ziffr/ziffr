import { describe, expect, it } from "vitest";
import { fillsComplete, fromTemplate, specifics, toTemplate } from "./team-templates";
import { metric } from "./test/fixtures";

const revenue = metric();
const orders = metric({ id: 2, slug: "orders", name: "Orders" });
const story = {
  template: "story" as const, title: null, metric_ids: [1],
  settings: {
    headline: "Revenue and Orders grow",
    panels: [{ type: "period-bars" as const, metricIds: [1, 2], annotations: [{ kind: "callout" as const, text: "Price change", anchor: { type: "period" as const, period: "2026-10-01" } }] }],
  },
};

describe("team templates", () => {
  it("turns a story's metrics into slots and their names into placeholders", () => {
    const t = toTemplate(story, [revenue, orders], { "ann:0:0": "max" });
    expect(t.slots).toHaveLength(1);
    expect(t.slots[0]).toMatchObject({ multiple: true, exampleIds: [1, 2] });
    expect(t.body.settings.headline).toBe("{metrics} grow");
    expect(t.body.settings.panels?.[0].annotations?.[0].anchor).toEqual({ type: "rule", rule: "max" });
  });
  it("lists notes tied to one period, and leaves them out unless they follow a rule", () => {
    expect(specifics(story)).toHaveLength(1);
    const t = toTemplate(story, [revenue, orders], {});
    expect(t.body.settings.panels?.[0].annotations).toEqual([]);
    expect(t.notices.join(" ")).toMatch(/left out/);
  });
  it("makes a widget again once every slot is filled", () => {
    const t = toTemplate(story, [revenue, orders], {});
    expect(fillsComplete(t.slots, [[]])).toBe(false);
    const w = fromTemplate({ view: "story", body: t.body }, [[7, 8]]);
    expect(w.settings.panels?.[0].metricIds).toEqual([7, 8]);
    expect(w.metric_ids).toEqual([7]);
  });
  it("keeps the Display Period a widget is shown by (spec 0018)", () => {
    const bars = { template: "bars" as const, title: null, metric_ids: [1], settings: { window: 8, display: "quarter" as const } };
    const t = toTemplate(bars, [revenue], {});
    expect(fromTemplate({ view: "bars", body: t.body }, [[7]]).settings).toMatchObject({ window: 8, display: "quarter" });
  });
});
