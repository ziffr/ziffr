// A dashboard as a Dashboard Template and back (spec 0014): one Slot per Metric however many widgets show it, words
// become Placeholders, Free Layouts stay behind, and filling the Slots makes the widgets again where they sat.
import { describe, expect, it } from "vitest";
import { BUILT_IN_DASHBOARD_TEMPLATES } from "./built-in-dashboard-templates";
import { fillsComplete, fromDashboardTemplate, toDashboardTemplate } from "./team-templates";
import { TEMPLATES } from "./widget-templates";
import type { Metric, TemplateId } from "./types";

const metric = (id: number, name: string) => ({ id, name, slug: `m${id}` }) as unknown as Metric;
const metrics = [metric(1, "Revenue"), metric(2, "Signups")];
const widget = (template: TemplateId, ids: number[], x: number, y: number, title: string | null = null) => ({ template, metric_ids: ids, settings: { ...TEMPLATES[template].settings }, title, x, y, w: 3, h: 4 });

describe("toDashboardTemplate", () => {
  it("makes one Slot per Metric, shared by the widgets that show it", () => {
    const t = toDashboardTemplate([widget("number", [1], 0, 0), widget("line", [1], 3, 0), widget("number", [2], 6, 0)], metrics, ["Money in"]);
    expect(t.slots.map((s) => ({ label: s.label, examples: s.exampleIds }))).toEqual([{ label: "Money in", examples: [1] }, { label: "Metric 2", examples: [2] }]);
    expect(t.body.widgets.map((w) => w.metricSlots)).toEqual([[0], [0], [1]]);
  });
  it("turns the Metric's name in a title into a Placeholder", () => {
    const t = toDashboardTemplate([widget("number", [1], 0, 0, "Revenue this month")], metrics);
    expect(t.body.widgets[0].title).toBe("{metric} this month");
  });
  it("leaves Free Layouts out and says so", () => {
    const t = toDashboardTemplate([widget("number", [1], 0, 0), widget("canvas", [2], 3, 0, "Board notes")], metrics);
    expect(t.body.widgets).toHaveLength(1);
    expect(t.leftOut).toEqual(["Board notes"]);
    expect(t.slots).toHaveLength(1);
  });
});

describe("fromDashboardTemplate", () => {
  it("fills every widget from its Slots and keeps where it sat", () => {
    const t = toDashboardTemplate([widget("number", [1], 0, 0), widget("correlation", [1, 2], 3, 4)], metrics);
    const made = fromDashboardTemplate(t.body, [[7], [8]]);
    expect(made.map((w) => ({ template: w.template, ids: w.metric_ids, x: w.x, y: w.y }))).toEqual([
      { template: "number", ids: [7], x: 0, y: 0 },
      { template: "correlation", ids: [7, 8], x: 3, y: 4 },
    ]);
  });
});

describe("the built-in Dashboard Templates", () => {
  it("use only Slots they declare, never overlap, and stay on the grid", () => {
    for (const t of BUILT_IN_DASHBOARD_TEMPLATES) {
      for (const w of t.body.widgets) {
        expect(w.metricSlots.every((s) => s < t.slots.length), t.name).toBe(true);
        expect(w.x + w.w <= 12 && w.x >= 0, t.name).toBe(true);
      }
      const ws = t.body.widgets;
      for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
        const a = ws[i], b = ws[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${t.name}: widgets ${i} and ${j} overlap`).toBe(false);
      }
      expect(fillsComplete(t.slots, t.slots.map((_, i) => [i + 1]))).toBe(true);
    }
  });
});
