// Lagged correlation (spec 0041, Method `laggedCorrelation`): equal to its reference (pairs by position in a list, Pearson's r on
// each) exactly up to the final square root, to SciPy's pearsonr on each shifted pair to 1e-9, hand-worked, hostile inputs,
// properties, and the Takeaway with the bar raised for the lags looked at.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { close, ex, FIXTURE, rootOf, series } from "../test/reference/methods-fixture";
import { referenceLagged } from "../test/reference/methods";
import { CHANCE_BY_TRIES, strengthOf } from "../takeaways/strength";
import type { TakeawayContext } from "../takeaways/takeaway";
import { laggedCorrelation, laggedTakeaway, MAX_LAG } from "./lagged-correlation";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const wavy = (n: number, step = 7, base = 10) => Array.from({ length: n }, (_, i) => base + ((i * step * 5) % 97) + (i % 7));
const delayed = (v: number[], by: number) => [...Array.from({ length: by }, (_, i) => 3 * i + 1), ...v.slice(0, v.length - by)];

describe("laggedCorrelation against SciPy and its reference", () => {
  it.each(Object.entries(FIXTURE.lag as Record<string, { a: number[]; b: number[]; lags: { lag: number; r: number | null; n: number }[] }>))("%s: SciPy's r at every lag to 1e-9, the pairs exactly", (name, c) => {
    const got = laggedCorrelation(series(c.a), series(c.b), "month");
    expect(got.lags.map((l) => [l.lag, l.n])).toEqual(c.lags.map((l) => [l.lag, l.n]));
    got.lags.forEach((l, i) => {
      const want = c.lags[i].r;
      if (want === null) expect(l.r).toBeNaN();
      else expect(close(l.r, want), `${name} lag ${l.lag}: ${l.r} vs ${want}`).toBe(true);
    });
  });
  it("finds the delay in a perfectly delayed series: r is exactly 1 at lag 2 and it is the best", () => {
    const a = wavy(36, 7);
    const got = laggedCorrelation(series(a), series(delayed(a, 2)), "month");
    expect(got.lags.find((l) => l.lag === 2)!.r).toBe(1);
    expect(got.best).toMatchObject({ lag: 2, r: 1, n: 34 });
    expect(got.lags.map((l) => l.lag)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("is worked out by hand: b is a delayed one period, 7 pairs at lag 1 and r = 1 there, while at lag 0 it is the exact Pearson r", () => {
    const got = laggedCorrelation(series([1, 3, 2, 5, 4, 8, 6, 9]), series([0, 1, 3, 2, 5, 4, 8, 6]), "month");
    expect(got.best).toMatchObject({ lag: 1, r: 1, n: 7 });
    // At lag 0, on 8 pairs: n·Sxy = 8·173 − 38·29 = 282, n·Sxx = 8·236 − 38² = 444, n·Syy = 8·155 − 29² = 399, so r² = 282² ÷ (444 · 399).
    expect(got.lags[0]).toEqual({ lag: 0, n: 8, r: Math.sqrt(79524 / 177156) });
  });
});

describe("laggedCorrelation on hostile input", () => {
  const a = wavy(12, 7);
  const b = wavy(12, 11);
  it("tries lags 0 to 6 and holds a longer or shorter request to that, whole periods only", () => {
    expect(MAX_LAG).toBe(6);
    const lags = (n: number) => laggedCorrelation(series(a), series(b), "month", n).lags.map((l) => l.lag);
    expect(lags(6)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(lags(99)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(lags(2)).toEqual([0, 1, 2]);
    expect(lags(2.9)).toEqual([0, 1, 2]);
    expect(lags(0)).toEqual([0]);
    expect(lags(-3)).toEqual([0]);
    expect(lags(NaN)).toEqual([]);
    expect(laggedCorrelation(series(a), series(b), "month", NaN).best).toBeNull();
  });
  it("leaves out a lag with fewer than 6 pairs: 11 periods have lags to 5, 12 have lags to 6 (one step either side)", () => {
    expect(laggedCorrelation(series(a.slice(0, 11)), series(b.slice(0, 11)), "month").lags.map((l) => l.lag)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(laggedCorrelation(series(a), series(b), "month").lags.at(-1)).toMatchObject({ lag: 6, n: 6 });
    expect(laggedCorrelation(series(a.slice(0, 5)), series(b.slice(0, 5)), "month")).toEqual({ lags: [], best: null });
    expect(laggedCorrelation([], [], "month")).toEqual({ lags: [], best: null });
  });
  it("has no r for a series that does not change, never the best, and no best when none has a number", () => {
    const flat = laggedCorrelation(series(a), series(Array.from({ length: 12 }, () => 5)), "month");
    expect(flat.lags.every((l) => Number.isNaN(l.r))).toBe(true);
    expect(flat.best).toBeNull();
    // Only the lag with a change counts: a series flat except at its end has a number at lag 0 only where the values differ.
    const late = laggedCorrelation(series(a), series([1, 2, 3, 4, 5, 6, 5, 5, 5, 5, 5, 5]), "month");
    expect(late.lags.filter((l) => Number.isNaN(l.r)).map((l) => l.lag)).toEqual([6]);
    expect(late.best!.lag).not.toBe(6);
  });
  it("takes the shorter lag when two have the same size of r", () => {
    // b rises with a at once and falls the same way at lag 1: equal |r| of a symmetric series at lags 0 and 1 is not forced; use a mirror.
    const x = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const y = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const got = laggedCorrelation(series(x), series(y), "month");
    expect(got.best!.lag).toBe(0);
    expect(got.lags.filter((l) => l.r === got.best!.r).length).toBeGreaterThanOrEqual(1);
    const flipped = laggedCorrelation(series(x), series(y.map((v) => -v)), "month");
    expect(flipped.best).toMatchObject({ lag: 0, r: -1 });
  });
  it("reads a gap as a missing pair, not as a shift: the periods carry the position", () => {
    const withGap = series([...a.slice(0, 5), null, ...a.slice(6)]);
    const got = laggedCorrelation(withGap, series(b), "month");
    expect(got.lags[0].n).toBe(11);
    expect(got.lags[3].n).toBe(8);
    expect(laggedCorrelation(series(a), series(b, "2030-01"), "month")).toEqual({ lags: [], best: null });
  });
  it("leaves out values that are not numbers, counts a period twice once, and orders unsorted input", () => {
    const clean = laggedCorrelation(series(a), series(b), "month");
    const dirty = laggedCorrelation([{ period: "2031-01-01", value: NaN }, ...[...series(a)].reverse(), { period: series(a)[0].period, value: 999 }, { period: series(a)[0].period, value: a[0] }], [...series(b)].reverse(), "month");
    expect(dirty).toEqual(clean);
  });
  it("lags by the Metric's own period: a weekly series shifts by weeks, a quarterly one by quarters", () => {
    const weekly = (vs: number[]) => vs.map((value, i) => ({ period: new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10), value }));
    const x = wavy(20, 7);
    expect(laggedCorrelation(weekly(x), weekly(delayed(x, 3)), "week").best).toMatchObject({ lag: 3, r: 1 });
    const quarterly = (vs: number[]) => vs.map((value, i) => ({ period: new Date(Date.UTC(2020, 3 * i, 1)).toISOString().slice(0, 10), value }));
    expect(laggedCorrelation(quarterly(x), quarterly(delayed(x, 2)), "quarter").best).toMatchObject({ lag: 2, r: 1 });
  });
});

describe("laggedCorrelation properties", () => {
  const gaps = fc.integer({ min: 8, max: 20 }).chain((n) => fc.tuple(fc.array(fc.option(fc.integer({ min: -9, max: 9 }), { nil: null, freq: 5 }), { minLength: n, maxLength: n }), fc.array(fc.option(fc.integer({ min: -9, max: 9 }), { nil: null, freq: 5 }), { minLength: n, maxLength: n })));
  it(`equals its reference at every lag exactly up to the root, pairs by position, with gaps (seed ${seed})`, () => {
    fc.assert(
      fc.property(gaps, ([a, b]) => {
        const got = laggedCorrelation(series(a), series(b), "month");
        const want = referenceLagged(a.map((v) => (v === null ? null : ex(v))), b.map((v) => (v === null ? null : ex(v))), 6);
        // A lag whose pairs do not vary has no r in the reference (null) and NaN in the code.
        expect(got.lags.map((l) => [l.lag, l.n])).toEqual(want.map((l) => [l.lag, l.n]));
        got.lags.forEach((l, i) => (want[i].r === null ? expect(l.r).toBeNaN() : expect(l.r).toBe(rootOf(want[i].r!))));
        if (got.best) {
          expect(got.lags.every((l) => !Number.isFinite(l.r) || Math.abs(l.r) <= Math.abs(got.best!.r))).toBe(true);
          expect(got.lags.find((l) => Number.isFinite(l.r) && Math.abs(l.r) === Math.abs(got.best!.r))!.lag).toBe(got.best.lag);
          expect(Math.abs(got.best.r)).toBeLessThanOrEqual(1);
        }
        expect(laggedCorrelation(series(a), series(b), "month")).toEqual(got);
      }),
      { numRuns, seed },
    );
  });
  it("gives the same r for a scaled and shifted series, the opposite sign for a negated one, the same for any order of the periods", () => {
    fc.assert(
      fc.property(gaps, fc.integer({ min: 1, max: 9 }), fc.integer({ min: -30, max: 30 }), ([a, b], scale, shift) => {
        const got = laggedCorrelation(series(a), series(b), "month");
        const moved = laggedCorrelation(series(a.map((v) => (v === null ? null : v * scale + shift))), series(b), "month");
        expect(moved).toEqual(got);
        const neg = laggedCorrelation(series(a), series(b.map((v) => (v === null ? null : -v))), "month");
        neg.lags.forEach((l, i) => expect(l.r === 0 || Number.isNaN(l.r) ? Math.abs(l.r) || l.r : l.r).toBe(Number.isNaN(got.lags[i].r) ? NaN : -got.lags[i].r || 0));
        expect(laggedCorrelation([...series(a)].reverse(), [...series(b)].reverse(), "month")).toEqual(got);
      }),
      { numRuns, seed },
    );
  });
});

describe("the Takeaway of a lagged correlation", () => {
  const take = (a: number[], b: number[], basis: "values" | "changes" = "values") => laggedTakeaway("Tickets", "Churn", series(a), series(b), "month", basis, ctx);
  const x = wavy(36, 7);
  it("says which one moves first and by how long, with the footer once and the numbers", () => {
    const t = take(x, delayed(x, 2));
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("Tickets tends to move 2 months before Churn does, over 34 months (strong).");
    expect(t.basis).toBe("compared by value, over 34 months");
    expect(t.footer).toBe("This shows what has gone together, not what caused what.");
    expect(t.numbers.map((n) => n.label)).toEqual(["Method", "Delay (periods)", "r", "Pairs of periods", "Delays looked at", "Compared on", "Strength"]);
    expect(t.numbers[1].text).toBe("2");
    expect(t.numbers[4].text).toBe("7");
    expect(t.figures).toEqual([{ label: "Delay (periods)", value: 2, text: "2" }, { label: "Pairs of periods", value: 34, text: "34" }]);
    expect(take(x, delayed(x, 1).map((v) => -v)).sentence).toBe("Tickets tends to move the other way 1 month before Churn does, over 35 months (strong).");
    expect(take(x, x, "changes").sentence).toBe("Tickets and Churn tend to move together in the same month, with no delay, over 36 months (strong).");
    expect(take(x, x.map((v) => -v)).sentence).toBe("Tickets and Churn tend to move in opposite directions in the same month, with no delay, over 36 months (strong).");
    expect(take(x, x, "changes").basis).toBe("compared by change, growth removed, over 36 months");
  });
  it("says it cannot tell from chance for an unrelated pair, naming the delays tried", () => {
    const t = take(wavy(24, 7), wavy(24, 11));
    expect(t.strength).toBe("cant-tell");
    expect(t.sentence).toBe("Over 18 months, nothing clearly shows Tickets moving 0 to 6 months before Churn: can't tell from chance.");
  });
  it("counts the delays that have a number, and says how many it looked at: a series flat from the last six months leaves 6 of the 7", () => {
    const t = take([1, 3, 2, 5, 4, 6, 9, 8, 9, 8, 9, 8], [1, 3, 2, 5, 4, 6, 9, 9, 9, 9, 9, 9]);
    expect(t.numbers[4]).toEqual({ label: "Delays looked at", text: "6" });
    expect(take(x, x).numbers[4]).toEqual({ label: "Delays looked at", text: "7" });
    expect(CHANCE_BY_TRIES[6]).toBeGreaterThan(CHANCE_BY_TRIES[0]);
  });
  it("does not call a delayed link a changed one: the halves are judged on the pairs of the best delay, so a steady lead of 6 months stays strong", () => {
    const a = wavy(40, 7);
    const t = take(a, delayed(a, 6).map((v) => 2 * v + 1));
    expect(t.numbers[1].text).toBe("6");
    expect(t.cautions).toEqual([]);
    expect(t.strength).toBe("strong");
  });
  it("counts the periods the two series share for the minimum of 12: 8 shared months with 10 pairs at a delay of 2 are refused", () => {
    const a = wavy(24, 7);
    // The second series starts 16 months later: 8 months in common.
    const t = laggedTakeaway("Tickets", "Churn", series(a), series(delayed(a, 2).slice(16, 40), "2025-05"), "month", "values", ctx);
    expect(t.refusal).toBe("Not enough months yet: 8 of 12 needed.");
    expect(t.sentence).toBeNull();
  });
  it("says the same number of months in the sentence and in the basis, also where nothing stands out", () => {
    const t = take(wavy(24, 7), wavy(24, 11));
    expect(t.strength).toBe("cant-tell");
    expect(t.sentence).toContain("Over 18 months");
    expect(t.basis).toBe("compared by value, over 18 months");
  });
  it("holds the minimum to the shorter series: 12 and 11 periods refuse with 11", () => {
    expect(laggedTakeaway("A", "B", series(wavy(12, 7)), series(wavy(11, 11)), "month", "values", ctx).refusal).toBe("Not enough months yet: 11 of 12 needed.");
    expect(laggedTakeaway("A", "B", series(wavy(11, 7)), series(wavy(12, 11)), "month", "values", ctx).refusal).toBe("Not enough months yet: 11 of 12 needed.");
    expect(laggedTakeaway("A", "B", series(wavy(12, 7)), series(wavy(12, 11)), "month", "values", ctx).kind).toBe("answer");
  });
  it("says what the best delay reads without far-off months, whether they are in the first series or the second", () => {
    const a = wavy(30, 7);
    const clean = delayed(a, 2).map((v) => 2 * v + 1);
    for (const [xs, ys] of [[a.map((v, i) => (i === 5 || i === 6 ? 5000 : v)), clean], [a, clean.map((v, i) => (i === 7 || i === 8 ? -5000 : v))]]) {
      const t = laggedTakeaway("Tickets", "Churn", series(xs), series(ys), "month", "values", ctx);
      const left = new Set(series(xs).filter((_, i) => (xs === a ? i === 7 || i === 8 : i === 5 || i === 6)).map((p) => p.period));
      // The delay the far-off months leave as the best one is the one read without them.
      const best = laggedCorrelation(series(xs), series(ys), "month").best!;
      const without = laggedCorrelation(series(xs).filter((p) => !left.has(p.period)), series(ys).filter((p) => !left.has(p.period)), "month", best.lag).lags.find((l) => l.lag === best.lag)!;
      const word = strengthOf(without.r, best.n - 2);
      const said = t.cautions.find((c) => c.startsWith("This result is pulled"));
      // Far-off months in the first series pull the result; in the second alone they may leave it where it was, and then nothing is said.
      if (xs !== a) expect(said).toBeDefined();
      if (said) expect(said).toBe(`This result is pulled by 2 months far from the rest; without them it reads ${word === "cant-tell" ? "can't tell from chance" : word}.`);
    }
  });
  it("says nothing of far-off months when too few pairs would be left without them, and does not fail", () => {
    const a = [0, 0, 0, -19, 0, 8, -9, 0, 0, 0, 0, 0, 0];
    const b = [0, 0, 0, 0, 0, 0, 0, -1, -1, 1, -1, -30, 4];
    const t = take(a, b);
    expect(t.cautions.filter((c) => c.startsWith("This result is pulled"))).toEqual([]);
    expect(["answer", "refusal"]).toContain(t.kind);
  });
  it("puts a caution above an answer where a month has no value, and what would be strong is moderate", () => {
    const a = wavy(30, 7);
    const t = laggedTakeaway("Tickets", "Churn", series(a), series(delayed(a, 2).map((v, i) => (i === 12 ? null : v))), "month", "values", ctx);
    expect(t.cautions).toEqual(["Tickets and Churn: no value for 1 of 28 months, left out."]);
    expect(t.strength).toBe("moderate");
  });
  it("holds the minimum of 12 periods: 11 refuses with how many it has, 12 answers (one step either side)", () => {
    const [y, z] = [wavy(12, 7), wavy(12, 11)];
    expect(take(y.slice(0, 11), z.slice(0, 11))).toMatchObject({ kind: "refusal", refusal: "Not enough months yet: 11 of 12 needed.", sentence: null, strength: null, footer: null, figures: [], numbers: [] });
    expect(take(y, z).kind).toBe("answer");
  });
  it("refuses series that hardly change or share no periods, in words", () => {
    expect(take(x, Array.from({ length: 36 }, () => 2)).refusal).toBe("Churn has hardly changed, so there is nothing to compare.");
    expect(laggedTakeaway("A", "B", series(wavy(12)), series(wavy(12, 11), "2030-01"), "month", "values", ctx).refusal).toBe("Not enough months yet: 0 of 12 needed.");
    // A far-off value in series that share no period: there is no best delay to leave it out of, so it is said as no periods in common.
    expect(laggedTakeaway("A", "B", series([...wavy(11), 1000]), series(wavy(12, 11), "2030-01"), "month", "values", ctx).refusal).toBe("Not enough months yet: 0 of 12 needed.");
  });
  it("puts a caution above an answer where a few periods pull the result, and never calls it strong", () => {
    const a = wavy(30, 7);
    const far = (vs: number[]) => vs.map((v, i) => (i < 2 ? 5000 + 3 * i : v));
    const t = take(far(a), far(a.map((v) => 200 - v)));
    expect(t.kind).toBe("answer");
    expect(t.cautions).toContain("This result is pulled by 2 months far from the rest; without them it reads strong.");
    expect(t.strength).toBe("moderate");
  });
  it(`gives the same words twice, none a person would have to look up, no number in a refusal (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 8, max: 40 }).chain((n) => fc.tuple(fc.array(fc.integer({ min: -30, max: 30 }), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: -30, max: 30 }), { minLength: n, maxLength: n }))), ([a, b]) => {
        const t = take(a, b);
        expect(take(a, b)).toEqual(t);
        for (const text of [t.sentence, t.refusal, t.basis, ...t.cautions, ...t.notes, ...t.numbers.map((n) => n.text)]) expect(text ?? "").not.toMatch(FORBIDDEN);
        if (t.kind === "refusal") expect(t).toMatchObject({ sentence: null, strength: null, footer: null, figures: [], numbers: [] });
        else if (t.cautions.length > 0) expect(t.strength).not.toBe("strong");
      }),
      { numRuns, seed },
    );
  });
});
