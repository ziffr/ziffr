// @ts-nocheck
// Generated series against the reference (spec 0022, "Aggregations, exhaustively"): for one source Period, every
// generated series is combined by every Display Period, every Aggregation and every Fiscal Year start, by the code
// and by the reference, and both must agree; the invariants are checked on top. One test file per source Period
// calls this, so the four run side by side.
import fc from "fast-check";
import { expect, it } from "vitest";
import { resolverFrom } from "../../compare";
import { seriesBy, targetsBy, type DisplayPoint } from "../../display-periods";
import type { Span } from "../../periods";
import type { Aggregation, Point, Polarity } from "../../types";
import { metric } from "../fixtures";
import { dayOf, monthsLater, spanEnd, spanStart, textOf } from "./calendar";
import { latestOfEach, referenceSeries, referenceTargets, type ReferenceSpan } from "./combine";
import { AGGREGATIONS, longer, PERIODS, runs, series, seriesMismatch, targetsMismatch, YEAR_STARTS } from "./check";
import { exactText, same, sumOf } from "./exact";

const NESTED: Span[] = ["month", "quarter", "half", "year"];

/** Every combination for one source Period, on generated series; fails with the combination, the difference and
 * fast-check's seed. */
export function generatedTests(period: (typeof PERIODS)[number]) {
  const displays: Span[] = [period, ...longer(period)];
  const { numRuns, seed } = runs();
  it(`equals the reference for every Display Period, Aggregation and Fiscal Year start (${numRuns} series, seed ${seed})`, () => {
    const extra = fc.record({ polarity: fc.constantFrom<Polarity>("higher", "lower", "target"), min: fc.option(fc.integer({ min: -50, max: 50 })), max: fc.option(fc.integer({ min: 50, max: 150 })) });
    fc.assert(
      fc.property(series(period), series(period), extra, (generated, generatedTargets, t) => {
        for (const yearStart of YEAR_STARTS) {
          // A quarterly or yearly Metric's periods start where the Fiscal Year's quarters or years do: the generated
          // ones (from January) move by as many months as the year start does.
          const s = forYear(generated, period, yearStart);
          const targets = forYear(generatedTargets, period, yearStart);
          for (const aggregation of AGGREGATIONS) {
            const m = metric({ period, aggregation, decimals: s.decimals, polarity: t.polarity, target_min: t.min, target_max: t.max });
            const resolve = resolverFrom([m], { revenue: s.points });
            // The same values in their own order, each period once: what reordering must not change.
            const tidy = resolverFrom([m], { revenue: latestOfEach(s.points).map((v) => ({ period: textOf(v.day), value: v.number })) });
            const sums = new Map<Span, ReferenceSpan[]>();
            for (const display of displays) {
              const opts = { yearStart, today: s.today, alignTo: s.alignTo };
              const code = seriesBy(m, resolve, display, opts);
              const ref = referenceSeries(s.points, period, display, aggregation, opts);
              const where = `${period} by ${display}, ${aggregation}, year from month ${yearStart}, today ${s.today}${s.alignTo ? `, cut at ${s.alignTo}` : ""}`;
              const wrong = seriesMismatch(code, ref, s.decimals);
              if (wrong) throw new Error(`${where}: ${wrong}`);
              expect(seriesBy(m, tidy, display, opts), `${where}: reordered`).toEqual(code);
              if (!code.ok) {
                // Aggregation none never combines; by its own period it is shown as it is.
                expect(aggregation === "none" && display !== period, where).toBe(true);
                continue;
              }
              invariants(code.points, s.points, aggregation, where);
              if (ref.ok && !s.alignTo) sums.set(display, ref.spans);
              const shown = targetsBy(m, targets.points, code.points, display, yearStart);
              const expected = referenceTargets(targets.points, ref.ok ? ref.spans : [], { ...m, target_min: t.min, target_max: t.max }, yearStart);
              const off = targetsMismatch(shown, expected);
              if (off) throw new Error(`${where}: ${off}`);
            }
            if (aggregation === "sum") addsUp(sums, period, yearStart);
          }
        }
      }),
      { numRuns, seed, endOnFailure: true },
    );
  });
}

type Generated = { points: Point[]; today: string; alignTo?: string; decimals: number };

/** A generated series for a Fiscal Year: quarterly and yearly periods moved from January's to the year start's. */
function forYear(s: Generated, period: Span, yearStart: (typeof YEAR_STARTS)[number]): Generated {
  if (period !== "quarter" && period !== "year") return s;
  const move = (day: string) => textOf(monthsLater(dayOf(day), yearStart - 1));
  return { ...s, points: s.points.map((p) => ({ ...p, period: move(p.period) })), alignTo: s.alignTo && move(s.alignTo) };
}

/** An average lies between the lowest and highest value it averages; the last value is that of the latest period;
 * every period counts in one span only, and a span holds exactly the periods from its start through its cut. */
function invariants(points: DisplayPoint[], input: Point[], aggregation: Aggregation, where: string) {
  const values = latestOfEach(input);
  let after = -Infinity;
  for (const p of points) {
    const from = dayOf(p.period);
    const through = dayOf(p.through);
    if (from <= after) throw new Error(`${where}: span ${p.period} overlaps the one before`);
    after = through;
    const held = values.filter((v) => v.day >= from && v.day <= through);
    if (held.length !== p.held) throw new Error(`${where}: span ${p.period} holds ${held.length} periods, not ${p.held}`);
    const numbers = held.map((v) => v.number);
    if (aggregation === "average" && (p.value < Math.min(...numbers) || p.value > Math.max(...numbers))) throw new Error(`${where}: average ${p.value} outside its values`);
    if (aggregation === "last" && p.value !== numbers[numbers.length - 1] && held.length > 1) throw new Error(`${where}: last ${p.value} is not the latest value`);
  }
}

/** Where every span is complete, a sum over a longer span equals the sum of the shorter spans in it: a year of its
 * half-years, quarters and months, a half-year of its quarters and months, a quarter of its months. Exact. */
function addsUp(sums: Map<Span, ReferenceSpan[]>, period: Span, yearStart: (typeof YEAR_STARTS)[number]) {
  const complete = (s: ReferenceSpan) => !s.toDate && s.held === s.length;
  const levels = NESTED.filter((n) => sums.has(n));
  for (const [i, outer] of levels.entries()) {
    for (const inner of levels.slice(0, i)) {
      for (const big of sums.get(outer)!.filter(complete)) {
        const from = dayOf(big.period);
        const to = spanEnd(from, outer, yearStart);
        const parts = sums.get(inner)!.filter((s) => dayOf(s.period) >= from && dayOf(s.period) <= to);
        const expectedParts = countSpans(from, to, inner, yearStart);
        if (parts.length !== expectedParts || !parts.every(complete)) continue;
        const total = sumOf(parts.map((p) => p.value));
        if (!same(total, big.value)) throw new Error(`${period} by ${outer} from ${big.period}: ${exactText(big.value)}, its ${inner}s add up to ${exactText(total)}`);
      }
    }
  }
}

function countSpans(from: number, to: number, span: Span, yearStart: (typeof YEAR_STARTS)[number]) {
  let n = 0;
  for (let d = spanStart(from, span, yearStart); d <= to; d = spanEnd(d, span, yearStart) + 1) n++;
  return n;
}
