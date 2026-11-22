// Basis choice against the reference and SciPy (spec 0041, rule 2; spec 0022 for the method): `changes` and `detrended`
// are the double nearest to the exact result, `basisFor` agrees with the exact decision on generated trending, flat and
// seasonal series, and two Metrics that only share a trend are not related once growth is taken out. Generated with a
// fixed seed in `pnpm test`, more and a new seed in `test:numbers`.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { basisFor, basisText, changes, detrended } from "./basis";
import { resolverFrom } from "./compare";
import { basisLabel, correlate, rankCorrelations, strength } from "./correlation";
import { JANUARY } from "./periods";
import { metric, months } from "./test/fixtures";
import { referenceBasis, referenceChange, referenceLine, referenceTrending } from "./test/reference/basis";
import { dayOf, monthsLater, textOf } from "./test/reference/calendar";
import { runs, valueText } from "./test/reference/check";
import { exactOf, exactText, isNearestDouble } from "./test/reference/exact";
import type { Point } from "./types";

const { numRuns, seed } = runs();
const month = (i: number) => textOf(monthsLater(dayOf("2024-01-01"), i));
const at = (vs: number[], positions = vs.map((_, i) => i)): Point[] => vs.map((value, i) => ({ period: month(positions[i]), value }));
const nearestTo = (code: number, exact: ReturnType<typeof exactOf>, where: string) => expect(isNearestDouble(code, exact), `${where}: ${code} is not the double nearest to ${exactText(exact)}`).toBe(true);
/** Month positions kept: gaps, and a series that starts anywhere. */
const withGaps = (min: number, max: number) => fc.uniqueArray(fc.integer({ min: 0, max: 60 }), { minLength: min, maxLength: max });
const valuesFor = (n: number) => fc.array(valueText, { minLength: n, maxLength: n });

describe("changes", () => {
  it(`is the exact difference to the period before, only where that period is there (${numRuns * 5} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(withGaps(0, 30).chain((ps) => fc.tuple(fc.constant(ps), valuesFor(ps.length))), ([ps, texts]) => {
        const rows = ps.map((p, i) => ({ p, text: texts[i] })).sort((a, b) => a.p - b.p);
        // Handed over newest first: the series is sorted by its periods.
        const got = changes(rows.map(({ p, text }) => ({ period: month(p), value: Number(text) })).reverse(), "month");
        const want = rows.flatMap(({ p, text }, i) => (i > 0 && rows[i - 1].p === p - 1 ? [{ period: month(p), exact: referenceChange(exactOf(Number(rows[i - 1].text)), exactOf(Number(text))) }] : []));
        expect(got.map((g) => g.period)).toEqual(want.map((w) => w.period));
        got.forEach((g, i) => nearestTo(g.value, want[i].exact, g.period));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it("is worked out on the values' text, and a missing period leaves no change", () => {
    expect(changes(months("2025-01", [0.1, 0.3, 0.6]), "month").map((p) => p.value)).toEqual([0.2, 0.3]);
    expect(changes(at([1, 4, 9], [0, 1, 3]), "month")).toEqual([{ period: month(1), value: 3 }]);
  });
  it("gives nothing for nothing, or for one value", () => {
    expect(changes([], "month")).toEqual([]);
    expect(changes(at([5]), "month")).toEqual([]);
  });
  it("reads a period given twice once (the last value given), and drops what is not a number", () => {
    expect(changes([...at([1, 2, 3]), { period: month(2), value: 10 }], "month").map((p) => p.value)).toEqual([1, 8]);
    expect(changes(at([1, Number.NaN, 3, 4]), "month")).toEqual([{ period: month(3), value: 1 }]);
    expect(changes(at([1, Infinity, 3]), "month")).toEqual([]);
  });
  it(`does not change when every value moves by the same amount, and scales with the values (${numRuns * 2} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20 }).chain((n) => fc.tuple(fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: n, maxLength: n }), fc.integer({ min: -500, max: 500 }), fc.integer({ min: 1, max: 9 }))), ([vs, shift, factor]) => {
        const base = changes(at(vs), "month").map((p) => p.value);
        expect(changes(at(vs.map((v) => v + shift)), "month").map((p) => p.value)).toEqual(base);
        expect(changes(at(vs.map((v) => v * factor)), "month").map((p) => p.value)).toEqual(base.map((v) => v * factor));
        expect(changes(at(vs), "month")).toEqual(changes(at(vs), "month"));
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
});

describe("detrended", () => {
  it(`is each value minus its exact straight-line trend (${numRuns * 5} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(withGaps(2, 30).chain((ps) => fc.tuple(fc.constant([...ps].sort((a, b) => a - b)), valuesFor(ps.length))), ([ps, texts]) => {
        const got = detrended(at(texts.map(Number), ps), "month");
        const line = referenceLine(ps.map((p) => p - ps[0]), texts.map((t) => exactOf(Number(t))))!;
        expect(got.map((g) => g.period)).toEqual(ps.map(month));
        got.forEach((g, i) => nearestTo(g.value, line.leftovers[i], g.period));
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it("leaves nothing of a straight line, and the wobble of anything else, worked out by hand", () => {
    expect(detrended(at([2, 4, 6, 8]), "month").map((p) => p.value)).toEqual([0, 0, 0, 0]);
    // x = 0..3, y = 1, 3, 2, 4: slope 4/5 about the means (1.5, 2.5), so the line is 1.3, 2.1, 2.9, 3.7.
    expect(detrended(at([1, 3, 2, 4]), "month").map((p) => p.value)).toEqual([-0.3, 0.9, -0.9, 0.3]);
  });
  it("gives nothing for nothing, one value, one period given twice or values that are not numbers", () => {
    expect(detrended([], "month")).toEqual([]);
    expect(detrended(at([5]), "month")).toEqual([]);
    expect(detrended([{ period: month(0), value: 1 }, { period: month(0), value: 2 }], "month")).toEqual([]);
    expect(detrended(at([1, Number.NaN]), "month")).toEqual([]);
  });
  it(`is unchanged by a shift, scales with the values and has leftovers that add up to nothing (${numRuns * 2} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }).chain((n) => fc.tuple(fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: n, maxLength: n }), fc.integer({ min: -500, max: 500 }), fc.integer({ min: 1, max: 9 }))), ([vs, shift, factor]) => {
        const base = detrended(at(vs), "month").map((p) => p.value);
        const shifted = detrended(at(vs.map((v) => v + shift)), "month").map((p) => p.value);
        const scaled = detrended(at(vs.map((v) => v * factor)), "month").map((p) => p.value);
        base.forEach((v, i) => {
          expect(Math.abs(shifted[i] - v)).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(v)));
          expect(Math.abs(scaled[i] - factor * v)).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(factor * v)));
        });
        expect(Math.abs(base.reduce((a, b) => a + b, 0))).toBeLessThanOrEqual(1e-9 * (1 + base.reduce((a, b) => a + Math.abs(b), 0)));
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
});

/** A series with a straight trend and noise from the integers given; or no trend at all; or a season. */
const shapes = (n: number) =>
  fc.oneof(
    fc.tuple(fc.integer({ min: 1, max: 20 }), fc.array(fc.integer({ min: -3, max: 3 }), { minLength: n, maxLength: n })).map(([slope, noise]) => ({ kind: "trend", values: noise.map((e, i) => 100 + slope * i + e) })),
    fc.array(fc.integer({ min: -5, max: 5 }), { minLength: n, maxLength: n }).map((noise) => ({ kind: "flat", values: noise.map((e) => 100 + e) })),
    fc.tuple(fc.integer({ min: 5, max: 30 }), fc.array(fc.integer({ min: -1, max: 1 }), { minLength: n, maxLength: n })).map(([amp, noise]) => ({ kind: "season", values: noise.map((e, i) => 100 + [amp, 0, -amp, 0][i % 4] + e) })),
  );

describe("basisFor", () => {
  it(`agrees with the exact decision on trending, flat and seasonal series (${numRuns * 5} pairs, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 8, max: 36 }).chain((n) => fc.tuple(shapes(n), shapes(n))), ([a, b]) => {
        const xs = a.values.map((_, i) => i);
        const want = referenceBasis(xs, a.values.map(exactOf), b.values.map(exactOf));
        expect(basisFor(at(a.values), at(b.values), "month"), `${a.kind} with ${b.kind}`).toBe(want);
        // The decision is symmetric.
        expect(basisFor(at(b.values), at(a.values), "month")).toBe(want);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it("chooses by what the series are: two growing ones by change, a flat, a zigzag or a seasonal one by value, worked out by hand", () => {
    const grow = (slope: number) => at(Array.from({ length: 12 }, (_, i) => 100 + slope * i + (i % 3) - 1));
    const flat = at(Array.from({ length: 12 }, (_, i) => 100 + (i % 2)));
    const season = at(Array.from({ length: 12 }, (_, i) => [120, 100, 80, 100][i % 4]));
    expect(basisFor(grow(5), grow(2), "month")).toBe("changes");
    expect(basisFor(grow(5), flat, "month")).toBe("values");
    expect(basisFor(grow(5), season, "month")).toBe("values");
    expect(basisFor(flat, season, "month")).toBe("values");
  });
  it(`agrees with the exact decision on any values, in any order, with gaps (${numRuns * 5} pairs, seed ${seed})`, () => {
    fc.assert(
      fc.property(withGaps(0, 20).chain((ps) => fc.tuple(fc.constant(ps), valuesFor(ps.length), valuesFor(ps.length))), ([ps, ta, tb]) => {
        const order = ps.map((_, i) => i).sort((x, y) => ps[x] - ps[y]);
        const first = ps[order[0]] ?? 0;
        const want = referenceBasis(order.map((i) => ps[i] - first), order.map((i) => exactOf(Number(ta[i]))), order.map((i) => exactOf(Number(tb[i]))));
        expect(basisFor(at(ta.map(Number), ps), at(tb.map(Number), ps), "month")).toBe(want);
      }),
      { numRuns: numRuns * 5, seed },
    );
  });
  it(`is unchanged by shifting or scaling the values, and by the order they come in (${numRuns * 2} pairs, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 24 }).chain((n) => fc.tuple(shapes(n), shapes(n), fc.integer({ min: -500, max: 500 }), fc.integer({ min: 1, max: 9 }))), ([a, b, shift, factor]) => {
        const base = basisFor(at(a.values), at(b.values), "month");
        expect(basisFor(at(a.values.map((v) => v + shift)), at(b.values.map((v) => v * factor)), "month")).toBe(base);
        expect(basisFor(at(a.values).reverse(), at(b.values).reverse(), "month")).toBe(base);
      }),
      { numRuns: numRuns * 2, seed },
    );
  });
  it("decides exactly at a half: above half is a trend, exactly half is not, worked out by hand", () => {
    // x = 0..3, y = 0, 2, 1, 3: Sxy = 4, Sxx = 5, Syy = 5, so R² = 16/25, above half.
    expect(referenceLine([0, 1, 2, 3], [0, 2, 1, 3].map(exactOf))!.r2).toEqual(exactOf("0.64"));
    expect(basisFor(at([0, 2, 1, 3]), at([5, 7, 6, 8]), "month")).toBe("changes");
    // x = 0..4, y = 0, 0, 0, 0, 1: Sxy = 2, Sxx = 10, Syy = 4/5, so R² = 4 ÷ 8 = exactly 1/2: not above half.
    expect(referenceLine([0, 1, 2, 3, 4], [0, 0, 0, 0, 1].map(exactOf))!.r2).toEqual(exactOf("0.5"));
    expect(referenceTrending([0, 1, 2, 3, 4], [0, 0, 0, 0, 1].map(exactOf))).toBe(false);
    expect(basisFor(at([0, 0, 0, 0, 1]), at([1, 2, 3, 4, 5]), "month")).toBe("values");
    // The same series on a slightly steeper end is above half.
    expect(basisFor(at([0, 0, 0, 0, 1.0001]), at([1, 2, 3, 4, 5]), "month")).toBe("values");
    expect(basisFor(at([0, 0, 0, 1, 1]), at([1, 2, 3, 4, 5]), "month")).toBe("changes");
    // A zigzag explains 9/25: not a trend.
    expect(basisFor(at([0, 2, 1, 3]), at([3, 0, 3, 0]), "month")).toBe("values");
  });
  it("gives values for what has no trend to speak of: no change, one value, nothing, a value that is not a number", () => {
    expect(basisFor(at([4, 4, 4, 4]), at([1, 2, 3, 4]), "month")).toBe("values");
    expect(basisFor(at([4]), at([1]), "month")).toBe("values");
    expect(basisFor([], [], "month")).toBe("values");
    expect(basisFor(at([1, 2, 3, Number.NaN]), at([1, 2, 3, 4]), "month")).toBe("changes");
    expect(basisFor(at([1, 2, Infinity]), at([1, 2, 3]), "month")).toBe("changes");
  });
  it("says its basis in words", () => {
    expect(basisText("changes")).toBe("compared by change, growth removed");
    expect(basisText("values")).toBe("compared by value");
  });
});

describe("against SciPy and NumPy (fixtures/basis.py)", () => {
  type Case = { values: number[]; changes: number[]; r2: number | null; residuals: number[] };
  const here = new URL("./test/reference/fixtures/", import.meta.url);
  const fixture = JSON.parse(readFileSync(new URL("basis.json", here), "utf8")) as { version: number; script: string; cases: Record<string, Case> };
  it("uses the fixture made by the script as it is now", () => {
    expect(fixture.script, "basis.json is stale: run `python3 packages/core/src/test/reference/fixtures/basis.py` again").toBe(createHash("sha256").update(readFileSync(new URL("basis.py", here))).digest("hex"));
    expect(Object.keys(fixture.cases)).toContain("anscombe-1");
  });
  for (const [name, c] of Object.entries(fixture.cases)) {
    it(`${name}: changes equal numpy's differences, leftovers match to 1e-9, and R² decides the same side of a half`, () => {
      const points = at(c.values);
      // Changes: the difference of the values' text is the double SciPy's difference of the same doubles is within one rounding of.
      const got = changes(points, "month").map((p) => p.value);
      expect(got).toHaveLength(c.changes.length);
      got.forEach((v, i) => expect(Math.abs(v - c.changes[i])).toBeLessThanOrEqual(1e-12 * (1 + Math.abs(c.changes[i]))));
      const left = detrended(points, "month").map((p) => p.value);
      left.forEach((v, i) => expect(Math.abs(v - c.residuals[i]), `${name} leftover ${i}`).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(c.residuals[i]))));
      // R² above half by SciPy (clear of the edge: the edge case is decided exactly above) is a trend.
      const other = at(c.values.map((_, i) => i * 2 + (i % 2)));
      if (c.r2 !== null && Math.abs(c.r2 - 0.5) > 1e-9) expect(basisFor(points, other, "month") === "changes").toBe(c.r2 > 0.5);
      if (c.r2 === null) expect(basisFor(points, other, "month")).toBe("values");
    });
  }
});

describe("two Metrics that only share a trend", () => {
  const a = metric({ id: 1, slug: "revenue", name: "Revenue", period: "month" });
  const b = metric({ id: 2, slug: "headcount", name: "Headcount", period: "month" });
  const c = metric({ id: 3, slug: "visits", name: "Visits", period: "month" });
  const noise = (k: number, n: number) => Array.from({ length: n }, (_, i) => ((k * (i + 3) * 7919) % 11) - 5);
  const grow = (slope: number, noiseValues: number[]) => months("2024-01", noiseValues.map((e, i) => 100 + slope * i + e));

  it("are strong by value, and by change nothing to speak of: growth removed", () => {
    const resolve = resolverFrom([a, b], { revenue: grow(10, noise(1, 24)), headcount: grow(3, noise(5, 24)) });
    const byValue = correlate(a, b, resolve, { yearStart: JANUARY, basis: "values" });
    expect(byValue).toMatchObject({ ok: true, basis: "values" });
    expect(strength((byValue as { r: number }).r)).toBe("strong positive");
    const auto = correlate(a, b, resolve, { yearStart: JANUARY });
    expect(auto).toMatchObject({ ok: true, basis: "changes", n: 23 });
    expect(strength((auto as { r: number }).r)).not.toMatch(/strong|moderate/);
    expect(basisLabel(auto as Extract<typeof auto, { ok: true }>)).toBe("Compared by change, growth removed");
    expect(basisLabel(byValue as Extract<typeof byValue, { ok: true }>)).toBe("Compared by value");
  });
  it(`never come out strong, over generated trends and noise (${numRuns} pairs, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 30, max: 48 }).chain((n) => fc.tuple(fc.integer({ min: 8, max: 40 }), fc.integer({ min: 8, max: 40 }), fc.array(fc.integer({ min: -4, max: 4 }), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: -4, max: 4 }), { minLength: n, maxLength: n }))), ([s1, s2, n1, n2]) => {
        const resolve = resolverFrom([a, b], { revenue: grow(s1, n1), headcount: grow(s2, n2) });
        const res = correlate(a, b, resolve, { yearStart: JANUARY });
        expect(res.ok).toBe(true);
        if (res.ok) {
          expect(res.basis).toBe("changes");
          expect(Math.abs(res.r)).toBeLessThan(0.7);
        }
      }),
      { numRuns, seed },
    );
  });
  it("rank under the changes they share, with the by-value ranking kept as a choice", () => {
    const wobble = [3, -2, 4, -4, 2, -1, 5, -3, 1, -5, 4, -2, 3, -4, 2, 0, -3, 5, -1, 2];
    const resolve = resolverFrom([a, b, c], {
      revenue: months("2024-01", wobble.map((e, i) => 100 + 10 * i + e)),
      headcount: grow(3, noise(5, 20)),
      // Visits really move with Revenue's changes, on a trend of their own.
      visits: months("2024-01", wobble.map((e, i) => 50 + 2 * i + 2 * e)),
    });
    const auto = rankCorrelations(a, [b, c], resolve, { yearStart: JANUARY });
    expect(auto.ranked.map((r) => r.metric.slug)).toEqual(["visits", "headcount"]);
    expect(auto.ranked.every((r) => r.result.basis === "changes")).toBe(true);
    const old = rankCorrelations(a, [b, c], resolve, { yearStart: JANUARY, basis: "values" });
    expect(old.ranked.every((r) => r.result.basis === "values")).toBe(true);
    expect(old.ranked.every((r) => Math.abs(r.result.r) > 0.9)).toBe(true);
  });
  it("say so when nothing is left once growth is removed, and when too few changes remain", () => {
    const straight = months("2024-01", Array.from({ length: 12 }, (_, i) => 100 + 10 * i));
    const resolve = resolverFrom([a, b], { revenue: straight, headcount: months("2024-01", Array.from({ length: 12 }, (_, i) => 5 + (i % 2 ? 2 : 0) + 3 * i)) });
    expect(correlate(a, b, resolve, { yearStart: JANUARY })).toMatchObject({ ok: false, why: "flat", reason: "Once growth is removed, one of them does not change, so there is nothing to compare." });
    // Five values of two growing series are fewer than six, and are counted as five, not as four changes.
    const five = resolverFrom([a, b], { revenue: months("2024-01", [1, 2, 3, 4, 5]), headcount: months("2024-01", [2, 4, 7, 8, 10]) });
    expect(correlate(a, b, five, { yearStart: JANUARY })).toMatchObject({ ok: false, why: "too-few", n: 5 });
    // Six values trend, but give only five changes.
    const six = resolverFrom([a, b], { revenue: months("2024-01", [1, 2, 3, 4, 5, 6]), headcount: months("2024-01", [2, 4, 7, 8, 10, 13]) });
    expect(correlate(a, b, six, { yearStart: JANUARY })).toMatchObject({ ok: false, why: "too-few", n: 5 });
  });
});
