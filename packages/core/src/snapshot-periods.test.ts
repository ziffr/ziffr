// The periods a Snapshot is taken for (spec 0013, ticket #175).
import { describe, expect, it } from "vitest";
import { completePeriods, cutPoints, inSnapshot, periodContaining, snapshotPeriod } from "./snapshot-periods";

describe("Snapshot periods", () => {
  it("names weeks, months and quarters and knows their last day", () => {
    expect(snapshotPeriod("month", "2026-10-01")).toEqual({ kind: "month", start: "2026-10-01", end: "2026-10-31", label: "October 2026" });
    expect(snapshotPeriod("quarter", "2026-07-01")).toEqual({ kind: "quarter", start: "2026-07-01", end: "2026-09-30", label: "Q3 2026" });
    expect(snapshotPeriod("week", "2026-10-26")).toEqual({ kind: "week", start: "2026-10-26", end: "2026-11-01", label: "Week of 26 Oct 2026" });
    expect(snapshotPeriod("quarter", "2026-12-01")?.end).toBeUndefined();
  });

  it("refuses a start that is not the first day of such a period, or not a day at all", () => {
    expect(snapshotPeriod("month", "2026-10-02")).toBeNull();
    expect(snapshotPeriod("quarter", "2026-08-01")).toBeNull();
    expect(snapshotPeriod("week", "2026-10-27")).toBeNull();
    expect(snapshotPeriod("month", "2026-13-01")).toBeNull();
    expect(snapshotPeriod("month", "October")).toBeNull();
    expect(snapshotPeriod("year" as never, "2026-01-01")).toBeNull();
  });

  it("offers the complete periods before today, the last complete one first", () => {
    expect(completePeriods("month", "2026-11-15", 2).map((p) => p.label)).toEqual(["October 2026", "September 2026"]);
    expect(completePeriods("quarter", "2026-11-15", 2).map((p) => p.label)).toEqual(["Q3 2026", "Q2 2026"]);
    expect(completePeriods("week", "2026-11-15", 1)[0].start).toBe("2026-11-02");
    expect(periodContaining("quarter", "2026-11-15").start).toBe("2026-10-01");
  });

  it("keeps a Metric's periods that are complete by the Snapshot's last day", () => {
    // A quarter ending 30 Sep: September's month is in, October's is not; the week of 28 Sep ends in October.
    expect(inSnapshot("month", "2026-09-01", "2026-09-30")).toBe(true);
    expect(inSnapshot("month", "2026-10-01", "2026-09-30")).toBe(false);
    expect(inSnapshot("week", "2026-09-21", "2026-09-30")).toBe(true);
    expect(inSnapshot("week", "2026-09-28", "2026-09-30")).toBe(false);
    expect(inSnapshot("day", "2026-09-30", "2026-09-30")).toBe(true);
    expect(cutPoints([{ period: "2026-09-01", value: 1 }, { period: "2026-10-01", value: 2 }], "month", "2026-09-30")).toEqual([{ period: "2026-09-01", value: 1 }]);
  });
});
