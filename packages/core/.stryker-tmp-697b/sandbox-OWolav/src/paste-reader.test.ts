// @ts-nocheck
// The paste reader (spec 0026, Testing Decisions, pure tests): the grid, each layout and its transposed form, header
// rows, period cells and number cells, and the clipboard text of Excel, Google Sheets, LibreOffice and Numbers.
// The fixtures in test/paste are what each program puts on the clipboard's text/plain, byte for byte (Excel for
// Windows ends every row in CRLF, a cell with a line break is quoted); the hand paste from each program before the
// first release checks them again.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cellName,
  findMetric,
  GRID_LIMITS,
  PASTE_LIMITS,
  pasteProblemText,
  pasteReadingText,
  readGrid,
  readPaste,
  readPeriodCell,
  readValueCell,
  type PasteContext,
  type PasteMetric,
  type PasteProblem,
  type PasteValue,
} from "./paste-reader";

const METRICS: PasteMetric[] = [
  { id: 1, slug: "revenue", name: "Revenue", period: "month", unit: "€", format: "currency" },
  { id: 2, slug: "signups", name: "Signups", period: "month", unit: "", format: "number" },
  { id: 3, slug: "churn-rate", name: "Churn rate", period: "month", unit: "%", format: "percent" },
  { id: 4, slug: "weekly-calls", name: "Calls", period: "week", unit: "", format: "number" },
  { id: 5, slug: "calls-eu", name: "Calls", period: "week", unit: "", format: "number" },
  { id: 6, slug: "usd-revenue", name: "US revenue", period: "month", unit: "$", format: "currency" },
  { id: 7, slug: "visits", name: "Visits", period: "day", unit: "", format: "number" },
  { id: 8, slug: "quarterly-sales", name: "Quarterly sales", period: "quarter", unit: "CHF ", format: "currency" },
];
const CTX: PasteContext = { style: "1,234.5", today: "2026-11-19", yearStart: 1, languages: ["en", "de"], metrics: METRICS };
const fixture = (name: string) => readFileSync(new URL(`./test/paste/${name}`, import.meta.url), "utf8");

/** The values of a reading as compact rows: place, Metric slug, period, value or the problem's reason. */
function summary(values: PasteValue[]) {
  const slug = (id: number | null) => METRICS.find((m) => m.id === id)?.slug ?? null;
  return values.map((v) => [v.place, slug(v.metricId), v.period, v.problem ? v.problem.reason : v.value]);
}
function read(text: string, ctx: Partial<PasteContext> = {}) {
  const r = readPaste(text, { ...CTX, ...ctx });
  if (!r.ok) throw new Error(`not read: ${r.reason}`);
  return r;
}

describe("cellName", () => {
  it("names places as a spreadsheet does", () => {
    expect(cellName(0, 0)).toBe("A1");
    expect(cellName(6, 2)).toBe("C7");
    expect(cellName(0, 25)).toBe("Z1");
    expect(cellName(9, 26)).toBe("AA10");
    expect(cellName(0, 701)).toBe("ZZ1");
    expect(cellName(0, 702)).toBe("AAA1");
  });
});

describe("readGrid", () => {
  it("splits rows on line breaks and cells on tabs, trimming each cell", () => {
    expect(readGrid("a\t b \tc\r\nd\te\tf\rg\th\ti\n")).toEqual({ ok: true, grid: { cells: [["a", "b", "c"], ["d", "e", "f"], ["g", "h", "i"]], top: 0, left: 0 } });
  });
  it("keeps tabs, line breaks and doubled quotes inside a quoted cell", () => {
    const r = readGrid('"a\tb"\t"line\nbreak"\n"say ""hi"""\tx');
    expect(r).toEqual({ ok: true, grid: { cells: [["a\tb", "line\nbreak"], ['say "hi"', "x"]], top: 0, left: 0 } });
  });
  it("reads a quote that does not open a cell as text, and an unclosed one to the end", () => {
    expect(readGrid('5" pipe\tx')).toEqual({ ok: true, grid: { cells: [['5" pipe', "x"]], top: 0, left: 0 } });
    expect(readGrid('"open\tx')).toEqual({ ok: true, grid: { cells: [["open\tx"]], top: 0, left: 0 } });
  });
  it("drops empty rows and columns at the edges and says how many", () => {
    const r = readGrid("\n\t\t\n\t\ta\tb\n\t\tc\td\t\n\n");
    expect(r).toEqual({ ok: true, grid: { cells: [["a", "b"], ["c", "d"]], top: 2, left: 2 } });
  });
  it("pads short rows so the grid is a rectangle", () => {
    expect(readGrid("a\tb\tc\nd")).toEqual({ ok: true, grid: { cells: [["a", "b", "c"], ["d", "", ""]], top: 0, left: 0 } });
  });
  it("tries a semicolon, then a comma, as a CSV, when every row has as many cells", () => {
    expect(readGrid("a;1,5\nb;2,5\n")).toEqual({ ok: true, grid: { cells: [["a", "1,5"], ["b", "2,5"]], top: 0, left: 0 } });
    expect(readGrid('a,"1,500"\nb,2')).toEqual({ ok: true, grid: { cells: [["a", "1,500"], ["b", "2"]], top: 0, left: 0 } });
  });
  it("refuses uneven CSV rows, a single column, an empty paste and anything not text", () => {
    expect(readGrid("a,b\nc,d,e")).toEqual({ ok: false, reason: "not_cells" });
    expect(readGrid("just some words\nand more")).toEqual({ ok: false, reason: "not_cells" });
    expect(readGrid(" \n\t\n")).toEqual({ ok: false, reason: "empty" });
    expect(readGrid("﻿")).toEqual({ ok: false, reason: "empty" });
    expect(readGrid(42 as unknown as string)).toEqual({ ok: false, reason: "empty" });
  });
  it("refuses more than 256 KB, counted in bytes of UTF-8", () => {
    expect(readGrid("a\t" + "x".repeat(PASTE_LIMITS.bytes - 2)).ok).toBe(true);
    expect(readGrid("a\t" + "x".repeat(PASTE_LIMITS.bytes - 1))).toEqual({ ok: false, reason: "too_large" });
    // "€" is three bytes: a third as many characters already cross the limit.
    expect(readGrid("a\t" + "€".repeat(Math.ceil(PASTE_LIMITS.bytes / 3)))).toEqual({ ok: false, reason: "too_large" });
  });
});

describe("readPeriodCell", () => {
  const p = (t: string, ctx: Partial<PasteContext> = {}) => readPeriodCell(t, { ...CTX, ...ctx });
  it("reads ISO dates and months", () => {
    expect(p("2026-10-01")).toEqual({ span: "day", start: "2026-10-01" });
    expect(p("2026-10")).toEqual({ span: "month", start: "2026-10-01" });
    expect(p("2026-1")).toEqual({ span: "month", start: "2026-01-01" });
    expect(p("2026-13")).toEqual({ span: "month", start: null });
    expect(p("2026-10-01 00:00:00")).toEqual({ span: "day", start: "2026-10-01" });
    expect(p("2026-10-01T08:30")).toEqual({ span: "day", start: "2026-10-01" });
  });
  it("reads dates in the Workspace's day and month order", () => {
    expect(p("01.10.2026")).toEqual({ span: "day", start: "2026-10-01" });
    expect(p("10/1/2026")).toEqual({ span: "day", start: "2026-01-10" });
    expect(p("10/1/2026", { monthFirst: true })).toEqual({ span: "day", start: "2026-10-01" });
    expect(p("10/2026")).toEqual({ span: "month", start: "2026-10-01" });
  });
  it("reads months as spreadsheets show them, in the Answer Languages", () => {
    expect(p("Oct-26")).toEqual({ span: "month", start: "2026-10-01" });
    expect(p("Okt.-2026")).toEqual({ span: "month", start: "2026-10-01" });
    expect(p("Oct 2026")).toEqual({ span: "month", start: "2026-10-01" });
    expect(p("Oktober 2026")).toEqual({ span: "month", start: "2026-10-01" });
    expect(p("  October   2026 ")).toEqual({ span: "month", start: "2026-10-01" });
    expect(p("octobre 2026")).toBeNull();
    expect(p("octobre 2026", { languages: ["fr"] })).toEqual({ span: "month", start: "2026-10-01" });
  });
  it("reads quarters, weeks and years", () => {
    expect(p("Q3 2026")).toEqual({ span: "quarter", start: "2026-07-01" });
    expect(p("KW 46")).toEqual({ span: "week", start: "2026-11-09" });
    expect(p("2026-W46")).toEqual({ span: "week", start: "2026-11-09" });
    expect(p("2026")).toEqual({ span: "year", start: "2026-01-01" });
    expect(p("H1 2026")).toEqual({ span: "half", start: "2026-01-01" });
  });
  it("says a cell shaped like a period names none, and refuses everything else", () => {
    expect(p("week 60")).toEqual({ span: "week", start: null });
    expect(p("31.02.2026")).toEqual({ span: "day", start: null });
    expect(p("46296")).toBeNull(); // a date serial is never guessed
    expect(p("Revenue")).toBeNull();
    expect(p("Oct 2026 total")).toBeNull();
    expect(p("Q3 and Q4")).toBeNull();
    expect(p("Rev-26")).toBeNull();
    expect(p("")).toBeNull();
  });
});

describe("readValueCell", () => {
  const euro = METRICS[0];
  const plain = METRICS[1];
  const percent = METRICS[2];
  const dollar = METRICS[5];
  const chf = METRICS[7];
  const v = (t: string, m: Pick<PasteMetric, "unit" | "format"> = plain, style: PasteContext["style"] = "1,234.5") => readValueCell(t, m, style);
  it("reads numbers in the Workspace's Number Style, the ambiguous 1.500 too", () => {
    expect(v("1,234.5")).toEqual({ value: 1234.5, problem: null });
    expect(v("1.234,5", plain, "1.234,5")).toEqual({ value: 1234.5, problem: null });
    expect(v("1.500")).toEqual({ value: 1.5, problem: null });
    expect(v("1.500", plain, "1.234,5")).toEqual({ value: 1500, problem: null });
    expect(v("2,5k", plain, "1.234,5")).toEqual({ value: 2500, problem: null });
    expect(v("- 12")).toEqual({ value: -12, problem: null });
  });
  it("takes off a currency sign or code only when it is the Metric's unit", () => {
    expect(v("€1,200.00", euro)).toEqual({ value: 1200, problem: null });
    expect(v("1.200,00 €", euro, "1.234,5")).toEqual({ value: 1200, problem: null });
    expect(v("EUR 1,200", euro)).toEqual({ value: 1200, problem: null });
    expect(v("$1,200", dollar)).toEqual({ value: 1200, problem: null });
    expect(v("USD 1,200", dollar)).toEqual({ value: 1200, problem: null });
    expect(v("CHF 1'200", chf)).toEqual({ value: 1200, problem: null });
    expect(v("Fr. 1'200", chf)).toEqual({ value: 1200, problem: null });
    expect(v("$1,200", euro)).toEqual({ value: null, problem: { reason: "wrong_unit", text: "$1,200" } });
    expect(v("€5", plain)).toEqual({ value: null, problem: { reason: "wrong_unit", text: "€5" } });
    expect(v("XYZ 5", { unit: "XYZ", format: "number" })).toEqual({ value: 5, problem: null });
  });
  it("takes off a percent sign for a percent Metric and refuses it elsewhere, never dividing by 100", () => {
    expect(v("2.5%", percent)).toEqual({ value: 2.5, problem: null });
    expect(v("12,5 %", percent, "1.234,5")).toEqual({ value: 12.5, problem: null });
    expect(v("2.5%", { unit: "", format: "percent" })).toEqual({ value: 2.5, problem: null });
    expect(v("2.5%", plain)).toEqual({ value: null, problem: { reason: "wrong_unit", text: "2.5%" } });
  });
  it("reads accounting negatives in brackets and a sign before the currency", () => {
    expect(v("(1,200)")).toEqual({ value: -1200, problem: null });
    expect(v("(€200.00)", euro)).toEqual({ value: -200, problem: null });
    expect(v("-€1,200", euro)).toEqual({ value: -1200, problem: null });
    expect(v("+€5", euro)).toEqual({ value: 5, problem: null });
    expect(v("€-1,200", euro)).toEqual({ value: -1200, problem: null });
    expect(v("(0)")).toEqual({ value: 0, problem: null });
    expect(Object.is(v("(0)").value, -0)).toBe(false);
  });
  it("refuses spreadsheet errors by name, and anything not a number", () => {
    for (const e of ["#N/A", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#NULL!", "#SPILL!", "#ERROR!", "Err:502"]) {
      expect(v(e)).toEqual({ value: null, problem: { reason: "spreadsheet_error", text: e } });
    }
    for (const t of ["n/a", "twelve", "(-5)", "-(5)", "-€-5", "€5 €", "1,2,3.4.5", "1e3"]) expect(v(t, euro).problem?.reason, t).toBe("not_a_number");
  });
  it("reads an empty cell as no value, not as a problem", () => {
    expect(v("  ")).toEqual({ value: null, problem: null });
  });
});

describe("findMetric", () => {
  it("finds a Metric by slug or name, without case or extra spaces", () => {
    expect(findMetric("revenue", METRICS)).toEqual({ metric: METRICS[0] });
    expect(findMetric("  CHURN   rate ", METRICS)).toEqual({ metric: METRICS[2] });
    expect(findMetric("Weekly-Calls", METRICS)).toEqual({ metric: METRICS[3] });
  });
  it("calls a name two Metrics share ambiguous and offers their slugs", () => {
    expect(findMetric("calls", METRICS)).toEqual({ problem: { reason: "ambiguous", text: "calls", slugs: ["calls-eu", "weekly-calls"] } });
  });
  it("says the same for a Metric that does not exist and one the person cannot see", () => {
    expect(findMetric("Secret margin", METRICS)).toEqual({ problem: { reason: "not_visible", text: "Secret margin" } });
    expect(findMetric("Revenue", [])).toEqual({ problem: { reason: "not_visible", text: "Revenue" } });
    expect(findMetric(" ", METRICS)).toEqual({ problem: { reason: "no_metric" } });
  });
});

describe("readPaste: layouts", () => {
  it("reads Metrics as rows and periods as columns", () => {
    const r = read("\tAug 2026\tSep 2026\nRevenue\t100\t200\nSignups\t5\t\n");
    expect(r.layout).toBe("wide");
    expect(r.alternatives).toEqual([]);
    expect([r.metrics, r.periods]).toEqual([2, 2]);
    expect(summary(r.values)).toEqual([
      ["B2", "revenue", "2026-08-01", 100],
      ["C2", "revenue", "2026-09-01", 200],
      ["B3", "signups", "2026-08-01", 5],
    ]);
    expect(r.values[0]).toMatchObject({ text: "100", metricText: "Revenue", periodText: "Aug 2026" });
  });
  it("reads the transposed form: periods down, Metrics across", () => {
    const r = read("Month\tRevenue\tSignups\n2026-08\t100\t5\n2026-09\t200\t6");
    expect(r.layout).toBe("wide_transposed");
    expect([r.metrics, r.periods]).toEqual([2, 2]);
    expect(summary(r.values)).toEqual([
      ["B2", "revenue", "2026-08-01", 100],
      ["B3", "revenue", "2026-09-01", 200],
      ["C2", "signups", "2026-08-01", 5],
      ["C3", "signups", "2026-09-01", 6],
    ]);
  });
  it("reads rows of a Metric, a period and a value in any order, with or without a header", () => {
    const plain = read("Revenue\t2026-08\t100\nSignups\t2026-08\t5");
    expect(plain.layout).toBe("long");
    expect(summary(plain.values)).toEqual([["C1", "revenue", "2026-08-01", 100], ["C2", "signups", "2026-08-01", 5]]);
    const headed = read("Wert\tMonat\tKennzahl\n100\t2026-08\tRevenue\n5\t2026-09\tSignups");
    expect(headed.layout).toBe("long");
    expect([headed.metrics, headed.periods]).toEqual([2, 2]);
    expect(summary(headed.values)).toEqual([["A2", "revenue", "2026-08-01", 100], ["A3", "signups", "2026-09-01", 5]]);
  });
  it("allows a column between that is empty everywhere, and refuses a fourth that is not", () => {
    const r = read("Revenue\t\t2026-08\t100\nSignups\t\t2026-08\t5");
    expect(summary(r.values)).toEqual([["D1", "revenue", "2026-08-01", 100], ["D2", "signups", "2026-08-01", 5]]);
    expect(readPaste("Revenue\tnote\t2026-08\t100\nSignups\t\t2026-08\t5", CTX)).toEqual({ ok: false, reason: "no_layout" });
  });
  it("reads a value column of text as values, so each is refused on its own", () => {
    const r = read("Revenue\t2026-08\tn/a\nSignups\t2026-08\t5");
    expect(summary(r.values)).toEqual([["C1", "revenue", "2026-08-01", "not_a_number"], ["C2", "signups", "2026-08-01", 5]]);
  });
  it("reads two columns for the Metric the page was opened for, in either order", () => {
    const r = read("Month\tValue\nAug 2026\t100\nSep 2026\t200", { metricId: 1 });
    expect(r.layout).toBe("one_metric");
    expect([r.metrics, r.periods]).toEqual([1, 2]);
    expect(summary(r.values)).toEqual([["B2", "revenue", "2026-08-01", 100], ["B3", "revenue", "2026-09-01", 200]]);
    expect(r.values[0].metricText).toBe("revenue");
    const swapped = read("100\t2026-08\n200\t2026-09", { metricId: 2 });
    expect(summary(swapped.values)).toEqual([["A1", "signups", "2026-08-01", 100], ["A2", "signups", "2026-09-01", 200]]);
  });
  it("offers the other reading when two fit, and reads the one asked for", () => {
    const text = "Month\tRevenue\n2026-08\t100\n2026-09\t200";
    const r = read(text, { metricId: 2 });
    expect([r.layout, r.alternatives]).toEqual(["one_metric", ["wide_transposed"]]);
    const other = read(text, { metricId: 2, layout: "wide_transposed" });
    expect([other.layout, other.alternatives]).toEqual(["wide_transposed", ["one_metric"]]);
    expect(summary(other.values)).toEqual([["B2", "revenue", "2026-08-01", 100], ["B3", "revenue", "2026-09-01", 200]]);
    // A layout that does not fit is not taken because it was asked for.
    expect(read(text, { layout: "long" }).layout).toBe("wide_transposed");
  });
  it("needs the Metric the page was opened for among those the person may see", () => {
    expect(readPaste("2026-08\t100\n2026-09\t200", { ...CTX, metricId: 99 })).toEqual({ ok: false, reason: "no_layout" });
  });
  it("keeps each cell's place in the paste when edges were dropped", () => {
    const r = read("\n\t\tAug 2026\n\tRevenue\t100");
    expect(summary(r.values)).toEqual([["C3", "revenue", "2026-08-01", 100]]);
  });
  it("refuses what fits no layout, with what Ziffr expected", () => {
    const no = readPaste("a\tb\nc\td", CTX);
    expect(no).toEqual({ ok: false, reason: "no_layout" });
    expect(pasteReadingText(no as Extract<typeof no, { ok: false }>)).toMatch(/Metrics in the first column and periods in the first row/);
    expect(readPaste("Revenue\t100", CTX)).toEqual({ ok: false, reason: "no_layout" });
    expect(readPaste("\tAug 2026\n\t\n2026-09\t", CTX)).toEqual({ ok: false, reason: "no_layout" });
    expect(readPaste("\tRevenue\tSignups\n\t5\t6", CTX)).toEqual({ ok: false, reason: "no_layout" });
    expect(readPaste("Revenue\t2026-08\t1\tx", CTX)).toEqual({ ok: false, reason: "no_layout" });
  });
  it("passes on why the grid could not be read", () => {
    expect(readPaste("", CTX)).toEqual({ ok: false, reason: "empty" });
    expect(readPaste("one column\nonly", CTX)).toEqual({ ok: false, reason: "not_cells" });
  });
});

describe("readPaste: values", () => {
  it("names each cell's problem: unseen, ambiguous, other length, future, unreadable", () => {
    const r = read([
      "\tOct 2026\tDec 2026\tQ3 2026\tweek 60",
      "Revenue\t1,200\t5\t6\t7",
      "Secret\t1\t\t\t",
      "Calls\t1\t\t\t",
      "\t9\t\t\t",
      "Churn rate\t#N/A\t\t\t",
    ].join("\n"));
    expect(summary(r.values)).toEqual([
      ["B2", "revenue", "2026-10-01", 1200],
      ["C2", "revenue", null, "future_period"],
      ["D2", "revenue", null, "other_length"],
      ["E2", "revenue", null, "not_a_period"],
      ["B3", null, null, "not_visible"],
      ["B4", null, null, "ambiguous"],
      ["B5", null, null, "no_metric"],
      ["B6", "churn-rate", "2026-10-01", "spreadsheet_error"],
    ]);
  });
  it("counts a date inside a period as that period, and refuses a longer one", () => {
    const r = read("Metric\tPeriod\tValue\nRevenue\t2026-10-15\t1\nweekly-calls\t2026-11-11\t2\nvisits\t2026-11-19\t3\nweekly-calls\t2026-10\t4\nvisits\t2026-11-20\t5");
    expect(summary(r.values)).toEqual([
      ["C2", "revenue", "2026-10-01", 1],
      ["C3", "weekly-calls", "2026-11-09", 2],
      ["C4", "visits", "2026-11-19", 3],
      ["C5", "weekly-calls", null, "other_length"],
      ["C6", "visits", null, "future_period"],
    ]);
  });
  it("reads quarters in the Fiscal Year", () => {
    const r = read("quarterly-sales\tQ1 2026\tCHF 100", { yearStart: 4 });
    expect(summary(r.values)).toEqual([["C1", "quarterly-sales", "2026-04-01", 100]]);
  });
  it("refuses both of two values for the same Metric and period, never picking one", () => {
    const r = read("Revenue\t2026-10\t1\nrevenue\t2026-10-05\t2\nRevenue\t2026-09\t3\nRevenue\t2026-10\t#N/A");
    expect(summary(r.values)).toEqual([
      ["C1", "revenue", "2026-10-01", "duplicate"],
      ["C2", "revenue", "2026-10-01", "duplicate"],
      ["C3", "revenue", "2026-09-01", 3],
      ["C4", "revenue", "2026-10-01", "spreadsheet_error"],
    ]);
    expect(r.values[0].problem).toEqual({ reason: "duplicate", places: ["C2"] });
  });
  it("skips empty value cells", () => {
    const r = read("\tAug 2026\tSep 2026\nRevenue\t\t2\nSignups\t\t");
    expect(summary(r.values)).toEqual([["C2", "revenue", "2026-09-01", 2]]);
  });
  it("refuses a paste of more than 2,000 values whole", () => {
    const rows = Array.from({ length: PASTE_LIMITS.values + 1 }, (_, i) => `Revenue\t2026-10\t${i}`);
    expect(readPaste(rows.join("\n"), CTX)).toEqual({ ok: false, reason: "too_many_values", count: 2001 });
    expect(read(rows.slice(1).join("\n")).values).toHaveLength(2000);
  });
});

describe("readPaste: bounded work", () => {
  it("refuses a paste of many tiny cells before trying any layout, quickly", () => {
    // Just under 256 KB of one-character cells: about 130,000 cells in rows of 400.
    const row = Array.from({ length: 400 }, () => "1").join("\t");
    const text = Array.from({ length: 320 }, () => row).join("\n");
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(PASTE_LIMITS.bytes);
    const started = performance.now();
    expect(readPaste(text, CTX)).toEqual({ ok: false, reason: "too_many_cells", count: 128_000 });
    expect(performance.now() - started).toBeLessThan(1_000);
  });
  it("refuses a grid that spans too many cells, even when most are empty", () => {
    const text = `a${"\t".repeat(GRID_LIMITS.cells)}b\nc\td`;
    expect(readPaste(text, CTX)).toEqual({ ok: false, reason: "too_many_cells", count: 2 * (GRID_LIMITS.cells + 1) });
  });
  it("refuses one very wide row among many short ones in readGrid, before any grid is built", () => {
    const text = [`a${"\t".repeat(GRID_LIMITS.cells + 1)}b`, ...Array.from({ length: PASTE_LIMITS.values }, () => "x\ty")].join("\n");
    const started = performance.now();
    expect(readGrid(text)).toEqual({ ok: false, reason: "too_many_cells", count: (PASTE_LIMITS.values + 1) * (GRID_LIMITS.cells + 2) });
    expect(performance.now() - started).toBeLessThan(1_000);
  });
  it("counts many rows without a limit on arguments", () => {
    // 60,000 rows: more than a spread into Math.max takes on some engines.
    expect(readGrid(Array.from({ length: 60_000 }, () => "\t").join("\n") + "a\tb")).toEqual({ ok: true, grid: { cells: [["a", "b"]], top: 59_999, left: 1 } });
  });
  it("still reads the largest paste the limits allow: 2,000 rows of a Metric, a period and a value", () => {
    const rows = Array.from({ length: PASTE_LIMITS.values }, (_, i) => `visits\t${new Date(Date.UTC(2021, 0, 1 + i)).toISOString().slice(0, 10)}\t${i}`);
    const started = performance.now();
    const r = read(["Metric\tDay\tValue", ...rows].join("\n"));
    expect(r.values).toHaveLength(PASTE_LIMITS.values);
    expect(performance.now() - started).toBeLessThan(5_000);
  });
});

describe("readPaste: what each spreadsheet program puts on the clipboard", () => {
  const expected = [
    ["revenue", "2026-08-01", 1200],
    ["revenue", "2026-09-01", 1350.5],
    ["revenue", "2026-10-01", -200],
  ];
  const rows = (r: ReturnType<typeof read>) => summary(r.values).map((v) => v.slice(1));
  it("Excel for Windows", () => {
    const r = read(fixture("excel.txt"));
    expect(r.layout).toBe("wide");
    expect(rows(r)).toEqual([...expected, ["signups", "2026-08-01", 12], ["signups", "2026-10-01", 15], ["churn-rate", "2026-08-01", 2.5], ["churn-rate", "2026-09-01", "spreadsheet_error"], ["churn-rate", "2026-10-01", 3.1]]);
    expect(r.values.find((v) => v.problem)?.place).toBe("C4");
  });
  it("Google Sheets", () => {
    const r = read(fixture("google-sheets.txt"));
    expect(r.layout).toBe("wide");
    expect(rows(r)).toEqual([...expected, ["signups", "2026-08-01", 12], ["signups", "2026-10-01", 15]]);
  });
  it("LibreOffice Calc, German", () => {
    const r = read(fixture("libreoffice.txt"), { style: "1.234,5" });
    expect(r.layout).toBe("wide_transposed");
    expect(rows(r)).toEqual([...expected, ["signups", "2026-08-01", 12], ["signups", "2026-10-01", 15]]);
  });
  it("Numbers for macOS", () => {
    const r = read(fixture("numbers.txt"), { metrics: [...METRICS.slice(1), { ...METRICS[0], unit: "$" }] });
    expect([r.layout, r.alternatives]).toEqual(["long", ["wide_transposed"]]);
    expect(rows(r)).toEqual([...expected.slice(0, 2), ["signups", "2026-10-01", 15]]);
  });
});

describe("pasteProblemText", () => {
  const cases: [PasteProblem, string][] = [
    [{ reason: "no_metric" }, "No Metric is named for this value."],
    [{ reason: "not_visible", text: "Secret" }, "“Secret” is not a Metric you can see here."],
    [{ reason: "ambiguous", text: "Calls", slugs: ["a", "b"] }, "“Calls” names more than one Metric: write “a” or “b” instead."],
    [{ reason: "not_a_period", text: "soon" }, "“soon” is not a period Ziffr can read."],
    [{ reason: "future_period", text: "Dec 2026" }, "“Dec 2026” has not begun yet."],
    [{ reason: "not_a_number", text: "n/a" }, "“n/a” is not a number."],
    [{ reason: "spreadsheet_error", text: "#N/A" }, "The cell shows the spreadsheet error #N/A."],
    [{ reason: "wrong_unit", text: "$5" }, "“$5” is written in another unit than this Metric’s."],
    [{ reason: "duplicate", places: ["C2", "C9"] }, "The paste holds another value for this Metric and period (C2, C9)."],
  ];
  it.each(cases)("words %j", (p, text) => expect(pasteProblemText(p)).toBe(text));
  it("words a period of another length, with the Metric's when known", () => {
    expect(pasteProblemText({ reason: "other_length", text: "Q3 2026", span: "quarter" }, "month")).toBe("“Q3 2026” is a quarter, and this Metric counts in months.");
    expect(pasteProblemText({ reason: "other_length", text: "H1", span: "half" })).toBe("“H1” is a half-year.");
  });
  it("words why a paste was not read", () => {
    expect(pasteReadingText({ ok: false, reason: "empty" })).toMatch(/nothing to read/);
    expect(pasteReadingText({ ok: false, reason: "too_large" })).toMatch(/256 KB/);
    expect(pasteReadingText({ ok: false, reason: "not_cells" })).toBe("Copy the cells from the spreadsheet itself.");
    expect(pasteReadingText({ ok: false, reason: "too_many_cells", count: 9000 })).toMatch(/^That paste spans 9,000 cells/);
    expect(pasteReadingText({ ok: false, reason: "too_many_values", count: 2400 })).toBe("That is 2,400 values; a paste may hold at most 2,000. Paste fewer at a time.");
  });
});
