// Comparisons against the reference on the hand-made cases (spec 0022; GLOSSARY: Comparison, Aggregation): both
// values of every Comparison, to date and in full, for every source Period, Aggregation and Fiscal Year start.
import { describe, expect, it } from "vitest";
import { compare, resolverFrom } from "./compare";
import type { Span, YearStart } from "./periods";
import { metric } from "./test/fixtures";
import { dayOf, monthsLater, spanEnd, spanStart, textOf } from "./test/reference/calendar";
import { at, everyCase, LATER, starts, type Source } from "./test/reference/cases";
import { AGGREGATIONS, valueMismatch } from "./test/reference/check";
import { referenceSeries, referenceValueOver } from "./test/reference/combine";
import { exactOf, exactText } from "./test/reference/exact";
import type { Aggregation, Point } from "./types";

describe("Comparisons against the reference", () => {
  /** What the reference says a Comparison's two values are. */
  function expected(points: Point[], own: Source, aggregation: Aggregation, key: string, full: boolean, ys: YearStart) {
    const latest = [...points].sort((a, b) => (a.period < b.period ? -1 : 1)).at(-1)!.period;
    const last = dayOf(latest);
    const one = (d: number) => referenceValueOver(points, aggregation, textOf(d), textOf(d), 1);
    const grain = ({ dod: "day", wow: "week", mom: "month", qoq: "quarter", hoh: "half" } as Record<string, Span>)[key];
    if (key === "prev" || grain === own) return [one(last), one(spanStart(last - 1, own, ys))];
    if (key === "yoy") return [one(last), one(own === "week" ? last - 364 : monthsLater(last, 12 * -1))];
    if (aggregation === "none") return null;
    const gStart = spanStart(last, grain, ys);
    let s = gStart;
    let series;
    if (full) {
      const complete = spanEnd(gStart, grain, ys) <= spanEnd(last, own, ys);
      s = complete ? gStart : spanStart(gStart - 1, grain, ys);
      series = referenceSeries(points, own, grain, aggregation, { yearStart: ys, today: textOf(spanEnd(last, own, ys) + 1) });
    } else {
      series = referenceSeries(points, own, grain, aggregation, { yearStart: ys, today: LATER, alignTo: latest });
    }
    const value = (start: number) => (series.ok ? (series.spans.find((x) => x.period === textOf(start))?.value ?? null) : null);
    return [value(s), value(spanStart(s - 1, grain, ys))];
  }

  it("compares the same values as the reference, for every Comparison, to date and in full", () => {
    for (const { own, ys, c } of everyCase()) {
      if (!c.points.length) continue;
      for (const aggregation of AGGREGATIONS) {
        const m = metric({ period: own, aggregation });
        const r = resolverFrom([m], { revenue: c.points });
        for (const full of [false, true]) {
          for (const cmp of compare(m, r, { yearStart: ys, full })) {
            const where = `${c.name}: ${own}, ${cmp.key}${full ? " in full" : " to date"}, ${aggregation}, ${ys}`;
            const values = expected(c.points, own, aggregation, cmp.key, full, ys);
            if (!values || values[0] === null || values[1] === null) {
              expect(cmp.available, where).toBe(false);
              continue;
            }
            expect(cmp.available, where).toBe(true);
            expect(valueMismatch(cmp.current!, values[0], 2), where).toBeNull();
            expect(valueMismatch(cmp.previous!, values[1], 2), where).toBeNull();
          }
        }
      }
    }
  });

  it("compares a weekly Metric's week with the week 52 weeks before", () => {
    const w = metric({ period: "week" });
    const [yoy] = compare(w, resolverFrom([w], { revenue: at(["2025-11-10", "2026-11-09"]) }), { yearStart: 1, keys: ["yoy"] });
    expect(yoy).toMatchObject({ available: true, current: 2.25, previous: 1.25, previousSpan: "Week of 10 Nov 2025" });
  });

  it("names a weekly Metric's month by the weeks it counts", () => {
    const w = metric({ period: "week" });
    const r = resolverFrom([w], { revenue: at(starts("2026-09-07", "week", 13, 1)) });
    // The latest week starts on 30 November 2026; November's weeks start on the 2nd and end with that one.
    const [toDate] = compare(w, r, { yearStart: 1, keys: ["mom"] });
    expect(toDate).toMatchObject({ currentSpan: "Week of 2 Nov 2026 to Week of 30 Nov 2026", previousSpan: "Week of 5 Oct 2026 to Week of 26 Oct 2026" });
    const [full] = compare(w, r, { yearStart: 1, keys: ["mom"], full: true });
    expect(full).toMatchObject({ currentSpan: "Week of 2 Nov 2026 to Week of 30 Nov 2026", previousSpan: "Week of 5 Oct 2026 to Week of 26 Oct 2026" });
    expect(exactText(exactOf(toDate.current!))).toBe(String(toDate.current));
  });
});
