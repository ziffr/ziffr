import { describe, expect, it } from "vitest";
import { resolverFrom } from "./compare";
import { commonPeriod, comparedBy, correlate, MIN_PAIRS, pearson, rankCorrelations, strength } from "./correlation";
import { JANUARY } from "./periods";
import { metric, months } from "./test/fixtures";
import type { Point } from "./types";

const yearStart = JANUARY;

/** Weekly points from a Monday, one value per week. */
function weeks(monday: string, values: number[]): Point[] {
  const [y, m, d] = monday.split("-").map(Number);
  return values.map((value, i) => ({ period: new Date(Date.UTC(y, m - 1, d + 7 * i)).toISOString().slice(0, 10), value }));
}

/** Weekly values added up by the month each week starts in, as seriesBy does for a summed Metric. */
function byMonth(points: Point[]): Point[] {
  const sums = new Map<string, number>();
  for (const p of points) sums.set(`${p.period.slice(0, 7)}-01`, (sums.get(`${p.period.slice(0, 7)}-01`) ?? 0) + p.value);
  return [...sums].map(([period, value]) => ({ period, value }));
}

const tickets = metric({ id: 2, slug: "support-tickets", name: "Support tickets", period: "week", aggregation: "sum", format: "number", unit: "" });
const churn = metric({ id: 3, slug: "churn", name: "Churn", period: "month", aggregation: "average", format: "percent", unit: "%" });
// 40 weeks from Monday 6 January 2025: the last one starts on 6 October 2025.
const weekly = weeks("2025-01-06", Array.from({ length: 40 }, (_, i) => 10 + ((i * 7) % 13)));
// Churn moves exactly with the month's tickets, plus a month (October) the weekly data barely reaches.
const monthly = byMonth(weekly).map((p) => ({ ...p, value: p.value / 10 }));

describe("pearson and strength", () => {
  it("needs six common periods", () => {
    const a = months("2025-01", [1, 2, 3, 4, 5]);
    expect(pearson(a, a)).toBeNull();
    expect(pearson(months("2025-01", [1, 2, 3, 4, 5, 6]), months("2025-01", [2, 4, 6, 8, 10, 12]))).toMatchObject({ n: 6 });
    expect(pearson(months("2025-01", [1, 2, 3, 4, 5, 6]), months("2025-01", [2, 4, 6, 8, 10, 12]))!.r).toBeCloseTo(1);
  });
  it("pairs only periods both series have", () => {
    const res = pearson(months("2025-01", [1, 2, 3, 4, 5, 6, 7, 8]), months("2025-03", [3, 1, 4, 1, 5, 9, 2, 6]));
    expect(res?.pairs.map((p) => p.period)).toEqual(["2025-03-01", "2025-04-01", "2025-05-01", "2025-06-01", "2025-07-01", "2025-08-01"]);
  });
  it("is 1 for identical series and -1 for mirrored ones", () => {
    const a = months("2025-01", [3, 1, 4, 1, 5, 9, 2]);
    expect(pearson(a, a)!.r).toBeCloseTo(1);
    expect(pearson(a, a.map((p) => ({ ...p, value: -p.value })))!.r).toBeCloseTo(-1);
  });
  it("refuses a series that does not change, rather than give r = NaN", () => {
    const flat = metric({ id: 9, slug: "flat", name: "Flat" });
    const r = resolverFrom([metric(), flat], { revenue: months("2025-01", [1, 2, 3, 4, 5, 6]), flat: months("2025-01", [7, 7, 7, 7, 7, 7]) });
    expect(Number.isNaN(pearson(months("2025-01", [1, 2, 3, 4, 5, 6]), months("2025-01", [7, 7, 7, 7, 7, 7]))!.r)).toBe(true);
    expect(correlate(metric(), flat, r, { yearStart })).toMatchObject({ ok: false, n: 6, reason: "One of them does not change, so there is nothing to compare." });
  });
  it("names the strength, bands at their edges", () => {
    expect(strength(0.71)).toBe("strong positive");
    expect(strength(0.7)).toBe("moderate positive");
    expect(strength(0.4)).toBe("weak positive");
    expect(strength(-0.2)).toBe("no clear");
    expect(strength(0.9)).toBe("strong positive");
    expect(strength(-0.5)).toBe("moderate negative");
    expect(strength(0.3)).toBe("weak positive");
    expect(strength(-0.1)).toBe("no clear");
  });
});

describe("correlate", () => {
  const resolve = resolverFrom([tickets, churn], { "support-tickets": weekly, churn: monthly });

  it("compares a weekly and a monthly Metric by month, the weeks added up", () => {
    expect(commonPeriod("week", "month")).toBe("month");
    const res = correlate(churn, tickets, resolve, { yearStart, today: "2026-03-01" });
    expect(res).toMatchObject({ ok: true, period: "month", combined: true });
    if (!res.ok) throw new Error(res.reason);
    expect(res.r).toBeCloseTo(1);
    // January to October 2025; October has one week of five, too little to count, so nine months.
    expect(res.n).toBe(9);
    expect(res.pairs[0]).toEqual({ period: "2025-01-01", x: monthly[0].value, y: monthly[0].value * 10 });
    expect(comparedBy(res)).toBe("Compared by month (9 months)");
  });

  it("leaves out the month still to date", () => {
    // On 8 October the month holds its one week so far: to date, so it does not count.
    const res = correlate(tickets, churn, resolve, { yearStart, today: "2025-10-08" });
    expect(res.ok && res.pairs.map((p) => p.period)).not.toContain("2025-10-01");
    expect(res.n).toBe(9);
    // Pairs carry the first Metric as x, whichever is shorter.
    expect(res.ok && res.pairs[0].x).toBe(monthly[0].value * 10);
  });

  it("refuses fewer than six common months, with the count", () => {
    const short = resolverFrom([tickets, churn], { "support-tickets": weekly.slice(0, 20), churn: monthly });
    // 20 weeks reach 19 May: January to May, five months.
    expect(correlate(churn, tickets, short, { yearStart, today: "2026-03-01" })).toEqual({ ok: false, period: "month", n: 5, reason: `Not enough months in common (5 of ${MIN_PAIRS}).` });
  });

  it("keeps a Metric with Aggregation none to its own period, and says why", () => {
    const none = { ...tickets, aggregation: "none" as const };
    const weeklyToo = metric({ id: 4, slug: "visits", name: "Visits", period: "week" });
    const r = resolverFrom([none, churn, weeklyToo], { "support-tickets": weekly, churn: monthly, visits: weekly.map((p) => ({ ...p, value: p.value * 3 })) });
    expect(correlate(churn, none, r, { yearStart, today: "2026-03-01" })).toMatchObject({ ok: false, reason: "Aggregation none: Support tickets is compared only with weekly Metrics." });
    const same = correlate(none, weeklyToo, r, { yearStart, today: "2026-03-01" });
    expect(same).toMatchObject({ ok: true, period: "week", combined: false, n: 40 });
    expect(comparedBy(same)).toBeNull();
  });

  it("never compares a Derived Metric with a Metric it is built from, at any period", () => {
    const perMonth = metric({ id: 5, slug: "tickets-per-churn", name: "Tickets per churn", period: "month", formula: "{support-tickets} / {churn}", aggregation: "none" });
    const r = resolverFrom([tickets, churn, perMonth], { "support-tickets": weekly, churn: monthly, "tickets-per-churn": monthly });
    expect(correlate(tickets, perMonth, r, { yearStart, today: "2026-03-01" })).toMatchObject({ ok: false, reason: "Tickets per churn is calculated from the other." });
    expect(rankCorrelations(tickets, [tickets, churn, perMonth], r, { yearStart, today: "2026-03-01" }).ranked.map((x) => x.metric.slug)).toEqual(["churn"]);
  });
});

describe("rankCorrelations", () => {
  it("ranks Metrics of every period by |r| and names those left out", () => {
    const noise = metric({ id: 6, slug: "visits", name: "Visits", period: "month", aggregation: "sum" });
    const flat = metric({ id: 7, slug: "nps", name: "NPS", period: "week", aggregation: "none" });
    const r = resolverFrom([churn, tickets, noise, flat], {
      churn: monthly,
      "support-tickets": weekly,
      visits: months("2025-01", [5, 3, 8, 1, 9, 2, 7, 4, 6, 5]),
      nps: weekly,
    });
    const { ranked, leftOut } = rankCorrelations(churn, [churn, tickets, noise, flat], r, { yearStart, today: "2026-03-01" });
    expect(ranked.map((x) => x.metric.slug)).toEqual(["support-tickets", "visits"]);
    expect(ranked[0].result.combined).toBe(true);
    expect(ranked[1].result).toMatchObject({ combined: false, n: 10 });
    expect(leftOut).toEqual([{ metric: flat, reason: "Aggregation none: NPS is compared only with weekly Metrics." }]);
  });
});
