// @ts-nocheck
// Concentration (spec 0041, Methods `topShare` and `pareto`): equal to the reference (every choice of rows tried) exactly, to
// NumPy's sort and cumulative sum to 1e-12 where no share is on the line, hand-worked, hostile inputs, properties, and the Takeaways.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { runs } from "../test/reference/check";
import { exactOf, nearestDoubleOf } from "../test/reference/exact";
import { close, FIXTURE } from "../test/reference/methods-fixture";
import { referenceParetoCount, referenceTopShare } from "../test/reference/methods";
import type { TakeawayContext } from "../takeaways/takeaway";
import { LEAST_ROWS, pareto, paretoTakeaway, PARETO_SHARE, topShare, topShareTakeaway, type Row } from "./concentration";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const rows = (vs: number[]): Row[] => vs.map((value, i) => ({ label: `L${i + 1}`, value }));
const exacts = (vs: number[]) => vs.map(exactOf);

describe("topShare and pareto against NumPy and their reference", () => {
  it.each(Object.entries(FIXTURE.shares as Record<string, { values: number[]; top: number[]; pareto80: number }>))("%s: NumPy's cumulative shares to 1e-12, the exact reference exactly, and its Pareto count", (name, c) => {
    c.top.forEach((want, i) => {
      const got = topShare(rows(c.values), i + 1);
      expect(got.ok && close(got.share, want, 1e-12), `${name} top ${i + 1}`).toBe(true);
      expect(got.ok && got.share).toBe(nearestDoubleOf(referenceTopShare(exacts(c.values), i + 1)));
    });
    const got = pareto(rows(c.values));
    expect(got.ok && got.count).toBe(c.pareto80);
    expect(got.ok && got.count).toBe(referenceParetoCount(exacts(c.values), exactOf(0.8)));
  });
  it("is worked out by hand: 50, 30 and 20 make 100; the largest is 1/2, and 80 % is reached exactly by the two largest", () => {
    const r = rows([20, 50, 30]);
    expect(topShare(r, 1)).toMatchObject({ ok: true, share: 0.5, percent: 50, total: 100, tied: false, top: [{ label: "L2", value: 50, share: 0.5, percent: 50 }] });
    expect(topShare(r, 2)).toMatchObject({ share: 0.8, percent: 80 });
    expect(pareto(r)).toMatchObject({ ok: true, count: 2, share: 0.8, percent: 80, rows: 3, target: 0.8, tied: false });
    expect(PARETO_SHARE).toBe(0.8);
    expect(pareto(r, 0.5)).toMatchObject({ count: 1, share: 0.5 });
    expect(pareto(r, 0.5000001)).toMatchObject({ count: 2 });
    expect(pareto(r, 1)).toMatchObject({ count: 3, share: 1 });
  });
  it("is exact where doubles are not: 0.1, 0.2, 0.3 and 0.4 add to 1 and the top two are exactly 0.7", () => {
    const r = rows([0.1, 0.2, 0.3, 0.4]);
    // In doubles 0.1 + 0.2 + 0.3 + 0.4 is 1 and 0.4 + 0.3 is 0.7, but 0.1 + 0.2 + 0.3 is 0.6000000000000001: the sum goes by the text.
    expect(topShare(r, 2)).toMatchObject({ share: 0.7, percent: 70, total: 1 });
    expect(pareto(r, 0.7)).toMatchObject({ count: 2, share: 0.7 });
    expect(pareto(rows([0.3, 0.2, 0.1]), 0.6)).toMatchObject({ count: 2 });
    // 0.3 is exactly half of 0.6: in doubles 0.1 + 0.2 + 0.3 is 0.6000000000000001, half of which is above 0.3, which would call for a second row.
    expect(pareto(rows([0.1, 0.2, 0.3]), 0.5)).toMatchObject({ count: 1, share: 0.5 });
  });
  it("says that a row of the same size was left out at the cut, so which is named is arbitrary and the count is not", () => {
    expect(topShare(rows([10, 10, 10, 5]), 2)).toMatchObject({ tied: true, top: [{ label: "L1" }, { label: "L2" }] });
    expect(topShare(rows([10, 10, 9, 5]), 2).ok && (topShare(rows([10, 10, 9, 5]), 2) as { tied: boolean }).tied).toBe(false);
    expect(topShare(rows([10, 9, 9, 5]), 2)).toMatchObject({ tied: true, share: 19 / 33 });
    expect(pareto(rows([10, 10, 10, 5]), 0.5)).toMatchObject({ count: 2, tied: true });
    // Decimals of different size are never tied, however small their whole parts.
    expect(topShare(rows([0.3, 0.2, 0.1]), 1)).toMatchObject({ tied: false });
    expect(topShare(rows([0.2, 0.2, 0.1]), 1)).toMatchObject({ tied: true });
    // The Pareto decides the same way for decimals (the tie is read off the rows' text, not their doubles): 0.2 of 0.5 is reached by the first 0.2, and the second is the same size.
    expect(pareto(rows([0.2, 0.2, 0.1]), 0.4)).toMatchObject({ count: 1, tied: true });
    expect(pareto(rows([0.3, 0.2, 0.1]), 0.5)).toMatchObject({ count: 1, tied: false });
    // Everything taken: nothing is left out at the cut.
    expect(pareto(rows([10, 10]), 1)).toMatchObject({ count: 2, tied: false });
  });
});

describe("topShare and pareto on hostile input", () => {
  it("needs 2 rows: one is none, two answer (one step either side)", () => {
    expect(LEAST_ROWS).toBe(2);
    expect(topShare(rows([5]), 1)).toEqual({ ok: false, why: "few" });
    expect(pareto(rows([5]))).toEqual({ ok: false, why: "few" });
    expect(pareto([])).toEqual({ ok: false, why: "few" });
    expect(topShare(rows([5, 3]), 1).ok).toBe(true);
    expect(pareto(rows([5, 3])).ok).toBe(true);
  });
  it("gives none for a row that is not a number, or below zero, or a whole of nothing; the row is never dropped or mended", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(topShare(rows([5, 3, bad]), 1)).toEqual({ ok: false, why: "not-a-number" });
      expect(pareto(rows([5, 3, bad]))).toEqual({ ok: false, why: "not-a-number" });
    }
    expect(topShare(rows([5, 3, -0.001]), 1)).toEqual({ ok: false, why: "negative" });
    expect(topShare(rows([5, 3, 0]), 1).ok).toBe(true);
    expect(pareto(rows([5, -3]))).toEqual({ ok: false, why: "negative" });
    expect(topShare(rows([0, 0, 0]), 1)).toEqual({ ok: false, why: "nothing" });
    expect(pareto(rows([0, 0]))).toEqual({ ok: false, why: "nothing" });
  });
  it("asks for 1 to one fewer than the rows, as a whole number, and a share above 0 and up to 1 (one step either side)", () => {
    const r = rows([5, 4, 3]);
    for (const n of [0, 3, 4, 1.5, NaN, -1, Infinity]) expect(topShare(r, n), String(n)).toEqual({ ok: false, why: "ask" });
    for (const n of [1, 2]) expect(topShare(r, n).ok, String(n)).toBe(true);
    for (const t of [0, -0.1, 1.0000001, NaN, Infinity]) expect(pareto(r, t), String(t)).toEqual({ ok: false, why: "ask" });
    for (const t of [1e-300, 0.5, 1]) expect(pareto(r, t).ok, String(t)).toBe(true);
  });
  it("is exact for huge and tiny values, and keeps rows of 0 out of the count", () => {
    expect(topShare(rows([1e300, 3e300, 6e300]), 1)).toMatchObject({ share: 0.6, percent: 60 });
    expect(topShare(rows([1e-300, 3e-300, 6e-300]), 2)).toMatchObject({ share: 0.9 });
    expect(pareto(rows([6, 0, 4, 0, 0]), 1)).toMatchObject({ count: 2, share: 1 });
  });
  it("orders any input largest first, ascending or descending, and keeps the order given for many rows of the same size", () => {
    const names = (vs: number[], n: number) => { const t = topShare(rows(vs), n); return t.ok ? t.top.map((r) => r.label) : []; };
    expect(names([1, 2, 3, 4, 5, 6, 7, 8], 3)).toEqual(["L8", "L7", "L6"]);
    expect(names([8, 7, 6, 5, 4, 3, 2, 1], 3)).toEqual(["L1", "L2", "L3"]);
    expect(names([3, 9, 1, 7], 2)).toEqual(["L2", "L4"]);
    const same = Array.from({ length: 70 }, () => 4);
    expect(names(same, 69)).toEqual(same.slice(0, 69).map((_, i) => `L${i + 1}`));
  });
  it("keeps the order given for rows of the same size, so the same rows give the same names twice", () => {
    const r = rows([4, 4, 4, 4]);
    expect(topShare(r, 2)).toMatchObject({ top: [{ label: "L1" }, { label: "L2" }] });
    expect(topShare(r, 2)).toEqual(topShare(r, 2));
  });
});

describe("topShare and pareto properties", () => {
  const gen = fc.array(fc.integer({ min: 0, max: 2000 }).map((v) => v / 100), { minLength: 2, maxLength: 9 }).filter((vs) => vs.some((v) => v > 0));
  it(`equal their reference exactly (every choice of rows tried), the count is the fewest that reach the share, shares are within 0 and 1 (seed ${seed})`, () => {
    fc.assert(
      fc.property(gen, fc.constantFrom(0.1, 0.25, 0.5, 0.7, 0.8, 0.9, 1), (vs, target) => {
        const r = rows(vs);
        for (let n = 1; n < vs.length; n++) {
          const got = topShare(r, n);
          expect(got.ok && got.share).toBe(nearestDoubleOf(referenceTopShare(exacts(vs), n)));
          expect(got.ok && got.share).toBeGreaterThanOrEqual(0);
          expect(got.ok && got.share).toBeLessThanOrEqual(1);
        }
        const p = pareto(r, target);
        expect(p.ok && p.count).toBe(referenceParetoCount(exacts(vs), exactOf(target)));
        if (p.ok) {
          // Minimal: one fewer row falls short, as far as the exact reference can say.
          expect(p.top.length).toBe(p.count);
          expect(p.share).toBeGreaterThanOrEqual(target - 1e-12);
          if (p.count > 1) expect(nearestDoubleOf(referenceTopShare(exacts(vs), p.count - 1))).toBeLessThanOrEqual(target);
          expect(pareto(r, target)).toEqual(p);
        }
      }),
      { numRuns, seed },
    );
  });
  it("rises with the number of rows, is the same for any order of the rows, any scale (whole), and no row's share is above the largest", () => {
    fc.assert(
      fc.property(gen, fc.integer({ min: 1, max: 9 }), (vs, scale) => {
        const shares = Array.from({ length: vs.length - 1 }, (_, i) => (topShare(rows(vs), i + 1) as { share: number }).share);
        shares.forEach((s, i) => i > 0 && expect(s).toBeGreaterThanOrEqual(shares[i - 1]));
        const [a, b] = [topShare(rows(vs), 1), topShare([...rows(vs)].reverse(), 1)];
        expect(a.ok && b.ok && a.share).toBe(b.ok && b.share);
        const scaled = topShare(rows(vs.map((v) => Math.round(v * 100) * scale)), 1);
        const plain = topShare(rows(vs.map((v) => Math.round(v * 100))), 1);
        expect(scaled.ok && scaled.share).toBe(plain.ok && plain.share);
        expect(a.ok && a.top[0].share).toBe(a.ok && a.share);
      }),
      { numRuns, seed },
    );
  });
});

describe("the Takeaways of concentration", () => {
  const sales = rows([40, 25, 12, 8, 6, 5, 3, 1]);
  it("says it is worked out, names the rows, and writes the share in the Number Style", () => {
    const t = topShareTakeaway("Revenue", sales, 3, ctx);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("Worked out: the 3 largest of 8 rows make up 77.0 % of Revenue: L1, L2 and L3.");
    expect(t.footer).toBeNull();
    expect(t.strength).toBeNull();
    expect(t.numbers).toEqual([{ label: "Method", text: "Share of the largest rows" }, { label: "Share", text: "77.0 %" }, { label: "L1", text: "40.0 %" }, { label: "L2", text: "25.0 %" }, { label: "L3", text: "12.0 %" }]);
    expect(t.figures).toEqual([{ label: "Share", value: 77, text: "77.0 %" }]);
    expect(topShareTakeaway("Revenue", sales, 3, { style: "1.234,5" }).sentence).toBe("Worked out: the 3 largest of 8 rows make up 77,0 % of Revenue: L1, L2 and L3.");
    const p = paretoTakeaway("Revenue", sales, ctx);
    expect(p.sentence).toBe("Worked out: 4 of 8 rows make up 85.0 % of Revenue, the fewest that reach 80.0 %: L1, L2, L3 and L4.");
    expect(p.kind).toBe("answer");
    expect(p.numbers).toEqual([{ label: "Method", text: "Pareto" }, { label: "Share", text: "85.0 %" }, { label: "L1", text: "40.0 %" }, { label: "L2", text: "25.0 %" }, { label: "L3", text: "12.0 %" }, { label: "L4", text: "8.0 %" }]);
    expect(p.figures).toEqual([{ label: "Share", value: 85, text: "85.0 %" }]);
    expect(p.footer).toBeNull();
    expect(topShareTakeaway("Revenue", sales, 3, ctx).kind).toBe("answer");
    expect(paretoTakeaway("Revenue", sales, ctx, 0.5).sentence).toBe("Worked out: 2 of 8 rows make up 65.0 % of Revenue, the fewest that reach 50.0 %: L1 and L2.");
  });
  it("notes rows of the same size at the cut", () => {
    expect(topShareTakeaway("Revenue", rows([10, 10, 10, 5]), 2, ctx).notes).toEqual(["Rows of the same size stand at the cut, so which of them is named is arbitrary; the count is not."]);
    expect(paretoTakeaway("Revenue", rows([10, 10, 10, 5]), ctx, 0.5).notes).toHaveLength(1);
    expect(topShareTakeaway("Revenue", sales, 3, ctx).notes).toEqual([]);
    expect(paretoTakeaway("Revenue", sales, ctx).notes).toEqual([]);
  });
  it("refuses in words for each fault of the rows, with no number", () => {
    const say = (r: Row[], n = 1) => topShareTakeaway("Revenue", r, n, ctx);
    expect(say(rows([5]))).toMatchObject({ kind: "refusal", refusal: "Revenue: 1 of 2 rows needed.", sentence: null, figures: [], numbers: [], footer: null });
    expect(say(rows([5, NaN])).refusal).toBe("Revenue has a row that is not a number, so nothing is worked out.");
    expect(say(rows([5, -1])).refusal).toBe("Revenue has a row below zero, so a share of the whole means nothing.");
    expect(say(rows([0, 0])).refusal).toBe("Revenue adds up to nothing, so there is no share to give.");
    expect(say(rows([5, 4]), 2).refusal).toBe("Revenue: that number of rows or that share cannot be worked out here.");
    expect(paretoTakeaway("Revenue", rows([5, 4]), ctx, 2).refusal).toBe("Revenue: that number of rows or that share cannot be worked out here.");
    expect(paretoTakeaway("Revenue", [], ctx).refusal).toBe("Revenue: 0 of 2 rows needed.");
  });
  it(`gives the same words twice, none a person would have to look up, no number in a refusal (${numRuns} cases, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -5, max: 30 }), { minLength: 0, maxLength: 9 }), fc.integer({ min: 0, max: 10 }), (vs, n) => {
        for (const t of [topShareTakeaway("Revenue", rows(vs), n, ctx), paretoTakeaway("Revenue", rows(vs), ctx, n / 10)]) {
          for (const text of [t.sentence, t.refusal, ...t.notes, ...t.numbers.map((x) => x.text)]) expect(text ?? "").not.toMatch(FORBIDDEN);
          if (t.kind === "refusal") expect(t).toMatchObject({ sentence: null, strength: null, footer: null, figures: [], numbers: [] });
        }
        expect(topShareTakeaway("Revenue", rows(vs), n, ctx)).toEqual(topShareTakeaway("Revenue", rows(vs), n, ctx));
      }),
      { numRuns, seed },
    );
  });
});
