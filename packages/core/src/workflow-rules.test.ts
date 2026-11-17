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
  it("puts a quarter's or year's due date after its last day, of the workspace's fiscal year", () => {
    const cfg = { dueWorkingDays: 5, steps: [] };
    // Q3 2026 ends Wednesday 30 Sep; five working days later is Wednesday 7 Oct.
    expect(dueDate("2026-07-01", "quarter", cfg)).toBe("2026-10-07");
    // 2026 ends Thursday 31 Dec; five working days later is Thursday 7 Jan 2027.
    expect(dueDate("2026-01-01", "year", cfg)).toBe("2027-01-07");
    // With an April year start, FY 2025/26 ends Tuesday 31 Mar 2026.
    expect(dueDate("2025-04-01", "year", cfg)).toBe("2026-04-07");
  });
  it("works on the last quarter or year that has ended", () => {
    expect(workingPeriod("2026-11-13", "quarter", JANUARY)).toBe("2026-07-01");
    expect(workingPeriod("2026-11-13", "year", JANUARY)).toBe("2025-01-01");
    expect(workingPeriod("2026-11-13", "quarter", 4)).toBe("2026-07-01");
    expect(workingPeriod("2026-11-13", "quarter", 2)).toBe("2026-08-01");
    expect(workingPeriod("2026-11-13", "year", 4)).toBe("2025-04-01");
  });
  it("compares a quarter's value with the quarter before", () => {
    const step = { type: "check" as const, changePct: 30, outsideTarget: false };
    expect(unusualReasons(metric({ period: "quarter" }), 150, 100, "2026-04-01", step, JANUARY)).toEqual(["up 50.0 % on Q2 2026"]);
    expect(unusualReasons(metric({ period: "year" }), 50, 100, "2025-04-01", step, 4)).toEqual(["down 50.0 % on FY 2025/26"]);
  });
  it("calls a value unusual for a big change or a missed target, and says why", () => {
    const step = { type: "check" as const, changePct: 30, outsideTarget: true };
    expect(unusualReasons(metric(), 150, 100, "2026-09-01", step, JANUARY, { min: 100, max: null })).toEqual(["up 50.0 % on September 2026"]);
    expect(unusualReasons(metric(), 90, 95, "2026-09-01", step, JANUARY, { min: 100, max: null })).toEqual(["below target"]);
    expect(unusualReasons(metric(), 101, 100, "2026-09-01", step, JANUARY, { min: 100, max: null })).toEqual([]);
  });
});
