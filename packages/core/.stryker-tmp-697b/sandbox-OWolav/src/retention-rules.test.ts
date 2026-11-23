// @ts-nocheck
// Retention rules (spec 0033, ticket #379): the setting and its limits, which periods are affected on a day, the
// Condensed Value by Aggregation, and the invariant: a series by every Display Period at or above the condensed one
// is identical before and after condensing, checked over generated series against the reference.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { latestOfEach, resolverFrom, seriesBy } from "./display-periods";
import { periodEnd, type YearStart } from "./periods";
import {
  CANNOT_CONDENSE, CANCEL_DAYS, DERIVED_HAS_NONE, MAX_KEEP_MONTHS, MIN_KEEP_MONTHS, canCondense, condense, condensesInto, firstRunDay, keptFrom, parseRetention, reminderDay, retentionPlan, retentionProblem, seriesFromParts,
  type CondenseInto, type Retention, type RetentionMetric,
} from "./retention-rules";
import { partOfPoint, valueOfParts, type Part } from "./condensed-parts";
import { dayOf, textOf } from "./test/reference/calendar";
import { AGGREGATIONS, DISPLAYS, runs, series } from "./test/reference/check";
const AFTER = "2040-01-01"; // a day after every generated series: every span is over
import { referenceSeries } from "./test/reference/combine";
import { exactOf, nearestDoubleOf, same } from "./test/reference/exact";
import { referenceCondensed, referenceKeptFrom, referencePlan } from "./test/reference/retention";
import type { Aggregation, Metric, Period } from "./types";

const m = (period: Period, aggregation: Aggregation = "sum", formula: string | null = null): RetentionMetric => ({ period, aggregation, formula });
const keep = (keep_months: number, into: CondenseInto): Retention => ({ keep_months, then: "condense", into });
const del = (keep_months: number): Retention => ({ keep_months, then: "delete" });
const p = (period: string, value: number) => ({ period, value });

describe("the setting and its limits", () => {
  it("has a floor of 13 months, a ceiling and 7 days to cancel", () => {
    expect([MIN_KEEP_MONTHS, MAX_KEEP_MONTHS, CANCEL_DAYS]).toEqual([13, 1200, 7]);
  });
  it("offers the longer periods a Metric condenses into, without half-years", () => {
    expect(condensesInto("day")).toEqual(["week", "month", "quarter", "year"]);
    expect(condensesInto("week")).toEqual(["month", "quarter", "year"]);
    expect(condensesInto("month")).toEqual(["quarter", "year"]);
    expect(condensesInto("quarter")).toEqual(["year"]);
    expect(condensesInto("year")).toEqual([]);
  });
  it("condenses only stored values with an Aggregation", () => {
    expect(canCondense({ aggregation: "sum" })).toBe(true);
    expect(canCondense({ aggregation: "average", formula: null })).toBe(true);
    expect(canCondense({ aggregation: "last", formula: "" })).toBe(true);
    expect(canCondense({ aggregation: "none" })).toBe(false);
    expect(canCondense({ aggregation: "sum", formula: "{a}+{b}" })).toBe(false);
  });
  it("refuses what does not fit the Metric, and says why", () => {
    expect(retentionProblem(keep(13, "month"), m("day"))).toBeNull();
    expect(retentionProblem(del(13), m("day", "none"))).toBeNull();
    expect(retentionProblem(keep(13, "month"), m("day", "none"))).toBe(CANNOT_CONDENSE);
    expect(retentionProblem(del(13), m("day", "sum", "{a}"))).toBe(DERIVED_HAS_NONE);
    expect(retentionProblem(del(12), m("day"))).toMatch(/at least 13 months/);
    expect(retentionProblem(del(13.5), m("day"))).toMatch(/whole number/);
    expect(retentionProblem(del(1200), m("day"))).toBeNull();
    expect(retentionProblem(del(1201), m("day"))).toMatch(/at most 1200/);
    expect(retentionProblem(keep(13, "week"), m("month"))).toBe("A month Metric cannot be condensed into weeks.");
    expect(retentionProblem(keep(13, "year"), m("year"))).toMatch(/cannot be condensed/);
  });
  it("reads a setting from untrusted input strictly", () => {
    expect(parseRetention(null)).toEqual({ ok: true, retention: null });
    expect(parseRetention({ keep_months: 24, then: "delete" })).toEqual({ ok: true, retention: del(24) });
    expect(parseRetention({ keep_months: 13, then: "condense", into: "quarter" })).toEqual({ ok: true, retention: keep(13, "quarter") });
    for (const bad of [undefined, "x", 5, [], { keep_months: 24 }, { keep_months: 24, then: "purge" }, { keep_months: 24, then: "delete", into: "month" }, { keep_months: 24, then: "condense" }, { keep_months: 24, then: "condense", into: "half" }, { keep_months: 24, then: "condense", into: "day" }, { keep_months: 24, then: "delete", extra: 1 }, { keep_months: 24, then: "purge", into: "month" }, { keep_months: 24, then: "condense", into: "half" }, { keep_months: 24, then: "delete", __proto__: { x: 1 }, y: 2 }]) {
      expect(parseRetention(bad), JSON.stringify(bad)).toEqual({ ok: false, reason: "That is not a Retention." });
    }
    for (const months of [12, 1201, 24.5, "24", null, NaN, Infinity]) {
      expect(parseRetention({ keep_months: months, then: "delete" }), String(months)).toEqual({ ok: false, reason: expect.stringMatching(/whole number of months, from 13 to 1200/) });
    }
    expect(parseRetention({ keep_months: 13, then: "delete" }).ok).toBe(true);
    expect(parseRetention({ keep_months: 1200, then: "delete" }).ok).toBe(true);
  });
  it("measures the keep time back from today, a short month ending sooner", () => {
    expect(keptFrom("2026-11-20", 13)).toBe("2025-10-20");
    expect(keptFrom("2027-03-31", 13)).toBe("2026-02-28");
    expect(keptFrom("2028-03-31", 25)).toBe("2026-02-28");
    expect(keptFrom("2028-02-29", 12)).toBe("2027-02-28");
    expect(keptFrom("2028-02-29", 48)).toBe("2024-02-29");
  });
  it("starts on the 8th day and reminds the day before", () => {
    expect(firstRunDay("2026-11-20")).toBe("2026-11-28");
    expect(reminderDay("2026-11-20")).toBe("2026-11-27");
    expect(firstRunDay("2026-12-28")).toBe("2027-01-05");
  });
});

describe("which periods are affected", () => {
  const today = "2026-11-20"; // keeps from 2025-10-20 at 13 months
  it("deletes periods that ended before the keep time, not those still inside it", () => {
    const stored = [{ period: "2025-08-01", locked: true }, { period: "2025-09-01" }, { period: "2025-10-01" }, { period: "2026-10-01" }];
    const plan = retentionPlan(del(13), m("month"), stored, today, 1);
    expect(plan).toEqual({ keptFrom: "2025-10-20", delete: ["2025-08-01", "2025-09-01"], deletedLocked: 1, condense: [], heldBack: [], uneven: [] });
  });
  it("treats a period ending on the first kept day as kept, and one before it as older", () => {
    // 13 months back from 1 November 2026 is 1 October 2025.
    const days = [{ period: "2025-10-01" }, { period: "2025-09-30" }, { period: "2025-09-29" }];
    expect(retentionPlan(del(13), m("day"), days, "2026-11-01", 1).delete).toEqual(["2025-09-29", "2025-09-30"]);
    expect(retentionPlan(del(13), m("day"), days, "2026-11-01", 1).keptFrom).toBe("2025-10-01");
  });
  it("leaves periods held back by open work, and deletes the rest", () => {
    const plan = retentionPlan(del(13), m("month"), [{ period: "2025-08-01", heldBack: true }, { period: "2025-09-01" }], today, 1);
    expect([plan.delete, plan.heldBack]).toEqual([["2025-09-01"], ["2025-08-01"]]);
  });
  it("condenses a span only when all its periods are older, locked when every period was", () => {
    const stored = ["2025-04-01", "2025-05-01", "2025-06-01", "2025-07-01", "2025-08-01", "2025-09-01"].map((period) => ({ period, locked: period < "2025-09-01" }));
    const plan = retentionPlan(keep(13, "quarter"), m("month"), stored, today, 1);
    expect(plan.condense).toEqual([
      { period: "2025-04-01", periods: ["2025-04-01", "2025-05-01", "2025-06-01"], locked: true },
      { period: "2025-07-01", periods: ["2025-07-01", "2025-08-01", "2025-09-01"], locked: false },
    ]);
    // October's quarter is not over the keep time: its September-ending neighbour is, October is not.
    const waiting = retentionPlan(keep(13, "quarter"), m("month"), [...stored, { period: "2025-10-01" }], today, 1);
    expect(waiting.condense.map((c) => c.period)).toEqual(["2025-04-01", "2025-07-01"]);
  });
  it("waits for a span whose last period is still inside the keep time", () => {
    const plan = retentionPlan(keep(13, "quarter"), m("month"), [{ period: "2025-07-01" }, { period: "2025-08-01" }], "2026-09-30", 1);
    expect(plan.condense).toEqual([]);
    const later = retentionPlan(keep(13, "quarter"), m("month"), [{ period: "2025-07-01" }, { period: "2025-08-01" }], "2026-11-01", 1);
    expect(later.condense).toHaveLength(1);
  });
  it("waits when the span's last period ends on the first kept day", () => {
    // 13 months back from 30 October 2026 is 30 September 2025: September ends on it, so it is kept.
    const jul = [{ period: "2025-07-01" }, { period: "2025-08-01" }, { period: "2025-09-01" }];
    expect(retentionPlan(keep(13, "quarter"), m("month"), jul, "2026-10-30", 1).condense).toEqual([]);
    expect(retentionPlan(keep(13, "quarter"), m("month"), jul, "2026-11-01", 1).condense).toHaveLength(1);
  });
  it("sorts what it is given: oldest first, in any order", () => {
    const plan = retentionPlan(del(13), m("month"), [{ period: "2025-03-01" }, { period: "2025-01-01" }, { period: "2025-02-01" }], today, 1);
    expect(plan.delete).toEqual(["2025-01-01", "2025-02-01", "2025-03-01"]);
    const parts = ["2025-03-01", "2025-01-01", "2025-02-01"].map((d) => partOfPoint(p(d, 1)));
    expect(seriesFromParts("sum", "month", "quarter", parts, 1)).toEqual([{ period: "2025-01-01", value: 3, held: 3, length: 3 }]);
  });
  it("holds a whole span back when one of its periods is held back", () => {
    const stored = [{ period: "2025-04-01" }, { period: "2025-05-01", heldBack: true }, { period: "2025-06-01" }];
    const plan = retentionPlan(keep(13, "quarter"), m("month"), stored, today, 1);
    expect([plan.condense, plan.heldBack]).toEqual([[], ["2025-04-01", "2025-05-01", "2025-06-01"]]);
  });
  it("follows the Fiscal Year for quarters", () => {
    const stored = ["2025-02-01", "2025-03-01", "2025-04-01"].map((period) => ({ period }));
    const plan = retentionPlan(keep(13, "quarter"), m("month"), stored, today, 2);
    expect(plan.condense.map((c) => c.period)).toEqual(["2025-02-01"]);
  });
  it("leaves a week across two months as days: the month would count it whole", () => {
    const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => ({ period: textOf(dayOf(from) + i) }));
    // 2025-09-29 is a Monday; its week ends on 5 October. The week of 15 September lies in one month.
    const plan = retentionPlan(keep(13, "week"), m("day"), [...days("2025-09-15", 7), ...days("2025-09-29", 7)], today, 1);
    expect(plan.condense.map((c) => c.period)).toEqual(["2025-09-15"]);
    expect(plan.uneven).toEqual(days("2025-09-29", 7).map((d) => d.period));
    // Into a month, the same days are all condensed once the month is over.
    expect(retentionPlan(keep(13, "month"), m("day"), days("2025-09-15", 7), today, 1).condense).toHaveLength(1);
  });
  it("condenses weeks into months by the month their Monday is in", () => {
    const plan = retentionPlan(keep(13, "month"), m("week"), ["2025-09-01", "2025-09-08", "2025-09-15", "2025-09-22", "2025-09-29"].map((period) => ({ period })), today, 1);
    expect(plan.condense).toEqual([{ period: "2025-09-01", periods: ["2025-09-01", "2025-09-08", "2025-09-15", "2025-09-22", "2025-09-29"], locked: false }]);
  });
  it("refuses a setting that does not fit, and never touches a period inside the keep time", () => {
    expect(() => retentionPlan(keep(13, "month"), m("day", "none"), [], today, 1)).toThrow(CANNOT_CONDENSE);
    const inside = retentionPlan(keep(13, "month"), m("day"), [{ period: "2026-10-01" }], today, 1);
    expect(inside).toMatchObject({ delete: [], condense: [], heldBack: [], uneven: [] });
  });
});

describe("a Condensed Value", () => {
  const into = "month" as const;
  const month = (day: number) => `2026-03-${String(day).padStart(2, "0")}`;
  it("keeps the exact sum and the count for a sum and an average", () => {
    const values = [p(month(1), 0.1), p(month(2), 0.2), p(month(3), 1e-7)];
    expect(condense(m("day", "sum"), into, "2026-03-01", values, 1)).toEqual({ period: "2026-03-01", into, held: 3, of: 31, sum: "0.3000001", last: null, locked: false });
    expect(condense(m("day", "average"), into, "2026-03-01", values, 1, true)).toMatchObject({ held: 3, sum: "0.3000001", locked: true });
  });
  it("writes sums plainly: no trailing zeros, no minus zero, whole numbers whole", () => {
    const sum = (...vs: number[]) => condense(m("day"), into, "2026-03-01", vs.map((v, i) => p(month(i + 1), v)), 1)!.sum;
    expect(sum(1.5, 1.5)).toBe("3");
    expect(sum(0.25, 0.75)).toBe("1");
    expect(sum(-0.5, 0.5)).toBe("0");
    expect(sum(-0.05)).toBe("-0.05");
    expect(sum(-12.5, 2)).toBe("-10.5");
    expect(sum(1e21)).toBe("1000000000000000000000");
    expect(sum(100)).toBe("100");
    expect(sum(0.000001, 5)).toBe("5.000001");
  });
  it("keeps the last value and the day it was for for a last value", () => {
    const c = condense(m("day", "last"), into, "2026-03-01", [p(month(9), 4), p(month(3), 7.5), p(month(20), 1)], 1);
    expect(c).toEqual({ period: "2026-03-01", into, held: 3, of: 31, sum: null, last: { value: "1", day: month(20) }, locked: false });
  });
  it("counts a period given twice once, with the value given last, and only the span's own periods", () => {
    const c = condense(m("day"), into, "2026-03-01", [p(month(1), 1), p(month(1), 2), p("2026-04-01", 100), p("2026-02-28", 100)], 1);
    expect(c).toMatchObject({ held: 1, sum: "2" });
  });
  it("keeps how many periods were missing: 20 of 31 days", () => {
    const values = Array.from({ length: 20 }, (_, i) => p(month(i + 1), 1));
    expect(condense(m("day"), into, "2026-03-01", values, 1)).toMatchObject({ held: 20, of: 31, sum: "20" });
    expect(condense(m("week"), "month", "2026-09-01", [p("2026-09-08", 1)], 1)).toMatchObject({ held: 1, of: 4 });
  });
  it("makes nothing for a rate, a Derived Metric or a span without values", () => {
    expect(condense(m("day", "none"), into, "2026-03-01", [p(month(1), 1)], 1)).toBeNull();
    expect(condense(m("day", "sum", "{a}"), into, "2026-03-01", [p(month(1), 1)], 1)).toBeNull();
    expect(condense(m("day"), into, "2026-03-01", [], 1)).toBeNull();
    expect(condense(m("day"), into, "2026-03-01", [p("2026-04-01", 1)], 1)).toBeNull();
  });
});

describe("values of parts", () => {
  const parts = (...vs: [string, number][]): Part[] => vs.map(([d, v]) => partOfPoint(p(d, v)));
  it("combines like a series by a Display Period", () => {
    const three = parts(["2026-01-01", 1], ["2026-02-01", 2], ["2026-03-01", 4]);
    expect(valueOfParts("sum", three, 3)).toBe(7);
    expect(valueOfParts("average", three, 3)).toBeCloseTo(7 / 3, 15);
    expect(valueOfParts("last", three, 3)).toBe(4);
    expect(valueOfParts("none", three, 3)).toBeUndefined();
    expect(valueOfParts("none", three.slice(0, 1), 1)).toBe(1);
  });
  it("counts once at least half of the periods have a value", () => {
    const one = parts(["2026-01-01", 5]);
    expect(valueOfParts("sum", one, 2)).toBe(5);
    expect(valueOfParts("sum", one, 3)).toBeUndefined();
    expect(valueOfParts("sum", [], 1)).toBeUndefined();
  });
  it("averages a Condensed Value with a value by the count held, not by the number of parts", () => {
    // March: 31 days of 1 and 30 days of 3 in April: the average of 61 days, not of two months.
    const march = condense(m("day", "average"), "month", "2026-03-01", Array.from({ length: 31 }, (_, i) => p(textOf(dayOf("2026-03-01") + i), 1)), 1)!;
    const april = condense(m("day", "average"), "month", "2026-04-01", Array.from({ length: 30 }, (_, i) => p(textOf(dayOf("2026-04-01") + i), 3)), 1)!;
    expect(valueOfParts("average", [march, april], 61)).toBeCloseTo((31 + 90) / 61, 14);
    expect((1 + 3) / 2).not.toBeCloseTo((31 + 90) / 61, 2);
  });
  it("takes the last value from the latest part", () => {
    const march = condense(m("day", "last"), "month", "2026-03-01", [p("2026-03-31", 9)], 1)!;
    expect(valueOfParts("last", [march, ...parts(["2026-04-02", 3])], 2)).toBe(3);
  });
});

describe("a series before and after condensing", () => {
  const ysFor = (own: string) => (own === "quarter" || own === "year" ? fc.constant(1 as YearStart) : fc.integer({ min: 1, max: 12 }).map((n) => n as YearStart));
  const today = fc.integer({ min: dayOf("2026-01-01"), max: dayOf("2030-12-31") }).map(textOf);

  for (const own of ["day", "week", "month", "quarter", "year"] as const) {
    const intos = condensesInto(own);
    if (!intos.length) continue;
    for (const aggregation of AGGREGATIONS.filter((a) => a !== "none")) {
      it(`${own} Metric, ${aggregation}: identical by every Display Period at or above the condensed one`, () => {
        const { numRuns, seed } = runs();
        fc.assert(
          fc.property(series(own), ysFor(own), today, fc.integer({ min: 13, max: 40 }), fc.constantFrom(...intos), fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }), fc.boolean(), (g, ys, now, months, into, flags, locks) => {
            const metric = m(own, aggregation);
            const stored = latestOfEach(g.points).map((pt, i) => ({ period: pt.period, locked: locks && i % 2 === 0, heldBack: flags[i % flags.length] && i % 7 === 0 }));
            const plan = retentionPlan(keep(months, into), metric, stored, now, ys);
            // The plan is the reference's.
            const ref = referencePlan("condense", into, own, stored, now, months, ys);
            expect(plan.condense).toEqual(ref.condense);
            expect(plan.heldBack).toEqual(ref.heldBack);
            expect(plan.uneven).toEqual(ref.uneven);
            expect(plan.keptFrom).toBe(referenceKeptFrom(now, months));
            // Every Condensed Value is the reference's: exact sum, count, last value.
            const condensed = plan.condense.map((c) => condense(metric, into, c.period, g.points, ys, c.locked)!);
            for (const c of condensed) {
              const r = referenceCondensed(g.points, own, into, c.period, ys)!;
              expect([c.held, c.of]).toEqual([r.held, r.of]);
              if (aggregation === "last") expect([c.last!.day, same(exactOf(c.last!.value), r.last.value)]).toEqual([r.last.day, true]);
              else expect(same(exactOf(c.sum!), r.sum)).toBe(true);
              expect(periodEnd(c.period, into) < plan.keptFrom).toBe(true);
            }
            // After: the Condensed Values and the values that stay.
            const gone = new Set(plan.condense.flatMap((c) => c.periods));
            const after: Part[] = [...condensed, ...latestOfEach(g.points).filter((pt) => !gone.has(pt.period)).map(partOfPoint)];
            const resolve = resolverFrom([{ slug: "x", period: own, aggregation, formula: null } as unknown as Metric], { x: g.points });
            for (const display of DISPLAYS.filter((d) => d === into || (DISPLAYS.indexOf(d) > DISPLAYS.indexOf(into as never)))) {
              const before = seriesBy({ slug: "x", period: own, aggregation, formula: null } as unknown as Metric, resolve, display, { yearStart: ys, today: AFTER });
              const now2 = seriesFromParts(aggregation, own, display, after, ys);
              expect(before.ok).toBe(true);
              expect(now2, `${display}`).toEqual(before.points.map((b) => ({ period: b.period, value: b.value, held: b.held, length: b.length })));
              // And both are the reference's exact value, as the nearest double.
              const r = referenceSeries(g.points, own, display, aggregation, { yearStart: ys, today: AFTER });
              if (!r.ok) throw new Error("the reference refuses");
              expect(now2.map((s) => [s.period, s.value])).toEqual(r.spans.map((s) => [s.period, nearestDoubleOf(s.value)]));
            }
          }),
          { numRuns, seed },
        );
      });
    }
  }

  it("delete mode is the reference's, by every period and Fiscal Year", () => {
    const { numRuns, seed } = runs();
    for (const own of ["day", "week", "month", "quarter", "year"] as const) {
      fc.assert(
        fc.property(series(own), ysFor(own), today, fc.integer({ min: 13, max: 40 }), (g, ys, now, months) => {
          const stored = latestOfEach(g.points).map((pt, i) => ({ period: pt.period, locked: i % 3 === 0, heldBack: i % 5 === 0 }));
          const plan = retentionPlan(del(months), m(own, "none"), stored, now, ys);
          const ref = referencePlan("delete", null, own, stored, now, months, ys);
          expect([plan.delete, plan.deletedLocked, plan.heldBack]).toEqual([ref.delete, ref.deletedLocked, ref.heldBack]);
        }),
        { numRuns: Math.ceil(numRuns / 2), seed },
      );
    }
  });
});
