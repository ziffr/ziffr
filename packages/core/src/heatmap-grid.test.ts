// The heatmap's numbers (GLOSSARY: Period): where each period sits for a day, a week and a month, week 53, a year that
// starts in another month, missing periods, a run over a year boundary, the steps and a constant series.
import { describe, expect, it } from "vitest";
import { HEAT_STEPS, heatmapModel, quantileSteps, type HeatmapInput } from "./heatmap-grid";
import { shiftPeriod } from "./periods";

const write = (v: number) => String(v);
const run = (by: HeatmapInput["by"], points: [string, number][], more: Partial<HeatmapInput> = {}) =>
  heatmapModel({ name: "Visits", by, points: points.map(([period, value]) => ({ period, value })), yearStart: 1, window: 26, lowerIsBetter: false, write, ...more });
const ok = (m: ReturnType<typeof heatmapModel>) => {
  if (!m.ok) throw new Error(m.reason);
  return m;
};
const run_ = (start: string, by: "day" | "week" | "month", n: number, f: (i: number) => number): [string, number][] => Array.from({ length: n }, (_, i) => [shiftPeriod(start, by, i), f(i)]);

describe("quantileSteps", () => {
  it("ranks values into five steps, the lowest in the first and the highest in the last", () => {
    const { steps, constant } = quantileSteps([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(constant).toBe(false);
    expect(steps).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("never gives a higher value a lower step, whatever order they come in", () => {
    const values = [9, 1, 5, 3, 7, 2, 8, 4, 6, 100];
    const { steps } = quantileSteps(values);
    for (const [i, a] of values.entries()) for (const [j, b] of values.entries()) if (a < b) expect(steps[i]).toBeLessThanOrEqual(steps[j]);
    expect(Math.max(...steps)).toBe(HEAT_STEPS - 1);
    expect(Math.min(...steps)).toBe(0);
  });
  it("gives equal values one step, so a tie is never split", () => {
    const { steps } = quantileSteps([5, 5, 5, 5, 5, 5, 5, 5, 1, 9]);
    expect(new Set(steps.slice(0, 8)).size).toBe(1);
    expect(steps[8]).toBeLessThan(steps[0]);
    expect(steps[9]).toBeGreaterThan(steps[0]);
  });
  it("makes a constant series one step, and nothing no steps", () => {
    expect(quantileSteps([4, 4, 4])).toEqual({ steps: [2, 2, 2], constant: true });
    expect(quantileSteps([7])).toEqual({ steps: [2], constant: true });
    expect(quantileSteps([])).toEqual({ steps: [], constant: false });
  });
});

describe("heatmapModel by day", () => {
  // 2026-06-01 is a Monday. Twenty-eight days from it end on Sunday 2026-06-28.
  const month = run_("2026-06-01", "day", 28, (i) => 10 + i);

  it("puts weeks in columns and Monday to Sunday in rows, the newest week last", () => {
    const m = ok(run("day", month, { window: 4 }));
    expect(m.rows.map((r) => r.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(m.columns).toHaveLength(4);
    expect(m.rows[0].cells.map((c) => c?.period)).toEqual(["2026-06-01", "2026-06-08", "2026-06-15", "2026-06-22"]);
    expect(m.rows[6].cells.map((c) => c?.period)).toEqual(["2026-06-07", "2026-06-14", "2026-06-21", "2026-06-28"]);
    expect(m.columns[0]).toBe("Jun");
  });

  it("does not draw the days after the newest, and draws a day before the first value as empty, never 0", () => {
    // Newest is a Wednesday: Thursday to Sunday of its week are no periods; the Monday before the first value has none.
    const m = ok(run("day", run_("2026-06-03", "day", 8, (i) => i + 1), { window: 2 }));
    expect(m.rows[3].cells.at(-1)).toBeNull();
    expect(m.rows[0].cells[0]).toMatchObject({ period: "2026-06-01", value: null, step: null, text: null });
    expect(m.rows[0].cells[1]).toMatchObject({ period: "2026-06-08", value: 6 });
    expect(m.caption).toContain("An empty square has no value (2 periods)");
  });

  it("leaves a missing day in the middle empty and ranks only the days that have a value", () => {
    const points = month.filter(([p]) => p !== "2026-06-10");
    const m = ok(run("day", points, { window: 4 }));
    expect(m.rows[2].cells[1]).toMatchObject({ period: "2026-06-10", value: null, step: null });
    const steps = m.rows.flatMap((r) => r.cells).flatMap((c) => (c && c.step !== null ? [c.step] : []));
    expect(steps).toHaveLength(27);
    expect(Math.max(...steps)).toBe(4);
  });

  it("runs over a year boundary: the weeks stay in order and name the new year's month", () => {
    // Monday 2025-12-29 to Sunday 2026-01-11: the week of 1 Jan 2026 (a Thursday) is one column.
    const m = ok(run("day", run_("2025-12-15", "day", 28, (i) => i), { window: 4 }));
    expect(m.rows[0].cells.map((c) => c?.period)).toEqual(["2025-12-15", "2025-12-22", "2025-12-29", "2026-01-05"]);
    expect(m.rows[3].cells[2]).toMatchObject({ period: "2026-01-01", value: 17 });
    expect(m.columns).toEqual(["", "", "", "Jan"]);
  });

  it("writes the lightest and darkest step in the Metric's own values, and says darker is higher", () => {
    const m = ok(run("day", month, { window: 4 }));
    expect(m.legend).toEqual({ low: "10", high: "37", text: "lowest 10 to highest 37" });
    expect(m.caption).toContain("Darker is a higher value.");
    expect(m.alt).toContain("Highest: ");
    expect(m.alt).toContain("Lowest: ");
  });

  it("names the five highest and the five lowest days in the text alternative", () => {
    const m = ok(run("day", month, { window: 4 }));
    const high = m.alt.match(/Highest: ([^.]*)\./)![1].split("; ");
    const low = m.alt.match(/Lowest: ([^.]*)\./)![1].split("; ");
    expect(high).toHaveLength(5);
    expect(low).toHaveLength(5);
    expect(high[0]).toMatch(/ 37$/);
    expect(low[0]).toMatch(/ 10$/);
  });

  it("says darker is a higher value, not a better one, for a lower-is-better Metric", () => {
    expect(ok(run("day", month, { window: 4, lowerIsBetter: true })).caption).toContain("Darker is a higher value, not a better one.");
  });
});

describe("heatmapModel before the Metric had values", () => {
  it("does not draw the weeks or years that come before its first value", () => {
    // Two years of months with a window of five: the three years before the first value are left out.
    const m = ok(run("month", run_("2025-01-01", "month", 18, (i) => i)));
    expect(m.rows).toHaveLength(2);
    // A fortnight of days with a window of 26 weeks is two columns.
    expect(ok(run("day", run_("2026-06-01", "day", 14, (i) => i))).columns).toHaveLength(2);
  });
  it("keeps a year that starts empty when a later month has a value", () => {
    const m = ok(run("month", [["2025-12-01", 1], ["2026-01-01", 2]], { yearStart: 4 }));
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].cells[0]).toMatchObject({ period: "2025-04-01", value: null });
  });
});

describe("heatmapModel with a constant series", () => {
  it("draws one step for every value and says all values are the same, with no range in the legend", () => {
    const m = ok(run("day", run_("2026-06-01", "day", 14, () => 5), { window: 2 }));
    const steps = new Set(m.rows.flatMap((r) => r.cells).map((c) => c?.step));
    expect(steps.size).toBe(1);
    expect(m.legend).toBeNull();
    expect(m.caption).toContain("All values are the same.");
    expect(m.alt).toContain("Every value is 5.");
  });
});

describe("heatmapModel by week", () => {
  it("has ISO weeks 1 to 53 in columns and years in rows, oldest first", () => {
    const m = ok(run("week", run_("2024-01-01", "week", 83, (i) => i), { window: 2 }));
    expect(m.rows.map((r) => r.label)).toEqual(["2024", "2025"]);
    expect(m.columns).toHaveLength(53);
    // ISO week 1 of 2025 begins on Monday 2024-12-30, so 2025-01-06 is week 2.
    expect(m.rows[1].cells[0]).toMatchObject({ period: "2024-12-30", value: 52 });
    expect(m.rows[1].cells[1]).toMatchObject({ period: "2025-01-06", value: 53 });
    // Nothing is drawn after the newest week (2025-07-28, week 31).
    expect(m.rows[1].cells[30]).toMatchObject({ period: "2025-07-28", value: 82 });
    expect(m.rows[1].cells[31]).toBeNull();
    expect(m.rows[0].cells[0]).toMatchObject({ period: "2024-01-01", value: 0 });
  });

  it("draws week 53 only in a year that has one", () => {
    // 2026 has 53 ISO weeks (it ends on Monday 2026-12-28), 2025 has 52 and 2020 had 53.
    const m = ok(run("week", run_("2025-01-06", "week", 104, (i) => i + 1), { window: 2 }));
    expect(m.rows.map((r) => r.label)).toEqual(["2025", "2026"]);
    expect(m.rows[0].cells[52]).toBeNull();
    expect(m.rows[1].cells[52]).toMatchObject({ period: "2026-12-28" });
    // The first week of 2026 begins on 2025-12-29, which belongs to ISO year 2026, so it sits in week 1 of 2026.
    expect(m.rows[1].cells[0]).toMatchObject({ period: "2025-12-29", value: 52 });
    expect(m.rows[1].cells[0]?.label).toContain("week 1");
  });

  it("uses 3 years at the default window", () => {
    expect(ok(run("week", run_("2022-01-03", "week", 200, (i) => i))).rows).toHaveLength(3);
  });
});

describe("heatmapModel by month", () => {
  it("has the months of the year in columns and years in rows, 5 years at the default window", () => {
    const m = ok(run("month", run_("2022-01-01", "month", 54, (i) => i)));
    expect(m.rows).toHaveLength(5);
    expect(m.columns).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
    expect(m.rows[4].cells.map((c) => c?.period ?? null)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01", null, null, null, null, null, null]);
  });

  it("counts the window in years when it is not the default", () => {
    expect(ok(run("month", run_("2022-01-01", "month", 54, (i) => i), { window: 2 })).rows).toHaveLength(2);
  });

  it("starts the columns at the Workspace's year start, with rows named by that year", () => {
    // A year that starts in April: March 2026 is the last month of the year that began in April 2025.
    const m = ok(run("month", run_("2024-04-01", "month", 24, (i) => i + 1), { yearStart: 4, window: 2 }));
    expect(m.columns[0]).toBe("Apr");
    expect(m.columns[11]).toBe("Mar");
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0].label).toMatch(/24\/25|2024/);
    expect(m.rows[1].cells[0]).toMatchObject({ period: "2025-04-01", value: 13 });
    expect(m.rows[1].cells[11]).toMatchObject({ period: "2026-03-01", value: 24 });
  });

  it("leaves a missing month empty and says so", () => {
    const points = run_("2025-01-01", "month", 18, (i) => i).filter(([p]) => p !== "2025-06-01");
    const m = ok(run("month", points, { window: 2 }));
    expect(m.rows[0].cells[5]).toMatchObject({ period: "2025-06-01", value: null, step: null });
    expect(m.caption).toContain("An empty square has no value (1 period)");
  });
});

describe("heatmapModel refusals", () => {
  it("refuses a Metric by quarter or year in plain words", () => {
    const text = "A heatmap needs a Metric by day, week or month.";
    expect(run("quarter", [["2026-01-01", 1]])).toEqual({ ok: false, reason: text });
    expect(run("year", [["2026-01-01", 1]])).toEqual({ ok: false, reason: text });
  });
  it("says so when there is no value, or the window is not a count", () => {
    expect(run("month", [])).toMatchObject({ ok: false });
    expect(run("month", [["2026-01-01", NaN]])).toMatchObject({ ok: false });
    expect(run("month", [["2026-01-01", 1]], { window: 0 })).toMatchObject({ ok: false });
  });
  it("draws at most 20 years and says so", () => {
    const m = ok(run("month", run_("2000-01-01", "month", 300, (i) => i), { window: 40 }));
    expect(m.rows).toHaveLength(20);
    expect(m.caption).toContain("Showing the latest 20 years.");
  });
});
