import { describe, expect, it } from "vitest";
import { fillText, fillWidgetText, listOf } from "./placeholders";
import { canvas, metric, months } from "./test/fixtures";

const revenue = metric();
const orders = metric({ id: 2, slug: "orders", name: "Orders", format: "number", unit: "" });
const data = canvas([revenue, orders], { revenue: months("2025-10", [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 120]), orders: months("2026-10", [7]) });

describe("placeholders", () => {
  it("fills words from the data", () => {
    expect(fillText("{metric} in {period}: {latest}", [revenue], data)).toBe("Revenue in October 2026: 120 €");
    expect(fillText("{metric} {change yoy}", [revenue], data)).toBe("Revenue up 20.0 %");
  });
  it("numbers further metrics and lists them all", () => {
    expect(fillText("{metric 2}", [revenue, orders], data)).toBe("Orders");
    expect(fillText("{metrics}", [revenue, orders], data)).toBe("Revenue and Orders");
    expect(listOf(["A", "B", "C"])).toBe("A, B and C");
  });
  it("leaves a placeholder it cannot fill visible", () => {
    expect(fillText("{metric 3} {top row}", [revenue], data)).toBe("{metric 3} {top row}");
  });
  describe("a widget's title", () => {
    const widget = { metric_ids: [1, 2], settings: {} };
    it("fills in from the widget's own Metrics", () => {
      expect(fillWidgetText("{metric}: {latest} ({change yoy})", { metric_ids: [1], settings: {} }, data)).toBe("Revenue: 120 € (up 20.0 %)");
      expect(fillWidgetText("{metric} vs {metric 2}", widget, data)).toBe("Revenue vs Orders");
      expect(fillWidgetText("Plain words, {unknown}", widget, data)).toBe("Plain words, {unknown}");
    });
    it("leaves nothing of a Metric the viewer may not see, and does not shift the next one into its place", () => {
      // The viewer's data carries only Orders: Revenue (the widget's first Metric) is hidden from them.
      const seen = canvas([orders], { orders: months("2026-10", [7]) });
      const out = fillWidgetText("A {metric} B {latest} C {metric 2} D {metrics}", widget, seen);
      expect(out).toBe("A  B  C Orders D Orders");
      expect(out).not.toContain("Revenue");
      expect(out).not.toContain("120");
      // A hidden second Metric is empty as well, and {metrics} lists only what is seen.
      expect(fillWidgetText("{metric 2}|{metrics}", widget, canvas([revenue], { revenue: months("2025-10", [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 120]) }))).toBe("|Revenue");
    });
  });
});
