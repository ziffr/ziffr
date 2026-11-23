// @ts-nocheck
// The periods a Snapshot is taken for (spec 0013, ticket #175).
import { describe, expect, it } from "vitest";
import { completePeriods, cutPoints, dataAsOf, dataAsOfEach, inSnapshot, MAX_METRIC_PERIODS, metricPeriodsIn, periodContaining, snapshotPeriod } from "./snapshot-periods";
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
    expect(snapshotPeriod("day" as never, "2026-01-01", JANUARY)).toBeNull();
    expect(snapshotPeriod("half", "2026-04-01", JANUARY)).toBeNull();
    expect(snapshotPeriod("year", "2026-07-01", JANUARY)).toBeNull();
  });

  it("offers the complete periods before today, the last complete one first", () => {
    expect(completePeriods("month", "2026-11-15", 2, JANUARY).map((p) => p.label)).toEqual(["October 2026", "September 2026"]);
    expect(completePeriods("quarter", "2026-11-15", 2, JANUARY).map((p) => p.label)).toEqual(["Q3 2026", "Q2 2026"]);
    expect(completePeriods("week", "2026-11-15", 1, JANUARY)[0].start).toBe("2026-11-02");
    expect(periodContaining("quarter", "2026-11-15", JANUARY).start).toBe("2026-10-01");
  });

  it("names half-years and years and knows their last day (spec 0020)", () => {
    expect(snapshotPeriod("half", "2026-01-01", JANUARY)).toEqual({ kind: "half", start: "2026-01-01", end: "2026-06-30", label: "H1 2026" });
    expect(snapshotPeriod("half", "2026-07-01", JANUARY)).toEqual({ kind: "half", start: "2026-07-01", end: "2026-12-31", label: "H2 2026" });
    expect(snapshotPeriod("year", "2026-01-01", JANUARY)).toEqual({ kind: "year", start: "2026-01-01", end: "2026-12-31", label: "2026" });
    expect(snapshotPeriod("year", "2028-01-01", JANUARY)?.end).toBe("2028-12-31");
    // With the year starting in April, halves start in April and October and the year is named by both years.
    expect(snapshotPeriod("half", "2026-10-01", 4)).toEqual({ kind: "half", start: "2026-10-01", end: "2027-03-31", label: "H2 FY 2026/27" });
    expect(snapshotPeriod("year", "2026-04-01", 4)).toEqual({ kind: "year", start: "2026-04-01", end: "2027-03-31", label: "FY 2026/27" });
    expect(snapshotPeriod("half", "2026-07-01", 4)).toBeNull();
    expect(snapshotPeriod("year", "2026-01-01", 4)).toBeNull();
    expect(snapshotPeriod("quarter", "2026-04-01", 4)?.label).toBe("Q1 FY 2026/27");
  });

  it("offers complete half-years and years across year ends", () => {
    expect(completePeriods("half", "2026-11-15", 3, JANUARY).map((p) => p.label)).toEqual(["H1 2026", "H2 2025", "H1 2025"]);
    expect(completePeriods("half", "2027-01-01", 1, JANUARY)[0]).toMatchObject({ start: "2026-07-01", end: "2026-12-31" });
    expect(completePeriods("year", "2026-11-15", 2, JANUARY).map((p) => p.label)).toEqual(["2025", "2024"]);
    expect(completePeriods("year", "2027-01-01", 1, JANUARY)[0]).toMatchObject({ start: "2026-01-01", end: "2026-12-31", label: "2026" });
    expect(completePeriods("year", "2026-12-31", 1, JANUARY)[0].label).toBe("2025");
    expect(completePeriods("year", "2027-03-31", 1, 4)[0].label).toBe("FY 2025/26");
    expect(completePeriods("year", "2027-04-01", 1, 4)[0].label).toBe("FY 2026/27");
    expect(completePeriods("half", "2027-04-01", 2, 4).map((p) => p.label)).toEqual(["H2 FY 2026/27", "H1 FY 2026/27"]);
    expect(periodContaining("year", "2026-11-15", JANUARY).start).toBe("2026-01-01");
    expect(periodContaining("half", "2026-03-15", 4)).toMatchObject({ start: "2025-10-01", end: "2026-03-31" });
  });

  it("lists every Metric period of a year, a leap year's 366 days included", () => {
    const y = snapshotPeriod("year", "2026-01-01", JANUARY)!;
    expect(metricPeriodsIn("month", y, JANUARY)).toHaveLength(12);
    expect(metricPeriodsIn("day", y, JANUARY)).toHaveLength(365);
    const leap = metricPeriodsIn("day", snapshotPeriod("year", "2028-01-01", JANUARY)!, JANUARY);
    expect([leap.length, leap[0], leap.at(-1)]).toEqual([366, "2028-01-01", "2028-12-31"]);
    // The most a Snapshot period may hold leaves room for it.
    expect(MAX_METRIC_PERIODS).toBeGreaterThanOrEqual(366);
    // A year starting in April that holds 29 February 2028.
    expect(metricPeriodsIn("day", snapshotPeriod("year", "2027-04-01", 4)!, 4)).toHaveLength(366);
    // Weeks wholly inside 2026: from Mon 5 Jan (29 Dec starts in 2025) to 21 Dec (28 Dec ends in 2027).
    const weeks = metricPeriodsIn("week", y, JANUARY);
    expect([weeks[0], weeks.at(-1), weeks.length]).toEqual(["2026-01-05", "2026-12-21", 51]);
    expect(metricPeriodsIn("month", snapshotPeriod("half", "2026-07-01", JANUARY)!, JANUARY)).toHaveLength(6);
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
    // A year ending 31 Dec keeps December's month, not the week of 28 Dec 2026 that ends in January.
    expect(inSnapshot("month", "2026-12-01", "2026-12-31")).toBe(true);
    expect(inSnapshot("week", "2026-12-28", "2026-12-31")).toBe(false);
    // A quarter ending 30 Sep: September's month is in, October's is not; the week of 28 Sep ends in October.
    expect(inSnapshot("month", "2026-09-01", "2026-09-30")).toBe(true);
    expect(inSnapshot("month", "2026-10-01", "2026-09-30")).toBe(false);
    expect(inSnapshot("week", "2026-09-21", "2026-09-30")).toBe(true);
    expect(inSnapshot("week", "2026-09-28", "2026-09-30")).toBe(false);
    expect(inSnapshot("day", "2026-09-30", "2026-09-30")).toBe(true);
    expect(cutPoints([{ period: "2026-09-01", value: 1 }, { period: "2026-10-01", value: 2 }], "month", "2026-09-30")).toEqual([{ period: "2026-09-01", value: 1 }]);
  });
});

describe("data as of a day, from data that is missing parts", () => {
  it("leaves data alone when no Metric is cut, and reads missing parts as empty", () => {
    const m = { id: 1, slug: "rev", period: "month" } as never;
    const data = { metrics: [m], series: { rev: [{ period: "2026-09-01", value: 1 }, { period: "2026-10-01", value: 2 }] } } as never;
    expect(dataAsOfEach(data, new Map())).toBe(data);
    // A Snapshot kept before breakdowns, Approvals and Locks were kept has none of them.
    const cut = dataAsOfEach(data, new Map([[1, "2026-09-30"]]));
    expect(cut.series.rev).toEqual([{ period: "2026-09-01", value: 1 }]);
    expect([cut.breakdowns[1], cut.pending[1], cut.locked[1]]).toEqual([{}, [], []]);
    const other = { metrics: [m], series: {}, breakdowns: undefined, pending: undefined, locked: undefined } as never;
    expect(dataAsOfEach(other, new Map([[1, "2026-09-30"]])).series.rev).toEqual([]);
  });

  it("cuts each Metric by its own period and leaves the Metrics it does not cut whole", () => {
    // A monthly Metric cut in the middle of October keeps September only: October is not complete by the 15th, though
    // its first day is before it. A daily Metric that is not cut keeps everything.
    const rev = { id: 1, slug: "rev", period: "month" } as never;
    const visits = { id: 2, slug: "visits", period: "day" } as never;
    const data = {
      metrics: [rev, visits],
      series: { rev: [{ period: "2026-09-01", value: 1 }, { period: "2026-10-01", value: 2 }], visits: [{ period: "2026-10-20", value: 5 }] },
      breakdowns: { 1: { "2026-09-01": [], "2026-10-01": [] }, 2: { "2026-10-20": [] } },
      pending: { 1: ["2026-10-01"], 2: ["2026-10-20"] },
      locked: { 1: ["2026-09-01", "2026-10-01"], 2: ["2026-10-20"] },
    } as never;
    const cut = dataAsOfEach(data, new Map([[1, "2026-10-15"]]));
    expect(cut.series).toEqual({ rev: [{ period: "2026-09-01", value: 1 }], visits: [{ period: "2026-10-20", value: 5 }] });
    expect(cut.breakdowns).toEqual({ 1: { "2026-09-01": [] }, 2: { "2026-10-20": [] } });
    expect(cut.pending).toEqual({ 1: [], 2: ["2026-10-20"] });
    expect(cut.locked).toEqual({ 1: ["2026-09-01"], 2: ["2026-10-20"] });
    const all = dataAsOf(data, "2026-10-15");
    expect([all.breakdowns[1], all.pending[1], all.locked[1]]).toEqual([{ "2026-09-01": [] }, [], ["2026-09-01"]]);
  });

  it("lists at most MAX_METRIC_PERIODS, however long the span it is given", () => {
    const twoYears = { kind: "year" as const, start: "2026-01-01", end: "2027-12-31", label: "2026 and 2027" };
    const days = metricPeriodsIn("day", twoYears, JANUARY);
    expect([days.length, days[0], days.at(-1)]).toEqual([MAX_METRIC_PERIODS, "2026-01-01", "2027-02-04"]);
  });

  it("cuts a series or period list of a Metric it does not know by days", () => {
    const data = { metrics: [], series: { gone: [{ period: "2026-09-30", value: 1 }, { period: "2026-10-01", value: 2 }] }, breakdowns: { 9: { "2026-10-01": [] } }, pending: { 9: ["2026-09-30", "2026-10-01"] }, locked: {} } as never;
    const cut = dataAsOf(data, "2026-09-30");
    expect(cut.series.gone).toEqual([{ period: "2026-09-30", value: 1 }]);
    expect(cut.breakdowns[9]).toEqual({});
    expect(cut.pending[9]).toEqual(["2026-09-30"]);
    const bare = dataAsOf({ metrics: [], series: {} } as never, "2026-09-30");
    expect([bare.breakdowns, bare.pending, bare.locked]).toEqual([{}, {}, {}]);
  });
});
