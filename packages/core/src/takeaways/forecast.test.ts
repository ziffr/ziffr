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
import { CHANCE, chanceCase, forecastTakeaway, endsOf, maxAhead, reachOf, TRACK_PERIODS } from "./forecast";
import { WORDING, type Language } from "./wording";

const { numRuns, seed } = runs();
const fixture = JSON.parse(readFileSync(new URL("../test/reference/fixtures/forecast.json", import.meta.url), "utf8"));
const suitability = JSON.parse(readFileSync(new URL("../test/reference/fixtures/suitability.json", import.meta.url), "utf8"));
const FORBIDDEN = /cause|because|significan|p-value|regression|r²|\br2\b|coefficient|confiden/i;
const FOOTER = "This carries the past forward; it is not a promise.";
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
  it("is the lower end where higher is better, the upper where lower is better, both where closer is better, none without a end", () => {
    expect(endsOf({ polarity: "higher", target_min: 100, target_max: 200 })).toEqual({ min: 100, max: null });
    expect(endsOf({ polarity: "lower", target_min: 100, target_max: 200 })).toEqual({ min: null, max: 200 });
    expect(endsOf({ polarity: "target", target_min: 100, target_max: 200 })).toEqual({ min: 100, max: 200 });
    expect(endsOf({ polarity: "higher", target_min: null, target_max: 200 })).toEqual({ min: null, max: null });
    expect(endsOf({ polarity: "lower", target_min: 100, target_max: null })).toEqual({ min: null, max: null });
  });
  it("lets a forecast look a season ahead, and at least the span's default", () => {
    expect(["day", "week", "month", "quarter", "half", "year"].map((s) => maxAhead(s as "day"))).toEqual([14, 52, 12, 4, 2, 1]);
  });
});

describe("how a chance is said", () => {
  it("is under 1 in 20 below 5 %, at least 19 in 20 from 95 %, else in tenths of the percentage shown, one step either side of each", () => {
    expect(CHANCE).toEqual({ under: 5, over: 95 });
    expect(chanceCase(0)).toEqual({ key: "chance-under", k: 0, percent: 1 });
    expect(chanceCase(0.0449)).toEqual({ key: "chance-under", k: 0, percent: 4 });
    // 4.5 % rounds to the 5 % it is shown as, and the words follow the percentage: "about 1 in 10" beside 5 %.
    expect(chanceCase(0.045)).toEqual({ key: "chance-about", k: 1, percent: 5 });
    expect(chanceCase(0.05)).toEqual({ key: "chance-about", k: 1, percent: 5 });
    expect(chanceCase(0.9449)).toEqual({ key: "chance-about", k: 9, percent: 94 });
    // 94.5 % is shown as 95 % and is said "at least 19 in 20", which 95 % is.
    expect(chanceCase(0.945)).toEqual({ key: "chance-over", k: 10, percent: 95 });
    expect(chanceCase(0.95)).toEqual({ key: "chance-over", k: 10, percent: 95 });
    expect(chanceCase(1)).toEqual({ key: "chance-over", k: 10, percent: 99 });
    expect(chanceCase(0.5)).toEqual({ key: "chance-about", k: 5, percent: 50 });
    expect(chanceCase(0.44)).toEqual({ key: "chance-about", k: 4, percent: 44 });
    expect(chanceCase(0.45)).toEqual({ key: "chance-about", k: 5, percent: 45 });
  });
  it("never shows 0 % or 100 %, and the words always agree with the percentage", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, noNaN: true }), (p) => {
        const c = chanceCase(p);
        expect(c.percent >= 1 && c.percent <= 99).toBe(true);
        expect(c.key === "chance-under").toBe(c.percent < 5);
        expect(c.key === "chance-over").toBe(c.percent >= 95);
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
    expect(t.sentence).toBe(`Revenue is expected to be ${money(value)} in March 2023 (likely between ${money(lo)} and ${money(hi)}).`);
    expect(t.range).toEqual({ lo, hi, text: `${money(lo)} – ${money(hi)}` });
    expect(t.figures).toEqual([{ label: "Expected", value, text: money(value) }, { label: "Likely between (low)", value: lo, text: money(lo) }, { label: "Likely between (high)", value: hi, text: money(hi) }]);
    expect(t.strength).toBeNull();
    expect(t.strengthText).toBeNull();
    expect(t.method).toBe("Holt-Winters, additive");
    expect(t.basis).toBe("worked out with the trend and the yearly pattern, over 36 months");
    expect(t.assumptions).toEqual(["This assumes the pattern of the past carries on."]);
    expect(t.footer).toBe(FOOTER);
    expect(t.cautions).toEqual([]);
    expect(t.notes).toEqual([]);
  });
  it("says how the Method did on the periods already known: the track record, as the rolling origin gives it", () => {
    const t = forecastTakeaway(euro, points36, ctx);
    const record = backtest(points36, "month", 12, "holtWinters", TRACK_PERIODS)!;
    expect(record.tested).toBe(12);
    expect(t.track).toBe(`Over the last 12 months, the range for the next month would have held ${record.inBand} of 12 times.`);
    const row = (label: string) => t.numbers.find((n) => n.label === label)?.text;
    expect(row("Periods tested")).toBe("12");
    expect(row("Inside the range")).toBe(String(record.inBand));
    expect(row("Typical miss")).toBe(money(record.typicalMiss));
    expect(row("Method")).toBe("Holt-Winters, additive");
    expect(row("Likely between")).toBe(`${money(t.range!.lo)} – ${money(t.range!.hi)}`);
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
    expect(t.basis).toBe("worked out with a plain trend, over 8 months");
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
  it("uses a plain trend, and says so, where the yearly pattern did not repeat even though the pattern would have missed less", () => {
    // No pattern in the first two years, a strong one in the last two: the seasonal Method would win the last third, and the check rules it out.
    const vs = Array.from({ length: 48 }, (_, t) => Math.round(100 + 2 * t + (t < 24 ? 0 : 30) * Math.sin((2 * Math.PI * (t % 12)) / 12)));
    const pts = months("2020-01", vs);
    expect(bestForecast(pts, "month", 12)!.method).toBe("holtWinters");
    const t = forecastTakeaway(euro, pts, ctx);
    expect(t.method).toBe("Holt's linear trend");
    expect(t.notes).toEqual(["The yearly pattern did not repeat the same way each year, so a plain trend is used instead."]);
  });
  it("names the pattern a plain trend was not checked against, by span: two seasons is the candidate, one step either side", () => {
    const quarter = metric({ ...euro, period: "quarter" });
    const q = (n: number) => Array.from({ length: n }, (_, t) => ({ period: shiftPeriod("2020-01-01", "quarter", t), value: 100 + 3 * t + [4, -3, 6, -2][t % 4] + (t % 3) }));
    expect(forecastTakeaway(quarter, q(8), ctx).notes).toEqual(["Too few quarters to check the yearly pattern against a plain trend, so a plain trend is used."]);
    expect(forecastTakeaway(quarter, q(7), ctx).notes).toEqual([]);
    const year = metric({ ...euro, period: "year" });
    expect(forecastTakeaway(year, Array.from({ length: 6 }, (_, t) => ({ period: shiftPeriod("2020-01-01", "year", t), value: 100 + 3 * t + (t % 3) })), ctx).notes).toEqual([]);
    const day = metric({ ...euro, period: "day" });
    const d = (n: number) => Array.from({ length: n }, (_, t) => ({ period: shiftPeriod("2025-01-01", "day", t), value: 100 + t + [0, 9, 14, 3, -6, -12, -8][t % 7] + (t % 3) }));
    expect(forecastTakeaway(day, d(14), ctx).notes).toEqual(["Too few days to check the weekly pattern against a plain trend, so a plain trend is used."]);
    expect(forecastTakeaway(day, d(13), ctx).notes).toEqual([]);
  });
  it("says the Method, the range and the numbers it leaves out: no track record where nothing could be tested (four values)", () => {
    const t = forecastTakeaway(euro, months("2025-01", [10, 12, 11, 15]), ctx);
    expect(t.track).toBe("Too few months yet to check how this forecast did on the past.");
    expect(t.numbers.map((n) => n.label)).toEqual(["Method", "Smoothing (level, trend, pattern)", "Expected", "Likely between"]);
    expect(t.numbers[0].text).toBe("Holt's linear trend");
    expect(t.numbers[3].text).toBe(t.range!.text);
    expect(t.numbers[3].text).toBe(`${money(t.range!.lo)} – ${money(t.range!.hi)}`);
  });
  it("says a weekly pattern for a daily Metric", () => {
    const daily = metric({ ...euro, period: "day" });
    const pts = Array.from({ length: 35 }, (_, t) => ({ period: shiftPeriod("2025-01-01", "day", t), value: 100 + t + [0, 9, 14, 3, -6, -12, -8][t % 7] }));
    const t = forecastTakeaway(daily, pts, ctx);
    expect(t.method).toBe("Holt-Winters, additive");
    expect(t.basis).toBe("worked out with the trend and the weekly pattern, over 35 days");
    expect(t.sentence).toMatch(/ in Tue 18 Feb 2025 \(likely between /);
  });
  it("has the footer of a forecast, not the one of a link between Metrics, and looks at the latest 120 periods only", () => {
    const t = forecastTakeaway(euro, points36, ctx);
    expect(t.footer).toBe("This carries the past forward; it is not a promise.");
    expect(t.footer).not.toContain("gone together");
    const long = months("1990-01", Array.from({ length: 200 }, (_, i) => 100 + ((i * 7) % 11) + 2 * i));
    expect(forecastTakeaway(euro, long, ctx)).toEqual(forecastTakeaway(euro, long.slice(-120), ctx));
    expect(forecastTakeaway(euro, long, ctx)).not.toEqual(forecastTakeaway(euro, long.slice(-119), ctx));
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
  const chanceOf = (end: number, side: "min" | "max") => referenceNormalCdf(side === "min" ? (value - end) / sd : (end - value) / sd);
  it("says it in tenths: a Target at the expected value is about 5 in 10, and the figure is the tenths", () => {
    const t = forecastTakeaway(euro, pts, ctx, { ends: { min: value, max: null } });
    expect(t.sentence).toBe(`At this pace Revenue reaches ${money(value)} or more in March 2023: about 5 in 10.`);
    expect(t.figures).toEqual([{ label: "Target, at least", value, text: money(value) }, { label: "In ten", value: 5, text: "5" }]);
    expect(t.numbers.find((n) => n.label === "Chance of reaching the Target")?.text).toBe("50 %");
    expect(t.range).not.toBeNull();
  });
  it("reads the chance from SciPy's normal curve: the Target 0.5244 spreads below the expected value is 7 in 10, and the number shown is the percentage", () => {
    const end = value - 0.5244005101 * sd;
    const t = forecastTakeaway(euro, pts, ctx, { ends: { min: end, max: null } });
    expect(t.sentence).toContain(": about 7 in 10.");
    const shown = Number(t.numbers.find((n) => n.label === "Chance of reaching the Target")!.text.replace(" %", ""));
    expect(shown).toBe(Math.round(100 * chanceOf(end, "min")));
  });
  it("says under 1 in 20 and at least 19 in 20 with no tenth, at 2 spreads away; and an upper end and a band in their own words", () => {
    const far = forecastTakeaway(euro, pts, ctx, { ends: { min: value + 2 * sd, max: null } });
    expect(far.sentence).toBe(`At this pace Revenue reaches ${money(value + 2 * sd)} or more in March 2023: under 1 in 20.`);
    expect(far.figures.map((f) => f.label)).toEqual(["Target, at least"]);
    expect(forecastTakeaway(euro, pts, ctx, { ends: { min: value - 2 * sd, max: null } }).sentence).toMatch(/: at least 19 in 20\.$/);
    const upper = forecastTakeaway(euro, pts, ctx, { ends: { min: null, max: value + 0.2533 * sd } });
    expect(upper.sentence).toBe(`At this pace Revenue stays at ${money(value + 0.2533 * sd)} or less in March 2023: about 6 in 10.`);
    const band = forecastTakeaway(euro, pts, ctx, { ends: { min: value - sd, max: value + sd } });
    expect(band.sentence).toBe(`At this pace Revenue lands between ${money(value - sd)} and ${money(value + sd)} in March 2023: about 7 in 10.`);
    expect(band.figures.map((f) => f.label)).toEqual(["Target, at least", "Target, at most", "In ten"]);
    expect(upper.figures.map((f) => f.label)).toEqual(["Target, at most", "In ten"]);
  });
  it("looks at the period asked for, up to a season ahead, and refuses one past it, and one that is not ahead", () => {
    const ok = forecastTakeaway(euro, pts, ctx, { ends: { min: 400, max: null }, by: "2023-12-01" });
    expect(ok.kind).toBe("answer");
    expect(ok.sentence).toContain("in December 2023");
    expect(forecastTakeaway(euro, pts, ctx, { ends: { min: 400, max: null }, by: "2024-01-01" }).refusal).toBe("Revenue cannot be looked at 13 months ahead; at most 12 months.");
    expect(forecastTakeaway(euro, pts, ctx, { by: "2022-12-01" }).refusal).toBe("That date is not ahead: the latest value is for December 2022.");
    expect(forecastTakeaway(euro, pts, ctx, { by: "2023-01-01" }).kind).toBe("answer");
    expect(forecastTakeaway(euro, pts, ctx, { by: "2023-01-01" }).sentence).toContain("in January 2023");
  });
  it("matches the plain forecast: asking for a Target changes the sentence, not the numbers", () => {
    const plain = forecastTakeaway(euro, pts, ctx);
    const asked = forecastTakeaway(euro, pts, ctx, { ends: { min: 400, max: null } });
    expect(asked.range).toEqual(plain.range);
    expect(asked.numbers.filter((n) => n.label !== "Chance of reaching the Target")).toEqual(plain.numbers);
  });
  it("is a refusal in words, not a chance, for a Target whose lower end is above its upper end or that is not a number", () => {
    for (const ends of [{ min: 200, max: 100 }, { min: NaN, max: null }, { min: null, max: Infinity }]) {
      expect(forecastTakeaway(euro, pts, ctx, { ends }), JSON.stringify(ends)).toMatchObject({ kind: "refusal", refusal: "The Target of Revenue cannot be read: its lower end is above its upper end, or an end is not a number.", sentence: null, figures: [], numbers: [] });
    }
    expect(forecastTakeaway(euro, pts, ctx, { ends: { min: 100, max: 100 } }).kind).toBe("answer");
  });
  it("is a refusal, with its words, for a Metric with no Target", () => {
    expect(forecastTakeaway(euro, pts, ctx, { ends: { min: null, max: null } })).toMatchObject({ kind: "refusal", refusal: "Revenue has no Target to reach.", sentence: null, track: null, figures: [], numbers: [] });
  });
  it("says what the past fit with no miss makes too sure: a series that is exactly a line and a pattern, and gives chance 1 or 0 exactly", () => {
    const q = metric({ ...euro, period: "quarter" });
    const exact = Array.from({ length: 20 }, (_, t) => ({ period: shiftPeriod("2020-01-01", "quarter", t), value: 10 + 2.5 * t + [-3, 1, 4, -2][t % 4] }));
    const t = forecastTakeaway(q, exact, ctx);
    expect(t.cautions).toEqual(["The past values fit this pattern with no miss at all, so the range and the chance may be too sure."]);
    expect(t.range!.lo).toBe(t.range!.hi);
    expect(forecastTakeaway(q, exact, ctx, { ends: { min: 0, max: null } }).sentence).toMatch(/: at least 19 in 20\.$/);
    expect(forecastTakeaway(q, exact, ctx, { ends: { min: 1000, max: null } }).sentence).toMatch(/: under 1 in 20\.$/);
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
    vals[14] = 140;
    const t = forecastTakeaway(euro, months("2025-01", vals), ctx);
    // The value three ahead without the period is what the same rule gives on what is left: 105 €.
    const without = bestForecast(months("2025-01", vals).filter((_, i) => i !== 14), "month", 12)!.points[2].value;
    expect(Math.round(without)).toBe(105);
    expect(t.cautions).toEqual(["This result is pulled by 1 month far from the rest; without them it reads 105 €."]);
    // Where leaving periods out leaves fewer than four values, there is nothing to say without them, and the answer is still given.
    const few = forecastTakeaway(euro, months("2025-01", [1, 2, 1, 900, 800]), ctx);
    expect(few.kind).toBe("answer");
    expect(few.cautions).toEqual([]);
  });
  it("says a period far from the rest for the Method that uses the yearly pattern too, from what the same rule gives without it", () => {
    const vs = Array.from({ length: 30 }, (_, t) => Math.round(100 + 2 * t + (t >= 24 ? 80 : 0) + 8 * Math.sin((2 * Math.PI * (t % 12)) / 12)));
    const t = forecastTakeaway(euro, months("2020-01", vs), ctx);
    expect(t.method).toBe("Holt-Winters, additive");
    expect(t.cautions).toEqual(["This result is pulled by 2 months far from the rest; without them it reads 303 €."]);
  });
  it("says periods left out for a Method that uses the yearly pattern too", () => {
    const pts = points("airline-last-36").filter((_, i) => i !== 30);
    const t = forecastTakeaway(euro, pts, ctx);
    expect(t.method).toBe("Holt-Winters, additive");
    expect(t.cautions).toEqual(["Revenue: no value for 1 of 36 months, left out."]);
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
        const t = forecastTakeaway(m, pts, ctx, goal === null ? {} : { ends: { min: goal, max: null } });
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

describe("the reach of a Target without the words", () => {
  const steady = Array.from({ length: 30 }, (_, i) => 1000 - 15 * i + ((i * 7) % 5) - 2);
  const pts = months("2024-01", steady);
  it("is the chance, the period and the periods ahead the Takeaway says: the same forecast, the same chance, for the default horizon and for a period asked", () => {
    const ends = { min: 600, max: null };
    const reach = reachOf(euro, pts, ctx, { ends })!;
    expect(reach.ahead).toBe(3);
    expect(reach.period).toBe(shiftPeriod(pts[pts.length - 1].period, "month", 3));
    const said = forecastTakeaway(euro, pts, ctx, { ends });
    expect(said.numbers.find((n) => n.label === "Chance of reaching the Target")!.text).toBe(`${chanceCase(reach.chance).percent} %`);
    const later = reachOf(euro, pts, ctx, { ends, by: shiftPeriod(pts[pts.length - 1].period, "month", 5) })!;
    expect(later.ahead).toBe(5);
    expect(later.period).toBe(shiftPeriod(pts[pts.length - 1].period, "month", 5));
    expect(later.chance).toBeGreaterThanOrEqual(0);
  });
  it("is nothing where the forecast is refused, comes with a caution, looks too far ahead or at the past, or the Target cannot be read", () => {
    const ends = { min: 600, max: null };
    expect(reachOf(euro, pts.slice(0, 3), ctx, { ends })).toBeNull();
    expect(reachOf(euro, pts, ctx, { ends: { min: null, max: null } })).toBeNull();
    expect(reachOf(euro, pts, ctx, { ends, by: shiftPeriod(pts[pts.length - 1].period, "month", 13) })).toBeNull();
    expect(reachOf(euro, pts, ctx, { ends, by: pts[pts.length - 1].period })).toBeNull();
    // A Target whose lower end is above its upper end cannot be read.
    expect(reachOf(euro, pts, ctx, { ends: { min: 900, max: 600 } })).toBeNull();
    // A past that fitted with no miss at all comes with a caution: no chance is given.
    expect(reachOf(euro, months("2024-01", Array.from({ length: 20 }, (_, i) => 100 + 2 * i)), ctx, { ends })).toBeNull();
  });
});
