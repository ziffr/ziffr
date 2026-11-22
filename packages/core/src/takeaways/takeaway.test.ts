// The Takeaway layer (spec 0041, "What every Takeaway must hold to" and Testing Decisions): the strength words at every
// threshold, the wording as a table of cases, no forbidden word in any text in any language, every number in a sentence the
// Method's number at the Metric's decimals, and the invariants over generated series (a refusal carries no number, a
// caution is never strong, the same series gives the same Takeaway twice, the footer is on once).
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolverFrom } from "../compare";
import { correlate, rankCorrelations, type Correlation } from "../correlation";
import { formatNumber } from "../format";
import { NUMBER_STYLES } from "../number-style";
import { numbersIn } from "../numbers";
import { JANUARY } from "../periods";
import { metric, months } from "../test/fixtures";
import { runs } from "../test/reference/check";
import type { Metric, Point } from "../types";
import { STRENGTH, strengthOf, type StrengthWord } from "./strength";
import { correlationTakeaway, driversTakeaway, footerText, refusalTakeaway, verdictLines, type Takeaway, type TakeawayContext } from "./takeaway";
import { LANGUAGES, WORDING, say, type CaseKey, type Slots } from "./wording";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/suitability.json", import.meta.url), "utf8"));
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const FOOTER = "This shows what has gone together, not what caused what.";

const a = metric({ id: 1, slug: "visits", name: "Visits", period: "month" });
const b = metric({ id: 2, slug: "revenue", name: "Revenue", period: "month" });
/** Values with no trend, no ties and no pattern a few periods long: a different `step` is a different series. */
const wavy = (n: number, base = 10, step = 7) => Array.from({ length: n }, (_, i) => base + ((i * step * 5) % 97) + i / 100);
/** Pseudo-random values from a fixed seed. */
const random = (seed: number, n: number) => {
  let x = seed;
  return Array.from({ length: n }, () => ((x = (x * 1103515245 + 12345) % 2147483648), Math.round(x / 1e7)));
};
const correlation = (xs: number[], ys: number[], over: { a?: Metric; b?: Metric } = {}): Correlation => {
  const [ma, mb] = [over.a ?? a, over.b ?? b];
  return correlate(ma, mb, resolverFrom([ma, mb], { [ma.slug]: months("2024-01", xs), [mb.slug]: months("2024-01", ys) }), { yearStart: JANUARY });
};
const takeaway = (xs: number[], ys: number[], c = ctx) => correlationTakeaway(a, b, correlation(xs, ys), c);
const texts = (t: Takeaway) => [t.sentence, t.refusal, t.strengthText, t.basis, t.method, ...t.assumptions, ...t.cautions, ...t.notes, ...t.numbers.flatMap((n) => [n.label, n.text]), ...t.figures.map((f) => f.label)].filter((x): x is string => x !== null);

describe("the strength words", () => {
  it("come from one table: above 0.7 strong, above 0.4 moderate, above 0.2 weak, else can't tell, each one step either side", () => {
    expect(STRENGTH).toEqual({ strong: 0.7, moderate: 0.4, weak: 0.2, chance: 1.959963984540054 });
    const word = (r: number) => strengthOf(r, 1000);
    const next = (x: number) => x + Number.EPSILON * 4;
    const table: [number, StrengthWord, StrengthWord][] = [[0.7, "moderate", "strong"], [0.4, "weak", "moderate"], [0.2, "cant-tell", "weak"]];
    for (const [edge, below, above] of table) {
      expect(word(edge), String(edge)).toBe(below);
      expect(word(next(edge)), String(edge)).toBe(above);
      expect(word(-edge), String(-edge)).toBe(below);
      expect(word(-next(edge)), String(-edge)).toBe(above);
    }
    expect([0, 0.19, 1, -1].map(word)).toEqual(["cant-tell", "cant-tell", "strong", "strong"]);
  });
  it("is never strong with a caution: strong becomes moderate, the others stay", () => {
    expect(strengthOf(0.95, 100, true)).toBe("moderate");
    expect(strengthOf(0.95, 100, false)).toBe("strong");
    expect(strengthOf(0.5, 100, true)).toBe("moderate");
    expect(strengthOf(0.3, 100, true)).toBe("weak");
    expect(strengthOf(0.1, 100, true)).toBe("cant-tell");
  });
  it("says can't tell where the pairs are too few to rule out chance: |r| must clear atanh(|r|) · √(n − 3) ≥ 1.96", () => {
    // The 97.5 % point of the normal curve is SciPy's.
    expect(STRENGTH.chance).toBe(fixture.normal975);
    // The r at which a given n just clears chance, from tanh by the exponential formula (no Math.atanh or tanh).
    const critical = (n: number) => { const z = STRENGTH.chance / Math.sqrt(n - 3); return (Math.exp(2 * z) - 1) / (Math.exp(2 * z) + 1); };
    for (const n of [6, 8, 12, 24, 50]) {
      const rc = critical(n);
      const [below, above] = [rc * (1 - 1e-9), rc * (1 + 1e-9)];
      // Only where the size itself would be weak or more (above 0.2).
      expect(strengthOf(below, n), `n=${n} below`).toBe("cant-tell");
      expect(strengthOf(above, n), `n=${n} above`).not.toBe("cant-tell");
    }
    // A strong r on 6 pairs is not told from chance; on 7 it is.
    expect(strengthOf(0.71, 6)).toBe("cant-tell");
    expect(strengthOf(0.99, 7)).toBe("strong");
    // With 4 pairs only |r| of 0.96 or more can clear it; with 3, nothing.
    expect(strengthOf(0.99, 4)).toBe("strong");
    expect(strengthOf(0.99, 3)).toBe("cant-tell");
    // Exactly at it: atanh(tanh(1.96)) is the normal point itself, so the pair clears it (at least 1.96), a step below does not.
    const exact = Math.tanh(STRENGTH.chance);
    expect(Math.atanh(exact)).toBe(STRENGTH.chance);
    expect(strengthOf(exact, 4)).toBe("strong");
    expect(strengthOf(exact - 1e-15, 4)).toBe("cant-tell");
  });
  it("is can't tell for no number, and for 3 pairs or fewer", () => {
    for (const r of [NaN, Infinity, -Infinity]) expect(strengthOf(r, 100)).toBe("cant-tell");
    for (const n of [3, 2, 0, -5]) expect(strengthOf(0.999, n)).toBe("cant-tell");
  });
});

describe("the wording", () => {
  const SAMPLE: Slots = { a: "Visits", b: "Revenue", n: 18, span: "month", strength: "strong", names: "Visits and Price", target: "Revenue", name: "Visits", other: "Cost", have: 9, need: 16, missing: 3, total: 24, run: 3, count: 2, without: 0.5, from: "2025-03-01", latest: "weak", drivers: 8, allowed: 4, basis: "compared by value", period: "month", skew: 2.5 };
  /** Each case with its slots and the sentence it must come to: a table of cases, per language that exists. */
  const TABLE: Record<CaseKey, [Slots, string]> = {
    "strength-strong": [{}, "strong"], "strength-moderate": [{}, "moderate"], "strength-weak": [{}, "weak"], "strength-cant-tell": [{}, "can't tell from chance"],
    footer: [{}, FOOTER],
    "basis-values": [{}, "compared by value"], "basis-changes": [{}, "compared by change, growth removed"],
    "basis-over": [SAMPLE, "compared by value, over 18 months"], "basis-combined": [SAMPLE, "compared by value, by month (18 months)"],
    "corr-together": [SAMPLE, "Visits and Revenue tend to move together over 18 months (strong)."],
    "corr-opposite": [SAMPLE, "Visits and Revenue tend to move in opposite directions over 18 months (strong)."],
    "corr-cant-tell": [SAMPLE, "Over 18 months, Visits and Revenue do not clearly move together: strong."],
    "drivers-some": [SAMPLE, "Over 18 months, Visits and Price moved with Revenue the most."],
    "drivers-none": [SAMPLE, "Over 18 months, no Metric moved with Revenue clearly enough to tell from chance."],
    "drivers-empty": [SAMPLE, "No other Metric has enough in common with Revenue to compare."],
    "drivers-row": [SAMPLE, "Visits: strong"], "list-and": [{}, " and "], "list-comma": [{}, ", "],
    "refuse-periods": [SAMPLE, "Not enough months yet: 9 of 16 needed."],
    "refuse-vary": [SAMPLE, "Visits has hardly changed, so there is nothing to compare."],
    "refuse-gaps": [SAMPLE, "Visits: no value for 3 of 24 months, too many to go on."],
    "refuse-gap-run": [SAMPLE, "Visits: no value for 3 months in a row, too many to go on."],
    "refuse-mixed-none": [SAMPLE, "Visits has Aggregation none, so it is compared only with Metrics counted the same way, and Cost is not."],
    "refuse-built-from": [SAMPLE, "Visits is worked out from Cost, so comparing them tells nothing."],
    "refuse-too-many": [SAMPLE, "8 Metrics are too many for 9 months: at most 4 can be weighed."],
    "caution-gaps": [SAMPLE, "Visits: no value for 3 of 24 months, left out."],
    "caution-far-off": [SAMPLE, "This result is pulled by 2 months far from the rest; without them it reads 0.50."],
    "caution-skew": [SAMPLE, "A few values of Visits are far larger or smaller than most, so this reading is rough."],
    "caution-ties": [SAMPLE, "Many values of Visits repeat, so this reading is rough."],
    "switch-rank": [SAMPLE, "The values of Visits are very uneven, so their ranks are compared instead of the values."],
    "caution-curved": [SAMPLE, "The link looks curved, so a straight-line reading is rough."],
    "caution-link-weaker": [SAMPLE, "This link was stronger earlier than it has been since; the latest half reads weak."],
    "caution-link-stronger": [SAMPLE, "This link was weaker earlier than it has been since; the latest half reads weak."],
    "caution-link-flipped": [SAMPLE, "This link pointed the other way earlier; the latest half reads weak."],
    "caution-level-shift": [SAMPLE, "The level of Visits changed around March 2025, so older values may mislead."],
    "switch-after-shift": [SAMPLE, "The level of Visits changed around March 2025, so only the 2 months since then are used."],
    "caution-season": [SAMPLE, "The yearly pattern did not repeat the same way each year, so a seasonal reading is rough."],
    "switch-holt": [SAMPLE, "The yearly pattern did not repeat the same way each year, so a plain trend is used instead."],
    "caution-spread": [SAMPLE, "The misses grow as the level grows, so the ranges are rough."],
    "switch-percent": [SAMPLE, "The misses grow as the level grows, so ranges are worked out as a share of the level."],
    "switch-first-pass": [SAMPLE, "8 Metrics are more than 9 months can weigh, so the 4 that matter most were chosen first and the others left out."],
    "numbers-method": [{}, "Method"], "numbers-method-pearson": [{}, "Pearson's r"], "numbers-r": [{}, "r"], "numbers-pairs": [{}, "Pairs of periods"],
    "numbers-periods": [{}, "Periods"], "numbers-basis": [{}, "Compared on"], "numbers-strength": [{}, "Strength"],
  };
  it.each(LANGUAGES)("%s: every case is in the table, and says what the table says", (language) => {
    expect(Object.keys(TABLE).sort()).toEqual(Object.keys(WORDING[language]).sort());
    for (const [key, [slots, want]] of Object.entries(TABLE) as [CaseKey, [Slots, string]][]) expect(say(key, slots, { style: "1,234.5", language }), key).toBe(want);
  });
  it.each(LANGUAGES)("%s: no text holds a word a person would have to look up, except the footer, which says nothing is a cause", (language) => {
    for (const [key, text] of Object.entries(WORDING[language])) {
      if (key === "footer") expect(text).toBe(FOOTER);
      else expect(text, key).not.toMatch(FORBIDDEN);
    }
  });
  it("writes counts and numbers in the Number Style, a value in the Metric's unit, a period by name, singular for 1", () => {
    const de = { style: "1.234,5" as const };
    expect(say("refuse-periods", { have: 1234, need: 2000, span: "month" }, de)).toBe("Not enough months yet: 1.234 of 2.000 needed.");
    expect(say("refuse-periods", { have: 1234, need: 2000, span: "week" }, { style: "1 234,5" })).toBe(`Not enough weeks yet: ${formatNumber(1234, 0, "1 234,5")} of ${formatNumber(2000, 0, "1 234,5")} needed.`);
    expect(say("caution-far-off", { count: 1, without: 0.5, span: "quarter" }, ctx)).toBe("This result is pulled by 1 quarter far from the rest; without them it reads 0.50.");
    expect(say("caution-far-off", { count: 1, without: 0.5, span: "month" }, { ...de, result: (r) => `r=${r}` })).toBe("This result is pulled by 1 month far from the rest; without them it reads r=0.5.");
    expect(say("caution-far-off", { count: 2, without: 0.5, span: "half" }, de)).toBe("This result is pulled by 2 half-years far from the rest; without them it reads 0,50.");
    expect(say("caution-far-off", { count: 3, without: -0.25, span: "year" }, de)).toBe("This result is pulled by 3 years far from the rest; without them it reads −0,25.");
    expect(say("caution-far-off", { count: 3, without: 1, span: "day" }, ctx)).toBe("This result is pulled by 3 days far from the rest; without them it reads 1.00.");
    expect(say("refuse-gaps", { name: "Orders", missing: 2, total: 9, span: "week" }, ctx)).toBe("Orders: no value for 2 of 9 weeks, too many to go on.");
    expect(say("basis-over", { basis: "x", n: 1, span: "month" }, ctx)).toBe("x, over 1 month");
    expect(say("caution-level-shift", { name: "A", from: "2025-03-01", span: "month" }, { ...ctx, yearStart: 4 })).toBe("The level of A changed around March 2025, so older values may mislead.");
    expect(say("caution-level-shift", { name: "A", from: "2025-04-01", span: "quarter" }, { ...ctx, yearStart: 4 })).toContain("Q1 FY 2025/26");
    expect(say("caution-link-weaker", { latest: "cant-tell" }, ctx)).toBe("This link was stronger earlier than it has been since; the latest half reads can't tell from chance.");
    expect(say("refuse-vary", { name: "Cost" }, { style: ctx.style, language: "en" })).toBe("Cost has hardly changed, so there is nothing to compare.");
    // A value in the Metric's unit goes through the same writer as everywhere (a unit stands on its side).
    expect(say("drivers-row", { name: { value: 1234.5, unit: { unit: "€", unit_position: "after", decimals: 0 } }, strength: 0.5 }, ctx)).toBe("1,235 €: 0.50");
    expect(say("drivers-row", { name: { value: 1234.5, unit: { unit: "$", unit_position: "before", decimals: 1 } }, strength: 1 }, de)).toBe("$1.234,5: 1");
  });
  it("says a verdict's refusals, cautions and switches as lines, a switch as what was done differently", () => {
    const v = { refusals: [{ case: "refuse-vary" as const, slots: { name: "A" } }], cautions: [{ case: "caution-skew" as const, slots: { name: "A" } }], switches: [{ case: "switch-rank" as const, slots: { name: "A" }, to: "rank-correlation" as const }] };
    expect(verdictLines(v, ctx, 10)).toEqual({
      refusals: ["A has hardly changed, so there is nothing to compare."],
      cautions: ["A few values of A are far larger or smaller than most, so this reading is rough."],
      notes: ["The values of A are very uneven, so their ranks are compared instead of the values."],
    });
  });
  it("says a far-off finding's result without them as a strength word judged on the pairs that are left", () => {
    // r = 0.7 clears chance on 10 pairs (moderate) and not on 6: 8 pairs less 2 left out are 6.
    const far = { refusals: [], cautions: [{ case: "caution-far-off" as const, slots: { count: 2, without: 0.7, span: "month" as const } }], switches: [] };
    expect(verdictLines(far, ctx, 8).cautions).toEqual(["This result is pulled by 2 months far from the rest; without them it reads can't tell from chance."]);
    expect(verdictLines(far, ctx, 12).cautions).toEqual(["This result is pulled by 2 months far from the rest; without them it reads moderate."]);
  });
  it("is the one footer, and it is the text of every Takeaway's footer", () => {
    expect(footerText(ctx)).toBe(FOOTER);
  });
});

describe("a correlation's Takeaway", () => {
  const ys = wavy(24, 10, 7);
  const together = wavy(24, 10, 7).map((v, i) => 2 * v + (i % 3) / 5);
  it("says what moved together, the strength, the basis, the footer once, and holds the numbers", () => {
    const t = takeaway(ys, together);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe("Visits and Revenue tend to move together over 24 months (strong).");
    expect(t.strength).toBe("strong");
    expect(t.strengthText).toBe("strong");
    expect(t.basis).toBe("compared by value, over 24 months");
    expect(t.footer).toBe(FOOTER);
    expect(t.cautions).toEqual([]);
    expect(t.range).toBeNull();
    expect(t.numbers.map((n) => n.label)).toEqual(["Method", "r", "Pairs of periods", "Periods", "Compared on", "Strength"]);
    expect(t.numbers[2].text).toBe("24");
    expect(t.numbers[3].text).toBe("2024-01-01 – 2025-12-01");
    expect(t.method).toBe("Pearson's r");
    expect(texts(t).filter((x) => x === FOOTER)).toEqual([]);
  });
  it("says opposite directions for a negative r, and can't tell for no link", () => {
    expect(takeaway(ys, together.map((v) => -v)).sentence).toBe("Visits and Revenue tend to move in opposite directions over 24 months (strong).");
    const none = takeaway(wavy(24, 10, 7), random(3, 24));
    expect(none.strength).toBe("cant-tell");
    expect(none.sentence).toMatch(/^Over 24 months, Visits and Revenue do not clearly move together: can't tell from chance\.$/);
    expect(none.footer).toBe(FOOTER);
  });
  it("says the Common Period when one Metric was combined to the other's, and growth removed where both grow", () => {
    const week = metric({ id: 3, slug: "tickets", name: "Tickets", period: "week", aggregation: "sum" });
    const weekly: Point[] = Array.from({ length: 80 }, (_, i) => ({ period: new Date(Date.UTC(2024, 0, 1 + 7 * i)).toISOString().slice(0, 10), value: 5 + ((i * 7) % 11) }));
    const c = correlate(week, b, resolverFrom([week, b], { tickets: weekly, revenue: months("2024-01", wavy(18, 10, 7)) }), { yearStart: JANUARY });
    expect(c.ok).toBe(true);
    expect(correlationTakeaway(week, b, c, ctx).basis).toMatch(/^compared by value, by month \(\d+ months\)$/);
    const grows = (k: number, e: number) => Array.from({ length: 24 }, (_, i) => 100 + k * i + ((i * i * e) % 13));
    expect(takeaway(grows(10, 3), grows(3, 2)).basis).toBe("compared by change, growth removed, over 23 months");
  });
  it("a Metric pair that only shares a trend is can't tell from chance, never strong (spec 0041)", () => {
    const noise = (k: number, n: number) => Array.from({ length: n }, (_, i) => ((i * i * k * 7919 + 13 * i) % 97) / 10 - 5);
    const grow = (slope: number, e: number[]) => e.map((x, i) => 100 + slope * i + x);
    const t = takeaway(grow(10, noise(1, 24)), grow(3, noise(5, 24)));
    expect(t.basis).toContain("growth removed");
    expect(t.strength).toBe("cant-tell");
  });
  it("is a refusal, with its words, where the Method found none, and where the checks refuse", () => {
    const few = correlationTakeaway(a, b, correlation([1, 2, 3], [3, 2, 1]), ctx);
    expect(few).toEqual({ kind: "refusal", method: "Pearson's r", sentence: null, refusal: "Not enough months in common (3 of 6).", strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], footer: null, figures: [], numbers: [] });
    expect(few.refusal).toBe("Not enough months in common (3 of 6).");
    const flat = takeaway([4, 4, 4, 4, 4, 4, 4, 4], wavy(8));
    expect(flat.kind).toBe("refusal");
    const hardly = takeaway([1, 2, 3, 1, 2, 3, 1, 2, 3, 1], wavy(10));
    expect(hardly.refusal).toBe("Visits has hardly changed, so there is nothing to compare.");
    expect(refusalTakeaway("Pearson's r", ["A.", "B."]).refusal).toBe("A. B.");
  });
  it("is a caution, said above the answer, when a few periods pull the result, and the strength drops below strong", () => {
    const base = wavy(24, 10, 7);
    const other = random(11, 24);
    const [xs, zs] = [[...base], [...other]];
    xs[10] = 400;
    zs[10] = 400;
    const t = takeaway(xs, zs);
    expect(t.kind).toBe("answer");
    expect(t.cautions[0]).toMatch(/^This result is pulled by 1 month far from the rest; without them it reads (moderate|weak|can't tell from chance)\.$/);
    expect(t.strength).not.toBe("strong");
    expect(t.strength).toBe("moderate");
  });
  it("is a caution about a link that changed, and about gaps that were left out", () => {
    const x = wavy(24, 10, 7);
    const flips = takeaway(x, x.map((v, i) => (i < 12 ? v + (i % 3) / 10 : 40 - v + (i % 3) / 10)));
    expect(flips.cautions).toEqual(["This link pointed the other way earlier; the latest half reads strong."]);
    const holey = months("2024-01", wavy(24, 10, 7)).filter((_, i) => i !== 5 && i !== 14);
    const m = resolverFrom([a, b], { visits: holey, revenue: months("2024-01", wavy(24, 10, 7).map((v, i) => 2 * v + (i % 3))) });
    const c = correlate(a, b, m, { yearStart: JANUARY });
    const t = correlationTakeaway(a, b, c, ctx);
    expect(t.cautions).toEqual(["Visits and Revenue: no value for 2 of 24 months, left out."]);
    // The link is strong by itself, and with a caution it is moderate.
    expect(strengthOf((c as { r: number }).r, (c as { n: number }).n)).toBe("strong");
    expect(t.strength).toBe("moderate");
  });
  it("writes the number of periods in the Number Style, and the figures are what the sentence says", () => {
    const day = metric({ id: 4, slug: "visits", name: "Visits", period: "day" });
    const day2 = metric({ id: 5, slug: "revenue", name: "Revenue", period: "day" });
    const at = (v: (i: number) => number): Point[] => Array.from({ length: 1234 }, (_, i) => ({ period: new Date(Date.UTC(2020, 0, 1 + i)).toISOString().slice(0, 10), value: v(i) }));
    const c = correlate(day, day2, resolverFrom([day, day2], { visits: at((i) => 10 + ((i * 7) % 11)), revenue: at((i) => 20 + ((i * 7) % 11) * 2 + (i % 3)) }), { yearStart: JANUARY });
    for (const style of NUMBER_STYLES) {
      const t = correlationTakeaway(day, day2, c, { style });
      const n = (c as { n: number }).n;
      expect(t.figures).toEqual([{ label: "Pairs of periods", value: n, text: formatNumber(n, 0, style) }]);
      expect(t.sentence).toContain(`over ${formatNumber(n, 0, style)} days`);
      expect(t.numbers.find((x) => x.label === "r")!.text).toBe(formatNumber((c as { r: number }).r, 2, style));
    }
  });
  it(`says no number the Method did not give: every number in the sentence is a figure, at the Metric's own reading (${numRuns} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(fc.integer({ min: 6, max: 40 }), fc.constantFrom(...NUMBER_STYLES), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 }), (n, style, s1, s2) => {
        const t = correlationTakeaway(a, b, correlation(wavy(n, 10, s1), wavy(n, 10, s2).map((v, i) => v + (i % 4))), { style });
        if (t.kind !== "answer") return;
        const found = numbersIn(t.sentence!, style).map((x) => x.text);
        expect(found.sort()).toEqual(t.figures.map((f) => f.text).sort());
        for (const f of t.figures) expect(f.text).toBe(formatNumber(f.value, 0, style));
      }),
      { numRuns, seed },
    );
  });
});

describe("the invariants over generated series", () => {
  const series = fc.integer({ min: 4, max: 30 }).chain((n) => fc.tuple(fc.array(fc.integer({ min: -30, max: 30 }), { minLength: n, maxLength: n }), fc.array(fc.integer({ min: -30, max: 30 }), { minLength: n, maxLength: n })));
  it(`a refusal never carries a number, a caution is never strong, the footer is on once, the same series gives the same words, and no forbidden word (${numRuns * 3} pairs, seed ${seed})`, () => {
    fc.assert(
      fc.property(series, ([xs, ys]) => {
        const t = takeaway(xs, ys);
        expect(takeaway(xs, ys)).toEqual(t);
        for (const text of texts(t)) expect(text).not.toMatch(FORBIDDEN);
        if (t.kind === "refusal") {
          expect(t).toMatchObject({ sentence: null, strength: null, strengthText: null, range: null, basis: null, footer: null, figures: [], numbers: [], cautions: [], assumptions: [], notes: [] });
          expect(t.refusal).not.toBeNull();
        } else {
          expect(t.refusal).toBeNull();
          if (t.cautions.length > 0) expect(t.strength).not.toBe("strong");
          expect(t.footer).toBe(FOOTER);
          expect([t.sentence, ...t.cautions, ...t.notes, t.basis].filter((x) => x?.includes("went together"))).toEqual([]);
        }
      }),
      { numRuns: numRuns * 3, seed },
    );
  });
  it("is a refusal, in the Method's words, for a pair the Method could not compare", () => {
    const t = correlationTakeaway(a, b, { ok: false, period: "month", why: "not-combined", reason: "Aggregation none: X is compared only with monthly Metrics.", n: 0 }, ctx);
    expect(t.refusal).toBe("Aggregation none: X is compared only with monthly Metrics.");
  });
});

describe("Drivers' Takeaway", () => {
  const target = metric({ id: 1, slug: "revenue", name: "Revenue", period: "month" });
  const others = [
    metric({ id: 2, slug: "visits", name: "Visits", period: "month" }),
    metric({ id: 3, slug: "price", name: "Price", period: "month" }),
    metric({ id: 4, slug: "noise", name: "Noise", period: "month" }),
    metric({ id: 5, slug: "tickets", name: "Tickets", period: "month" }),
    metric({ id: 6, slug: "flat", name: "Flat", period: "month" }),
    metric({ id: 7, slug: "sessions", name: "Sessions", period: "month" }),
  ];
  const base = wavy(24, 10, 7);
  const data = {
    revenue: months("2024-01", base),
    visits: months("2024-01", base.map((v, i) => 2 * v + (i % 3))),
    price: months("2024-01", base.map((v, i) => 3 * v + (i % 4) * 2)),
    noise: months("2024-01", random(1, 24)),
    tickets: months("2024-01", base.map((v, i) => 100 - v + (i % 5))),
    flat: months("2024-01", Array.from({ length: 24 }, () => 3)),
    sessions: months("2024-01", base.map((v, i) => 4 * v + (i % 6))),
  };
  const run = (ms: Metric[]) => {
    const { ranked } = rankCorrelations(target, ms, resolverFrom([target, ...ms], data), { yearStart: JANUARY });
    return { ranked, t: driversTakeaway(target, ranked, ctx) };
  };
  it("names the Metrics that moved with the target the most, up to three, with one footer and the strength of each", () => {
    const { ranked, t } = run(others);
    expect(t.kind).toBe("answer");
    expect(t.sentence).toMatch(/^Over 24 months, .+ moved with Revenue the most\.$/);
    const named = /^Over 24 months, (.+) moved with Revenue the most\.$/.exec(t.sentence!)![1];
    expect(named.split(/, | and /).length).toBe(3);
    expect(t.footer).toBe(FOOTER);
    expect(t.rows.length).toBe(ranked.length);
    for (const row of t.rows) expect(row.takeaway.footer).toBeNull();
    expect(t.rows.map((r) => r.takeaway.kind)).toEqual(ranked.map(() => "answer"));
    expect(t.strength).toBe(t.rows[0].takeaway.strength);
    expect(t.numbers.length).toBe(ranked.length);
    expect(t.numbers[0].text).toMatch(/^r -?\d\.\d\d, compared by value, over 24 months$/);
    expect(t.figures).toEqual([{ label: "Pairs of periods", value: 24, text: "24" }]);
    for (const x of texts(t)) expect(x).not.toMatch(FORBIDDEN);
  });
  it("names one Metric alone, and two with 'and'", () => {
    expect(/moved with/.test(run([others[0]]).t.sentence!)).toBe(true);
    expect(run([others[0]]).t.sentence).toBe("Over 24 months, Visits moved with Revenue the most.");
    expect(run([others[0], others[1]]).t.sentence).toMatch(/^Over 24 months, (Visits and Price|Price and Visits) moved with Revenue the most\.$/);
  });
  it("names only the Metrics that can be told from chance, though the others are in the list", () => {
    const t = run([others[0], others[2]]).t;
    expect(t.sentence).toBe("Over 24 months, Visits moved with Revenue the most.");
    expect(t.rows.map((r) => r.takeaway.strength)).toEqual(["strong", "cant-tell"]);
  });
  it("names none when no Metric can be told from chance, and never a Metric that is a refusal", () => {
    const t = run([others[2]]).t;
    expect(t.sentence).toBe("Over 24 months, no Metric moved with Revenue clearly enough to tell from chance.");
    expect(t.strength).toBe("cant-tell");
  });
  it("is a refusal when there is nothing to compare, and a Metric whose own checks refuse stays out of the sentence", () => {
    const empty = driversTakeaway(target, [], ctx);
    expect(empty).toMatchObject({ kind: "refusal", sentence: null, refusal: "No other Metric has enough in common with Revenue to compare.", footer: null, rows: [] });
    const ok = run([others[0]]).ranked[0];
    const fake = { metric: others[4], result: { ...ok.result, pairs: ok.result.pairs.map((p) => ({ ...p, y: 3 })), r: 0.99 } };
    const t = driversTakeaway(target, [fake, ok], ctx);
    expect(t.rows[0].takeaway.kind).toBe("refusal");
    expect(t.sentence).toBe("Over 24 months, Visits moved with Revenue the most.");
    expect(t.numbers.length).toBe(1);
    expect(driversTakeaway(target, [fake], ctx)).toMatchObject({ kind: "refusal", refusal: "No other Metric has enough in common with Revenue to compare." });
  });
});
