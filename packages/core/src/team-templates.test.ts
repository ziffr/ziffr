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

  it("leaves no Metric's name in a Slide Element's words, and warns of numbers in them", () => {
    const slide = (element: object, metric_ids = [1, 2]) => ({ template: "slide" as const, title: null, metric_ids, settings: { element: element as never } });
    const t = toTemplate(slide({ kind: "columns", part: true, title: "Revenue and Orders", partLabel: "Orders so far", restLabel: "Revenue", referenceLabel: "Revenue plan" }), [revenue, orders], {});
    expect(t.body.settings.element).toEqual({ kind: "columns", part: true, title: "{metrics}", partLabel: "{metric 2} so far", restLabel: "{metric}", referenceLabel: "{metric} plan" });
    expect(t.notices.join(" ")).not.toMatch(/numbers/);
    // {metric 2} is the element's second Slot, whatever order the Metrics were listed in.
    const list = toTemplate(slide({ kind: "words", text: ["Orders trail Revenue"], lead: "Revenue:", empty: "Where are Orders?" }, [2, 1]), [revenue, orders], {});
    expect(list.body.settings.element).toEqual({ kind: "words", text: ["{metric} trail {metric 2}"], lead: "{metric 2}:", empty: "Where are {metric}?" });
    for (const element of [{ kind: "figure", note: "Up 12 % in May" }, { kind: "words", text: ["We closed 40 deals"] }, { kind: "list", items: [{ text: "Win", note: "by 31 May" }] }, { kind: "gap-table", headline: "3 are behind" }]) {
      expect(toTemplate(slide(element), [revenue, orders], {}).notices.join(" ")).toMatch(/still contain numbers/);
    }
    expect(toTemplate(slide({ kind: "words", text: ["{difference 1 2} to go"] }), [revenue, orders], {}).notices).toEqual([]);
  });

  it("leaves a Placeholder alone when a Metric is called like one, and never makes words too long for their field", () => {
    const gap = metric({ id: 3, slug: "gap", name: "Gap" });
    const element = { kind: "figure" as const, label: `${"x".repeat(76)} Gap`, note: "{gap 1 1} Gap" };
    const t = toTemplate({ template: "slide", title: null, metric_ids: [3], settings: { element } }, [gap], {});
    expect(t.body.settings.element).toEqual({ kind: "figure", label: `${"x".repeat(76)} `, note: "{gap 1 1} {metric}" });
  });
});
