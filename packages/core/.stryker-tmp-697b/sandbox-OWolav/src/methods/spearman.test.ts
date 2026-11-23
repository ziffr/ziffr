// @ts-nocheck
// Rank correlation (spec 0041, Method `spearman`): equal to its reference exactly up to the final square root, to SciPy's
// spearmanr to 1e-9, with hand-worked cases, hostile inputs, properties, and the Takeaway.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { nearestDoubleOf } from "../test/reference/exact";
import { close, FIXTURE, series } from "../test/reference/methods-fixture";
import { referenceSpearman } from "../test/reference/suitability";
import { CHANCE_BY_TRIES, strengthOf } from "../takeaways/strength";
import { checkSuitability } from "../suitability";
import type { TakeawayContext } from "../takeaways/takeaway";
import { RANK_SPREAD, rankStrength, spearman, spearmanTakeaway } from "./spearman";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const reference = (a: number[], b: number[]) => {
  const r = referenceSpearman(a, b);
  return r === null ? NaN : (r.negative ? -1 : 1) * Math.sqrt(nearestDoubleOf(r.squared));
};
const wavy = (n: number, step = 7) => Array.from({ length: n }, (_, i) => 10 + ((i * step * 5) % 97) + i / 100);

describe("spearman against SciPy and its reference", () => {
  it.each(Object.entries(FIXTURE.spearman as Record<string, { a: number[]; b: number[]; rho: number }>))("%s: SciPy's rho to 1e-9, the reference exactly", (name, c) => {
    const got = spearman(series(c.a), series(c.b))!;
    expect(got.n).toBe(c.a.length);
    expect(close(got.rho, c.rho), `${name}: ${got.rho} vs ${c.rho}`).toBe(true);
    expect(got.rho).toBe(reference(c.a, c.b));
  });
  it("is worked out by hand: a rank swap of neighbours is 1 − 6·6 ÷ 210 = 29/35; Anscombe's first set is 9/11", () => {
    expect(spearman(series([1, 2, 3, 4, 5, 6]), series([2, 1, 4, 3, 6, 5]))!.rho).toBe(Math.sqrt(841 / 1225));
    expect(spearman(series([10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5]), series([8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]))!.rho).toBe(Math.sqrt(81 / 121));
  });
  it("is exactly 1 for any rising curve and −1 for any falling one, and ignores how far off a value is", () => {
    expect(spearman(series([1, 2, 3, 4, 5, 6, 7]), series([1, 8, 27, 64, 125, 216, 343]))!.rho).toBe(1);
    expect(spearman(series([1, 2, 3, 4, 5, 6, 7]), series([49, 36, 25, 16, 9, 4, 1]))!.rho).toBe(-1);
    expect(spearman(series([1, 2, 3, 4, 5, 6, 7, 8]), series([1, 2, 3, 4, 5, 6, 7, 1e300]))!.rho).toBe(1);
  });
});

describe("spearman on hostile input", () => {
  const six = [3, 1, 4, 1.5, 9, 2.6];
  it("needs 6 pairs: 5 is none, 6 is a number (one step either side)", () => {
    expect(spearman(series(six.slice(0, 5)), series([2, 7, 1, 8, 2.8]))).toBeNull();
    expect(spearman(series(six), series([2, 7, 1, 8, 2.8, 1.8]))).not.toBeNull();
    expect(spearman([], [])).toBeNull();
    expect(spearman(series([1]), series([1]))).toBeNull();
  });
  it("has no r (NaN) where one side's values are all equal, and still counts the pairs", () => {
    const flat = spearman(series([5, 5, 5, 5, 5, 5, 5]), series([1, 2, 3, 4, 5, 6, 7]))!;
    expect(flat.rho).toBeNaN();
    expect(flat.n).toBe(7);
    expect(spearman(series([1, 2, 3, 4, 5, 6, 7]), series([5, 5, 5, 5, 5, 5, 5]))!.rho).toBeNaN();
  });
  it("leaves out a value that is not a number, counts a period given twice once with the last value, and orders unsorted input", () => {
    const a = series([1, 2, 3, 4, 5, 6, 7, 8]);
    const b = series([8, 7, 6, 5, 4, 3, 2, 1]);
    const dirty = [{ period: "2025-01-01", value: NaN }, { period: "2025-02-01", value: Infinity }, ...[...a].reverse(), { period: a[0].period, value: 0 }, { period: a[0].period, value: 1 }];
    const clean = spearman(a, b)!;
    const got = spearman(dirty, b)!;
    expect(got.rho).toBe(-1);
    expect(got.n).toBe(clean.n);
    expect(got.pairs.map((p) => p.period)).toEqual(a.map((p) => p.period));
  });
  it("pairs only the periods both series have", () => {
    const a = series([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const b = series([null, null, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(spearman(a, b)!.n).toBe(8);
    expect(spearman(series([1, 2, 3, 4, 5, 6, 7]), series([1, 2, 3, 4, 5, 6, 7], "2030-01"))).toBeNull();
  });
  it("works for huge and tiny values (the exact text), and for decimals that are not exact in a double", () => {
    expect(spearman(series([1e300, 2e300, 3e300, 4e300, 5e300, 6e300]), series([1e-300, 3e-300, 2e-300, 5e-300, 4e-300, 6e-300]))!.rho).toBe(Math.sqrt(961 / 1225));
    expect(spearman(series([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]), series([0.6, 0.5, 0.4, 0.3, 0.2, 0.1]))!.rho).toBe(-1);
  });
});

describe("spearman properties", () => {
  const ints = fc.integer({ min: 6, max: 14 }).chain((n) => fc.tuple(fc.array(fc.integer({ min: -9, max: 9 }), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: -9, max: 9 }), { minLength: n, maxLength: n })));
  const decimals = fc.integer({ min: 6, max: 12 }).chain((n) => fc.tuple(fc.array(fc.integer({ min: -500, max: 500 }).map((v) => v / 100), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: -500, max: 500 }).map((v) => v / 100), { minLength: n, maxLength: n })));
  it(`equals its reference exactly (ties, decimals, flat series), is symmetric, within −1 and 1, deterministic (seed ${seed})`, () => {
    for (const gen of [ints, decimals]) {
      fc.assert(
        fc.property(gen, ([a, b]) => {
          const got = spearman(series(a), series(b))!;
          expect(got.rho).toBe(reference(a, b));
          expect(spearman(series(b), series(a))!.rho).toBe(got.rho);
          expect(spearman(series(a), series(b))).toEqual(got);
          if (Number.isFinite(got.rho)) expect(Math.abs(got.rho)).toBeLessThanOrEqual(1);
        }),
        { numRuns, seed },
      );
    }
  });
  it("is the same for any rising change of either series, flips its sign for a falling one, and for any order of the periods", () => {
    fc.assert(
      fc.property(ints, fc.integer({ min: 1, max: 5 }), fc.integer({ min: -20, max: 20 }), ([a, b], scale, shift) => {
        const got = spearman(series(a), series(b))!.rho;
        expect(spearman(series(a.map((v) => v * scale + shift)), series(b.map((v) => v ** 3)))!.rho).toBe(got);
        const falling = spearman(series(a.map((v) => -v * scale)), series(b))!.rho;
        expect(falling).toBe(Number.isNaN(got) ? NaN : -got || 0);
        const [pa, pb] = [series(a), series(b)];
        expect(spearman([...pa].reverse(), [...pb].sort((x, y) => (x.period < y.period ? 1 : -1)))!.rho).toBe(got);
      }),
      { numRuns, seed },
    );
  });
});

describe("rank strength", () => {
  it("reads the chance rule on 3 + (n − 3) ÷ 1.06 pairs: a step either side of the point where tanh(z) just clears the bar", () => {
    expect(RANK_SPREAD).toBe(1.06);
    for (const n of [8, 12, 24, 60]) {
      const z = CHANCE_BY_TRIES[0] / Math.sqrt((n - 3) / RANK_SPREAD);
      const rc = (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1);
      expect(rankStrength(rc * (1 - 1e-9), n), `n=${n}`).toBe("cant-tell");
      expect(rankStrength(rc * (1 + 1e-9), n), `n=${n}`).not.toBe("cant-tell");
    }
    // Where Pearson's bar is cleared and Fieller's is not: a rho between the two critical values at n = 12.
    expect(rankStrength(0.6, 12)).toBe("moderate");
    expect(rankStrength(0.9, 12, true)).toBe("moderate");
    expect(rankStrength(0.9, 30)).toBe("strong");
  });
});

describe("the Takeaway of a rank correlation", () => {
  const take = (a: number[], b: number[], basis: "values" | "changes" = "values") => spearmanTakeaway("Visits", "Revenue", series(a), series(b), "month", basis, ctx);
  it("says what it found, by rank, with the footer once and the numbers", () => {
    const a = wavy(24);
    const t = take(a, a.map((v) => v * v));
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("Visits and Revenue tend to move together over 24 months (strong).");
    expect(t.basis).toBe("compared by rank of value, over 24 months");
    expect(t.footer).toBe("This shows what has gone together, not what caused what.");
    expect(t.numbers.map((n) => n.label)).toEqual(["Method", "Rank correlation", "Pairs of periods", "Periods", "Compared on", "Strength"]);
    expect(t.numbers[1].text).toBe("1.00");
    expect(t.numbers.map((n) => n.text)).toEqual(["Spearman's rank correlation", "1.00", "24", `${series(a)[0].period} – ${series(a)[23].period}`, "compared by rank of value", "strong"]);
    expect(t.figures).toEqual([{ label: "Pairs of periods", value: 24, text: "24" }]);
    expect(take(a, a.map((v) => -v)).sentence).toBe("Visits and Revenue tend to move in opposite directions over 24 months (strong).");
    expect(take(a, a, "changes").basis).toBe("compared by rank of change, growth removed, over 24 months");
  });
  it("says it cannot tell from chance for a weak rank link", () => {
    const t = take(wavy(24, 7), wavy(24, 11));
    expect(t.strength).toBe("cant-tell");
    expect(t.sentence).toMatch(/^Over 24 months, Visits and Revenue do not clearly move together: can't tell from chance\.$/);
  });
  it("refuses with fewer pairs than the Method's 6, and for series that hardly change, with no number", () => {
    const few = take([1, 2, 3, 4, 5], [5, 4, 3, 2, 1]);
    expect(few).toMatchObject({ kind: "refusal", sentence: null, strength: null, footer: null, figures: [], numbers: [], refusal: "Not enough months yet: 5 of 6 needed." });
    expect(take([1, 2, 3, 4, 5, 6], [6, 5, 4, 3, 2, 1]).kind).toBe("answer");
    expect(take(wavy(8), [3, 3, 3, 3, 3, 3, 3, 3]).refusal).toBe("Revenue has hardly changed, so there is nothing to compare.");
    expect(spearmanTakeaway("A", "B", [], [], "month", "values", ctx).refusal).toBe("Not enough months yet: 0 of 6 needed.");
  });
  it("puts a caution above an answer where a period has no value or a few periods pull the result, and never calls it strong", () => {
    const a = wavy(24, 7);
    // One month without a value in the second series: left out, said, and what would be strong is moderate.
    const gap = spearmanTakeaway("Visits", "Revenue", series(a), series(a.map((v, i) => (i === 10 ? null : v * 2))), "month", "values", ctx);
    expect(gap.cautions).toEqual(["Visits and Revenue: no value for 1 of 24 months, left out."]);
    expect(gap.strength).toBe("moderate");
    expect(take(a, a.map((v) => v * 2)).strength).toBe("strong");
    // Two far-off months that pull the ranks the other way.
    const far = (vs: number[]) => vs.map((v, i) => (i < 2 ? 5000 + 3 * i : v));
    const t = take(far(wavy(30, 7)), far(wavy(30, 7).map((v) => 200 - v)));
    expect(t.cautions[0]).toBe("This result is pulled by 2 months far from the rest; without them it reads strong.");
    expect(t.strength).toBe("moderate");
  });
  it(`never holds a word a person would have to look up, and gives the same words twice (${numRuns} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 30 }).chain((n) => fc.tuple(fc.array(fc.integer({ min: -30, max: 30 }), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: -30, max: 30 }), { minLength: n, maxLength: n }))), ([a, b]) => {
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

describe("the far-off caution reads the rank bar, not Pearson's", () => {
  it("says 'without them' by the chance rule of a rank correlation: a rho that Pearson's bar would pass is not told from chance", () => {
    const x = [1000, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => v * 10)];
    const y = [-1000, ...[5, 4, 2, 3, 6, 1, 10, 7, 8, 9].map((v) => v * 10)];
    const without = spearman(series(x).slice(1), series(y).slice(1))!;
    // Pearson's bar would call the result without them moderate; the rank bar cannot tell it from chance.
    expect(strengthOf(without.rho, without.n)).not.toBe("cant-tell");
    expect(rankStrength(without.rho, without.n)).toBe("cant-tell");
    const t = spearmanTakeaway("A", "B", series(x), series(y), "month", "values", ctx);
    expect(t.cautions[0]).toBe("This result is pulled by 1 month far from the rest; without them it reads can't tell from chance.");
  });
  it("and the link that changed is judged on ranks too: a rise that is steady in rank but not in size is not called weaker", () => {
    const x = Array.from({ length: 24 }, (_, i) => i + 1);
    const y = [...x.slice(0, 12), ...x.slice(12, 23), 1e6];
    const t = spearmanTakeaway("A", "B", series(x), series(y), "month", "values", ctx);
    expect(t.cautions.filter((c) => c.startsWith("This link"))).toEqual([]);
    expect(correlationLikeWeaker(x, y)).toBe(true);
  });
});

// Pearson's r of the two halves, as the changing-link check used to judge them: the first is 1, the second well under half.
function correlationLikeWeaker(x: number[], y: number[]): boolean {
  const verdict = checkSuitability("correlation", { series: [{ name: "A", points: series(x) }, { name: "B", points: series(y) }], span: "month", periods: 24 });
  return verdict.cautions.some((c) => c.case === "caution-link-weaker");
}

describe("the changed-link check on ranks", () => {
  it("says nothing of a half that does not vary (it has no rank correlation), and of a link that is the same in both halves", () => {
    const x = Array.from({ length: 24 }, (_, i) => i + 1);
    const check = (y: number[]) => checkSuitability("spearman", { series: [{ name: "A", points: series(x) }, { name: "B", points: series(y) }], span: "month", periods: 24, rank: true }).cautions;
    expect(check([...Array.from({ length: 12 }, () => 5), ...x.slice(12)]).filter((c) => c.case.startsWith("caution-link"))).toEqual([]);
    expect(check(x).filter((c) => c.case.startsWith("caution-link"))).toEqual([]);
    // A link that reverses between the halves is a flip, whatever the statistic.
    expect(check([...x.slice(0, 12), ...x.slice(12).reverse()]).map((c) => c.case)).toContain("caution-link-flipped");
  });
});

describe("the changed-link check judges by ranks, in size and in words", () => {
  it("calls a link flipped when the halves have opposite rank correlations, and names the latest half by the rank bar: 0.58 over 12 pairs is moderate by Pearson's bar and not told from chance by the rank bar", () => {
    const first = Array.from({ length: 12 }, (_, i) => 12 - i);
    const last = [6, 1, 3, 4, 8, 2, 10, 7, 12, 9, 11, 5].map((v) => v + 12);
    const x = Array.from({ length: 24 }, (_, i) => i + 1);
    const cautions = checkSuitability("spearman", { series: [{ name: "A", points: series(x) }, { name: "B", points: series([...first, ...last]) }], span: "month", periods: 24, rank: true }).cautions;
    expect(cautions.map((c) => [c.case, c.slots.latest])).toEqual([["caution-link-flipped", "cant-tell"]]);
    expect(strengthOf(0.5804195804195804, 12)).not.toBe("cant-tell");
    // A latest half that is clearly there is named as it is.
    const strong = checkSuitability("spearman", { series: [{ name: "A", points: series(x) }, { name: "B", points: series([...first, ...x.slice(12)]) }], span: "month", periods: 24, rank: true }).cautions;
    expect(strong.map((c) => [c.case, c.slots.latest])).toEqual([["caution-link-flipped", "strong"]]);
    // A weaker link: rank correlation 1 in the first half and 0.3 in the second (sum of squared rank differences 200 over 12 pairs), by ranks and not by values.
    const weaker = checkSuitability("spearman", { series: [{ name: "A", points: series(x) }, { name: "B", points: series([...x.slice(0, 12), ...[2, 3, 9, 1, 10, 5, 12, 11, 7, 8, 4, 6].map((v) => v + 12)]) }], span: "month", periods: 24, rank: true }).cautions;
    expect(weaker.map((c) => c.case)).toContain("caution-link-weaker");
  });
});
