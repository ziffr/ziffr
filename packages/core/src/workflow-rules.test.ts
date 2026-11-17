import { describe, expect, it } from "vitest";
import { addWorkingDays, dueDate, unusualReasons, workingPeriod } from "./workflow-rules";
import { metric } from "./test/fixtures";
import { JANUARY, periodEnd } from "./periods";

describe("workflow rules", () => {
  it("skips weekends when counting working days", () => {
    // Friday 30 Oct 2026 + 3 working days = Wednesday 4 Nov.
    expect(addWorkingDays("2026-10-30", 3)).toBe("2026-11-04");
  });
  it("puts the due date after the end of the period", () => {
    expect(periodEnd("2026-10-01", "month")).toBe("2026-10-31");
    expect(dueDate("2026-10-01", "month", { dueWorkingDays: 3, steps: [] })).toBe("2026-11-04");
  });
  it("works on the last period that has ended", () => {
    expect(workingPeriod("2026-11-13", "month", JANUARY)).toBe("2026-10-01");
  });
  it("calls a value unusual for a big change or a missed target, and says why", () => {
    const step = { type: "check" as const, changePct: 30, outsideTarget: true };
    expect(unusualReasons(metric(), 150, 100, "2026-09-01", step, JANUARY, { min: 100, max: null })).toEqual(["up 50.0 % on September 2026"]);
    expect(unusualReasons(metric(), 90, 95, "2026-09-01", step, JANUARY, { min: 100, max: null })).toEqual(["below target"]);
    expect(unusualReasons(metric(), 101, 100, "2026-09-01", step, JANUARY, { min: 100, max: null })).toEqual([]);
  });
});
