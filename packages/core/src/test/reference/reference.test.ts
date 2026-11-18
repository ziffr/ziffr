// The references' own tests (spec 0022): small cases worked out by hand, so a reference is checked before it checks
// anything else.
import { describe, expect, it } from "vitest";
import { dayOf, daysInMonth, samePoint, spanEnd, spanStart, startsSpan, textOf, weekday } from "./calendar";
import { combine, nextDay, referenceKept, referenceSeries, referenceTargets, referenceValueOver } from "./combine";
import { compareExact, dividedBy, exactOf, exactOfDouble, exactText, fitsDigits, fraction, isNearestDouble, minus, nearestDoubleOf, placesOf, plus, roundedText, same, sumOf } from "./exact";

const e = exactOf;
const text = (x: { value: ReturnType<typeof exactOf> }) => exactText(x.value);
const p = (period: string, value: number) => ({ period, value });

describe("reference calendar", () => {
  it("counts days from 1 January 1970 and back", () => {
    expect(dayOf("1970-01-01")).toBe(0);
    expect(dayOf("1970-02-01")).toBe(31);
    expect(dayOf("1969-12-31")).toBe(-1);
    // 2000 is a leap year (divisible by 400), 1900 is not (by 100): 30 years with 7 leap days in 1970..1999.
    expect(dayOf("2000-01-01")).toBe(30 * 365 + 7);
    expect(textOf(dayOf("2028-02-29"))).toBe("2028-02-29");
    expect(textOf(dayOf("1960-03-01"))).toBe("1960-03-01");
    expect(() => dayOf("2027-02-29")).toThrow();
    expect(() => dayOf("2026-13-01")).toThrow();
    expect(() => dayOf("12.11.2026")).toThrow();
    expect([daysInMonth(1900, 2), daysInMonth(2000, 2), daysInMonth(2026, 4), daysInMonth(2026, 12)]).toEqual([28, 29, 30, 31]);
  });

  it("knows Mondays, and the spans of every Fiscal Year start", () => {
    // 16 November 2026 is a Monday; 1 January 1970 a Thursday.
    expect(weekday(dayOf("2026-11-16"))).toBe(0);
    expect(weekday(0)).toBe(3);
    expect(textOf(spanStart(dayOf("2026-11-22"), "week", 1))).toBe("2026-11-16");
    expect(textOf(spanEnd(dayOf("2026-11-16"), "week", 1))).toBe("2026-11-22");
    // A Fiscal Year from April: quarters from April, July, October, January; halves from April and October.
    expect(textOf(spanStart(dayOf("2026-03-31"), "quarter", 4))).toBe("2026-01-01");
    expect(textOf(spanStart(dayOf("2026-09-30"), "half", 4))).toBe("2026-04-01");
    expect(textOf(spanStart(dayOf("2026-03-31"), "year", 4))).toBe("2025-04-01");
    expect(textOf(spanEnd(dayOf("2025-04-01"), "year", 4))).toBe("2026-03-31");
    // From November: Q1 is November to January, across the calendar year.
    expect(textOf(spanEnd(dayOf("2026-11-01"), "quarter", 11))).toBe("2027-01-31");
    expect(startsSpan(dayOf("2026-12-01"), "quarter", 12)).toBe(true);
    expect(startsSpan(dayOf("2026-12-01"), "quarter", 1)).toBe(false);
    expect(startsSpan(dayOf("2026-12-02"), "day", 1)).toBe(true);
  });

  it("finds the same point in an earlier span", () => {
    // 12 November is day 43 of Q4; the same point in Q2 is 12 May.
    expect(textOf(samePoint(dayOf("2026-11-12"), dayOf("2026-04-01"), "quarter", 1))).toBe("2026-05-12");
    // 31 May is a quarter after 28 (29) February: the shorter month ends sooner.
    expect(textOf(samePoint(dayOf("2026-05-31"), dayOf("2026-01-01"), "quarter", 1))).toBe("2026-02-28");
    expect(textOf(samePoint(dayOf("2028-05-31"), dayOf("2028-01-01"), "quarter", 1))).toBe("2028-02-29");
    // Thursday of a week is Thursday of the week before; the 3rd of a year from April is the 3rd a year before.
    expect(textOf(samePoint(dayOf("2026-11-19"), dayOf("2026-11-09"), "week", 1))).toBe("2026-11-12");
    expect(textOf(samePoint(dayOf("2027-01-03"), dayOf("2025-04-01"), "year", 4))).toBe("2026-01-03");
    expect(textOf(samePoint(dayOf("2026-11-19"), dayOf("2026-11-18"), "day", 1))).toBe("2026-11-18");
  });
});

describe("reference exact numbers", () => {
  it("reads values from their text and adds them without loss", () => {
    expect(same(plus(e(0.1), e(0.2)), e("0.3"))).toBe(true);
    expect(exactText(sumOf(Array.from({ length: 1000 }, () => e(0.01))))).toBe("10");
    expect(same(e("1e-7"), fraction(1n, 10_000_000n))).toBe(true);
    expect(same(e("1.5E+3"), e(1500))).toBe(true);
    expect(same(e(-2.5), fraction(-5n, 2n))).toBe(true);
    expect(same(minus(e(1), e(1.5)), e(-0.5))).toBe(true);
    expect(compareExact(e(1), e(2))).toBe(-1);
    expect(compareExact(e(2), e(1))).toBe(1);
    expect(() => e(Number.NaN)).toThrow();
    expect(() => e("1,5")).toThrow();
    expect(() => fraction(1n, 0n)).toThrow();
    expect(fraction(2n, -4n)).toEqual({ num: -1n, den: 2n });
  });

  it("rounds half away from zero, without a minus on zero", () => {
    expect(roundedText(e("1.005"), 2)).toBe("1.01");
    expect(roundedText(e("-1.005"), 2)).toBe("-1.01");
    expect(roundedText(e("1.0049999"), 2)).toBe("1.00");
    expect(roundedText(e("-0.004"), 2)).toBe("0.00");
    expect(roundedText(e("2.5"), 0)).toBe("3");
    expect(roundedText(dividedBy(e(2), 3), 3)).toBe("0.667");
    expect(roundedText(e("0.05"), 1)).toBe("0.1");
  });

  it("says how a value is written out", () => {
    expect(placesOf(e("0.125"))).toBe(3);
    expect(placesOf(dividedBy(e(1), 3))).toBeNull();
    expect(fitsDigits(e("123456789012345"), 15)).toBe(true);
    expect(fitsDigits(e("1234567890123456"), 15)).toBe(false);
    expect(fitsDigits(e("0.000001"), 1)).toBe(true);
    expect(fitsDigits(dividedBy(e(1), 3), 40)).toBe(false);
    expect(exactText(dividedBy(e(1), 3))).toBe("1/3");
    expect(exactText(e(-12.5))).toBe("-12.5");
  });

  it("finds the double nearest to an exact value, however small or large", () => {
    expect(nearestDoubleOf(fraction(1n, 3n))).toBe(1 / 3);
    expect(nearestDoubleOf(fraction(-2n, 3n))).toBe(-2 / 3);
    expect(nearestDoubleOf(fraction(0n, 5n))).toBe(0);
    expect(nearestDoubleOf(plus(e(0.1), e(0.2)))).toBe(0.3);
    expect(nearestDoubleOf(fraction(10n ** 300n + 1n, 3n))).toBe(1e300 / 3);
    // About 1.1 · 10^-25, which a guess from 40 decimals missed by more than one double (nightly seed 29916739).
    const tiny = fraction(6997088046315517778484394606475355182809n, 62221653733345416346085529149363446454565912982062978199052773140n);
    expect(isNearestDouble(nearestDoubleOf(tiny), tiny)).toBe(true);
  });
  it("knows the double nearest to an exact value", () => {
    expect(isNearestDouble(0.3, plus(e(0.1), e(0.2)))).toBe(true);
    // 0.1 + 0.2 in floating point is the double above 0.3: not the nearest.
    expect(isNearestDouble(0.1 + 0.2, e("0.3"))).toBe(false);
    expect(isNearestDouble(10, sumOf(Array.from({ length: 1000 }, () => e(0.01))))).toBe(true);
    expect(isNearestDouble(1 / 3, dividedBy(e(1), 3))).toBe(true);
    expect(isNearestDouble(-1 / 3, dividedBy(e(-1), 3))).toBe(true);
    expect(isNearestDouble(0, e(0))).toBe(true);
    expect(isNearestDouble(Number.MIN_VALUE, e(0))).toBe(false);
    expect(isNearestDouble(Number.POSITIVE_INFINITY, e(1))).toBe(false);
    // 2^53 + 1 lies halfway between 2^53 and 2^53 + 2: the tie goes to the even one, 2^53.
    expect(isNearestDouble(2 ** 53, e("9007199254740993"))).toBe(true);
    expect(isNearestDouble(2 ** 53 + 2, e("9007199254740993"))).toBe(false);
    expect(same(exactOfDouble(0.5), fraction(1n, 2n))).toBe(true);
    // 2^60 is written "1152921504606847000" (its shortest text); its exact value ends in 976.
    expect(same(exactOfDouble(2 ** 60), e("1152921504606846976"))).toBe(true);
    expect(same(exactOfDouble(2 ** 60), e(2 ** 60))).toBe(false);
    expect(same(exactOfDouble(Number.MIN_VALUE), fraction(1n, 2n ** 1074n))).toBe(true);
    expect(() => exactOfDouble(Number.NaN)).toThrow();
  });
});

describe("reference combining", () => {
  const ys = 1;
  const months = [p("2026-01-01", 10), p("2026-02-01", 20.5), p("2026-03-01", 30), p("2026-04-01", 7)];

  it("adds up, averages and takes the last value by quarter, by hand", () => {
    const sum = referenceSeries(months, "month", "quarter", "sum", { yearStart: ys, today: "2026-12-01" });
    // Q1: 10 + 20.5 + 30 = 60.5. Q2: April alone is 1 of 3 months, less than half: not shown.
    expect(sum.ok && sum.spans.map((s) => [s.period, text(s), s.held, s.length, s.through])).toEqual([["2026-01-01", "60.5", 3, 3, "2026-03-31"]]);
    const avg = referenceSeries(months, "month", "quarter", "average", { yearStart: ys, today: "2026-12-01" });
    // (10 + 20.5 + 30) / 3 = 20.1666…
    expect(avg.ok && exactText(avg.spans[0].value)).toBe("121/6");
    const last = referenceSeries(months, "month", "quarter", "last", { yearStart: ys, today: "2026-12-01" });
    expect(last.ok && text(last.spans[0])).toBe("30");
  });

  it("counts the span today falls in up to its latest value", () => {
    const r = referenceSeries(months, "month", "quarter", "sum", { yearStart: ys, today: "2026-05-20" });
    // Q2 to date: April only, 1 of 1 month counted so far, of 3.
    expect(r.ok && r.spans.at(-1)).toMatchObject({ period: "2026-04-01", held: 1, length: 3, toDate: true, through: "2026-04-01" });
  });

  it("cuts every span at the same point for a Comparison", () => {
    const days = Array.from({ length: 60 }, (_, i) => p(textOf(dayOf("2026-01-01") + i), 1));
    // To 15 February: January counts 1 to 15 January, 15 of its days. March, cut at 15 March, holds 1 of 15 days.
    const r = referenceSeries(days, "day", "month", "sum", { yearStart: ys, today: "2026-02-15", alignTo: "2026-02-15" });
    expect(r.ok && r.spans.map((s) => [s.period, text(s), s.through])).toEqual([["2026-01-01", "15", "2026-01-15"], ["2026-02-01", "15", "2026-02-15"]]);
  });

  it("puts a week into the month its Monday is in, and keeps the latest of a period given twice", () => {
    // Mondays 23 and 30 March 2026; the week of 30 March ends in April.
    const weeks = [p("2026-03-30", 5), p("2026-03-23", 1), p("2026-03-02", 2), p("2026-03-09", 3), p("2026-03-30", 4)];
    const r = referenceSeries(weeks, "week", "month", "sum", { yearStart: ys, today: "2026-06-01" });
    // 2 + 3 + 1 + 4 (the second value of 30 March): 4 of March's 5 weeks.
    expect(r.ok && r.spans.map((s) => [s.period, text(s), s.held, s.length])).toEqual([["2026-03-01", "10", 4, 5]]);
  });

  it("refuses none and shorter periods, keeps the own period, and is empty without values", () => {
    expect(referenceSeries(months, "month", "quarter", "none", { yearStart: ys, today: "2026-12-01" })).toEqual({ ok: false });
    expect(referenceSeries(months, "month", "week", "sum", { yearStart: ys, today: "2026-12-01" })).toEqual({ ok: false });
    expect(referenceSeries([], "month", "year", "sum", { yearStart: ys, today: "2026-12-01" })).toEqual({ ok: true, spans: [] });
    const own = referenceSeries([months[1], months[0]], "month", "month", "none", { yearStart: ys, today: "2026-12-01" });
    expect(own.ok && own.spans.map((s) => s.period)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(() => referenceSeries([p("2026-01-02", 1)], "month", "year", "sum", { yearStart: ys, today: "2026-12-01" })).toThrow();
    expect(combine("none", [e(1)])).toBeNull();
    expect(combine("sum", [])).toBeNull();
  });

  it("reads one period's value, or a few at least half of which have one", () => {
    expect(exactText(referenceValueOver(months, "sum", "2026-02-01", "2026-02-01", 1)!)).toBe("20.5");
    expect(exactText(referenceValueOver(months, "average", "2026-01-01", "2026-02-01", 2)!)).toBe("15.25");
    expect(referenceValueOver(months, "sum", "2026-05-01", "2026-06-01", 2)).toBeNull();
    expect(referenceValueOver(months, "sum", "2026-04-01", "2026-06-01", 3)).toBeNull();
  });

  it("combines the Target Series where every period has one, else the range unless it is a sum", () => {
    const metric = { period: "month" as const, aggregation: "sum" as const, polarity: "higher" as const, target_min: 100, target_max: null };
    const spans = [{ period: "2026-01-01", through: "2026-03-31" }, { period: "2026-04-01", through: "2026-06-30" }];
    const targets = [p("2026-01-01", 1.1), p("2026-02-01", 2.2), p("2026-03-01", 3.3), p("2026-04-01", 1)];
    const sum = referenceTargets(targets, spans, metric, ys);
    expect(Object.keys(sum.at)).toEqual(["2026-01-01"]);
    expect(exactText(sum.at["2026-01-01"].min!)).toBe("6.6");
    expect(sum.line.map((l) => exactText(l.value))).toEqual(["6.6"]);
    const lower = referenceTargets(targets, spans, { ...metric, aggregation: "average", polarity: "lower", target_min: null, target_max: 5 }, ys);
    expect(exactText(lower.at["2026-01-01"].max!)).toBe("2.2");
    expect(lower.at["2026-04-01"]).toEqual({ min: null, max: e(5) });
    const both = referenceTargets([], spans, { ...metric, aggregation: "last", target_max: 120 }, ys);
    expect(both.at["2026-04-01"]).toEqual({ min: e(100), max: e(120) });
  });

  it("keeps what a Snapshot keeps: the Metric periods over by its last day", () => {
    const weeks = [p("2026-03-23", 1), p("2026-03-30", 2)];
    expect(referenceKept(weeks, "week", "2026-03-31", ys)).toEqual([weeks[0]]);
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});
