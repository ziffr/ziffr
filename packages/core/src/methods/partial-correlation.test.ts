// Partial correlation (spec 0041, Method `partialCorrelation`): equal to its reference (the correlation of what is left after
// a least-squares fit on the controls, by Cramer's rule) exactly up to the final square root, to NumPy and SciPy to 1e-9,
// hand-worked, hostile inputs, properties, and the Takeaway with its suitability limits one step either side.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { close, ex, FIXTURE, rootOf, series } from "../test/reference/methods-fixture";
import { referencePartial } from "../test/reference/methods";
import type { TakeawayContext } from "../takeaways/takeaway";
import { CONTROLS, partialCorrelation, partialStrength, partialTakeaway } from "./partial-correlation";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const S = (vs: number[]) => series(vs);
const exacts = (vs: number[]) => vs.map(ex);
const ref = (a: number[], b: number[], cs: number[][]) => referencePartial(exacts(a), exacts(b), cs.map(exacts));
/** Values with no pattern a few periods long, different for each step. */
const wavy = (n: number, step = 7, base = 10) => Array.from({ length: n }, (_, i) => base + ((i * step * 5) % 97) + (i % 7));

describe("partialCorrelation against NumPy, SciPy and its reference", () => {
  it.each(Object.entries(FIXTURE.partial as Record<string, { a: number[]; b: number[]; controls: number[][]; r: number }>))("%s: the NumPy and SciPy r to 1e-9, the reference exactly", (name, c) => {
    const got = partialCorrelation(S(c.a), S(c.b), c.controls.map(S));
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.n).toBe(c.a.length);
    expect(got.held).toBe(c.controls.length);
    expect(close(got.r, c.r), `${name}: ${got.r} vs ${c.r}`).toBe(true);
    const want = ref(c.a, c.b, c.controls);
    expect(want.kind).toBe("ok");
    if (want.kind === "ok") expect(got.r).toBe(rootOf(want));
  });
  it("is worked out by hand: with Sab = 29, Saa = Sbb = Szz = 42, Sza = 38, Szb = 39 the part left is −264/42 over √(320/42 · 243/42), so r = −√(121/135)", () => {
    const z = [1, 2, 3, 4, 5, 6, 7, 8];
    const got = partialCorrelation(S([2, 1, 4, 3, 6, 5, 8, 7]), S([1, 3, 2, 5, 4, 7, 6, 8]), [S(z)]);
    expect(got).toMatchObject({ ok: true, n: 8, held: 1 });
    expect(got.ok && got.r).toBe(-Math.sqrt(121 / 135));
  });
  it("is exactly 0, not minus 0, where what is left of a and b has no link: the parts left are orthogonal", () => {
    // With z = 1 to 8, e1 and e2 are each orthogonal to a constant and to z and to each other, so a = z + e1 and b = 2z + e2 leave e1 and e2.
    const z = [1, 2, 3, 4, 5, 6, 7, 8];
    const [e1, e2] = [[1, -1, -1, 1, 1, -1, -1, 1], [1, -1, 1, -1, -1, 1, -1, 1]];
    const got = partialCorrelation(S(z.map((v, i) => v + e1[i])), S(z.map((v, i) => 2 * v + e2[i])), [S(z)]);
    expect(got).toMatchObject({ ok: true });
    expect(Object.is(got.ok && got.r, 0)).toBe(true);
  });
  it("recovers exact relations: a equal to b with a control gives 1, the opposite −1; a mix of the control and noise held out gives the noise's link", () => {
    const b = wavy(10, 7);
    const z = wavy(10, 3, 50);
    expect(partialCorrelation(S(b), S(b), [S(z)])).toMatchObject({ ok: true, r: 1 });
    expect(partialCorrelation(S(b.map((v) => -v)), S(b), [S(z)])).toMatchObject({ ok: true, r: -1 });
    // a = b + 2z and b: with z held, what is left of a is b's, so the link is exactly 1.
    expect(partialCorrelation(S(b.map((v, i) => v + 2 * z[i])), S(b), [S(z)])).toMatchObject({ ok: true, r: 1 });
  });
});

describe("partialCorrelation on hostile input", () => {
  const [a, b, z] = [wavy(12, 7), wavy(12, 11), wavy(12, 3, 50)];
  it("takes 1 to 4 controls: none and five are refused, in words, with no number (one step either side)", () => {
    expect(partialCorrelation(S(a), S(b), [])).toEqual({ ok: false, why: "controls", n: 0 });
    expect(CONTROLS).toEqual({ least: 1, most: 4 });
    expect(partialCorrelation(S(a), S(b), [S(z)]).ok).toBe(true);
    const more = [wavy(14, 13), wavy(14, 17), wavy(14, 19), wavy(14, 23)];
    expect(partialCorrelation(S(wavy(14, 7)), S(wavy(14, 11)), more.map(S)).ok).toBe(true);
    expect(partialCorrelation(S(wavy(14, 7)), S(wavy(14, 11)), [...more, wavy(14, 3)].map(S))).toEqual({ ok: false, why: "controls", n: 0 });
  });
  it("needs 6 pairs plus one for each control: one fewer is none, that many is a number", () => {
    for (const held of [1, 2, 3, 4]) {
      const controls = Array.from({ length: held }, (_, i) => wavy(20, 13 + 2 * i, 5 + i));
      const at = (n: number) => partialCorrelation(S(a.concat(wavy(8, 5)).slice(0, n)), S(b.concat(wavy(8, 9)).slice(0, n)), controls.map((c) => S(c.slice(0, n))));
      expect(at(5 + held), `${held} controls, one fewer`).toMatchObject({ ok: false, why: "too-few", n: 5 + held });
      expect(at(6 + held).ok, `${held} controls`).toBe(true);
    }
    expect(partialCorrelation([], [], [[]])).toEqual({ ok: false, why: "too-few", n: 0 });
  });
  it("refuses controls that move together exactly (a mix of each other, or one that does not change), by name", () => {
    expect(partialCorrelation(S(a), S(b), [S(z), S(z.map((v) => 2 * v + 3))])).toEqual({ ok: false, why: "collinear", n: 12 });
    expect(partialCorrelation(S(a), S(b), [S(z), S(wavy(12, 13)), S(z.map((v, i) => v - wavy(12, 13)[i]))])).toMatchObject({ ok: false, why: "collinear" });
    expect(partialCorrelation(S(a), S(b), [S(Array.from({ length: 12 }, () => 4))])).toMatchObject({ ok: false, why: "collinear" });
  });
  it("gives no number for a Metric the controls explain completely, or one that does not change", () => {
    expect(partialCorrelation(S(z.map((v) => 3 * v - 2)), S(b), [S(z)])).toEqual({ ok: false, why: "explained", n: 12 });
    expect(partialCorrelation(S(a), S(z.map((v) => 3 * v - 2)), [S(z)])).toEqual({ ok: false, why: "explained", n: 12 });
    expect(partialCorrelation(S(Array.from({ length: 12 }, () => 4)), S(b), [S(z)])).toMatchObject({ ok: false, why: "explained" });
  });
  it("leaves out a value that is not a number, counts a period twice once with the last value, orders unsorted input and pairs only common periods", () => {
    const clean = partialCorrelation(S(a), S(b), [S(z)]);
    const dirty = partialCorrelation([{ period: "2030-01-01", value: NaN }, ...[...S(a)].reverse(), { period: S(a)[0].period, value: 999 }, { period: S(a)[0].period, value: a[0] }], S(b), [[{ period: "2031-01-01", value: Infinity }, ...S(z)]]);
    expect(dirty).toEqual(clean);
    const partly = partialCorrelation(S([...a, 5, 6]), S(b), [S(z)]);
    expect(partly).toMatchObject({ ok: true, n: 12 });
    expect(partialCorrelation(S(a), S(b), [series(z, "2030-01")])).toMatchObject({ ok: false, why: "too-few", n: 0 });
  });
  it("is exact for huge and tiny values and for decimals that a double cannot hold", () => {
    const scale = (vs: number[], k: number) => vs.map((v) => Number(`${v}e${k}`));
    const base = partialCorrelation(S(a), S(b), [S(z)]);
    expect(partialCorrelation(S(scale(a, 100)), S(scale(b, -100)), [S(scale(z, 50))])).toEqual(base);
    expect(partialCorrelation(S(a.map((v) => v / 10)), S(b.map((v) => v / 100)), [S(z.map((v) => v / 1000))])).toEqual(base);
  });
});

describe("partialCorrelation properties", () => {
  const sizes = fc.integer({ min: 10, max: 14 }).chain((n) => fc.integer({ min: 1, max: 3 }).chain((k) => fc.tuple(...Array.from({ length: k + 2 }, () => fc.array(fc.integer({ min: -9, max: 9 }), { minLength: n, maxLength: n })))));
  const decimals = fc.integer({ min: 10, max: 12 }).chain((n) => fc.tuple(...Array.from({ length: 4 }, () => fc.array(fc.integer({ min: -900, max: 900 }).map((v) => v / 100), { minLength: n, maxLength: n }))));
  const split = (v: number[][]) => ({ a: v[0], b: v[1], controls: v.slice(2) });
  it(`equals its reference exactly up to the root, including which refusal (collinear or explained), on integers and decimals (seed ${seed})`, () => {
    for (const gen of [sizes, decimals]) {
      fc.assert(
        fc.property(gen, (v) => {
          const { a, b, controls } = split(v);
          const got = partialCorrelation(S(a), S(b), controls.map(S));
          const want = ref(a, b, controls);
          if (want.kind === "ok") {
            expect(got.ok && got.r).toBe(rootOf(want));
            expect(got.ok && Math.abs(got.r)).toBeLessThanOrEqual(1);
          } else expect(got).toMatchObject({ ok: false, why: want.kind });
          expect(partialCorrelation(S(a), S(b), controls.map(S))).toEqual(got);
        }),
        { numRuns, seed },
      );
    }
  });
  it("is symmetric in a and b, the same for any order of the controls, and for scaling and shifting a series", () => {
    fc.assert(
      fc.property(sizes, fc.integer({ min: 1, max: 9 }), fc.integer({ min: -50, max: 50 }), (v, scale, shift) => {
        const { a, b, controls } = split(v);
        const got = partialCorrelation(S(a), S(b), controls.map(S));
        expect(partialCorrelation(S(b), S(a), controls.map(S))).toEqual(got);
        expect(partialCorrelation(S(a), S(b), [...controls].reverse().map(S))).toEqual(got);
        expect(partialCorrelation(S(a.map((x) => x * scale + shift)), S(b), controls.map((c) => S(c.map((x) => x * scale - shift))))).toEqual(got);
      }),
      { numRuns, seed },
    );
  });
  it("is unchanged when a multiple of a control is added to a series (what the control explains is taken out)", () => {
    fc.assert(
      fc.property(sizes, fc.integer({ min: -4, max: 4 }), (v, k) => {
        const { a, b, controls } = split(v);
        const got = partialCorrelation(S(a), S(b), controls.map(S));
        expect(partialCorrelation(S(a.map((x, i) => x + k * controls[0][i])), S(b), controls.map(S))).toEqual(got);
      }),
      { numRuns, seed },
    );
  });
});

describe("the Takeaway of a partial correlation", () => {
  const names = (held: string[]) => ({ a: "Visits", b: "Revenue", held });
  const take = (a: number[], b: number[], controls: number[][], held = controls.map((_, i) => ["Price", "Cost", "Tickets", "Staff"][i])) => partialTakeaway(names(held), S(a), S(b), controls.map(S), "month", ctx);
  const [a, z, w] = [wavy(30, 7), wavy(30, 3, 50), wavy(30, 11, 20)];
  const b = a.map((v, i) => 2 * v + (i % 3));
  it("says what it found with the others held the same, with the footer once and the numbers", () => {
    const t = take(a, b, [z]);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("With Price held the same, Visits and Revenue tend to move together over 30 months (strong).");
    expect(t.basis).toBe("compared by value, with Price held the same, over 30 months");
    expect(t.footer).toBe("This shows what has gone together, not what caused what.");
    expect(t.numbers.map((n) => n.label)).toEqual(["Method", "r", "Held the same", "Pairs of periods", "Strength"]);
    expect(t.numbers[2].text).toBe("Price");
    expect(t.figures).toEqual([{ label: "Pairs of periods", value: 30, text: "30" }]);
    expect(take(a, b.map((v) => -v), [z, w]).sentence).toBe("With Price and Cost held the same, Visits and Revenue tend to move in opposite directions over 30 months (strong).");
    expect(take(a, wavy(30, 13), [z, w, wavy(30, 17), wavy(30, 19)]).sentence).toMatch(/^With Price, Cost, Tickets and Staff held the same, over 30 months, Visits and Revenue do not clearly move together: can't tell from chance\.$/);
  });
  it("refuses with a wrong number of controls, naming how many were given", () => {
    expect(take(a, b, [], []).refusal).toBe("Visits and Revenue need 1 to 4 other Metrics held the same: 0 were given.");
    expect(take(a, b, [z, z, z, z, z], ["A", "B", "C", "D", "E"]).refusal).toBe("Visits and Revenue need 1 to 4 other Metrics held the same: 5 were given.");
  });
  it("holds the minimum of 8 + 4 for each Metric weighed and at most one per 6 periods: one period fewer refuses, that many answers (1 to 4 held the same)", () => {
    for (const held of [1, 2, 3, 4]) {
      const need = 8 + 4 * (held + 1);
      const cs = Array.from({ length: held }, (_, i) => wavy(40, 13 + 2 * i, 5 + i));
      const at = (n: number) => take(wavy(40, 7).slice(0, n), wavy(40, 11).slice(0, n), cs.map((c) => c.slice(0, n)));
      expect(at(need - 1).refusal, `${held} held, ${need - 1}`).toMatch(/^Not enough months yet: \d+ of \d+ needed\.$|^\d+ Metrics are too many for/);
      expect(at(need - 1).kind).toBe("refusal");
      // At the minimum, one Metric per 6 periods may still be too many (4 held needs 30).
      const ok = at(Math.max(need, 6 * (held + 1)));
      expect(ok.kind, `${held} held, ${Math.max(need, 6 * (held + 1))}`).toBe("answer");
    }
    expect(take(wavy(15), wavy(15, 11), [wavy(15, 3, 50)]).refusal).toBe("Not enough months yet: 15 of 16 needed.");
    expect(take(wavy(16), wavy(16, 11), [wavy(16, 3, 50)]).kind).toBe("answer");
    // Too many for the history: 28 periods with 4 held is 5 Metrics for 28 months, and 4 allowed.
    expect(take(wavy(28), wavy(28, 11), [3, 13, 17, 19].map((s) => wavy(28, s, s))).refusal).toBe("5 Metrics are too many for 28 months: at most 4 can be weighed.");
    expect(take(wavy(30), wavy(30, 11), [3, 13, 17, 19].map((s) => wavy(30, s, s))).kind).toBe("answer");
  });
  it("says in words when the Metrics held the same cannot be told apart, or leave nothing to compare, and for a series that hardly changes", () => {
    expect(take(a, b, [z, z.map((v) => 2 * v + 3)]).refusal).toBe("The Metrics held the same move so closely together that they cannot be told apart, so nothing can be held the same.");
    expect(take(z.map((v) => 3 * v - 2), b, [z]).refusal).toBe("Once the others are held the same, nothing of Visits or Revenue is left to compare.");
    expect(take(a, Array.from({ length: 30 }, () => 3), [z]).refusal).toBe("Revenue has hardly changed, so there is nothing to compare.");
  });
  it("reads the chance rule on the periods less the Metrics held the same: a step either side of the point where tanh just clears the bar", () => {
    for (const [n, held] of [[20, 1], [30, 2], [40, 4]]) {
      const z = 1.959963984540054 / Math.sqrt(n - held - 3);
      const rc = (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1);
      expect(partialStrength(rc * (1 - 1e-9), n, held), `n=${n} held=${held}`).toBe("cant-tell");
      expect(partialStrength(rc * (1 + 1e-9), n, held), `n=${n} held=${held}`).not.toBe("cant-tell");
    }
    expect(partialStrength(0.95, 30, 1)).toBe("strong");
    expect(partialStrength(0.95, 30, 1, true)).toBe("moderate");
  });
  it("goes by the periods every series has, and says how many", () => {
    const [x, y, c] = [wavy(30, 7), wavy(30, 7).map((v, i) => 2 * v + (i % 3)), wavy(30, 3, 50)];
    // a has two more months at the end, the control lacks the first: 29 months in common.
    const t = partialTakeaway(names(["Price"]), S([...x, 5, 9]), S(y), [series(c.slice(1), "2024-02")], "month", ctx);
    expect(t.sentence).toBe("With Price held the same, Visits and Revenue tend to move together over 29 months (strong).");
    expect(t.figures).toEqual([{ label: "Pairs of periods", value: 29, text: "29" }]);
    // The same answer as with the series cut to those months.
    expect(t).toEqual(partialTakeaway(names(["Price"]), series(x.slice(1), "2024-02"), series(y.slice(1), "2024-02"), [series(c.slice(1), "2024-02")], "month", ctx));
  });
  it("puts a caution above an answer where a month has no value, and what would be strong is moderate", () => {
    const [x, c] = [wavy(30, 7), wavy(30, 3, 50)];
    const t = partialTakeaway(names(["Price"]), S(x), series(x.map((v, i) => (i === 12 ? null : 2 * v + (i % 3)))), [S(c)], "month", ctx);
    expect(t.cautions).toEqual(["Visits and Revenue and Price: no value for 1 of 30 months, left out."]);
    expect(t.strength).toBe("moderate");
  });
  it("puts a caution above an answer where a few periods pull the result, says what it reads without them, and never calls it strong", () => {
    const x = wavy(30, 7);
    const far = (vs: number[]) => vs.map((v, i) => (i < 2 ? 5000 + 3 * i : v));
    const t = take(far(x), far(x.map((v) => 200 - v)), [wavy(30, 3, 50)]);
    expect(t.kind).toBe("answer");
    expect(t.cautions).toEqual(["This result is pulled by 2 months far from the rest; without them it reads strong."]);
    expect(t.strength).toBe("moderate");
  });
  it(`gives the same words twice, none a person would have to look up, no number in a refusal (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 4, max: 34 }).chain((n) => fc.tuple(...Array.from({ length: 3 }, () => fc.array(fc.integer({ min: -30, max: 30 }), { minLength: n, maxLength: n })))), ([x, y, c]) => {
        const t = take(x, y, [c]);
        expect(take(x, y, [c])).toEqual(t);
        for (const text of [t.sentence, t.refusal, t.basis, ...t.cautions, ...t.notes, ...t.numbers.map((n) => n.text)]) expect(text ?? "").not.toMatch(FORBIDDEN);
        if (t.kind === "refusal") expect(t).toMatchObject({ sentence: null, strength: null, footer: null, figures: [], numbers: [] });
        else if (t.cautions.length > 0) expect(t.strength).not.toBe("strong");
      }),
      { numRuns, seed },
    );
  });
});
