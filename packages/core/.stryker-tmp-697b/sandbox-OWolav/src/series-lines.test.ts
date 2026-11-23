// @ts-nocheck
import { describe, expect, it } from "vitest";
import { parseSeriesLine, parseSeriesText } from "./series-lines";
import { JANUARY } from "./periods";

describe("series lines", () => {
  it("reads the usual ways a period and a value are written", () => {
    expect(parseSeriesLine("2026-12 140000", "month", JANUARY, "1.234,5")).toEqual({ period: "2026-12-01", value: 140000 });
    expect(parseSeriesLine("2026-12-01;140.000", "month", JANUARY, "1.234,5")).toEqual({ period: "2026-12-01", value: 140000 });
    expect(parseSeriesLine("12/2026\t1,5", "month", JANUARY, "1.234,5")).toEqual({ period: "2026-12-01", value: 1.5 });
    expect(parseSeriesLine("December 140000", "month", JANUARY, "1.234,5")).toBeNull();
  });
  it("refuses months and values that do not exist, and reads a day into its period", () => {
    for (const bad of ["2026-13 5", "2026-00 5", "13/2026 5", "0/2026 5", "2026-12 1..5", "12/2026 1,2,3"]) expect(parseSeriesLine(bad, "month", JANUARY, "1,234.5"), bad).toBeNull();
    expect(parseSeriesLine("  2026-12 5  ", "month", JANUARY, "1,234.5")).toEqual({ period: "2026-12-01", value: 5 });
    // A day names the period it falls in: the week of Monday 14 December 2026; without a day, a week starts on the 1st.
    expect(parseSeriesLine("2026-12-16 5", "week", JANUARY, "1,234.5")).toEqual({ period: "2026-12-14", value: 5 });
    expect(parseSeriesLine("2026-12 5", "week", JANUARY, "1,234.5")).toEqual({ period: "2026-11-30", value: 5 });
    expect(parseSeriesLine("12/2026 5", "week", JANUARY, "1,234.5")).toEqual({ period: "2026-11-30", value: 5 });
    expect(parseSeriesLine("2026-12 2.5k", "month", JANUARY, "1,234.5")).toEqual({ period: "2026-12-01", value: 2500 });
  });
  it("reads at most 2,000 lines and lists what it skipped as written, without its spaces", () => {
    const many = Array.from({ length: 2001 }, (_, i) => `${2000 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")} ${i}`).join("\n");
    expect(parseSeriesText(many, "month", JANUARY, "1,234.5").rows).toHaveLength(2000);
    expect(parseSeriesText("  Period  \n2026-12 5", "month", JANUARY, "1,234.5").skipped).toEqual(["Period"]);
  });
  it("reads pasted spreadsheet columns, keeps the last value per period and lists what it skipped", () => {
    const r = parseSeriesText("2027-01\t112000\n\nPeriod\tBudget\n2026-12\t140000\n2027-01\t115000", "month", JANUARY, "1,234.5");
    expect(r.rows).toEqual([{ period: "2026-12-01", value: 140000 }, { period: "2027-01-01", value: 115000 }]);
    expect(r.skipped).toEqual(["Period\tBudget"]);
  });
});
