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
import { HEADS_UP_EN } from "./heads-up-wording";
import { STRENGTH, strengthOf, type StrengthWord } from "./strength";
import { correlationTakeaway, driversTakeaway, footerText, refusalTakeaway, verdictLines, type Takeaway, type TakeawayContext } from "./takeaway";
import { LANGUAGES, WORDING, say, type CaseKey, type Slots } from "./wording";

const { numRuns, seed } = runs();
const ctx: TakeawayContext = { style: "1,234.5" };
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/suitability.json", import.meta.url), "utf8"));
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const FOOTER = "This shows what has gone together, not what caused what.";

const UNIT = { unit: "€", unit_position: "after", decimals: 0 } as const;
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
const texts = (t: Takeaway) => [t.sentence, t.refusal, t.strengthText, t.basis, t.method, ...t.assumptions, ...t.cautions, ...t.notes, t.track, ...t.numbers.flatMap((n) => [n.label, n.text]), ...t.figures.map((f) => f.label)].filter((x): x is string => x !== null);

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

const EUR = (value: number) => ({ value, unit: { unit: "€", unit_position: "after" as const, decimals: 0 } });

describe("the wording", () => {
  const SAMPLE: Slots = { a: "Visits", b: "Revenue", n: 18, span: "month", strength: "strong", names: "Visits and Price", target: "Revenue", name: "Visits", other: "Cost", have: 9, need: 16, missing: 3, total: 24, run: 3, count: 2, without: 0.5, held: "Price and Cost", lag: 2, longest: 6, low: { value: 410, unit: UNIT }, high: { value: 520, unit: UNIT }, top: 3, rows: 8, share: "71.0 %", change: { value: 42, unit: UNIT }, parts: "A −3 €, B +1 €", from: "2025-03-01", latest: "weak", drivers: 8, allowed: 4, basis: "compared by value", period: "month", skew: 2.5, value: EUR(1200), lo: EUR(1100), hi: EUR(1300), min: EUR(1250), max: EUR(1350), chance: "about 7 in 10", k: 7, tested: 12, inside: 10, pattern: "yearly", ahead: 15, most: 12, method: "a plain trend (Holt)" };
  const FIT: Slots = { ...SAMPLE, driver: "Visits", step: "1,000", direction: "gone up", effect: "2,400 €", lo: "1,800 €", hi: "3,000 €", held: ", with Price held the same", others: "Price and Cost", share: "about half", given: "Visits at 60,000", value: "54,000", goal: "120,000 €", compared: "12 % above today", outside: "This is higher than Visits has ever been (highest 51,000)", limit: "51,000", pct: "12 %", what: "The fit", strength: "strong", name: "Visits", names: "Visits, Price" };
  /** Each case with its slots and the sentence it must come to: a table of cases, per language that exists. */
  const TABLE: Record<Exclude<CaseKey, keyof typeof HEADS_UP_EN>, [Slots, string]> = {
    "strength-strong": [{}, "strong"], "strength-moderate": [{}, "moderate"], "strength-weak": [{}, "weak"], "strength-cant-tell": [{}, "can't tell from chance"],
    footer: [{}, FOOTER], "footer-forecast": [{}, "This carries the past forward; it is not a promise."],
    "basis-values": [{}, "compared by value"], "basis-changes": [{}, "compared by change, growth removed"],
    "basis-over": [SAMPLE, "compared by value, over 18 months"], "basis-combined": [SAMPLE, "compared by value, by month (18 months)"],
    "corr-together": [SAMPLE, "Visits and Revenue tend to move together over 18 months (strong)."],
    "corr-opposite": [SAMPLE, "Visits and Revenue tend to move in opposite directions over 18 months (strong)."],
    "corr-cant-tell": [SAMPLE, "Over 18 months, Visits and Revenue do not clearly move together: strong."],
    "drivers-some": [SAMPLE, "Over 18 months, Visits and Price moved with Revenue the most."],
    "drivers-none": [SAMPLE, "Over 18 months, no Metric moved with Revenue clearly enough to tell from chance."],
    "drivers-empty": [SAMPLE, "No other Metric has enough in common with Revenue to compare."],
    "drivers-row": [SAMPLE, "Visits: strong"], "list-and": [{}, " and "], "list-comma": [{}, ", "],
    // Fit, predict and needs (spec 0041, ticket 4).
    "moves-some": [SAMPLE, "Over 18 months, Visits and Price moved with Revenue the most, with the others held the same."],
    "moves-one": [SAMPLE, "Over 18 months, Visits and Price moved with Revenue the most."],
    "moves-none": [SAMPLE, "Over 18 months, none of the other Metrics clearly moved with Revenue: can't tell from chance."],
    "moves-row": [FIT, "Visits: about half of the movement in Revenue, strong"],
    "moves-all": [SAMPLE, "Over 18 months, Visits and Price all moved with Revenue, the first the most, with the others held the same."],
    "effect-per-step": [{ amount: "2,400 €", step: "1,000", name: "Visits" }, "2,400 € for each step of 1,000 in Visits"],
    "note-first-pass": [SAMPLE, "8 Metrics are more than 9 months can weigh, so the 4 that move most closely with Revenue were chosen first and the others left out."],
    "caution-crowded": [SAMPLE, "Visits and Price move closely together, so their separate effects are less certain; the ranges show how much."],
    "list-more": [{ n: 3 }, "3 more"],
    "numbers-explains": [{}, "Share of all the movement"],
    "note-left-out": [SAMPLE, "Left out of the first pass, as they moved less closely with Revenue: Visits and Price."],
    "note-common-period": [SAMPLE, "Everything is compared by month, the longest period among these Metrics: Visits and Price combined to it by their Aggregation."],
    "refuse-drivers-mix": [FIT, "Visits, Price move so closely together as a group (one is much like the others added up) that there is no telling which of them matters."],
    "caution-gaps-change": [{ ...SAMPLE, which: "March 2025" }, "Visits: no value for March 2025, so the changes into and out of March 2025 could not be worked out and were left out."],
    "refuse-gaps-change": [{ ...SAMPLE, which: "March 2025" }, "Visits: no value for March 2025, so too many changes could not be worked out to go on."],
    "refuse-gap-run-change": [SAMPLE, "Visits: no value for 3 months in a row, so the changes into and out of them could not be worked out: too many to go on."],
    "predict-range-next": [FIT, "Next month, with Visits at 60,000, Revenue is likely between 1,800 € and 3,000 €."],
    "predict-guess-next": [FIT, "Next month, with Visits at 60,000, Revenue comes to about 54,000. This is higher than Visits has ever been (highest 51,000), so treat it as a guess."],
    "needs-range-next": [FIT, "To reach 120,000 € next month, Visits would need to be around 54,000 (likely between 1,800 € and 3,000 €), 12 % above today."],
    "needs-guess-next": [FIT, "To reach 120,000 € next month, Visits would need to be around 54,000, 12 % above today. This is higher than Visits has ever been (highest 51,000), so treat it as a guess."],
    "needs-point-next": [FIT, "To reach 120,000 € next month, Visits would need to be around 54,000, 12 % above today; how far off that could be cannot be told from the data, so treat it as a guess."],
    "numbers-value": [{}, "Value read"],
    "moves-effect": [FIT, "When Visits goes up by 1,000, Revenue has gone up by about 2,400 € (likely between 1,800 € and 3,000 €), with Price held the same."],
    "moves-held": [FIT, ", with Price and Cost held the same"],
    "moves-unclear": [FIT, "Visits: it cannot be told whether Revenue goes up or down with it."],
    "word-up": [{}, "gone up"], "word-down": [{}, "gone down"],
    "share-nearly-all": [{}, "nearly all"], "share-most": [{}, "most"], "share-half": [{}, "about half"], "share-third": [{}, "about a third"], "share-quarter": [{}, "about a quarter"], "share-some": [{}, "some"], "share-little": [{}, "little"],
    "note-merged": [{ ...SAMPLE, kept: "Visits" }, "Visits and Price move so closely that Ziffr cannot tell which matters; treated as one, and the effect is in the unit of Visits."],
    "predict-range": [FIT, "With Visits at 60,000, Revenue is likely between 1,800 € and 3,000 €."],
    "predict-guess": [FIT, "With Visits at 60,000, Revenue comes to about 54,000. This is higher than Visits has ever been (highest 51,000), so treat it as a guess."],
    "needs-range": [FIT, "To reach 120,000 €, Visits would need to be around 54,000 (likely between 1,800 € and 3,000 €), 12 % above today."],
    "needs-guess": [FIT, "To reach 120,000 €, Visits would need to be around 54,000, 12 % above today. This is higher than Visits has ever been (highest 51,000), so treat it as a guess."],
    "needs-point": [FIT, "To reach 120,000 €, Visits would need to be around 54,000, 12 % above today; how far off that could be cannot be told from the data, so treat it as a guess."],
    "compared-above": [FIT, "12 % above today"], "compared-below": [FIT, "12 % below today"], "compared-same": [{}, "the same as today"], "compared-zero": [{}, "against 0 today"],
    "given-at": [FIT, "Visits at 54,000"],
    "needs-none": [FIT, "Over 18 months, none of the other Metrics clearly moved with Revenue, so no value of them can be read as reaching 120,000 €."],
    "outside-above": [FIT, "This is higher than Visits has ever been (highest 51,000)"],
    "outside-below": [FIT, "This is lower than Visits has ever been (lowest 51,000)"],
    "outside-rise": [FIT, "This is a bigger rise in one month than Visits has ever had (largest 51,000)"],
    "outside-fall": [FIT, "This is a bigger fall in one month than Visits has ever had (largest 51,000)"],
    "refuse-drivers-collinear": [FIT, "Visits, Price: one is exactly the others added up, so there is no telling which of them matters."],
    "refuse-no-drivers": [SAMPLE, "Revenue needs at least one other Metric to be compared with."],
    "refuse-too-large": [{}, "The values are too large to work with."],
    "refuse-exact-places": [{ name: "Signups", places: 20 }, "Signups: its values go to more than 20 decimal places, which cannot be worked out exactly in reasonable time."],
    "refuse-exact-orders": [{ name: "Signups", orders: 20 }, "Signups: its values span more than 20 orders of magnitude, from the smallest that is not 0 to the largest, which cannot be worked out exactly in reasonable time."],
    "refuse-exact-work": [{}, "These values are too large or too fine to work out exactly in reasonable time."],
    "refuse-input": [FIT, "The fit cannot be used as it was given."],
    "refuse-no-effect": [SAMPLE, "Revenue has not moved with Visits at all, so no value of Visits reaches the value you want."],
    "refuse-curved-outside": [SAMPLE, "The link looks curved, so nothing can be read from it for a value of Visits outside what it has been."],
    "refuse-goal-input": [{}, "The value you want must be a number."],
    "refuse-goal-far": [FIT, "120,000 € is more than 1,000 times the largest value Revenue has had, so it is not worked out."],
    "numbers-method-fit": [{}, "Straight line through several Metrics, by least squares"],
    "numbers-method-predict": [{}, "A value read from that line, with the range of a single period"],
    "numbers-method-needs": [{}, "That line turned round for one driver"],
    "numbers-explained": [{}, "How much of the movement the line explains"],
    "numbers-effect": [FIT, "Effect per 1,000"], "numbers-explained-share": [{}, "Share of what the line explains"],
    "numbers-moves-with": [{}, "How closely it moves with the other drivers (1 is not at all)"], "numbers-goal": [{}, "Value wanted"], "numbers-needed": [{}, "Value needed"], "numbers-given": [{}, "Values given"],
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
    "refuse-controls": [{ ...SAMPLE, have: 5 }, "Visits and Cost need 1 to 4 other Metrics held the same: 5 were given."],
    "refuse-collinear": [{}, "The Metrics held the same move so closely together that they cannot be told apart, so nothing can be held the same."],
    "refuse-explained": [SAMPLE, "Once the others are held the same, nothing of Visits or Cost is left to compare."],
    "refuse-season": [SAMPLE, "Visits has no values at that place in the season to go by."],
    "refuse-rows": [{ ...SAMPLE, have: 1, need: 2 }, "Visits: 1 of 2 rows needed."],
    "refuse-not-a-number": [SAMPLE, "Visits has a row that is not a number, so nothing is worked out."],
    "refuse-negative": [SAMPLE, "Visits has a row below zero, so a share of the whole means nothing."],
    "refuse-nothing": [SAMPLE, "Visits adds up to nothing, so there is no share to give."],
    "refuse-ask": [SAMPLE, "Visits: that number of rows or that share cannot be worked out here."],
    "refuse-weight": [SAMPLE, "Visits: a part must count for or against the whole."],
    "basis-rank-values": [{}, "compared by rank of value"], "basis-rank-changes": [{}, "compared by rank of change, growth removed"],
    "basis-held": [SAMPLE, "compared by value, with Price and Cost held the same"],
    "basis-season": [SAMPLE, "from the 18 values at the same place in the season"], "basis-history": [SAMPLE, "from 18 months of history"],
    "partial-together": [SAMPLE, "With Price and Cost held the same, Visits and Revenue tend to move together over 18 months (strong)."],
    "partial-opposite": [SAMPLE, "With Price and Cost held the same, Visits and Revenue tend to move in opposite directions over 18 months (strong)."],
    "partial-cant-tell": [SAMPLE, "With Price and Cost held the same, over 18 months, Visits and Revenue do not clearly move together: strong."],
    "lag-leads": [SAMPLE, "Visits tends to move 2 months before Revenue does, over 18 months (strong)."],
    "lag-leads-opposite": [SAMPLE, "Visits tends to move the other way 2 months before Revenue does, over 18 months (strong)."],
    "lag-same": [SAMPLE, "Visits and Revenue tend to move together in the same month, with no delay, over 18 months (strong)."],
    "lag-same-opposite": [SAMPLE, "Visits and Revenue tend to move in opposite directions in the same month, with no delay, over 18 months (strong)."],
    "lag-cant-tell": [SAMPLE, "Over 18 months, nothing clearly shows Visits moving 0 to 6 months before Revenue: strong."],
    "usual-range": [SAMPLE, "Visits is usually between 410 € and 520 €, going by 18 months."],
    "usual-range-season": [SAMPLE, "Visits is usually between 410 € and 520 € at this place in the season, going by 18 values."],
    "usual-below": [{ value: { value: 380, unit: UNIT } }, "The value asked about, 380 €, is below that."],
    "usual-within": [{ value: { value: 440, unit: UNIT } }, "The value asked about, 440 €, is within that."],
    "usual-above": [{ value: { value: 640, unit: UNIT } }, "The value asked about, 640 €, is above that."],
    "share-top": [{ ...SAMPLE, names: "A, B and C" }, "Worked out: the 3 largest of 8 rows make up 71.0 % of Visits: A, B and C."],
    "share-pareto": [{ ...SAMPLE, names: "A, B and C", target: "80.0 %" }, "Worked out: 3 of 8 rows make up 71.0 % of Visits, the fewest that reach 80.0 %: A, B and C."],
    "note-tied": [{}, "Rows of the same size stand at the cut, so which of them is named is arbitrary; the count is not."],
    "bridge-up": [SAMPLE, "Worked out: Visits rose by 42 €: A −3 €, B +1 €."],
    "bridge-down": [SAMPLE, "Worked out: Visits fell by 42 €: A −3 €, B +1 €."],
    "bridge-flat": [SAMPLE, "Worked out: Visits did not change: A −3 €, B +1 €."],
    "bridge-missing": [{ ...SAMPLE, names: "A, B and C" }, "A, B and C had no value in one of the two periods; a missing value counts as 0."],
    "bridge-unexplained": [{ value: { value: 5, unit: UNIT } }, "5 € of the change is not in these rows."],
    "numbers-method-spearman": [{}, "Spearman's rank correlation"], "numbers-method-partial": [{}, "Partial correlation"], "numbers-method-lag": [{}, "Lagged correlation"],
    "numbers-method-usual": [{}, "Usual range"], "numbers-method-share": [{}, "Share of the largest rows"], "numbers-method-pareto": [{}, "Pareto"], "numbers-method-bridge": [{}, "Bridge"],
    "numbers-rho": [{}, "Rank correlation"], "numbers-held": [{}, "Held the same"], "numbers-lag": [{}, "Delay (periods)"], "numbers-tries": [{}, "Delays looked at"],
    "numbers-low": [{}, "Usual low"], "numbers-high": [{}, "Usual high"], "numbers-asked": [{}, "Value asked about"], "numbers-median": [{}, "Middle"],
    "numbers-quartiles": [{}, "Middle half"], "numbers-usual": [{}, "Usual range"], "numbers-values": [{}, "Values used"], "numbers-share": [{}, "Share"], "numbers-change": [{}, "Change"],
    // Before and after, and the change point (spec 0041, ticket 7).
    "footer-before-after": [{}, "This compares what happened with where the earlier trend pointed; it does not show what made the difference."],
    "refuse-date": [{}, "That date is not a day, so nothing can be compared before and after it."],
    "refuse-no-after": [{ name: "Signups", since: "1 Mar 2026" }, "Signups has no value on or after 1 Mar 2026 yet, so there is nothing to compare."],
    "refuse-huge-values": [{ name: "Signups" }, "The values of Signups are too large to work out a range from."],
    "refuse-tiny": [{ name: "Signups" }, "Signups: the difference is too small to write out."],
    "ba-lead-main": [{ since: "1 Mar 2026" }, "After 1 Mar 2026, "], "ba-lead-beside": [{}, "Set beside it, "],
    "ba-gap-above": [{ size: "12.0 %" }, "about 12.0 % above"], "ba-gap-below": [{ size: "12.0 %" }, "about 12.0 % below"],
    "ba-clear": [{ lead: "After 1 Mar 2026, ", name: "Signups", gap: "about 12.0 % above", lo: "+4.0 %", hi: "+20.0 %" }, "After 1 Mar 2026, Signups ran about 12.0 % above where its trend pointed (likely between +4.0 % and +20.0 %; that range leaves out zero)."],
    "ba-unclear": [{ lead: "After 1 Mar 2026, ", name: "Signups", gap: "about 3.0 % below", lo: "−9.0 %", hi: "+3.0 %" }, "After 1 Mar 2026, Signups ran about 3.0 % below where its trend pointed (likely between −9.0 % and +3.0 %; that range includes zero)."],
    "ba-level": [{ lead: "Set beside it, ", name: "Visits", lo: "−2.0 %", hi: "+2.0 %" }, "Set beside it, Visits ran exactly where its trend pointed (likely between −2.0 % and +2.0 %; that range includes zero)."],
    "ba-basis": [{ n: 12, m: 4, since: "1 Mar 2026", span: "month" }, "from a straight line through the 12 months before 1 Mar 2026, compared with the 4 months since"],
    "ba-assumes": [{ since: "1 Mar 2026" }, "This assumes the trend before 1 Mar 2026 would have carried on, and that the ups and downs since are as large as those before and do not carry over from one period to the next."],
    "ba-note-latest": [{ n: 120, since: "1 Mar 2026", span: "month" }, "Only the latest 120 months with a value before 1 Mar 2026 are used."],
    "ba-note-straddle": [{ from: "2026-03-01", since: "15 Mar 2026", span: "month" }, "The month of March 2026 began before 15 Mar 2026, so it is left out."],
    "ba-beside-refused": [{ name: "Visits" }, "Visits could not be set beside it."],
    "caution-ba-beside-moved": [{ name: "Visits" }, "Visits, set beside it, also ran outside the same range around its own trend, which chance alone gives about 1 time in 5, so something else may have moved both, or it may be chance."],
    "caution-ba-fits": [{ since: "1 Mar 2026" }, "The values before 1 Mar 2026 lie exactly on a straight line, so the range has no spread to go by and may be too sure."],
    "cp-found": [{ from: "2026-03-01", span: "month", name: "Signups", before: "up 120 a month", after: "down 40 a month", step: "its level was 300 lower than the earlier trend would have given" }, "Around March 2026, Signups changed: before, it went up 120 a month; since, down 40 a month; and at that point its level was 300 lower than the earlier trend would have given."],
    "cp-up": [{ size: "120", span: "month" }, "up 120 a month"], "cp-down": [{ size: "40", span: "week" }, "down 40 a week"], "cp-flat": [{}, "neither up nor down"],
    "cp-step-up": [{ size: "300" }, "its level was 300 higher than the earlier trend would have given"], "cp-step-down": [{ size: "300" }, "its level was 300 lower than the earlier trend would have given"], "cp-step-none": [{}, "its level was just where the earlier trend would have put it"],
    "cp-none": [{ n: 24, name: "Signups", span: "month" }, "Over 24 months, nothing in Signups stands out as a change in its level or in where it was heading."],
    "cp-basis": [{ n: 24, tries: 17, span: "month" }, "from a straight line before the date and another after it, over 24 months, with the bar for chance raised for the dates tried (17)"],
    "cp-assumes": [{}, "This looks for one change only; the date is the one that fits best, nearby dates may fit almost as well, and the ups and downs of each period are taken as not carrying over from the one before."],
    "footer-change-point": [{}, "This shows when the numbers changed, not what made them change."],
    "caution-carry-over": [{ name: "Signups", span: "month" }, "The ups and downs of Signups carry over from one month to the next, which a change does too, but so does a slow wave; read this with care, since the range or the chance may be too sure."],
    "ba-note-first": [{ n: 120, since: "1 Mar 2026", span: "month" }, "Only the first 120 months with a value since 1 Mar 2026 are used."],
    "cp-note-latest": [{ n: 120, span: "month" }, "Only the latest 120 months with a value are looked at."],
    "cp-without-found": [{ from: "2026-03-01", span: "month" }, "a change around March 2026"], "cp-without-none": [{}, "no change at all"],
    "numbers-method-before-after": [{}, "Before and after"], "numbers-method-change-point": [{}, "Change point"], "numbers-date": [{}, "Date"],
    "numbers-before": [{}, "Periods before"], "numbers-after": [{}, "Periods after"], "numbers-trend": [{}, "Trend before (per period)"],
    "numbers-trend-level": [{}, "Where the trend pointed (average)"], "numbers-actual": [{}, "What it was (average)"], "numbers-gap": [{}, "Difference"],
    "numbers-gap-share": [{}, "Difference as a share of the trend"], "numbers-periods-used": [{}, "Periods used"], "numbers-dates-tried": [{}, "Dates tried"],
    "numbers-change-date": [{}, "Best date"], "numbers-kept": [{}, "Misses left, against one line"], "numbers-slope-before": [{}, "Trend before the date (per period)"],
    "numbers-slope-after": [{}, "Trend after the date (per period)"], "numbers-step": [{}, "Step in level at the date"],
    "numbers-method": [{}, "Method"], "numbers-method-pearson": [{}, "Pearson's r"], "numbers-r": [{}, "r"], "numbers-pairs": [{}, "Pairs of periods"],
    "fc-expected": [SAMPLE, "Visits is expected to be 1,200 € in March 2025 (likely between 1,100 € and 1,300 €)."],
    "fc-reach-min": [SAMPLE, "At this pace Visits reaches 1,250 € or more in March 2025: about 7 in 10."],
    "fc-reach-max": [SAMPLE, "At this pace Visits stays at 1,350 € or less in March 2025: about 7 in 10."],
    "fc-reach-between": [SAMPLE, "At this pace Visits lands between 1,250 € and 1,350 € in March 2025: about 7 in 10."],
    "chance-about": [SAMPLE, "about 7 in 10"], "chance-under": [{}, "under 1 in 20"], "chance-over": [{}, "at least 19 in 20"],
    "fc-method-holt": [{}, "a plain trend (Holt)"],
    "fc-method-holt-winters": [{}, "the trend and the yearly pattern (Holt-Winters)"],
    "fc-method-holt-winters-weekly": [{}, "the trend and the weekly pattern (Holt-Winters)"],
    "fc-basis": [SAMPLE, "worked out with a plain trend (Holt), over 18 months"],
    "fc-track": [SAMPLE, "Over the last 12 months, the range for the next month would have held 10 of 12 times."],
    "fc-track-none": [SAMPLE, "Too few months yet to check how this forecast did on the past."],
    "fc-assumes": [{}, "This assumes the pattern of the past carries on."],
    "fc-note-holt-better": [SAMPLE, "A plain trend missed no more than the yearly pattern on the last third of the months, so the plain trend is used."],
    "fc-note-too-few": [SAMPLE, "Too few months to check the yearly pattern against a plain trend, so a plain trend is used."],
    "fc-note-start-gap": [SAMPLE, "The yearly pattern needs the first two seasons without a gap, so a plain trend is used."],
    "pattern-yearly": [{}, "yearly"], "pattern-weekly": [{}, "weekly"],
    "caution-no-misses": [{}, "The past values fit this pattern with no miss at all, so the range and the chance may be too sure."],
    "refuse-too-far": [SAMPLE, "Visits cannot be looked at 15 months ahead; at most 12 months."],
    "refuse-by-past": [SAMPLE, "That date is not ahead: the latest value is for March 2025."],
    "refuse-no-target": [SAMPLE, "Visits has no Target to reach."],
    "refuse-target-ends": [SAMPLE, "The Target of Visits cannot be read: its lower end is above its upper end, or an end is not a number."],
    "refuse-huge": [SAMPLE, "The values of Visits are too large to look ahead from."],
    "numbers-method-holt": [{}, "Holt's linear trend"], "numbers-method-holt-winters": [{}, "Holt-Winters, additive"],
    "numbers-smoothing": [{}, "Smoothing (level, trend, pattern)"], "numbers-expected": [{}, "Expected"], "numbers-range": [{}, "Likely between"],
    "numbers-chance": [{}, "Chance of reaching the Target"], "numbers-target-min": [{}, "Target, at least"], "numbers-target-max": [{}, "Target, at most"], "numbers-in-ten": [{}, "In ten"],
    "numbers-tested": [{}, "Periods tested"], "numbers-inside": [{}, "Inside the range"], "numbers-miss": [{}, "Typical miss"],
    "numbers-third-holt": [{}, "Typical miss on the last third, plain trend"], "numbers-third-holt-winters": [{}, "Typical miss on the last third, with the pattern"], "numbers-third-n": [{}, "Periods compared"],
    "numbers-periods": [{}, "Periods"], "numbers-basis": [{}, "Compared on"], "numbers-strength": [{}, "Strength"],
  };
  it.each(LANGUAGES)("%s: every case is in the table, and says what the table says", (language) => {
    // The Heads-ups' cases are a table of their own (heads-up.test.ts).
    expect(Object.keys({ ...TABLE, ...HEADS_UP_EN }).sort()).toEqual(Object.keys(WORDING[language]).sort());
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
    expect(few).toEqual({ kind: "refusal", method: "Pearson's r", sentence: null, refusal: "Not enough months in common (3 of 6).", strength: null, strengthText: null, range: null, basis: null, assumptions: [], cautions: [], notes: [], track: null, footer: null, figures: [], numbers: [] });
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

describe("the far-off finding's strength word", () => {
  it("is read by the rule the Method gives, Pearson's by default", () => {
    const v = { refusals: [], cautions: [{ case: "caution-far-off" as const, slots: { count: 1, without: 0.95, span: "month" } }], switches: [] };
    expect(verdictLines(v, ctx, 10).cautions).toEqual(["This result is pulled by 1 month far from the rest; without them it reads strong."]);
    expect(verdictLines(v, ctx, 10, () => "weak").cautions).toEqual(["This result is pulled by 1 month far from the rest; without them it reads weak."]);
    const seen: number[][] = [];
    verdictLines(v, ctx, 10, (r, n) => (seen.push([r, n]), "weak"));
    expect(seen).toEqual([[0.95, 9]]);
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
