import { describe, expect, it } from "vitest";
import { parseSeriesLine, parseSeriesText } from "./series-lines";
import { JANUARY } from "./periods";

describe("series lines", () => {
  it("reads the usual ways a period and a value are written", () => {
    expect(parseSeriesLine("2026-12 140000", "month", JANUARY)).toEqual({ period: "2026-12-01", value: 140000 });
    expect(parseSeriesLine("2026-12-01;140.000", "month", JANUARY)).toEqual({ period: "2026-12-01", value: 140000 });
    expect(parseSeriesLine("12/2026\t1,5", "month", JANUARY)).toEqual({ period: "2026-12-01", value: 1.5 });
    expect(parseSeriesLine("December 140000", "month", JANUARY)).toBeNull();
  });
  it("reads pasted spreadsheet columns, keeps the last value per period and lists what it skipped", () => {
    const r = parseSeriesText("2027-01\t112000\n\nPeriod\tBudget\n2026-12\t140000\n2027-01\t115000", "month", JANUARY);
    expect(r.rows).toEqual([{ period: "2026-12-01", value: 140000 }, { period: "2027-01-01", value: 115000 }]);
    expect(r.skipped).toEqual(["Period\tBudget"]);
  });
});
