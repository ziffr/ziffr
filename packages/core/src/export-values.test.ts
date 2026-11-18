// The deck export's numbers match the app's (spec 0022, ticket #114): the change comes from compare(), so a gap or
// an earlier 0 shows none, and chart values are rounded to the Metric's decimals.
import { describe, expect, it } from "vitest";
import { compare, resolverFrom } from "./compare";
import { canvas, metric, months } from "./test/fixtures";
import { chartFormatCode, chartValue, exportedChange } from "./export-values";

const revenue = metric();

describe("the exported change", () => {
  it("is the app's first comparison, written the one way changes are", () => {
    const data = canvas([revenue], { revenue: months("2026-01", [100, 110]) });
    expect(exportedChange(revenue, data, {})).toBe("vs prev. +10.0 %");
    expect(exportedChange(revenue, { ...data, numberStyle: "1.234,5" }, {})).toBe("vs prev. +10,0 %");
    const c = compare(revenue, resolverFrom(data.metrics, data.series), { keys: ["prev"], yearStart: 1 })[0];
    expect(exportedChange(revenue, data, {})).toContain(`${c.pct!.toFixed(1)} %`);
  });
  it("shows nothing across a gap, from 0, or when the widget shows no comparison", () => {
    // March, then May: the app says n/a for "vs prev.", where comparing points would show a change.
    const gap = canvas([revenue], { revenue: [{ period: "2026-03-01", value: 100 }, { period: "2026-05-01", value: 150 }] });
    expect(exportedChange(revenue, gap, {})).toBe("");
    expect(exportedChange(revenue, canvas([revenue], { revenue: months("2026-01", [0, 5]) }), {})).toBe("");
    expect(exportedChange(revenue, canvas([revenue], { revenue: months("2026-01", [100, 110]) }), { compare: [] })).toBe("");
  });
  it("follows the widget's comparisons, such as YoY", () => {
    const data = canvas([revenue], { revenue: months("2025-01", [100, ...Array(11).fill(1), 150]) });
    expect(exportedChange(revenue, data, { compare: ["yoy"] })).toBe("YoY +50.0 %");
  });
});

describe("chart values", () => {
  it("are rounded to the Metric's decimals", () => {
    expect(chartValue({ decimals: 0 }, 1234.5678)).toBe(1235);
    expect(chartValue({ decimals: 2 }, 1234.5678)).toBe(1234.57);
    expect(chartValue({ decimals: 1 }, -0.04)).toBe(0);
  });
  it("are labelled with the decimals and the unit on its side", () => {
    expect(chartFormatCode({ decimals: 0, unit: "€", unit_position: "after" })).toBe('#,##0" €"');
    expect(chartFormatCode({ decimals: 2, unit: "$", unit_position: "before" })).toBe('"$"#,##0.00');
    expect(chartFormatCode({ decimals: 1, unit: "", unit_position: "after" })).toBe("#,##0.0");
    expect(chartFormatCode({ decimals: 0, unit: 'a"b', unit_position: "after" })).toBe('#,##0" a""b"');
  });
});
