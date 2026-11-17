// The periods a Snapshot is taken for (spec 0013, ticket #175).
import { describe, expect, it } from "vitest";
import { completePeriods, cutPoints, dataAsOf, inSnapshot, metricPeriodsIn, periodContaining, snapshotPeriod } from "./snapshot-periods";
import { JANUARY } from "./periods";

describe("Snapshot periods", () => {
  it("names weeks, months and quarters and knows their last day", () => {
    expect(snapshotPeriod("month", "2026-10-01", JANUARY)).toEqual({ kind: "month", start: "2026-10-01", end: "2026-10-31", label: "October 2026" });
    expect(snapshotPeriod("quarter", "2026-07-01", JANUARY)).toEqual({ kind: "quarter", start: "2026-07-01", end: "2026-09-30", label: "Q3 2026" });
    expect(snapshotPeriod("week", "2026-10-26", JANUARY)).toEqual({ kind: "week", start: "2026-10-26", end: "2026-11-01", label: "Week of 26 Oct 2026" });
    expect(snapshotPeriod("quarter", "2026-12-01", JANUARY)?.end).toBeUndefined();
  });

  it("refuses a start that is not the first day of such a period, or not a day at all", () => {
    expect(snapshotPeriod("month", "2026-10-02", JANUARY)).toBeNull();
    expect(snapshotPeriod("quarter", "2026-08-01", JANUARY)).toBeNull();
    expect(snapshotPeriod("week", "2026-10-27", JANUARY)).toBeNull();
    expect(snapshotPeriod("month", "2026-13-01", JANUARY)).toBeNull();
    expect(snapshotPeriod("month", "October", JANUARY)).toBeNull();
    expect(snapshotPeriod("year" as never, "2026-01-01", JANUARY)).toBeNull();
  });

  it("offers the complete periods before today, the last complete one first", () => {
    expect(completePeriods("month", "2026-11-15", 2, JANUARY).map((p) => p.label)).toEqual(["October 2026", "September 2026"]);
    expect(completePeriods("quarter", "2026-11-15", 2, JANUARY).map((p) => p.label)).toEqual(["Q3 2026", "Q2 2026"]);
    expect(completePeriods("week", "2026-11-15", 1, JANUARY)[0].start).toBe("2026-11-02");
    expect(periodContaining("quarter", "2026-11-15", JANUARY).start).toBe("2026-10-01");
  });

  it("lists the Metric periods wholly inside a Snapshot period", () => {
    const q3 = snapshotPeriod("quarter", "2026-07-01", JANUARY)!;
    expect(metricPeriodsIn("month", q3, JANUARY)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    // Weeks of Q3: the first starts on Mon 6 Jul (29 Jun starts in June), the last on 21 Sep (28 Sep ends in October).
    const weeks = metricPeriodsIn("week", q3, JANUARY);
    expect([weeks[0], weeks.at(-1), weeks.length]).toEqual(["2026-07-06", "2026-09-21", 12]);
    expect(metricPeriodsIn("day", snapshotPeriod("month", "2026-02-01", JANUARY)!, JANUARY)).toHaveLength(28);
    expect(metricPeriodsIn("month", snapshotPeriod("week", "2026-10-26", JANUARY)!, JANUARY)).toEqual([]);
  });

  it("cuts a page's data at a day, for a widget drawn as of then (#178)", () => {
    const m = { id: 1, slug: "rev", period: "month" } as never;
    const data = { metrics: [m], series: { rev: [{ period: "2026-09-01", value: 1 }, { period: "2026-10-01", value: 2 }] }, breakdowns: { 1: { "2026-09-01": [], "2026-10-01": [] } }, pending: { 1: ["2026-10-01"] }, locked: { 1: ["2026-09-01", "2026-10-01"] }, targets: { 1: [{ period: "2026-12-01", value: 9 }] } } as never;
    const cut = dataAsOf(data, "2026-09-30");
    expect(cut.series.rev).toEqual([{ period: "2026-09-01", value: 1 }]);
    expect(Object.keys(cut.breakdowns[1])).toEqual(["2026-09-01"]);
    expect(cut.pending[1]).toEqual([]);
    expect(cut.locked[1]).toEqual(["2026-09-01"]);
    // Targets stay: they say what was planned, not what was recorded.
    expect(cut.targets[1]).toHaveLength(1);
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
