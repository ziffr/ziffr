// The cumulative mark (GLOSSARY: Fiscal Year, Target Series): what it draws is worked out here, so the tests check the
// sums against hand-worked numbers, the alignment of the years, and every refusal against what the person is told.
import { describe, expect, it } from "vitest";
import { NOT_ADDED, NO_PLAN, runningTotal, TOO_COARSE } from "./running-total";
import { sampleData } from "./sample-data";
import { shiftPeriod, type YearStart } from "./periods";
import type { Metric, Point } from "./types";

const base: Metric = { ...sampleData("month").metrics[1], id: 1, slug: "orders", name: "Orders", unit: "", format: "number", decimals: 0, polarity: "higher", target_min: null, target_max: null, aggregation: "sum", period: "month" };
const metric = (extra: Partial<Metric> = {}): Metric => ({ ...base, ...extra });
const months = (from: string, ...values: (number | null)[]): Point[] => values.flatMap((v, i) => (v === null ? [] : [{ period: shiftPeriod(from, "month", i), value: v }]));
const run = (over: Partial<Parameters<typeof runningTotal>[0]> & { points: Point[] }) => runningTotal({ metric: metric(), yearStart: 1 as YearStart, today: "2026-07-15", style: "1,234.5", ...over });
const ok = (m: ReturnType<typeof runningTotal>) => { if (!m.ok) throw new Error(`refused: ${m.reason}`); return m; };
const line = (m: ReturnType<typeof runningTotal>, key: "now" | "plan" | "last") => ok(m).lines.find((l) => l.key === key);

describe("runningTotal", () => {
  it("adds up the year so far, restarting each year, and lines last year up by place", () => {
    const points = [...months("2025-01-01", 10, 10, 10, 10), ...months("2026-01-01", 5, 6, 7)];
    const m = ok(run({ points, today: "2026-03-20" }));
    expect(line(m, "now")!.points).toEqual([{ at: 0, total: 5 }, { at: 1, total: 11 }, { at: 2, total: 18 }]);
    expect(line(m, "last")!.points).toEqual([{ at: 0, total: 10 }, { at: 1, total: 20 }, { at: 2, total: 30 }, { at: 3, total: 40 }]);
    expect(m.slots).toBe(12);
    expect(line(m, "now")!.end).toBe("18");
  });

  it("refuses a Metric that does not add up, in words", () => {
    for (const aggregation of ["average", "last", "none"] as const) {
      const r = run({ metric: metric({ aggregation }), points: months("2026-01-01", 1, 2) });
      expect(r).toEqual({ ok: false, reason: NOT_ADDED });
    }
    expect(NOT_ADDED).toBe("A running total needs a Metric that adds up over the year (its Aggregation is sum).");
    expect(run({ metric: metric({ period: "year" }), points: [{ period: "2026-01-01", value: 1 }] })).toEqual({ ok: false, reason: TOO_COARSE });
    expect(run({ points: [] })).toMatchObject({ ok: false });
  });

  it("starts the year in the Workspace's year start month", () => {
    // A year starting in April: January 2026 belongs to the year that began in April 2025.
    const points = [...months("2025-04-01", 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1), ...months("2026-04-01", 2, 2)];
    const m = ok(run({ points, yearStart: 4, today: "2026-05-20" }));
    expect(line(m, "now")!.points).toEqual([{ at: 0, total: 2 }, { at: 1, total: 4 }]);
    expect(line(m, "last")!.points.at(-1)).toEqual({ at: 11, total: 12 });
    expect(m.ticks[0].label).toBe("Apr 26");
    // Today in February 2026 is still the year that began in April 2025.
    const earlier = ok(run({ points, yearStart: 4, today: "2026-02-10" }));
    expect(line(earlier, "now")!.points.at(-1)).toEqual({ at: 11, total: 12 });
  });

  it("counts a week Metric by its place in the year, 52 or 53 weeks", () => {
    const weeks = (from: string, n: number, v: number): Point[] => Array.from({ length: n }, (_, i) => ({ period: shiftPeriod(from, "week", i), value: v }));
    // 53 weeks start in 2024 (the last on 30 December); the first week to start in 2025 is 6 January.
    const points = [...weeks("2024-01-01", 53, 1), ...weeks("2025-01-06", 3, 10)];
    const m = ok(run({ metric: metric({ period: "week" }), points, today: "2025-01-28" }));
    expect(line(m, "now")!.points).toEqual([{ at: 0, total: 10 }, { at: 1, total: 20 }, { at: 2, total: 30 }]);
    // Last year's 53rd week still has its place, so the axis has room for it.
    expect(m.slots).toBe(53);
    expect(line(m, "last")!.points.at(-1)!.at).toBe(52);
  });

  it("continues over a missing period and names it, never inventing a zero", () => {
    const m = ok(run({ points: months("2026-01-01", 5, null, null, 4), today: "2026-06-10" }));
    expect(line(m, "now")!.points).toEqual([{ at: 0, total: 5 }, { at: 3, total: 9 }]);
    expect(m.notes.join(" ")).toContain("No value for Feb 26 and Mar 26: the line goes on");
    // Last year's gaps do not stop its line either.
    const both = ok(run({ points: [...months("2025-01-01", 1, null, 1), ...months("2026-01-01", 5)], today: "2026-02-10" }));
    expect(line(both, "last")!.points).toEqual([{ at: 0, total: 1 }, { at: 2, total: 2 }]);
  });

  it("lines days up by their date across a leap year", () => {
    const days = (from: string, n: number): Point[] => Array.from({ length: n }, (_, i) => ({ period: shiftPeriod(from, "day", i), value: 1 }));
    // 2024 is a leap year (366 days); 2025 is not. The year being drawn is 2025, last year the leap one.
    const m = ok(run({ metric: metric({ period: "day" }), points: [...days("2024-01-01", 366), ...days("2025-01-01", 70)], today: "2025-03-12" }));
    expect(m.slots).toBe(365);
    expect(line(m, "now")!.points.at(-1)).toEqual({ at: 69, total: 70 });
    // 1 March is place 59 in 2025; last year it came a day later in the count (61 days in), at the same place on the axis.
    expect(line(m, "last")!.points.find((p) => p.at === 59)!.total).toBe(61);
    // 29 February has no place in 2025: its value is in the totals after it.
    expect(line(m, "last")!.points.at(-1)).toEqual({ at: 364, total: 366 });
    // The other way round: this year leap, last year not.
    const leap = ok(run({ metric: metric({ period: "day" }), points: [...days("2023-01-01", 365), ...days("2024-01-01", 70)], today: "2024-03-12" }));
    expect(leap.slots).toBe(366);
    expect(line(leap, "last")!.points.find((p) => p.at === 60)!.total).toBe(60);
  });

  it("plans from the Target Series, adding it up, and says how the total stands in words", () => {
    const targets = months("2026-01-01", 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10);
    const behind = ok(run({ points: months("2026-01-01", 8, 8, 8), targets, today: "2026-03-20" }));
    expect(line(behind, "plan")!.points.at(-1)).toEqual({ at: 11, total: 120 });
    expect(line(behind, "plan")!.end).toBe("120");
    // 24 of 30: 80 % of plan, 6 behind; March is still running, so the comparison is made at February (16 of 20).
    expect(line(behind, "now")!.words).toBe("80 % of plan, 4 behind");
    expect(behind.status).toBe("off");
    expect(behind.notes.join(" ")).toContain("Mar 26 is still running, so the comparison is made at Feb 26");
    const ahead = ok(run({ points: months("2026-01-01", 12, 12), targets, today: "2026-04-10" }));
    expect(line(ahead, "now")!.words).toBe("ahead of plan by 4");
    expect(ahead.status).toBe("on");
    expect(ok(run({ points: months("2026-01-01", 10, 10), targets, today: "2026-04-10" })).lines[0].words).toBe("on plan");
  });

  it("says a plan period that has no target, and that lower is ahead where lower is better", () => {
    const m = ok(run({ metric: metric({ polarity: "lower" }), points: months("2026-01-01", 8, 8), targets: months("2026-01-01", 10, null, 10), today: "2026-04-10" }));
    expect(m.notes.join(" ")).toContain("No plan for Feb 26");
    expect(line(m, "plan")!.points).toEqual([{ at: 0, total: 10 }, { at: 2, total: 20 }]);
    // At February the plan holds 10 (January only), the total 16: more than planned, so off for a Metric where lower is better.
    expect(m.status).toBe("off");
    const low = ok(run({ metric: metric({ polarity: "lower" }), points: months("2026-01-01", 8, 8), targets: months("2026-01-01", 10, 10), today: "2026-04-10" }));
    expect(line(low, "now")!.words).toBe("ahead of plan by 4");
    expect(low.status).toBe("on");
  });

  it("derives a plan from a target with one bound, saying so, and draws none for a range or no target", () => {
    const one = ok(run({ metric: metric({ target_min: 5 }), points: months("2026-01-01", 5, 6, 7), today: "2026-04-10" }));
    expect(line(one, "plan")!.points.slice(0, 3)).toEqual([{ at: 0, total: 5 }, { at: 1, total: 10 }, { at: 2, total: 15 }]);
    expect(one.notes.join(" ")).toContain("Plan: the target of 5 each month, added up.");
    const range = ok(run({ metric: metric({ target_min: 5, target_max: 9 }), points: months("2026-01-01", 5, 6, 7), today: "2026-04-10" }));
    expect(line(range, "plan")).toBeUndefined();
    expect(range.notes).toContain(NO_PLAN);
    expect(range.status).toBeNull();
    expect(range.lines[0].words).toBeNull();
    expect(range.alt).toContain("no plan");
    const none = ok(run({ points: months("2026-01-01", 5), today: "2026-04-10" }));
    expect(none.notes).toContain(NO_PLAN);
  });

  it("says last year has no values when it has none, and writes every number in the text alternative", () => {
    const m = ok(run({ points: months("2026-01-01", 5, 6), targets: months("2026-01-01", 5, 5), today: "2026-03-10" }));
    expect(m.notes).toContain("No values for last year.");
    expect(line(m, "last")).toBeUndefined();
    expect(m.alt).toContain("Running total of Orders since the start of");
    expect(m.alt).toContain("This year: 11 (ahead of plan by 1)");
    expect(m.alt).toContain("Plan: 10");
  });

  it("uses the year of the latest value when the current year has none yet", () => {
    const m = ok(run({ points: months("2025-01-01", 1, 2), today: "2026-02-10" }));
    expect(line(m, "now")!.points).toEqual([{ at: 0, total: 1 }, { at: 1, total: 3 }]);
  });
});
