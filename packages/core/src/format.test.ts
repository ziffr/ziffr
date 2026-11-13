import { describe, expect, it } from "vitest";
import { formatValue, periodLabel, periodStart } from "./format";
import { metric } from "./test/fixtures";

describe("format", () => {
  it("formats currency and percent the way the app shows them", () => {
    expect(formatValue(metric(), 118941)).toBe("118,941 €");
    expect(formatValue(metric({ format: "percent", decimals: 1, unit: "%" }), -6.5)).toContain("-6.5");
  });
  it("shows a dash for no value", () => {
    expect(formatValue(metric(), null)).toBe("–");
  });
  it("names periods and finds the start of the current one", () => {
    expect(periodLabel("2026-10-01", "month")).toBe("October 2026");
    expect(periodLabel("2026-10-01", "month", true)).toBe("Oct 26");
    expect(periodStart(new Date("2026-11-13T12:00:00"), "month")).toBe("2026-11-01");
  });
});
