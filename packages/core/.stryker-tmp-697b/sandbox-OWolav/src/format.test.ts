// @ts-nocheck
import { describe, expect, it } from "vitest";
import { axisLabels, compactValue, formatChange, MAX_AXIS_TICKS, MINUS, niceAxis, formatDate, formatNumber, formatPercent, formatValue, targetStatus, targetText, type ValueUnit } from "./format";
import { NUMBER_STYLES, type NumberStyle } from "./number-style";
import { readNumber } from "./numbers";
import { metric } from "./test/fixtures";
import { isUnitPosition, keptUnit, moneyUnit, UNIT_POSITIONS } from "./units";

const NB = " ";
const eur: ValueUnit = { unit: "€", unit_position: "after", decimals: 0 };
const usd: ValueUnit = { unit: "$", unit_position: "before", decimals: 2 };
const chf: ValueUnit = { unit: "CHF ", unit_position: "before", decimals: 0 };
const days: ValueUnit = { unit: "d", unit_position: "after", decimals: 1 };
const plain: ValueUnit = { unit: "", unit_position: "after", decimals: 0 };
const pct: ValueUnit = { unit: "%", unit_position: "after", decimals: 1 };

// Writing (spec 0022): values, units, sides, decimals and Number Styles to their text.
const WRITTEN: [ValueUnit, number, NumberStyle, string][] = [
  [eur, 118941, "1,234.5", "118,941 €"],
  [eur, 118941, "1.234,5", "118.941 €"],
  [eur, 118941, "1 234,5", `118${NB}941 €`],
  [eur, 118941, "1'234.5", "118'941 €"],
  [usd, 1200, "1,234.5", "$1,200.00"],
  [usd, 1200, "1.234,5", "$1.200,00"],
  [usd, -1200.5, "1,234.5", "−$1,200.50"],
  [chf, 1200, "1'234.5", "CHF 1'200"],
  [days, 12, "1,234.5", "12.0 d"],
  [days, 12.25, "1.234,5", "12,3 d"],
  [pct, 12.5, "1,234.5", "12.5 %"],
  [pct, 12.5, "1 234,5", "12,5 %"],
  [pct, -6.5, "1,234.5", "−6.5 %"],
  [plain, 1234567.891, "1,234.5", "1,234,568"],
  [{ ...plain, decimals: 3 }, 1234.5678, "1.234,5", "1.234,568"],
  [plain, -0.4, "1,234.5", "0"],
  [{ ...plain, decimals: 1 }, -0.04, "1.234,5", "0,0"],
  [plain, 0, "1,234.5", "0"],
  [plain, 999, "1,234.5", "999"],
  [plain, 1e15, "1,234.5", "1,000,000,000,000,000"],
  [{ ...plain, decimals: 6 }, 0.000001, "1,234.5", "0.000001"],
  [{ ...plain, decimals: 2 }, 0.000001, "1,234.5", "0.00"],
];

describe("formatValue", () => {
  it.each(WRITTEN)("writes %j, %d in %s as %s", (m, v, style, text) => {
    expect(formatValue(m, v, style)).toBe(text);
  });
  it("writes a dash for no value and for one that is not finite, never ∞ or NaN", () => {
    for (const v of [null, undefined, Number.NaN, Infinity, -Infinity]) expect(formatValue(eur, v, "1,234.5")).toBe("–");
  });
  it("adds nothing for the format: the unit alone stands next to the number", () => {
    expect(formatValue(metric({ format: "currency", unit: "" }), 5, "1,234.5")).toBe("5");
    expect(formatValue(metric({ format: "percent", unit: "pts", decimals: 1 }), 5, "1,234.5")).toBe("5.0 pts");
  });
});

describe("compactValue", () => {
  const cases: [ValueUnit, number, NumberStyle, string][] = [
    [eur, 9999, "1,234.5", "9,999 €"],
    [eur, 10000, "1,234.5", "10k €"],
    [eur, 12345, "1,234.5", "12.3k €"],
    [eur, 12345, "1.234,5", "12,3k €"],
    [eur, 126000, "1,234.5", "126k €"],
    [eur, 126400, "1,234.5", "126k €"],
    [plain, 99949, "1,234.5", "99.9k"],
    [plain, 99950, "1,234.5", "100k"],
    [plain, 999499, "1,234.5", "999k"],
    [plain, 999500, "1,234.5", "1M"],
    [plain, 1234567, "1,234.5", "1.2M"],
    [plain, 1234567, "1 234,5", "1,2M"],
    [usd, 1234567, "1,234.5", "$1.2M"],
    [usd, -1234567, "1,234.5", "−$1.2M"],
    [{ ...plain, unit: "pc" }, 12000, "1,234.5", "12k pc"],
    [pct, 12.5, "1,234.5", "12.5 %"],
    [plain, 2_500_000_000, "1.234,5", "2.500M"],
  ];
  it.each(cases)("shortens %j, %d in %s to %s", (m, v, style, text) => {
    expect(compactValue(m, v, style)).toBe(text);
  });
  it("never writes 1000k and gives neighbouring ticks different labels", () => {
    for (let v = 10_000; v < 2_000_000; v += 2_500) expect(compactValue(plain, v, "1,234.5")).not.toMatch(/^1000k/);
    const ticks = [10_000, 12_500, 15_000, 17_500, 20_000].map((v) => compactValue(plain, v, "1,234.5"));
    expect(new Set(ticks).size).toBe(ticks.length);
  });
  it("writes a dash for a value that is not finite", () => {
    expect(compactValue(eur, Infinity, "1,234.5")).toBe("–");
  });
});

describe("formatChange", () => {
  it("writes every change one way, in the style", () => {
    expect(formatChange(12, "1,234.5")).toBe("+12.0 %");
    expect(formatChange(-3.45, "1.234,5")).toBe("−3,5 %");
    expect(formatChange(0, "1,234.5")).toBe("±0.0 %");
    expect(formatChange(-0.04, "1,234.5")).toBe("±0.0 %");
    expect(formatChange(1234.5, "1'234.5")).toBe("+1'234.5 %");
    expect(formatChange(-12, "1,234.5", { signed: false })).toBe("12.0 %");
    for (const v of [null, undefined, Number.NaN, -Infinity]) expect(formatChange(v, "1,234.5")).toBe("–");
  });
  it("writes shares in percent with the decimals asked for", () => {
    expect(formatPercent(96.44, "1.234,5")).toBe("96,4 %");
    expect(formatPercent(96.44, "1,234.5", 0)).toBe("96 %");
  });
});

describe("formatNumber", () => {
  it("writes digits in the style, without group marks when asked", () => {
    expect(formatNumber(1234.5, 1, "1.234,5")).toBe("1.234,5");
    expect(formatNumber(1234.5, 1, "1.234,5", { group: false })).toBe("1234,5");
    expect(formatNumber(-1234.5, 2, "1,234.5", { group: false })).toBe("-1234.50");
    expect(formatNumber(1234567, 0, "1 234,5", {}).split(/\s/)).toEqual(["1", "234", "567"]);
    expect(formatNumber(-0.004, 2, "1,234.5")).toBe("0.00");
  });
  it("writes a dash for no number", () => {
    for (const v of [null, undefined, Number.NaN, Infinity, -Infinity]) expect(formatNumber(v, 2, "1,234.5")).toBe("–");
  });
  it("writes one minus sign for people and the ASCII minus for files, and both read back as the same number (#184)", () => {
    expect(MINUS).toBe("\u2212");
    expect(formatNumber(-1234.5, 1, "1,234.5")).toBe("−1,234.5");
    expect(formatValue({ unit: "€", unit_position: "after", decimals: 0 }, -1200, "1.234,5")).toBe("−1.200 €");
    expect(compactValue({ unit: "", unit_position: "after", decimals: 0 }, -12_300, "1,234.5")).toBe("−12.3k");
    expect(formatChange(-3.5, "1,234.5")).toBe("−3.5 %");
    expect(axisLabels({ unit: "", unit_position: "after", decimals: 0 }, [-20_000, 0, 20_000], 20_000, "1,234.5")).toEqual(["−20k", "0", "20k"]);
    for (const s of NUMBER_STYLES) {
      const shown = formatNumber(-1234.5, 1, s);
      const filed = formatNumber(-1234.5, 1, s, { group: false });
      expect(shown.startsWith(MINUS) && !shown.includes("-")).toBe(true);
      expect(filed.startsWith("-") && !filed.includes(MINUS)).toBe(true);
      expect(readNumber(shown, s)).toBe(-1234.5);
      expect(readNumber(filed, s)).toBe(-1234.5);
    }
  });
  it("writes the same digits in every style, only the marks differ", () => {
    for (const s of NUMBER_STYLES) expect(formatNumber(1234.5, 1, s).replace(/\D/g, "")).toBe("12345");
  });
});

describe("units", () => {
  it("proposes the unit of a new money Metric from the Workspace Profile's currency", () => {
    expect(moneyUnit("EUR")).toEqual({ unit: "€", unit_position: "after" });
    expect(moneyUnit("USD")).toEqual({ unit: "$", unit_position: "before" });
    expect(moneyUnit("CHF")).toEqual({ unit: "CHF ", unit_position: "before" });
    expect(moneyUnit("GBP")).toEqual({ unit: "GBP ", unit_position: "before" });
    expect(moneyUnit(null)).toEqual({ unit: "€", unit_position: "after" });
  });
  it("gives a Metric kept before units had a side the unit its format used to add", () => {
    const old = { unit: "", format: "currency" as const, decimals: 0 };
    expect(formatValue(keptUnit(old), 1200, "1,234.5")).toBe("1,200 €");
    expect(keptUnit({ unit: "", format: "percent" as const })).toMatchObject({ unit: "%", unit_position: "after" });
    expect(keptUnit({ unit: "", format: "number" as const })).toMatchObject({ unit: "", unit_position: "after" });
    expect(keptUnit({ unit: "d", format: "number" as const, unit_position: "before" as const })).toMatchObject({ unit: "d", unit_position: "before" });
  });
  it("knows the two sides a unit stands on, and nothing else", () => {
    expect(UNIT_POSITIONS.map(isUnitPosition)).toEqual([true, true]);
    for (const bad of ["", "Before", "left", null, undefined, 0]) expect(isUnitPosition(bad)).toBe(false);
  });
});

describe("format", () => {
  it("writes a target in the style", () => {
    expect(targetText(metric({ target_min: 1000, target_max: 2000 }), "1.234,5")).toBe("1.000 € – 2.000 €");
    expect(targetText(metric({ target_min: null, target_max: null }), "1,234.5")).toBe("No target");
    expect(targetText(metric({ target_min: 1000, target_max: null }), "1,234.5")).toBe("≥ 1,000 €");
    expect(targetText(metric({ target_min: null, target_max: 5 }), "1,234.5")).toBe("≤ 5 €");
  });
  it("places a value against the target range", () => {
    const m = { target_min: 100, target_max: 200 };
    expect(targetStatus(m, 50)).toBe("below");
    expect(targetStatus(m, 150)).toBe("on");
    expect(targetStatus(m, 250)).toBe("above");
    expect(targetStatus({ target_min: null, target_max: null }, 50)).toBeNull();
    expect(targetStatus(m, null)).toBeNull();
  });
  it("writes every date one way", () => {
    expect(formatDate("2026-11-04")).toBe("4 Nov 2026");
    expect(formatDate(new Date("2026-12-24T09:00:00"))).toBe("24 Dec 2026");
    expect(formatDate("not a date")).toBe("–");
  });
  it("reads a calendar day as a day, so one that does not exist is none, and any other text as a timestamp", () => {
    // A day is read as a calendar day, never rolled over: 29 February 2026 does not exist. Read as a timestamp it
    // would come out as 1 March (or 28 February west of UTC). Neither depends on the machine's time zone.
    expect(formatDate("2026-02-29")).toBe("–");
    expect(formatDate("2026-04-31")).toBe("–");
    expect(formatDate("2028-02-29")).toBe("29 Feb 2028");
    // Text that only starts or ends with a day, or names a day in words, is a timestamp. It is written as the day
    // that instant falls on where the code runs, worked out here from the instant itself.
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const localDay = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const noonUtc = localDay(new Date(Date.UTC(2026, 10, 4, 12)));
    expect(formatDate("2026-11-04 12:00 GMT")).toBe(noonUtc);
    expect(formatDate("Wed, 04 Nov 2026 12:00:00 GMT")).toBe(noonUtc);
    expect(formatDate("Day 2026-11-04")).toBe(localDay(new Date(2026, 10, 4)));
  });
});

describe("niceAxis and axisLabels (ticket #184)", () => {
  const usd2: ValueUnit = { unit: "$", unit_position: "before", decimals: 2 };
  it("gives one value an axis of nice steps from 0, in one notation", () => {
    const a = niceAxis(13_292.35, 13_292.35);
    expect(a.ticks).toEqual([0, 5000, 10_000, 15_000]);
    expect(a.domain).toEqual([0, 15_000]);
    expect(axisLabels(usd2, a.ticks, a.step, "1.234,5")).toEqual(["$0", "$5k", "$10k", "$15k"]);
  });
  it("steps by 1, 2, 2.5 or 5 times a power of ten and covers the data", () => {
    expect(niceAxis(0, 9).ticks).toEqual([0, 2.5, 5, 7.5, 10]);
    expect(niceAxis(0.1, 0.9).ticks).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceAxis(-30, 70).ticks).toEqual([-50, -25, 0, 25, 50, 75]);
    expect(niceAxis(0, 0).ticks).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(niceAxis(-4, -4).domain).toEqual([-4, 0]);
    expect(niceAxis(9, 0)).toEqual(niceAxis(0, 9));
  });
  it("ends for any input, at most MAX_AXIS_TICKS ticks, and falls back to a padded domain where it cannot step", () => {
    const sane = (a: ReturnType<typeof niceAxis>) => {
      expect(a.ticks.length).toBeLessThanOrEqual(MAX_AXIS_TICKS + 1);
      expect(a.domain.every(Number.isFinite)).toBe(true);
      expect(a.domain[0]).toBeLessThanOrEqual(a.domain[1]);
    };
    // Huge values: the step is far below their precision, or the span overflows.
    for (const [lo, hi] of [[1e300, 1e300], [-1e300, 1e300], [Number.MAX_VALUE, Number.MAX_VALUE], [-Number.MAX_VALUE, Number.MAX_VALUE], [1e15, 1e15 + 1], [2 ** 53, 2 ** 53 + 2], [1e-300, 2e-300], [5e-324, 1e-323]]) sane(niceAxis(lo, hi));
    // Steps of 0.5 at 2^53, where doubles are 2 apart: ticks would repeat, so the chart picks its own.
    expect(niceAxis(2 ** 53, 2 ** 53 + 2).ticks).toEqual([]);
    // A range of 0, and values that are no numbers.
    sane(niceAxis(0, 0));
    expect(niceAxis(Number.NaN, 5)).toEqual({ domain: [0, 1], ticks: [0, 1], step: 1 });
    expect(niceAxis(0, Number.POSITIVE_INFINITY)).toEqual({ domain: [0, 1], ticks: [0, 1], step: 1 });
    expect(niceAxis(Number.NEGATIVE_INFINITY, Number.NaN).ticks).toEqual([0, 1]);
    // A tick count that asks for far more steps than the cap.
    sane(niceAxis(0, 1, 1e9));
  });
  it("writes small axes in full with the decimals the step needs, never more than the Metric's", () => {
    const a = niceAxis(0, 9);
    expect(axisLabels(usd2, a.ticks, a.step, "1,234.5")).toEqual(["$0.0", "$2.5", "$5.0", "$7.5", "$10.0"]);
    expect(axisLabels({ unit: "d", unit_position: "after", decimals: 0 }, a.ticks, a.step, "1,234.5")).toEqual(["0 d", "3 d", "5 d", "8 d", "10 d"]);
    const big = niceAxis(0, 2_400_000);
    expect(axisLabels(usd2, big.ticks, big.step, "1,234.5")).toEqual(["$0", "$1M", "$2M", "$3M"]);
  });
});
