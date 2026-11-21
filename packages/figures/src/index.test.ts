// One table of values, Number Styles, units and period kinds, run against the module the app, the MCP views and the
// emails all write with (ticket #591).
import { describe, expect, it } from "vitest";
import { NUMBER_STYLES, writeNumber, writePeriod, type WriteOptions } from "./index";

const [EN, DE, FR, CH] = NUMBER_STYLES;
const NB = " ";
const M = "−";

// [value, decimals, style, options, written]
const NUMBERS: [number, number, string, WriteOptions, string][] = [
  [1234.5, 1, EN, {}, "1,234.5"],
  [1234.5, 1, DE, {}, "1.234,5"],
  [1234.5, 1, FR, {}, `1${NB}234,5`],
  [1234.5, 1, CH, {}, "1'234.5"],
  [-1234.5, 1, EN, {}, `${M}1,234.5`],
  [-1234.5, 1, DE, { group: false, minus: "-" }, "-1234,5"],
  [1234567, 0, FR, {}, `1${NB}234${NB}567`],
  [-0.4, 0, EN, {}, "0"],
  [0, 2, DE, {}, "0,00"],
  [12, 0, EN, { unit: "$", side: "before" }, "$12"],
  [-1200, 0, EN, { unit: "$", side: "before" }, `${M}$1,200`],
  [1200, 0, CH, { unit: "CHF ", side: "before" }, "CHF 1'200"],
  [1200, 0, DE, { unit: "€", side: "after" }, "1.200 €"],
  [-1200, 0, DE, { unit: "€" }, `${M}1.200 €`],
  [96.4, 1, DE, { unit: "%", side: "after" }, "96,4 %"],
  [12, 1, EN, { unit: "%", side: "after", change: true }, "+12.0 %"],
  [-3.5, 1, DE, { unit: "%", side: "after", change: true }, `${M}3,5 %`],
  [0.01, 1, EN, { unit: "%", side: "after", change: true }, "±0.0 %"],
  [126, 0, EN, { unit: "€", suffix: "k" }, "126k €"],
  [1.2, 1, EN, { unit: "$", side: "before", suffix: "M" }, "$1.2M"],
  [0, 0, EN, { suffix: "k" }, "0"],
  [5, 99, EN, {}, "5.00000000000000000000"],
  [5, 1, "nonsense", {}, "5.0"],
  [Number.NaN, 0, EN, {}, "–"],
  [Number.POSITIVE_INFINITY, 0, EN, {}, "–"],
];

describe("writeNumber", () => {
  it.each(NUMBERS)("%s with %s decimals in %s %j is %j", (value, decimals, style, options, written) => {
    expect(writeNumber(value, decimals, style, options)).toBe(written);
  });
  it("writes a dash for what is not a number and reads decimals leniently", () => {
    expect(writeNumber(null, 0, EN)).toBe("–");
    expect(writeNumber("5", 0, EN)).toBe("–");
    expect(writeNumber(5, Number.NaN, EN)).toBe("5");
    expect(writeNumber(5, -3, EN)).toBe("5");
  });
  it("has the four styles the app knows, each 1234.5 written in it", () => {
    expect(NUMBER_STYLES).toEqual(["1,234.5", "1.234,5", "1 234,5", "1'234.5"]);
    for (const s of NUMBER_STYLES) expect(writeNumber(1234.5, 1, s).replace(NB, " ")).toBe(s);
  });
});

// [first day, span, year start, long, short]
const PERIODS: [string, string, number, string, string][] = [
  ["2026-11-04", "day", 1, "Wed 4 Nov 2026", "4 Nov"],
  ["2026-11-16", "week", 1, "Week of 16 Nov 2026", "Week of 16 Nov 2026"],
  ["2026-10-01", "month", 1, "October 2026", "Oct 26"],
  ["2026-07-01", "quarter", 1, "Q3 2026", "Q3 26"],
  ["2026-01-01", "half", 1, "H1 2026", "H1 26"],
  ["2026-07-01", "half", 1, "H2 2026", "H2 26"],
  ["2026-01-01", "year", 1, "2026", "2026"],
  ["2026-04-01", "quarter", 4, "Q1 FY 2026/27", "Q1 26/27"],
  ["2027-01-01", "quarter", 4, "Q4 FY 2026/27", "Q4 26/27"],
  ["2026-10-01", "half", 4, "H2 FY 2026/27", "H2 26/27"],
  ["2026-04-01", "year", 4, "FY 2026/27", "FY26/27"],
  ["2026-01-01", "year", 4, "FY 2025/26", "FY25/26"],
  ["1999-10-01", "year", 10, "FY 1999/00", "FY99/00"],
  ["2026-04-01", "quarter", 99, "Q2 2026", "Q2 26"],
];

describe("writePeriod", () => {
  it.each(PERIODS)("%s as a %s from month %s is %s, short %s", (start, span, yearStart, long, short) => {
    expect(writePeriod(start, span, yearStart)).toBe(long);
    expect(writePeriod(start, span, yearStart, true)).toBe(short);
  });
  it("gives back what is not a day or not a span it names", () => {
    expect(writePeriod("nonsense", "month", 1)).toBe("nonsense");
    expect(writePeriod("2026-13-01", "month", 1)).toBe("2026-13-01");
    expect(writePeriod("2026-10-01", "decade", 1)).toBe("2026-10-01");
    expect(writePeriod("2026-10-01T10:00:00Z", "month", 1)).toBe("October 2026");
  });
});

describe("a page without modules", () => {
  it("runs from the source the views embed, with the same answers", () => {
    const embedded = new Function(`${writeNumber.toString()}\n${writePeriod.toString()}\nreturn { writeNumber, writePeriod };`)();
    for (const [v, d, s, o, written] of NUMBERS) expect(embedded.writeNumber(v, d, s, o)).toBe(written);
    for (const [start, span, ys, long, short] of PERIODS) { expect(embedded.writePeriod(start, span, ys)).toBe(long); expect(embedded.writePeriod(start, span, ys, true)).toBe(short); }
  });
});
