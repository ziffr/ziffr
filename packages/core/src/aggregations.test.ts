// Aggregations against the reference on hand-made edge cases (spec 0022, "Aggregations, exhaustively"; GLOSSARY:
// Aggregation, Display Period, Comparison, Snapshot, Target Series). Every case runs for every source Period, every
// Display Period, every Aggregation and every Fiscal Year start; where a case is about a rule (half the periods, week
// 53, 29 February), the rule's outcome is also written down here, so the reference itself is held to it.
import { describe, expect, it } from "vitest";
import { resolverFrom } from "./compare";
import { seriesBy } from "./display-periods";
import type { Span } from "./periods";
import { metric } from "./test/fixtures";
import { dayOf, spanEnd, spanStart, textOf } from "./test/reference/calendar";
import { at, everyCase, LATER, MID, periodsOfSpan, starts, type Source } from "./test/reference/cases";
import { AGGREGATIONS, displayed, longer, PERIODS, seriesMismatch, valueMismatch, YEAR_STARTS } from "./test/reference/check";
import { referenceSeries } from "./test/reference/combine";
import { exactOf, same, sumOf } from "./test/reference/exact";
import type { Aggregation } from "./types";

describe("every Aggregation into every longer Display Period, for every Fiscal Year start", () => {
  it("equals the reference on every hand-made case", () => {
    let checked = 0;
    for (const { own, ys, c } of everyCase()) {
      for (const aggregation of AGGREGATIONS) {
        const m = metric({ period: own, aggregation, decimals: 2 });
        const r = resolverFrom([m], { revenue: c.points });
        for (const display of [own, ...longer(own)]) {
          const opts = { yearStart: ys, today: c.today, alignTo: c.alignTo };
          const wrong = seriesMismatch(seriesBy(m, r, display, opts), referenceSeries(c.points, own, display, aggregation, opts), 2);
          expect(wrong, `${c.name}: ${own} by ${display}, ${aggregation}, year from month ${ys}`).toBeNull();
          checked++;
        }
      }
    }
    // 5 Periods, 12 year starts, 4 Aggregations, every Display Period from the Metric's own up.
    expect(checked).toBeGreaterThan(5000);
  });

  it("shows a span with exactly half of its periods, and not one with one fewer", () => {
    for (const own of PERIODS) {
      for (const ys of YEAR_STARTS) {
        for (const display of longer(own)) {
          const span = periodsOfSpan(MID, own, display, ys);
          const half = Math.ceil(span.length / 2);
          const m = metric({ period: own });
          const shown = (n: number) => seriesBy(m, resolverFrom([m], { revenue: at(span.slice(0, n)) }), display, { yearStart: ys, today: LATER }).points;
          expect(shown(half), `${own} by ${display}, ${ys}`).toEqual([expect.objectContaining({ period: span[0] <= MID ? textOf(spanStart(dayOf(MID), display, ys)) : span[0], held: half, length: span.length })]);
          if (half > 1) expect(shown(half - 1), `${own} by ${display}, ${ys}`).toEqual([]);
        }
      }
    }
  });

  it("counts week 53 and weeks across a boundary in the span their Monday is in", () => {
    const w = metric({ period: "week" });
    // Every week from the one of 29 December 2025 (ISO week 1 of 2026) to the one of 4 January 2027.
    const r = resolverFrom([w], { revenue: at(starts("2025-12-29", "week", 54, 1), () => 1) });
    // With the calendar year, week 53 of 2026 (28 December to 3 January) belongs to December, Q4, H2 and 2026; ISO
    // week 1 of 2026 belongs to 2025, where its Monday is. 2026 holds the 52 weeks whose Monday falls in it.
    const span = (display: "month" | "quarter" | "half" | "year") => seriesBy(w, r, display, { yearStart: 1, today: LATER }).points.find((p) => p.period <= "2026-12-28" && p.through >= "2026-12-28");
    expect(span("month")).toMatchObject({ period: "2026-12-01", value: 4, held: 4, length: 4 });
    expect(span("quarter")).toMatchObject({ period: "2026-10-01", value: 13, length: 13 });
    expect(span("half")).toMatchObject({ period: "2026-07-01", value: 26, length: 26 });
    expect(span("year")).toMatchObject({ period: "2026-01-01", value: 52, length: 52 });
    const across = resolverFrom([w], { revenue: at(["2025-09-08", "2025-09-15", "2025-09-22", "2025-09-29"], () => 1) });
    expect(seriesBy(w, across, "month", { yearStart: 1, today: LATER }).points[0]).toMatchObject({ period: "2025-09-01", value: 4, held: 4, length: 5 });
  });

  it("cuts at 29 February where a later month's day does not exist in February", () => {
    const d = metric({ period: "day" });
    const r = resolverFrom([d], { revenue: at(starts("2028-01-01", "day", 160, 1), () => 1) });
    const q = seriesBy(d, r, "quarter", { yearStart: 1, today: LATER, alignTo: "2028-05-31" }).points;
    // 31 May, two months into Q2, is 29 February in Q1 of a leap year: 31 + 29 days.
    expect(q[0]).toMatchObject({ period: "2028-01-01", through: "2028-02-29", value: 60 });
    const y = seriesBy(d, resolverFrom([d], { revenue: at(starts("2027-01-01", "day", 800, 1), () => 1) }), "year", { yearStart: 1, today: LATER, alignTo: "2028-02-29" }).points;
    // 29 February 2028 a year back is 28 February 2027; and a year on, 28 February 2029.
    expect(y.map((p) => p.through)).toEqual(["2027-02-28", "2028-02-29", "2029-02-28"]);
  });

  it("adds up: a year of complete spans is the sum of its half-years, quarters and months", () => {
    for (const own of ["day", "week", "month"] as const) {
      for (const ys of YEAR_STARTS) {
        const points = at(starts("2025-01-01", own, { day: 1200, week: 170, month: 40 }[own], ys), (i) => (i % 7) * 0.1 + 0.01);
        const by = (display: Span) => referenceSeries(points, own, display, "sum", { yearStart: ys, today: LATER });
        const year = by("year");
        if (!year.ok) throw new Error("refused");
        const complete = year.spans.filter((s) => s.held === s.length);
        expect(complete.length).toBeGreaterThan(0);
        for (const y of complete) {
          const end = textOf(spanEnd(dayOf(y.period), "year", ys));
          for (const display of longer(own).filter((d) => d !== "week" && d !== "year")) {
            const parts = by(display);
            const inYear = parts.ok ? parts.spans.filter((s) => s.period >= y.period && s.period <= end) : [];
            expect(same(sumOf(inYear.map((s) => s.value)), y.value), `${own} by ${display}, ${ys}`).toBe(true);
          }
          const code = seriesBy(metric({ period: own }), resolverFrom([metric({ period: own })], { revenue: points }), "year", { yearStart: ys, today: LATER }).points.find((p) => p.period === y.period)!;
          expect(valueMismatch(code.value, y.value, 2)).toBeNull();
        }
      }
    }
  });
});

describe("exact results", () => {
  const sumOfQuarter = (aggregation: Aggregation, values: number[], own: Source = "month") => {
    const m = metric({ period: own, aggregation });
    const points = at(starts("2026-01-01", own, values.length, 1), (i) => values[i]);
    return seriesBy(m, resolverFrom([m], { revenue: points }), own === "day" ? "year" : "quarter", { yearStart: 1, today: LATER }).points[0].value;
  };

  it("adds 0.1 and 0.2 to 0.3, not 0.30000000000000004", () => {
    expect(sumOfQuarter("sum", [0.1, 0.2, 0])).toBe(0.3);
    expect(sumOfQuarter("sum", [0.1, 0.2])).toBe(0.3);
    expect(sumOfQuarter("average", [0.1, 0.2, 0.3])).toBe(0.2);
  });

  it("adds a year of 0.01 a day to 3.65, and every year of three to its exact total", () => {
    const d = metric({ period: "day" });
    const points = at(starts("2025-01-01", "day", 365 * 3 + 1, 1), () => 0.01);
    const years = seriesBy(d, resolverFrom([d], { revenue: points }), "year", { yearStart: 1, today: LATER }).points;
    // 2025, 2026 and 2027: 365 days each; 1 January 2028 alone is not shown. 1,095 values of 0.01.
    expect(years.map((y) => y.value)).toEqual([3.65, 3.65, 3.65]);
    // Added one by one, the doubles drift: 3.6499999999999773.
    expect(points.slice(0, 365).reduce((a, p) => a + p.value, 0)).not.toBe(3.65);
    expect(sumOfQuarter("sum", Array(365).fill(0.01), "day")).toBe(3.65);
  });

  it("rounds a 5 at the rounding digit up, as the exact value does", () => {
    const m = metric({ aggregation: "sum" });
    // 1.004 + 0.001 + 0 is 1.005: "1.01" at two decimals.
    const sum = sumOfQuarter("sum", [1.004, 0.001, 0]);
    expect(displayed(sum, 2)).toBe("1.01");
    // 0.011 + 0.011 + 0.003 is 0.025: "0.03". Added as doubles it was 0.024999999999999998, shown as "0.02".
    expect(sumOfQuarter("sum", [0.011, 0.011, 0.003])).toBe(0.025);
    expect(displayed(0.011 + 0.011 + 0.003, 2)).toBe("0.02");
    expect(displayed(sumOfQuarter("sum", [0.011, 0.011, 0.003]), 2)).toBe("0.03");
    expect(displayed(sumOfQuarter("average", [0.061, 0.011, 0.003]), 2)).toBe("0.03");
    // (1.25 + 1.26) / 2 is 1.255 exactly: "1.26".
    const avg = sumOfQuarter("average", [1.25, 1.26]);
    expect(avg).toBe(1.255);
    expect(displayed(avg, 2)).toBe("1.26");
    for (const [values, exact] of [[[0.125, 0.125, 0.125], "0.375"], [[2.674, 0.001, 0], "2.675"], [[-1.004, -0.001, 0], "-1.005"]] as const) {
      expect(valueMismatch(sumOfQuarter("sum", [...values]), exactOf(exact), 2)).toBeNull();
    }
    expect(m.decimals).toBe(0);
  });

  it("keeps very large and very small values exact to the nearest double", () => {
    const cases: number[][] = [[999999999999999, 999999999999999, 1], [0.000001, 0.000002, 0.000004], [123456789012.345678, -123456789012.345678, 0.000001], [1e15, 0.5, 0.25]];
    for (const values of cases) {
      for (const aggregation of ["sum", "average"] as const) {
        const total = sumOf(values.map((v) => exactOf(v)));
        const expected = aggregation === "sum" ? total : { num: total.num, den: total.den * BigInt(values.length) };
        expect(valueMismatch(sumOfQuarter(aggregation, values), expected, 6), `${aggregation} of ${values}`).toBeNull();
      }
    }
  });

  it("gives no value where a value is not finite, rather than a wrong one", () => {
    const m = metric();
    const r = resolverFrom([m], { revenue: at(starts("2026-01-01", "month", 3, 1), (i) => (i === 1 ? Number.POSITIVE_INFINITY : 1)) });
    expect(seriesBy(m, r, "quarter", { yearStart: 1, today: LATER }).points[0].value).toBe(Number.POSITIVE_INFINITY);
  });
});
