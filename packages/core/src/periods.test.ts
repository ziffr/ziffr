import { describe, expect, it } from "vitest";
import { isPeriodStart, isYearStart, JANUARY, periodEnd, periodLabel, periodsBetween, periodStart, periodStartsIn, shiftPeriod, toYearStart, type YearStart } from "./periods";

const APRIL: YearStart = 4;
const OCTOBER: YearStart = 10;

describe("periods", () => {
  it("finds where days, ISO weeks and months start, whatever the year start", () => {
    for (const ys of [JANUARY, APRIL, OCTOBER]) {
      expect(periodStart("2026-11-13", "day", ys)).toBe("2026-11-13");
      expect(periodStart("2026-11-13", "week", ys)).toBe("2026-11-09");
      expect(periodStart("2026-11-13", "month", ys)).toBe("2026-11-01");
      // ISO weeks cross the year end: 1 Jan 2027 is a Friday in the week of 28 Dec 2026.
      expect(periodStart("2027-01-01", "week", ys)).toBe("2026-12-28");
    }
    expect(periodStart(new Date("2026-11-13T12:00:00"), "month", JANUARY)).toBe("2026-11-01");
  });
  it("starts quarters, halves and years from the year start", () => {
    expect(periodStart("2026-11-13", "quarter", JANUARY)).toBe("2026-10-01");
    expect(periodStart("2026-11-13", "half", JANUARY)).toBe("2026-07-01");
    expect(periodStart("2026-11-13", "year", JANUARY)).toBe("2026-01-01");
    expect(periodStart("2026-11-13", "quarter", APRIL)).toBe("2026-10-01");
    expect(periodStart("2026-11-13", "half", APRIL)).toBe("2026-10-01");
    expect(periodStart("2026-11-13", "year", APRIL)).toBe("2026-04-01");
    // Before the year start, the year began in the calendar year before.
    expect(periodStart("2027-02-10", "year", APRIL)).toBe("2026-04-01");
    expect(periodStart("2027-02-10", "quarter", APRIL)).toBe("2027-01-01");
    expect(periodStart("2026-11-13", "quarter", OCTOBER)).toBe("2026-10-01");
    expect(periodStart("2026-09-30", "year", OCTOBER)).toBe("2025-10-01");
    expect(periodStart("2026-03-31", "half", OCTOBER)).toBe("2025-10-01");
    expect(periodStart("2026-04-01", "half", OCTOBER)).toBe("2026-04-01");
  });
  it("steps forward and back and finds the last day", () => {
    expect(shiftPeriod("2026-01-31", "day", 1)).toBe("2026-02-01");
    expect(shiftPeriod("2026-12-28", "week", 1)).toBe("2027-01-04");
    expect(shiftPeriod("2026-01-01", "month", -1)).toBe("2025-12-01");
    expect(shiftPeriod("2026-10-01", "quarter", 1)).toBe("2027-01-01");
    expect(shiftPeriod("2026-04-01", "half", -1)).toBe("2025-10-01");
    expect(shiftPeriod("2026-04-01", "year", 2)).toBe("2028-04-01");
    expect(periodEnd("2028-02-01", "month")).toBe("2028-02-29");
    expect(periodEnd("2027-02-01", "month")).toBe("2027-02-28");
    expect(periodEnd("2027-12-27", "week")).toBe("2028-01-02");
    expect(periodEnd("2026-07-01", "quarter")).toBe("2026-09-30");
    expect(periodEnd("2027-10-01", "half")).toBe("2028-03-31");
    expect(periodEnd("2026-04-01", "year")).toBe("2027-03-31");
    expect(periodEnd("2026-11-13", "day")).toBe("2026-11-13");
  });
  it("counts spans between two starts", () => {
    expect(periodsBetween("2026-01-01", "2026-03-01", "month")).toBe(2);
    expect(periodsBetween("2026-12-28", "2027-01-04", "week")).toBe(1);
    expect(periodsBetween("2028-02-28", "2028-03-01", "day")).toBe(2);
    expect(periodsBetween("2026-04-01", "2027-01-01", "quarter")).toBe(3);
    expect(periodsBetween("2026-04-01", "2025-04-01", "year")).toBe(-1);
  });
  it("lists the spans that lie wholly inside another", () => {
    expect(periodStartsIn("month", "2026-07-01", "2026-09-30", JANUARY)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(periodStartsIn("quarter", "2026-04-01", "2027-03-31", APRIL)).toEqual(["2026-04-01", "2026-07-01", "2026-10-01", "2027-01-01"]);
    expect(periodStartsIn("day", "2028-02-01", "2028-02-29", JANUARY)).toHaveLength(29);
    expect(periodStartsIn("month", "2026-10-26", "2026-11-01", JANUARY)).toEqual([]);
  });
  it("knows a span's first day", () => {
    expect(isPeriodStart("2026-04-01", "year", APRIL)).toBe(true);
    expect(isPeriodStart("2026-01-01", "year", APRIL)).toBe(false);
    expect(isPeriodStart("2026-11-09", "week", JANUARY)).toBe(true);
    expect(isPeriodStart("2026-13-01", "month", JANUARY)).toBe(false);
    expect(isPeriodStart(20260101, "day", JANUARY)).toBe(false);
  });
  it("names calendar periods as people expect", () => {
    expect(periodLabel("2026-11-13", "day", JANUARY)).toBe("Fri 13 Nov 2026");
    expect(periodLabel("2026-11-13", "day", JANUARY, true)).toBe("13 Nov");
    expect(periodLabel("2026-11-09", "week", JANUARY)).toBe("Week of 9 Nov 2026");
    expect(periodLabel("2026-10-01", "month", JANUARY)).toBe("October 2026");
    expect(periodLabel("2026-10-01", "month", JANUARY, true)).toBe("Oct 26");
    expect(periodLabel("2026-07-01", "quarter", JANUARY)).toBe("Q3 2026");
    expect(periodLabel("2026-07-01", "quarter", JANUARY, true)).toBe("Q3 26");
    expect(periodLabel("2026-07-01", "half", JANUARY)).toBe("H2 2026");
    expect(periodLabel("2026-07-01", "half", JANUARY, true)).toBe("H2 26");
    expect(periodLabel("2026-01-01", "year", JANUARY)).toBe("2026");
    expect(periodLabel("2026-01-01", "year", JANUARY, true)).toBe("2026");
  });
  it("names a fiscal year by both calendar years it spans", () => {
    expect(periodLabel("2026-04-01", "year", APRIL)).toBe("FY 2026/27");
    expect(periodLabel("2026-04-01", "year", APRIL, true)).toBe("FY26/27");
    expect(periodLabel("2026-04-01", "quarter", APRIL)).toBe("Q1 FY 2026/27");
    expect(periodLabel("2026-04-01", "quarter", APRIL, true)).toBe("Q1 26/27");
    expect(periodLabel("2027-01-01", "quarter", APRIL)).toBe("Q4 FY 2026/27");
    expect(periodLabel("2026-04-01", "half", APRIL)).toBe("H1 FY 2026/27");
    expect(periodLabel("2026-10-01", "half", APRIL, true)).toBe("H2 26/27");
    expect(periodLabel("2099-10-01", "year", OCTOBER)).toBe("FY 2099/00");
    expect(periodLabel("2025-10-01", "quarter", OCTOBER)).toBe("Q1 FY 2025/26");
    expect(periodLabel("2026-07-01", "quarter", OCTOBER)).toBe("Q4 FY 2025/26");
    // Months, weeks and days keep their calendar names.
    expect(periodLabel("2026-04-01", "month", APRIL)).toBe("April 2026");
  });
  it("reads a year start, January when it is not a month", () => {
    expect(isYearStart(4)).toBe(true);
    expect(isYearStart(0)).toBe(false);
    expect(isYearStart(4.5)).toBe(false);
    expect(toYearStart(10)).toBe(10);
    expect(toYearStart("7")).toBe(7);
    expect(toYearStart(13)).toBe(JANUARY);
    expect(toYearStart(null)).toBe(JANUARY);
  });
});
