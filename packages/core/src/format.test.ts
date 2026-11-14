import { describe, expect, it } from "vitest";
import { formatDate, formatValue, periodLabel, periodStart, targetStatus } from "./format";
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
  it("places a value against the target range", () => {
    const m = { target_min: 100, target_max: 200 };
    expect(targetStatus(m, 50)).toBe("below");
    expect(targetStatus(m, 150)).toBe("on");
    expect(targetStatus(m, 250)).toBe("above");
    expect(targetStatus({ target_min: null, target_max: null }, 50)).toBeNull();
    expect(targetStatus(m, null)).toBeNull();
  });
  it("writes every date one way", () => {
    expect(formatDate("2026-11-04")).toBe("4 Nov 2026");
    expect(formatDate(new Date("2026-12-24T09:00:00"))).toBe("24 Dec 2026");
    expect(formatDate("not a date")).toBe("–");
  });
});
