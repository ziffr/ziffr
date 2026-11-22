// Quantiles and the usual range (spec 0041, Methods `quantile` and `usualRange`): equal to the reference (type 7 from its
// definition on exact fractions) exactly, to NumPy's quantile and SciPy's mquantiles to 1e-12, hand-worked, hostile inputs,
// properties, and the Takeaway with its suitability limits one step either side.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { exactOf, nearestDoubleOf } from "../test/reference/exact";
import { close, FIXTURE, series } from "../test/reference/methods-fixture";
import { referenceQuantile } from "../test/reference/methods";
import type { TakeawayContext } from "../takeaways/takeaway";
import { formatValue, type ValueUnit } from "../format";
import { quantile, standing, usualRange, usualRangeTakeaway } from "./quantiles";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const unit: ValueUnit = { unit: "€", unit_position: "after", decimals: 0 };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const refQ = (vs: number[], p: number) => nearestDoubleOf(referenceQuantile(vs.map(exactOf), exactOf(p)));
const wavy = (n: number, step = 7, base = 400) => Array.from({ length: n }, (_, i) => base + ((i * step * 5) % 97) + (i % 7));

describe("quantile against NumPy, SciPy and its reference", () => {
  it.each(Object.entries(FIXTURE.quantile as Record<string, { values: number[]; quantiles: Record<string, number> }>))("%s: NumPy's quantile at every probability to 1e-12, the reference exactly", (name, c) => {
    for (const [p, want] of Object.entries(c.quantiles)) {
      const got = quantile(series(c.values), Number(p))!;
      expect(close(got, want, 1e-12), `${name} p=${p}: ${got} vs ${want}`).toBe(true);
      expect(got).toBe(refQ(c.values, Number(p)));
    }
  });
  it("is worked out by hand: of 1 to 11, the 10th percentile sits at position 1 (the value 2), the quartiles at 2.5 and 7.5 (3.5 and 8.5), the median at 6", () => {
    const v = series([11, 3, 7, 1, 9, 5, 2, 10, 4, 8, 6]);
    expect([0.1, 0.25, 0.5, 0.75, 0.9].map((p) => quantile(v, p))).toEqual([2, 3.5, 6, 8.5, 10]);
    expect(quantile(series([1, 2, 3, 4]), 0.5)).toBe(2.5);
    // 0.1 and 0.2 are 1/10 and 1/5 as written: their middle is exactly 3/20, which is the double 0.15 (0.1 + 0.2 in doubles is not).
    expect(quantile(series([0.1, 0.2]), 0.5)).toBe(0.15);
  });
  it("is the smallest value at 0, the largest at 1, the value itself for one value, and between two values in proportion", () => {
    const v = series([5, 9, 1, 7]);
    expect([quantile(v, 0), quantile(v, 1)]).toEqual([1, 9]);
    expect([0, 0.3, 1].map((p) => quantile(series([7]), p))).toEqual([7, 7, 7]);
    expect(quantile(series([3, 9]), 0.25)).toBe(4.5);
  });
});

describe("quantile on hostile input", () => {
  it("is none for no values, for values that are not numbers, and for a probability outside 0 to 1 (one step either side)", () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([{ period: "2024-01-01", value: NaN }, { period: "2024-02-01", value: Infinity }], 0.5)).toBeNull();
    const v = series([1, 2, 3]);
    for (const p of [-1e-9, 1 + 1e-15, NaN, Infinity, -Infinity, -1, 2]) expect(quantile(v, p), String(p)).toBeNull();
    for (const p of [0, 1e-300, 1 - 1e-16, 1]) expect(quantile(v, p), String(p)).not.toBeNull();
  });
  it("leaves out values that are not numbers, counts a period twice once with the last value, and orders unsorted input", () => {
    const clean = series([4, 1, 3, 2]);
    const dirty = [{ period: "2031-01-01", value: NaN }, ...[...clean].reverse(), { period: clean[0].period, value: 100 }, { period: clean[0].period, value: 4 }];
    for (const p of [0, 0.25, 0.5, 1]) expect(quantile(dirty, p)).toBe(quantile(clean, p));
  });
  it("is exact for huge and tiny values, and for decimals that are not exact in a double", () => {
    expect(quantile(series([1e300, 3e300, 2e300]), 0.5)).toBe(2e300);
    expect(quantile(series([1e-300, 3e-300, 2e-300]), 0.5)).toBe(2e-300);
    expect(quantile(series([0.1, 0.2, 0.3]), 0.5)).toBe(0.2);
    expect(quantile(series([0.1, 0.2, 0.3, 0.4]), 0.5)).toBe(0.25);
    expect(quantile(series([-5, -1]), 0.5)).toBe(-3);
  });
});

describe("quantile properties", () => {
  const ps = fc.constantFrom(0, 0.1, 0.25, 0.3, 0.5, 0.75, 0.9, 1);
  const values = fc.array(fc.integer({ min: -2000, max: 2000 }).map((v) => v / 100), { minLength: 1, maxLength: 30 });
  it(`equals the reference exactly, is between the smallest and the largest, rises with p, and is deterministic (seed ${seed})`, () => {
    fc.assert(
      fc.property(values, ps, ps, (vs, p, q) => {
        const got = quantile(series(vs), p)!;
        expect(got).toBe(refQ(vs, p));
        expect(got).toBeGreaterThanOrEqual(Math.min(...vs));
        expect(got).toBeLessThanOrEqual(Math.max(...vs));
        expect(quantile(series(vs), Math.max(p, q))!).toBeGreaterThanOrEqual(quantile(series(vs), Math.min(p, q))!);
        expect(quantile(series(vs), p)).toBe(got);
      }),
      { numRuns, seed },
    );
  });
  it("is the same for any order of the values, moves with a shift and a scale, and mirrors for negated values", () => {
    fc.assert(
      fc.property(values, ps, fc.integer({ min: 1, max: 9 }), fc.integer({ min: -50, max: 50 }), (vs, p, scale, shift) => {
        const got = quantile(series(vs), p)!;
        expect(quantile([...series(vs)].reverse(), p)).toBe(got);
        // Whole numbers, so that the moved values are exact in a double and the reference's text reads them the same.
        const whole = vs.map((v) => Math.round(v * 100));
        expect(quantile(series(whole.map((v) => v * scale + shift)), p)).toBe(refQ(whole.map((v) => v * scale + shift), p));
        // The mirror probability from a table: 1 − 0.9 in a double is not 0.1.
        const mirror = { 0: 1, 0.1: 0.9, 0.25: 0.75, 0.3: 0.7, 0.5: 0.5, 0.75: 0.25, 0.9: 0.1, 1: 0 }[p as 0]!;
        expect(quantile(series(vs.map((v) => -v)), mirror)).toBe(-got || 0);
      }),
      { numRuns, seed },
    );
  });
});

describe("usualRange", () => {
  it("is the median, the quartiles and the 10th to 90th percentile of the history, with how many values it rests on", () => {
    const got = usualRange(series([11, 3, 7, 1, 9, 5, 2, 10, 4, 8, 6]), "month");
    expect(got).toEqual({ n: 11, median: 6, q1: 3.5, q3: 8.5, low: 2, high: 10 });
  });
  it("is none for no values or fewer than the least asked for (one step either side)", () => {
    expect(usualRange([], "month")).toBeNull();
    expect(usualRange([], "month", { least: 0 })).toBeNull();
    expect(usualRange(series([1, 2, 3]), "month", { least: 4 })).toBeNull();
    expect(usualRange(series([1, 2, 3, 4]), "month", { least: 4 })).not.toBeNull();
  });
  it("takes only the values at the same place in the season as the period asked about", () => {
    // 36 months from January 2024: each January is 100 + 10·year, the rest 50.
    const v = Array.from({ length: 36 }, (_, i) => (i % 12 === 0 ? 100 + 10 * (i / 12) : 50));
    const january = usualRange(series(v), "month", { season: 12, at: "2027-01-01" })!;
    expect(january).toEqual({ n: 3, median: 110, q1: 105, q3: 115, low: 102, high: 118 });
    const march = usualRange(series(v), "month", { season: 12, at: "2025-03-01" })!;
    expect(march).toMatchObject({ n: 3, median: 50, low: 50, high: 50 });
    // A period before the history counts places by the same rule.
    expect(usualRange(series(v), "month", { season: 12, at: "2023-01-01" })).toEqual(january);
  });
  it("keeps to whole seasons: a season of 1 is every value, and one that is 0, negative, fractional or without a period asked about is none or all", () => {
    const s = series(wavy(10));
    expect(usualRange(s, "month", { season: 1, at: "2024-03-01" })!.n).toBe(10);
    for (const season of [0, -3, 2.5, NaN, Infinity]) expect(usualRange(s, "month", { season, at: "2024-03-01" }), String(season)).toBeNull();
    // A season with no period asked about is the whole history.
    expect(usualRange(s, "month", { season: 12 })!.n).toBe(10);
    expect(usualRange(s, "month", { at: "2024-03-01" })!.n).toBe(10);
    // A position with no values is none.
    expect(usualRange(s, "month", { season: 12, at: "2024-12-01" })).toBeNull();
  });
  it("counts seasons by the Metric's period: weeks, quarters and days", () => {
    const at = (span: "week" | "quarter", n: number) => Array.from({ length: n }, (_, i) => ({ period: span === "week" ? new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10) : new Date(Date.UTC(2020, 3 * i, 1)).toISOString().slice(0, 10), value: i % 4 === 0 ? 100 : 1 }));
    expect(usualRange(at("quarter", 12), "quarter", { season: 4, at: "2020-01-01" })).toMatchObject({ n: 3, median: 100 });
    expect(usualRange(at("week", 12), "week", { season: 4, at: "2024-01-01" })).toMatchObject({ n: 3, median: 100 });
  });
  it("says where a value stands: below, within (the ends included) or above", () => {
    const range = { low: 10, high: 20 };
    expect([9.99, 10, 15, 20, 20.01].map((v) => standing(range, v))).toEqual(["below", "within", "within", "within", "above"]);
  });
  it(`equals the reference exactly for every statistic, by season too, and is the same for any order (seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -2000, max: 2000 }).map((v) => v / 100), { minLength: 4, maxLength: 48 }), (vs) => {
        const got = usualRange(series(vs), "month")!;
        expect([got.median, got.q1, got.q3, got.low, got.high]).toEqual([0.5, 0.25, 0.75, 0.1, 0.9].map((p) => refQ(vs, p)));
        expect(got.low).toBeLessThanOrEqual(got.q1);
        expect(got.q3).toBeLessThanOrEqual(got.high);
        expect(usualRange([...series(vs)].reverse(), "month")).toEqual(got);
        const bySeason = usualRange(series(vs), "month", { season: 4, at: "2024-02-01" })!;
        const same = vs.filter((_, i) => i % 4 === 1);
        expect(bySeason.n).toBe(same.length);
        expect(bySeason.median).toBe(refQ(same, 0.5));
      }),
      { numRuns, seed },
    );
  });
});

describe("the Takeaway of a usual range", () => {
  const take = (vs: number[], opts: { value?: number; season?: number; at?: string } = {}, from = "2024-01") => usualRangeTakeaway("Revenue", series(vs, from), "month", unit, ctx, opts);
  const history = wavy(24);
  it("says what is usual in the Metric's unit, with the middle and the quartiles under Show the numbers and no footer (nothing is said about what goes together)", () => {
    const t = take(history);
    const got = usualRange(series(history), "month")!;
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe(`Revenue is usually between ${formatValue(unit, got.low, "1,234.5")} and ${formatValue(unit, got.high, "1,234.5")}, going by 24 months.`);
    expect(t.basis).toBe("from 24 months of history");
    expect(t.footer).toBeNull();
    expect(t.numbers.map((n) => n.label)).toEqual(["Method", "Middle", "Middle half", "Usual range", "Values used"]);
    expect(t.numbers[1].text).toBe(formatValue(unit, got.median, "1,234.5"));
    expect(t.numbers.map((n) => n.text)).toEqual(["Usual range", formatValue(unit, got.median, "1,234.5"), `${formatValue(unit, got.q1, "1,234.5")} – ${formatValue(unit, got.q3, "1,234.5")}`, `${formatValue(unit, got.low, "1,234.5")} – ${formatValue(unit, got.high, "1,234.5")}`, "24"]);
    expect(t.figures.map((f) => [f.label, f.value])).toEqual([["Usual low", got.low], ["Usual high", got.high]]);
  });
  it("says whether a value asked about is above, below or within", () => {
    const got = usualRange(series(history), "month")!;
    expect(take(history, { value: got.high + 100 }).sentence).toMatch(/ is above that\.$/);
    expect(take(history, { value: got.low - 100 }).sentence).toMatch(/ is below that\.$/);
    expect(take(history, { value: got.median }).sentence).toMatch(/ is within that\.$/);
    expect(take(history, { value: got.median }).figures.at(-1)).toMatchObject({ label: "Value asked about", value: got.median });
  });
  it("goes by the values at the same point of the year, and says so, or says there are none there", () => {
    const years = Array.from({ length: 36 }, (_, i) => 100 + 7 * ((i * 5) % 11) + (i % 12 === 0 ? 300 : 0));
    const t = take(years, { season: 12, at: "2027-01-01", value: 640 });
    expect(t.basis).toBe("from the 3 values at the same point of the year");
    expect(t.sentence).toMatch(/^Revenue is usually between 4\d\d € and 4\d\d €, going by 3 months\. The value asked about, 640 €, is above that\.$/);
    expect(take(wavy(8), { season: 12, at: "2024-12-01" })).toMatchObject({ kind: "refusal", refusal: "Revenue has no values at that point of the year to go by." });
  });
  it("goes by the season only when both the length and a period are given", () => {
    const years = Array.from({ length: 36 }, (_, i) => 100 + 7 * ((i * 5) % 11) + (i % 12 === 0 ? 300 : 0));
    expect(take(years, { season: 12 }).basis).toBe("from 36 months of history");
    expect(take(years, { at: "2027-01-01" }).basis).toBe("from 36 months of history");
    expect(take(years, { season: 12, at: "2027-01-01" }).basis).toBe("from the 3 values at the same point of the year");
  });
  it("holds the minimum of 8 periods: 7 refuses with how many it has, 8 answers (one step either side)", () => {
    expect(take(wavy(7))).toMatchObject({ kind: "refusal", refusal: "Not enough months yet: 7 of 8 needed.", sentence: null, figures: [], numbers: [] });
    expect(take(wavy(8)).kind).toBe("answer");
  });
  it("refuses a series that hardly changes, or that has too many months without a value", () => {
    expect(take(Array.from({ length: 12 }, () => 3)).refusal).toBe("Revenue has hardly changed, so there is nothing to compare.");
    const gappy = series(wavy(24).map((v, i) => (i % 3 === 0 ? null : v)));
    expect(usualRangeTakeaway("Revenue", gappy, "month", unit, ctx).kind).toBe("refusal");
  });
  it("uses only the values since a step in level and says so, when the minimum remains, and cautions when not", () => {
    const step = Array.from({ length: 24 }, (_, i) => 100 + ((i * 7) % 5) + (i >= 12 ? 300 : 0));
    const t = take(step);
    expect(t.notes).toEqual(["The level of Revenue changed around January 2025, so only the 12 months since then are used."]);
    expect(t.numbers.at(-1)).toEqual({ label: "Values used", text: "12" });
    // The step is at month 10 of 24, so the 14 months since are not the 10 before: the range is that of the later values.
    const early = Array.from({ length: 24 }, (_, i) => 100 + ((i * 7) % 5) + (i >= 10 ? 300 : 0));
    const e = take(early);
    expect(e.notes).toEqual(["The level of Revenue changed around November 2024, so only the 14 months since then are used."]);
    expect(e.numbers.at(-1)).toEqual({ label: "Values used", text: "14" });
    const since = usualRange(series(early.slice(10), "2024-11"), "month")!;
    expect(e.numbers.map((n) => n.text).slice(1, 4)).toEqual([formatValue(unit, since.median, "1,234.5"), `${formatValue(unit, since.q1, "1,234.5")} – ${formatValue(unit, since.q3, "1,234.5")}`, `${formatValue(unit, since.low, "1,234.5")} – ${formatValue(unit, since.high, "1,234.5")}`]);
    const late = Array.from({ length: 14 }, (_, i) => 100 + ((i * 7) % 5) + (i >= 9 ? 300 : 0));
    const c = take(late);
    expect(c.notes).toEqual([]);
    expect(c.cautions).toEqual(["The level of Revenue changed around October 2024, so older values may mislead."]);
    expect(c.numbers.at(-1)).toEqual({ label: "Values used", text: "14" });
  });
  it(`gives the same words twice, none a person would have to look up, no number in a refusal (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -30, max: 30 }), { minLength: 0, maxLength: 40 }), fc.option(fc.integer({ min: -40, max: 40 }), { nil: undefined }), (vs, value) => {
        const t = take(vs, { value });
        expect(take(vs, { value })).toEqual(t);
        for (const text of [t.sentence, t.refusal, t.basis, ...t.cautions, ...t.notes, ...t.numbers.map((n) => n.text)]) expect(text ?? "").not.toMatch(FORBIDDEN);
        if (t.kind === "refusal") expect(t).toMatchObject({ sentence: null, strength: null, footer: null, figures: [], numbers: [] });
      }),
      { numRuns, seed },
    );
  });
});
