// @ts-nocheck
import { describe, expect, it } from "vitest";
import { BUILT_IN_DASHBOARD_TEMPLATES } from "./built-in-dashboard-templates";
import { SAMPLE_PERIODS, sampleCanvasData, sampleDashboard, sampleData, sampleFills, samplePeriods, sampleTeamWidget, sampleWidget } from "./sample-data";
import { fillsComplete } from "./team-templates";
import { widgetMetricIds } from "./widget-metrics";
import { TEMPLATES } from "./widget-templates";
import type { DashboardTemplate, Period, Point, TemplateId } from "./types";

// Pearson's r over two series of the same periods (the app's own lives in apps/web, which the core does not import).
const corr = (a: Point[], b: Point[]) => {
  const n = a.length;
  const mx = a.reduce((s, p) => s + p.value, 0) / n;
  const my = b.reduce((s, p) => s + p.value, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  a.forEach((p, i) => { sxy += (p.value - mx) * (b[i].value - my); sxx += (p.value - mx) ** 2; syy += (b[i].value - my) ** 2; });
  return sxy / Math.sqrt(sxx * syy);
};

const grains: Period[] = ["month", "week", "day"];

describe("Sample Data", () => {
  it("is the same on every call", () => {
    expect(JSON.stringify(sampleData("month"))).toBe(JSON.stringify(sampleData("month")));
    expect(sampleFills([{ multiple: false }, { multiple: true }])).toEqual(sampleFills([{ multiple: false }, { multiple: true }]));
  });

  it.each(grains)("covers %s with a full series per Metric", (g) => {
    const d = sampleData(g);
    expect(samplePeriods(g)).toHaveLength(SAMPLE_PERIODS);
    expect(new Set(samplePeriods(g)).size).toBe(SAMPLE_PERIODS);
    for (const m of d.metrics) {
      expect(m.period).toBe(g);
      expect(d.series[m.slug]).toHaveLength(SAMPLE_PERIODS);
      expect(d.series[m.slug].every((p) => Number.isFinite(p.value) && p.value > 0)).toBe(true);
    }
  });

  it("uses only negative ids and an owner nobody is", () => {
    const d = sampleCanvasData("viewer", "1,234.5");
    expect(d.metrics.length).toBeGreaterThanOrEqual(5);
    expect(d.metrics.every((m) => m.id < 0 && m.owner_id === "sample")).toBe(true);
    expect(new Set(d.metrics.map((m) => m.id)).size).toBe(d.metrics.length);
    expect(d.people).toEqual([]);
    expect(d.templates).toEqual([]);
  });

  it("has a Breakdown on the first Metric whose rows add up to its value", () => {
    const d = sampleData();
    const first = d.metrics[0];
    const rows = d.breakdowns[first.id];
    for (const p of d.series[first.slug]) {
      const sum = rows[p.period].reduce((a, r) => a + r.value, 0);
      expect(Math.abs(sum - p.value)).toBeLessThanOrEqual(rows[p.period].length);
    }
  });

  it("has a second series that moves with the first", () => {
    const d = sampleData();
    const r = corr(d.series[d.metrics[0].slug], d.series[d.metrics[1].slug]);
    expect(r).toBeGreaterThan(0.7);
  });

  it("fills slots with different Metrics, three for one-or-more, the Breakdown first", () => {
    const d = sampleData();
    const fills = sampleFills([{ multiple: false }, { multiple: false }, { multiple: true }]);
    expect(fills[0]).toEqual([d.metrics[0].id]);
    expect(fills[1]).toEqual([d.metrics[1].id]);
    expect(fills[2]).toHaveLength(3);
    expect(new Set(fills.flat()).size).toBe(5);
  });
});

describe("Sample widgets for Previews", () => {
  // A Workspace's View Design has its own Preview, of its own design (design-files.test.ts).
  const ids = (Object.keys(TEMPLATES) as TemplateId[]).filter((id) => id !== "design");

  it.each(ids)("%s has Slots its Sample Data fills completely", (id) => {
    const t = TEMPLATES[id];
    expect(Array.isArray(t.slots)).toBe(true);
    expect(fillsComplete(t.slots, sampleFills(t.slots))).toBe(true);
    const w = sampleWidget(id);
    expect(w.template).toBe(id);
    expect(w.metric_ids.every((m) => m < 0)).toBe(true);
    expect(widgetMetricIds(w.metric_ids, w.settings).every((m) => m < 0)).toBe(true);
  });

  it("asks a Finding that draws a Breakdown for the Metric that has one", () => {
    const withRows = sampleData().metrics.filter((m) => sampleData().breakdowns[m.id]).map((m) => m.id);
    for (const id of ids.filter((x) => TEMPLATES[x].needsBreakdown)) expect(withRows).toContain(sampleWidget(id).metric_ids[0]);
  });

  it("fills a team template with Sample Data, never the metrics it was made with", () => {
    const t = {
      view: "story" as const,
      slots: [{ label: "Revenue", multiple: false, exampleIds: [41] }, { label: "Regions", multiple: true, exampleIds: [42, 43] }],
      body: { metricSlots: [0], settings: { headline: "{metric} grew", panels: [{ type: "period-bars" as const, metricIds: [], slot: 1 }] }, title: "Board" },
    };
    const w = sampleTeamWidget(t);
    const all = widgetMetricIds(w.metric_ids, w.settings);
    expect(all.length).toBeGreaterThan(1);
    expect(all.every((m) => m < 0)).toBe(true);
    expect(JSON.stringify(w)).not.toMatch(/\b4[123]\b/);
    expect(w.settings.headline).toBe("{metric} grew");
    expect(w.title).toBe("Board");
  });
});

describe("a Dashboard Template's Preview (#191)", () => {
  it("fills every built-in template with Sample Data only, each widget where it sits", () => {
    const sample = new Set(sampleData().metrics.map((m) => m.id));
    for (const t of BUILT_IN_DASHBOARD_TEMPLATES) {
      const widgets = sampleDashboard(t);
      expect(widgets.map(({ x, y, w, h }) => ({ x, y, w, h })), t.name).toEqual(t.body.widgets.map(({ x, y, w, h }) => ({ x, y, w, h })));
      expect(widgets.every((w) => widgetMetricIds(w.metric_ids, w.settings).every((id) => sample.has(id))), t.name).toBe(true);
    }
  });
  it("never draws the Metrics a team template was made with", () => {
    const team: Pick<DashboardTemplate, "slots" | "body"> = { slots: [{ label: "Revenue", multiple: false, exampleIds: [41] }], body: { widgets: [{ view: "number", metricSlots: [0], settings: {}, title: null, x: 0, y: 0, w: 3, h: 4 }] } };
    const widgets = sampleDashboard(team);
    expect(widgets[0].metric_ids).not.toContain(41);
  });
});
