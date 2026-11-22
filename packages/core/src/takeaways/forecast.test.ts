// The Takeaway of a forecast (spec 0041, ticket 6): the words for what is expected and how likely a Target is to be reached, the
// Method and why, the track record, the refusals and cautions, with the numbers held to the Methods' (and to Python's, from
// fixtures/forecast.py), the thresholds of the chance's words one step either side, no forbidden word anywhere, the same text twice.
import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatNumber, formatValue } from "../format";
import { bestForecast } from "../methods/forecast-choice";
import { Z80 } from "../methods/normal-curve";
import { backtest } from "../methods/track-record";
import { NUMBER_STYLES } from "../number-style";
import { shiftPeriod } from "../periods";
import { metric, months } from "../test/fixtures";
import { runs } from "../test/reference/check";
import { referenceNormalCdf } from "../test/reference/forecast";
import type { Point } from "../types";
import { CHANCE, chanceCase, forecastTakeaway, limitsOf, maxAhead, TRACK_PERIODS } from "./forecast";
import { WORDING, type Language } from "./wording";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/forecast.json", import.meta.url), "utf8"));
const suitability = JSON.parse(readFileSync(new URL("../test/reference/fixtures/suitability.json", import.meta.url), "utf8"));
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const FOOTER = "This shows what has gone together, not what caused what.";
const ctx = { style: "1,234.5" as const };
const euro = metric({ slug: "revenue", name: "Revenue", unit: "€", unit_position: "after", decimals: 0, period: "month" });
type Case = { season: number; values: (number | null)[]; periods: string[] };
const points = (name: string): Point[] => {
  const c: Case = fixture.cases[name];
  return c.values.flatMap((value, i) => (value === null ? [] : [{ period: c.periods[i], value }]));
};
const texts = (t: ReturnType<typeof forecastTakeaway>) => [t.sentence, t.refusal, t.basis, t.method, t.track, t.footer, ...t.assumptions, ...t.cautions, ...t.notes, ...t.numbers.flatMap((n) => [n.label, n.text]), ...t.figures.map((f) => f.label), t.range?.text].filter((x): x is string => typeof x === "string");
const money = (v: number, style: (typeof NUMBER_STYLES)[number] = "1,234.5") => formatValue(euro, v, style);

describe("what a Target asks for", () => {
  it("is the lower limit where higher is better, the upper where lower is better, both where closer is better, none without a limit", () => {
    expect(limitsOf({ polarity: "higher", target_min: 100, target_max: 200 })).toEqual({ min: 100, max: null });
    expect(limitsOf({ polarity: "lower", target_min: 100, target_max: 200 })).toEqual({ min: null, max: 200 });
    expect(limitsOf({ polarity: "target", target_min: 100, target_max: 200 })).toEqual({ min: 100, max: 200 });
    expect(limitsOf({ polarity: "higher", target_min: null, target_max: 200 })).toEqual({ min: null, max: null });
    expect(limitsOf({ polarity: "lower", target_min: 100, target_max: null })).toEqual({ min: null, max: null });
  });
  it("lets a forecast look a season ahead, and at least the span's default", () => {
    expect(["day", "week", "month", "quarter", "half", "year"].map((s) => maxAhead(s as "day"))).toEqual([14, 52, 12, 4, 2, 1]);
  });
});

describe("how a chance is said", () => {
  it("is under 1 in 20 below 5 %, over 19 in 20 from 95 %, else in tenths, one step either side of each", () => {
    expect(CHANCE).toEqual({ under: 0.05, over: 0.95 });
    const next = (x: number) => x + Number.EPSILON;
    expect(chanceCase(0)).toMatchObject({ key: "chance-under" });
    expect(chanceCase(0.05 - 1e-12)).toMatchObject({ key: "chance-under" });
    expect(chanceCase(0.05)).toEqual({ key: "chance-about", k: 1 });
    expect(chanceCase(0.95 - 1e-12)).toEqual({ key: "chance-about", k: 10 - 1 });
    expect(chanceCase(0.95)).toMatchObject({ key: "chance-over" });
    expect(chanceCase(1)).toMatchObject({ key: "chance-over" });
    // Tenths round half up: 0.45 is 5 in 10 (as 0.45 × 10 is 4.5 exactly in a double), 0.449… is 4.
    expect(chanceCase(0.5)).toEqual({ key: "chance-about", k: 5 });
    expect(chanceCase(0.44999)).toEqual({ key: "chance-about", k: 4 });
    expect(chanceCase(0.45).k).toBe(Math.round(0.45 * 10));
    expect(chanceCase(next(0.7)).k).toBe(7);
  });
  it("never says 0 in 10 or 10 in 10: the tenths between the two limits are 1 to 9", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (p) => {
        const c = chanceCase(p);
        if (c.key === "chance-about") expect(c.k >= 1 && c.k <= 9).toBe(true);
      }),
      { numRuns, seed },
    );
  });
});

describe("a forecast's Takeaway", () => {
  const points36 = points("airline-last-36");
  const py = fixture.cases["airline-last-36"].holtWinters.ahead;
  it("says what is expected and the 80 % range, in the Metric's unit, from Holt-Winters' numbers (Python's fractions say the same)", () => {
    const t = forecastTakeaway(euro, points36, ctx);
    const [value, sd] = [py[2].double, py[2].sd];
    const [lo, hi] = [value - Z80 * sd, value + Z80 * sd];
    expect(t.kind).toBe("answer");
    expect(t.sentence).toBe(`Revenue is expected to be ${money(value)} by March 2023 (likely between ${money(lo)} and ${money(hi)}).`);
    expect(t.range).toEqual({ lo, hi, text: `${money(lo)} – ${money(hi)}` });
    expect(t.figures).toEqual([{ label: "Expected", value, text: money(value) }, { label: "Likely between (low)", value: lo, text: money(lo) }, { label: "Likely between (high)", value: hi, text: money(hi) }]);
    expect(t.strength).toBeNull();
    expect(t.strengthText).toBeNull();
    expect(t.method).toBe("Holt-Winters, additive");
    expect(t.basis).toBe("worked out with the trend and the yearly pattern (Holt-Winters), over 36 months");
    expect(t.assumptions).toEqual(["This assumes the pattern of the past carries on."]);
    expect(t.footer).toBe(FOOTER);
    expect(t.cautions).toEqual([]);
    expect(t.notes).toEqual([]);
  });
  it("says how the Method did on the periods already known: the track record, as the rolling origin gives it", () => {
    const t = forecastTakeaway(euro, points36, ctx);
    const record = backtest(points36, "month", 12, "holtWinters", TRACK_PERIODS)!;
    expect(record.tested).toBe(12);
    expect(t.track).toBe(`Over the last 12 months this Method would have been within its range ${record.inBand} of 12 times.`);
    const row = (label: string) => t.numbers.find((n) => n.label === label)?.text;
    expect(row("Periods tested")).toBe("12");
    expect(row("Inside the range")).toBe(String(record.inBand));
    expect(row("Typical miss")).toBe(money(record.typicalMiss));
    expect(row("Method")).toBe("Holt-Winters, additive");
    expect(row("Smoothing (level, trend, pattern)")).toBe("0.5, 0.1, 0.3");
    expect(row("Expected")).toBe(money(py[2].double));
    // The last third: both Methods' typical miss on the same periods.
    const choice = bestForecast(points36, "month", 12)!.choice;
    expect(row("Typical miss on the last third, plain trend")).toBe(money(choice.holt!.typicalMiss));
    expect(row("Typical miss on the last third, with the pattern")).toBe(money(choice.seasonal!.typicalMiss));
    expect(row("Periods compared")).toBe("12");
  });
  it("says the Method that was used: a plain trend where the series is short, and it names no other", () => {
    const t = forecastTakeaway(euro, months("2025-01", [10, 12, 11, 14, 13, 16, 15, 18]), ctx);
    expect(t.method).toBe("Holt's linear trend");
    expect(t.basis).toBe("worked out with a plain trend (Holt), over 8 months");
    expect(t.notes).toEqual([]);
    expect(t.numbers.find((n) => n.label === "Smoothing (level, trend, pattern)")?.text).toBe("0.5, 0.1");
    expect(t.numbers.some((n) => n.label.startsWith("Typical miss on the last third"))).toBe(false);
  });
  it("says why a plain trend was used where the yearly pattern was a candidate: too few periods to check, not better, a gap at the start, a pattern that does not repeat", () => {
    const note = (pts: Point[]) => forecastTakeaway(euro, pts, ctx).notes;
    expect(note(points("airline-last-26" in fixture.cases ? "airline-last-26" : "airline-last-27").slice(0, 26))).toEqual(["Too few months to check the yearly pattern against a plain trend, so a plain trend is used."]);
    expect(note(points("airline-last-27"))).toEqual([]);
    expect(note(points("noisy-line-48"))).toEqual(["A plain trend missed no more than the yearly pattern on the last third of the months, so the plain trend is used."]);
    const gapAtStart = months("2020-01", Array.from({ length: 30 }, (_, t) => 100 + 3 * t + [5, -2, 1, 7, -4, 0, 3, -6, 2, 8, -1, 4][t % 12])).filter((_, i) => i !== 5);
    expect(note(gapAtStart)).toEqual(["The yearly pattern needs the first two seasons without a gap, so a plain trend is used."]);
    const flips: number[] = suitability.seasons.flips.values;
    expect(note(months("2020-01", flips))).toContain("The yearly pattern did not repeat the same way each year, so a plain trend is used instead.");
    expect(forecastTakeaway(euro, months("2020-01", flips), ctx).method).toBe("Holt's linear trend");
  });
  it("says a weekly pattern for a daily Metric", () => {
    const daily = metric({ ...euro, period: "day" });
    const pts = Array.from({ length: 35 }, (_, t) => ({ period: shiftPeriod("2025-01-01", "day", t), value: 100 + t + [0, 9, 14, 3, -6, -12, -8][t % 7] }));
    const t = forecastTakeaway(daily, pts, ctx);
    expect(t.method).toBe("Holt-Winters, additive");
    expect(t.basis).toBe("worked out with the trend and the weekly pattern (Holt-Winters), over 35 days");
    expect(t.sentence).toMatch(/ by Tue 18 Feb 2025 \(likely between /);
  });
  it("is the same twice, and does not change what it is given", () => {
    const before = JSON.stringify(points36);
    expect(forecastTakeaway(euro, points36, ctx)).toEqual(forecastTakeaway(euro, points36, ctx));
    expect(JSON.stringify(points36)).toBe(before);
  });
  it("writes numbers in the Number Style", () => {
    for (const style of NUMBER_STYLES) {
      const t = forecastTakeaway(euro, points36, { style });
      expect(t.sentence).toContain(money(py[2].double, style));
      expect(t.numbers.find((n) => n.label === "Periods tested")?.text).toBe(formatNumber(12, 0, style));
      expect(t.numbers.find((n) => n.label === "Smoothing (level, trend, pattern)")?.text).toBe([0.5, 0.1, 0.3].map((x) => formatNumber(x, 1, style)).join(", "));
    }
  });
});

describe("the chance of reaching the Target", () => {
  const pts = points("airline-last-36");
  const [value, sd] = [fixture.cases["airline-last-36"].holtWinters.ahead[2].double, fixture.cases["airline-last-36"].holtWinters.ahead[2].sd];
  const chanceOf = (limit: number, side: "min" | "max") => referenceNormalCdf(side === "min" ? (value - limit) / sd : (limit - value) / sd);
  it("says it in tenths: a Target at the expected value is about 5 in 10, and the figure is the tenths", () => {
    const t = forecastTakeaway(euro, pts, ctx, { limits: { min: value, max: null } });
    expect(t.sentence).toBe(`At this pace Revenue reaches ${money(value)} or more by March 2023: about 5 in 10.`);
    expect(t.figures).toEqual([{ label: "Target, at least", value, text: money(value) }, { label: "In ten", value: 5, text: "5" }]);
    expect(t.numbers.find((n) => n.label === "Chance of reaching the Target")?.text).toBe("50 %");
    expect(t.range).not.toBeNull();
  });
  it("reads the chance from SciPy's normal curve: the Target 0.5244 spreads below the expected value is 7 in 10, and the number shown is the percentage", () => {
    const limit = value - 0.5244005101 * sd;
    const t = forecastTakeaway(euro, pts, ctx, { limits: { min: limit, max: null } });
    expect(t.sentence).toContain(": about 7 in 10.");
    const shown = Number(t.numbers.find((n) => n.label === "Chance of reaching the Target")!.text.replace(" %", ""));
    expect(shown).toBe(Math.round(100 * chanceOf(limit, "min")));
  });
  it("says under 1 in 20 and over 19 in 20 with no tenth, at 2 spreads away; and an upper limit and a band in their own words", () => {
    const far = forecastTakeaway(euro, pts, ctx, { limits: { min: value + 2 * sd, max: null } });
    expect(far.sentence).toBe(`At this pace Revenue reaches ${money(value + 2 * sd)} or more by March 2023: under 1 in 20.`);
    expect(far.figures.map((f) => f.label)).toEqual(["Target, at least"]);
    expect(forecastTakeaway(euro, pts, ctx, { limits: { min: value - 2 * sd, max: null } }).sentence).toMatch(/: over 19 in 20\.$/);
    const upper = forecastTakeaway(euro, pts, ctx, { limits: { min: null, max: value + 0.2533 * sd } });
    expect(upper.sentence).toBe(`At this pace Revenue stays at ${money(value + 0.2533 * sd)} or less by March 2023: about 6 in 10.`);
    const band = forecastTakeaway(euro, pts, ctx, { limits: { min: value - sd, max: value + sd } });
    expect(band.sentence).toBe(`At this pace Revenue lands between ${money(value - sd)} and ${money(value + sd)} by March 2023: about 7 in 10.`);
    expect(band.figures.map((f) => f.label)).toEqual(["Target, at least", "Target, at most", "In ten"]);
  });
  it("looks at the period asked for, up to a season ahead, and refuses one past it, and one that is not ahead", () => {
    const ok = forecastTakeaway(euro, pts, ctx, { limits: { min: 400, max: null }, by: "2023-12-01" });
    expect(ok.kind).toBe("answer");
    expect(ok.sentence).toContain("by December 2023");
    expect(forecastTakeaway(euro, pts, ctx, { limits: { min: 400, max: null }, by: "2024-01-01" }).refusal).toBe("Revenue cannot be looked at 13 months ahead; at most 12 months.");
    expect(forecastTakeaway(euro, pts, ctx, { by: "2022-12-01" }).refusal).toBe("That date is not ahead: the latest value is for December 2022.");
    expect(forecastTakeaway(euro, pts, ctx, { by: "2023-01-01" }).kind).toBe("answer");
    expect(forecastTakeaway(euro, pts, ctx, { by: "2023-01-01" }).sentence).toContain("by January 2023");
  });
  it("matches the plain forecast: asking for a Target changes the sentence, not the numbers", () => {
    const plain = forecastTakeaway(euro, pts, ctx);
    const asked = forecastTakeaway(euro, pts, ctx, { limits: { min: 400, max: null } });
    expect(asked.range).toEqual(plain.range);
    expect(asked.numbers.filter((n) => n.label !== "Chance of reaching the Target")).toEqual(plain.numbers);
  });
  it("is a refusal, with its words, for a Metric with no Target", () => {
    expect(forecastTakeaway(euro, pts, ctx, { limits: { min: null, max: null } })).toMatchObject({ kind: "refusal", refusal: "Revenue has no Target to reach.", sentence: null, track: null, figures: [], numbers: [] });
  });
  it("says what the past fit with no miss makes too sure: a series that is exactly a line and a pattern, and gives chance 1 or 0 exactly", () => {
    const q = metric({ ...euro, period: "quarter" });
    const exact = Array.from({ length: 20 }, (_, t) => ({ period: shiftPeriod("2020-01-01", "quarter", t), value: 10 + 2.5 * t + [-3, 1, 4, -2][t % 4] }));
    const t = forecastTakeaway(q, exact, ctx);
    expect(t.cautions).toEqual(["The past values fit this pattern with no miss at all, so the range and the chance may be too sure."]);
    expect(t.range!.lo).toBe(t.range!.hi);
    expect(forecastTakeaway(q, exact, ctx, { limits: { min: 0, max: null } }).sentence).toMatch(/: over 19 in 20\.$/);
    expect(forecastTakeaway(q, exact, ctx, { limits: { min: 1000, max: null } }).sentence).toMatch(/: under 1 in 20\.$/);
  });
});

describe("the refusals", () => {
  it("are in words, with no number, no strength, no range and no footer: too few values, one step either side of four", () => {
    const t = forecastTakeaway(euro, months("2025-01", [1, 5, 2]), ctx);
    expect(t).toMatchObject({ kind: "refusal", refusal: "Not enough months yet: 3 of 4 needed.", sentence: null, strength: null, range: null, basis: null, track: null, footer: null, figures: [], numbers: [], cautions: [], notes: [], assumptions: [] });
    expect(forecastTakeaway(euro, months("2025-01", [1, 5, 2, 8]), ctx).kind).toBe("answer");
    expect(forecastTakeaway(euro, [], ctx).refusal).toBe("Not enough months yet: 0 of 4 needed.");
  });
  it("say a series that hardly changes has nothing to look ahead from, and too many gaps", () => {
    expect(forecastTakeaway(euro, months("2025-01", Array(12).fill(5)), ctx).refusal).toBe("Revenue has hardly changed, so there is nothing to compare.");
    const holey = months("2025-01", Array.from({ length: 24 }, (_, i) => 10 + ((i * 7) % 11))).filter((_, i) => i % 3 !== 1);
    expect(forecastTakeaway(euro, holey, ctx).refusal).toBe("Revenue: no value for 8 of 24 months, too many to go on.");
  });
  it("say values too large to look ahead from, and read NaN and Infinity as no value", () => {
    expect(forecastTakeaway(euro, months("2025-01", [1e200, 3e200, 2e200, 5e200, 4e200, 7e200]), ctx).refusal).toBe("The values of Revenue are too large to look ahead from.");
    const ok = months("2025-01", [10, 12, 11, 14, 13, 16, 15, 18]);
    const messy: Point[] = [...ok, { period: "2025-09-01", value: NaN }, { period: "2025-10-01", value: Infinity }];
    expect(forecastTakeaway(euro, messy, ctx)).toEqual(forecastTakeaway(euro, ok, ctx));
  });
  it("read the periods in any order, and a period given twice by its last value", () => {
    const ok = months("2025-01", [10, 12, 11, 14, 13, 16, 15, 18]);
    expect(forecastTakeaway(euro, [...ok].reverse(), ctx)).toEqual(forecastTakeaway(euro, ok, ctx));
    expect(forecastTakeaway(euro, [{ period: "2025-03-01", value: 999 }, ...ok], ctx)).toEqual(forecastTakeaway(euro, ok, ctx));
  });
});

describe("the cautions", () => {
  it("say a period far from the rest pulls the forecast, with what it reads without, in the Metric's unit", () => {
    const vals = Array.from({ length: 16 }, (_, i) => 100 + ((i * 7) % 11));
    vals[14] = 900;
    const t = forecastTakeaway(euro, months("2025-01", vals), ctx);
    expect(t.cautions).toHaveLength(1);
    expect(t.cautions[0]).toMatch(/^This result is pulled by 1 month far from the rest; without them it reads [\d,]+ €\.$/);
  });
  it("say periods without a value that were left out, and a level that changed", () => {
    const vals = Array.from({ length: 24 }, (_, i) => 100 + ((i * 7) % 11) + 3 * i);
    expect(forecastTakeaway(euro, months("2025-01", vals).filter((_, i) => i !== 7), ctx).cautions).toContain("Revenue: no value for 1 of 24 months, left out.");
    const stepped = Array.from({ length: 20 }, (_, i) => 100 + ((i * 7) % 5) + (i >= 10 ? 60 : 0));
    expect(forecastTakeaway(euro, months("2025-01", stepped), ctx).cautions.some((c) => c.startsWith("The level of Revenue changed around"))).toBe(true);
  });
  it("say nothing of a series that passed every check", () => {
    const t = forecastTakeaway(euro, points("airline-last-36"), ctx);
    expect(t.cautions).toEqual([]);
  });
});

describe("the invariants over generated series", () => {
  const series = fc.integer({ min: 0, max: 40 }).chain((n) => fc.array(fc.integer({ min: -50, max: 400 }), { minLength: n, maxLength: n }));
  it(`no forbidden word in any text, a refusal carries no number, the footer is on an answer once, the numbers in the sentence are the figures, the same twice (${numRuns} series, seed ${seed})`, () => {
    fc.assert(
      fc.property(series, fc.option(fc.integer({ min: -20, max: 300 }), { nil: null }), fc.constantFrom("month", "quarter", "week" as const), (vs, goal, period) => {
        const m = metric({ ...euro, period: period as "month" });
        const pts = vs.map((value, i) => ({ period: shiftPeriod(period === "week" ? "2024-01-01" : "2024-01-01", period as "month", i), value }));
        const t = forecastTakeaway(m, pts, ctx, goal === null ? {} : { limits: { min: goal, max: null } });
        expect(forecastTakeaway(m, pts, ctx)).toEqual(forecastTakeaway(m, pts, ctx));
        for (const text of texts(t)) expect(text.replace(FOOTER, ""), text).not.toMatch(FORBIDDEN);
        if (t.kind === "refusal") {
          expect(t).toMatchObject({ sentence: null, strength: null, range: null, basis: null, track: null, footer: null, figures: [], numbers: [], cautions: [], notes: [], assumptions: [] });
          expect(t.refusal).not.toBeNull();
        } else {
          expect(t.refusal).toBeNull();
          expect(t.footer).toBe(FOOTER);
          expect(t.strength).toBeNull();
          for (const f of t.figures) if (f.label !== "In ten") expect(t.sentence! + t.range!.text, f.label).toContain(f.text);
          expect(t.range!.lo).toBeLessThanOrEqual(t.range!.hi);
          expect(t.sentence).not.toMatch(/NaN|Infinity|undefined/);
        }
      }),
      { numRuns, seed },
    );
  });
  it("no text of any language holds a forbidden word (the footer, which says nothing is a cause, apart)", () => {
    for (const language of Object.keys(WORDING) as Language[]) for (const [key, text] of Object.entries(WORDING[language])) if (key !== "footer") expect(text, key).not.toMatch(FORBIDDEN);
  });
});
