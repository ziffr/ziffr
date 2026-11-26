// The made-up numbers of a Practice Workspace (spec 0063; GLOSSARY: Practice Workspace): the periods they cover, that
// they are believable for the Metric's unit and Polarity, that they never replace a value, and that targets reach to
// the end of the fiscal year.
import { describe, expect, it } from "vitest";
import { madeUpPeriods, madeUpTargets, madeUpValues, type MadeUpMetric } from "./practice-numbers";
import { JANUARY, periodStart } from "./periods";
import type { Period } from "./types";

const TODAY = "2026-11-26";
const metric = (over: Partial<MadeUpMetric> = {}): MadeUpMetric => ({ seed: "Revenue", period: "month", polarity: "higher", unit: "€", format: "currency", decimals: 0, targetMin: null, targetMax: null, ...over });
const PERIODS: Period[] = ["day", "week", "month", "quarter", "year"];

describe("the periods filled", () => {
  it.each([["day", "2025-01-01", "2026-11-26"], ["week", "2024-12-30", "2026-11-23"], ["month", "2025-01-01", "2026-11-01"], ["quarter", "2025-01-01", "2026-10-01"], ["year", "2024-01-01", "2026-01-01"]] as const)("for %s run from %s to the running one", (period, first, last) => {
    const periods = madeUpPeriods(period, TODAY, JANUARY);
    expect([periods[0] <= first, periods.at(-1)]).toEqual([true, last]);
    // Every period between, once, each the first day of one.
    expect(new Set(periods).size).toBe(periods.length);
    for (const p of periods) expect(periodStart(p, period, JANUARY)).toBe(p);
  });
  it.each(PERIODS)("cover the whole previous fiscal year for %s, whatever month it starts in, early in a year too", (period) => {
    for (const yearStart of [1, 4, 10] as const) {
      for (const today of [TODAY, "2027-01-02", `2026-${String(yearStart).padStart(2, "0")}-01`]) {
        const running = periodStart(today, "year", yearStart as never);
        const previous = `${Number(running.slice(0, 4)) - 1}${running.slice(4)}`;
        const periods = madeUpPeriods(period, today, yearStart as never);
        expect(periods[0] <= periodStart(previous, period, yearStart as never)).toBe(true);
        // Never fewer than 13 months back.
        expect(Date.parse(periods.at(-1)!) - Date.parse(periods[0])).toBeGreaterThanOrEqual(365 * 86_400_000);
      }
    }
  });
  it("hold enough to compare: 8 quarters, 3 years, 13 months and more of weeks and days", () => {
    expect(madeUpPeriods("quarter", "2026-02-01", JANUARY).length).toBeGreaterThanOrEqual(8);
    expect(madeUpPeriods("year", TODAY, JANUARY).length).toBeGreaterThanOrEqual(3);
    expect(madeUpPeriods("month", "2027-01-02", JANUARY).length).toBeGreaterThanOrEqual(14);
    expect(madeUpPeriods("week", TODAY, JANUARY).length).toBeGreaterThanOrEqual(58);
    expect(madeUpPeriods("day", TODAY, JANUARY).length).toBeGreaterThanOrEqual(397);
  });
  it("reach to the end of the current fiscal year for targets", () => {
    expect(madeUpPeriods("month", TODAY, JANUARY, true).at(-1)).toBe("2026-12-01");
    expect(madeUpPeriods("quarter", TODAY, 4 as never, true).at(-1)).toBe("2027-01-01");
    expect(madeUpPeriods("day", TODAY, JANUARY, true).at(-1)).toBe("2026-12-31");
  });
});

describe("the values", () => {
  const periods = madeUpPeriods("month", TODAY, JANUARY);
  it("are the same on a second run and different between Metrics", () => {
    const a = madeUpValues(metric(), periods, new Map());
    expect(madeUpValues(metric(), periods, new Map())).toEqual(a);
    expect(madeUpValues(metric({ seed: "Cost" }), periods, new Map())).not.toEqual(a);
    expect(a.size).toBe(periods.length);
  });
  it("never replace a value, and join on to the ones there are", () => {
    const existing = new Map(periods.slice(-6).map((p, i) => [p, 5000 + i * 10]));
    const made = madeUpValues(metric(), periods, existing);
    for (const p of existing.keys()) expect(made.has(p)).toBe(false);
    for (const v of made.values()) expect(v).toBeGreaterThan(2500);
    for (const v of made.values()) expect(v).toBeLessThan(10_000);
  });
  it.each<[string, Partial<MadeUpMetric>, number, number]>([
    ["a percentage", { unit: "%", format: "percent", decimals: 1 }, 0, 100],
    ["a count", { unit: "orders", format: "number" }, 0, 10_000],
    ["money", { unit: "€", format: "currency" }, 1000, 2_000_000],
    ["days", { unit: "days", format: "number", polarity: "lower", decimals: 1 }, 0, 100],
    ["a score", { unit: "NPS", format: "number" }, 0, 100],
  ])("are believable for %s", (_name, over, low, high) => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      for (const period of PERIODS) {
        const m = metric({ ...over, seed, period });
        for (const v of madeUpValues(m, madeUpPeriods(period, TODAY, JANUARY), new Map()).values()) {
          expect(v).toBeGreaterThanOrEqual(period === "month" ? low : 0);
          expect(v).toBeLessThanOrEqual(period === "year" || period === "quarter" ? high * 12 : high);
          expect(Number(v.toFixed(m.decimals))).toBe(v);
        }
      }
    }
  });
  it("grow where higher is better and shrink where lower is, year on year", () => {
    for (const [polarity, grows] of [["higher", true], ["lower", false]] as const) {
      for (const seed of ["a", "b", "c", "d"]) {
        const made = madeUpValues(metric({ seed, polarity }), periods, new Map());
        const sum = (year: string) => [...made].filter(([p]) => p.startsWith(year) && p.slice(5) <= "10-01").reduce((n, [, v]) => n + v, 0);
        expect(sum("2026") > sum("2025")).toBe(grows);
      }
    }
  });
  it("move around a Target Range, never far off it", () => {
    const made = madeUpValues(metric({ targetMin: 1000 }), periods, new Map());
    const last = made.get(periods.at(-1)!)!;
    expect(last).toBeGreaterThan(700);
    expect(last).toBeLessThan(1300);
  });
});

describe("the targets", () => {
  const ahead = madeUpPeriods("month", TODAY, JANUARY, true);
  it("cover the previous and the whole current fiscal year", () => {
    const made = madeUpTargets(metric(), ahead, madeUpValues(metric(), madeUpPeriods("month", TODAY, JANUARY), new Map()));
    expect([...made.keys()]).toEqual(ahead);
    expect(ahead.at(-1)).toBe("2026-12-01");
    for (const v of made.values()) expect(v).toBeGreaterThan(0);
  });
  it("follow a Target Range where there is one", () => {
    const made = madeUpTargets(metric({ targetMin: 1000 }), ahead, new Map());
    expect(made.get("2026-11-01") ?? made.get("2026-12-01")).toBeGreaterThan(900);
    for (const v of made.values()) expect(v).toBeLessThan(1200);
  });
  it("are none for a Metric whose Polarity asks for no direction and has no range", () => {
    expect(madeUpTargets(metric({ polarity: "target" }), ahead, new Map()).size).toBe(0);
  });
});
