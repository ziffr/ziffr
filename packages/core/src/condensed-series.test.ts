// Condensed Values in a series (spec 0033, ticket #380; GLOSSARY: Condensed Value, Display Period, Target Series): what
// a widget shows after a Retention condensed old periods. By every Display Period at or above the condensed one the
// numbers, the counts and the Targets are exactly the ones shown before; by a shorter one each Condensed Value is a
// point of its own, named for what it was made from, with a note, never invented days.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolverFrom } from "./compare";
import { partOfCondensed, partOfPoint, targetOfParts, targetPartOf, type CondensedPoint } from "./condensed-parts";
import { latestOfEach, pointName, seriesBy, shownSeries, targetsBy } from "./display-periods";
import { periodEnd, type YearStart } from "./periods";
import { condense, condensedTarget, condensesInto, retentionPlan, type CondenseInto } from "./retention-rules";
import { canvas, metric } from "./test/fixtures";
import { dayOf, textOf } from "./test/reference/calendar";
import { AGGREGATIONS, DISPLAYS, runs, series } from "./test/reference/check";
import type { Metric, Point } from "./types";

const AFTER = "2100-01-01";
const keep = (keep_months: number, into: CondenseInto) => ({ keep_months, then: "condense" as const, into });

/** What the plan condenses of a series on a day: the Condensed Values (with their Targets) and what is left. */
function condensedOf(m: Metric, into: CondenseInto, points: Point[], targets: Point[], now: string, months: number, ys: YearStart) {
  const stored = latestOfEach(points).map((p) => ({ period: p.period }));
  const plan = retentionPlan(keep(months, into), m, stored, now, ys);
  const spans = plan.condense.map((c) => {
    const made = condense(m, into, c.period, points, ys)!;
    return { ...made, periodEnd: periodEnd(c.period, into), target: condensedTarget(m, into, c.period, targets, ys), condensedOn: "2026-12-01" } satisfies CondensedPoint;
  });
  const gone = new Set(plan.condense.flatMap((c) => c.periods));
  const inSpan = (period: string) => spans.some((c) => period >= c.period && period <= c.periodEnd);
  return { spans, points: points.filter((p) => !gone.has(p.period)), targets: targets.filter((t) => !inSpan(t.period)) };
}

describe("a series with Condensed Values", () => {
  const ysFor = (own: string) => (own === "quarter" || own === "year" ? fc.constant(1 as YearStart) : fc.integer({ min: 1, max: 12 }).map((n) => n as YearStart));
  const today = fc.integer({ min: dayOf("2026-01-01"), max: dayOf("2030-12-31") }).map(textOf);

  for (const own of ["day", "week", "month", "quarter"] as const) {
    for (const aggregation of AGGREGATIONS.filter((a) => a !== "none")) {
      it(`${own} Metric, ${aggregation}: by every Display Period at or above the condensed one, values, counts and Targets are as before`, () => {
        const { numRuns, seed } = runs();
        fc.assert(
          fc.property(series(own), ysFor(own), today, fc.integer({ min: 13, max: 40 }), fc.constantFrom(...condensesInto(own)), fc.constantFrom("higher", "lower"), (g, ys, now, months, into, polarity) => {
            const m = { ...metric({ period: own, aggregation }), polarity } as Metric;
            // A Target for most periods, not all, so some spans have a whole Target Series and some do not.
            const targets = latestOfEach(g.points).filter((_, i) => i % 5 !== 3).map((p, i) => ({ period: p.period, value: 0.1 * (i % 4) }));
            const kept = condensedOf(m, into, g.points, targets, now, months, ys);
            for (const display of DISPLAYS.filter((d) => d !== "half" || into !== "year").filter((d) => DISPLAYS.indexOf(d) >= DISPLAYS.indexOf(into))) {
              const opts = { yearStart: ys, today: AFTER };
              const before = seriesBy(m, resolverFrom([m], { revenue: g.points }), display, opts);
              const after = seriesBy(m, resolverFrom([m], { revenue: kept.points }), display, { ...opts, condensed: kept.spans });
              expect(after, `${display}`).toEqual(before);
              if (!before.ok || !after.ok) continue;
              const was = targetsBy(m, targets, before.points, display, ys);
              const is = targetsBy(m, kept.targets, after.points, display, ys, kept.spans);
              expect(is.at, `targets by ${display}`).toEqual(was.at);
              expect(is.line).toEqual(was.line);
            }
          }),
          { numRuns: Math.ceil(numRuns / 2), seed },
        );
      });
    }
  }
});

describe("shown by a period shorter than the Condensed Value", () => {
  const day = (n: number) => `2024-03-${String(n).padStart(2, "0")}`;
  const m = metric({ period: "day", aggregation: "sum", polarity: "higher" });
  // March 2024 condensed from 31 days of 2 (62 in all, a Target of 3 a day), and one kept day in 2026.
  const march = condense(m, "month", "2024-03-01", Array.from({ length: 31 }, (_, i) => ({ period: day(i + 1), value: 2 })), 1)!;
  const targets = Array.from({ length: 31 }, (_, i) => ({ period: day(i + 1), value: 3 }));
  const condensed: CondensedPoint[] = [{ ...march, periodEnd: "2024-03-31", target: condensedTarget(m, "month", "2024-03-01", targets, 1), condensedOn: "2026-12-01" }];
  // February too, so the first quarter of 2024 has 60 of its 91 days and counts.
  const feb = condense(m, "month", "2024-02-01", Array.from({ length: 29 }, (_, i) => ({ period: `2024-02-${String(i + 1).padStart(2, "0")}`, value: 1 })), 1)!;
  condensed.unshift({ ...feb, periodEnd: "2024-02-29", target: null, condensedOn: "2026-12-01" });
  const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].map((period) => ({ period, value: 5 }));
  const data = canvas([m], { revenue: days }, { condensed: { 1: condensed } });

  it("draws one point for the span, named for what it was made from, and says so under the widget", () => {
    const s = shownSeries(m, data, undefined, { today: "2026-12-01" });
    expect(s.points.filter((p) => p.condensed).map((p) => [p.period, p.value, p.condensed?.into])).toEqual([["2024-02-01", 29, "month"], ["2024-03-01", 62, "month"]]);
    expect(s.points.map((p) => p.period)).toEqual(["2024-02-01", "2024-03-01", ...days.map((d) => d.period)]);
    expect(pointName(s.points[1], s.by, "day", 1)).toBe("March 2024, condensed from 31 days");
    expect(s.note).toBe("Before April 2024 shown by month, condensed from daily values.");
    // Its Target is the span's own: 31 days of 3.
    expect(s.targets?.at["2024-03-01"]).toEqual({ min: 93, max: null });
  });
  it("draws it among the weeks too, since a week is shorter than a month", () => {
    const s = shownSeries(m, data, "week", { today: "2026-12-01" });
    expect(s.points.filter((p) => p.condensed).map((p) => p.period)).toEqual(["2024-02-01", "2024-03-01"]);
    expect(s.points.map((p) => p.period)).toEqual(["2024-02-01", "2024-03-01", "2026-09-28"]);
  });
  it("counts it in the quarter, exactly as before", () => {
    const s = shownSeries(m, data, "quarter", { today: "2026-12-01" });
    expect(s.points.map((p) => [p.period, p.value, p.held, p.length])).toEqual([["2024-01-01", 91, 60, 91], ["2026-10-01", 5, 1, 92]]);
    expect(s.note).toBeUndefined();
  });
  it("names a span with gaps by what it held", () => {
    const some = condense(m, "month", "2024-03-01", Array.from({ length: 20 }, (_, i) => ({ period: day(i + 1), value: 1 })), 1)!;
    expect(pointName({ period: "2024-03-01", held: some.held, length: some.of, toDate: false, condensed: { into: "month" } }, "day", "day", 1)).toBe("March 2024, condensed from 20 of 31 days");
  });
  it("leaves a Derived Metric and a Metric without Condensed Values as they were", () => {
    const plain = shownSeries(m, canvas([m], { revenue: [{ period: "2026-10-01", value: 5 }] }), undefined, { today: "2026-12-01" });
    expect([plain.points.length, plain.note, plain.targets]).toEqual([1, undefined, null]);
  });
});

describe("the Target of a condensed span", () => {
  it("keeps a count, an exact sum and the last Target", () => {
    expect(targetPartOf([{ period: "2024-01-01", value: 0.1 }, { period: "2024-02-01", value: 0.2 }])).toEqual({ held: 2, sum: "0.3", last: { value: "0.2", day: "2024-02-01" } });
    expect(targetPartOf([])).toBeNull();
  });
  it("combines with Targets that stay, only when every period has one", () => {
    const part = targetPartOf([{ period: "2024-01-01", value: 0.1 }, { period: "2024-02-01", value: 0.1 }])!;
    expect(targetOfParts("sum", [{ period: "2024-03-01", value: 0.1 }], [part], 3)).toBe(0.3);
    expect(targetOfParts("average", [{ period: "2024-03-01", value: 0.4 }], [part], 3)).toBe(0.2);
    expect(targetOfParts("last", [{ period: "2024-03-01", value: 7 }], [part], 3)).toBe(7);
    expect(targetOfParts("sum", [], [part], 3)).toBeUndefined();
    expect(targetOfParts("none", [], [part], 2)).toBeUndefined();
  });
  it("is made of parts the same way values are", () => {
    const c = condense(metric({ period: "month", aggregation: "sum" }), "quarter", "2024-01-01", [{ period: "2024-01-01", value: 1 }], 1)!;
    expect(partOfCondensed({ ...c })).toEqual({ period: "2024-01-01", held: 1, sum: "1", last: null });
    expect(partOfPoint({ period: "2024-01-01", value: 1 }).sum).toBe("1");
  });
});
