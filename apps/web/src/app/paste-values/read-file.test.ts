// Reading a dropped file for Paste values (spec 0026, ticket 5): a workbook becomes the text a paste from it would be,
// cells as they are shown, and the core's paste reader reads that text the same as a paste.
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readPaste, type PasteContext } from "@ziffr/core/paste-reader";
import { readFile, WORKBOOK_LIMIT } from "./read-file";

const CTX: PasteContext = {
  style: "1,234.5", today: "2026-11-19", yearStart: 1, languages: ["en"],
  metrics: [
    { id: 1, slug: "revenue", name: "Revenue", period: "month", unit: "€", format: "currency" },
    { id: 2, slug: "churn", name: "Churn", period: "month", unit: "%", format: "percent" },
  ],
};

/** A workbook as a file, with cells given as SheetJS cell objects so their number formats are kept. */
function workbook(sheets: Record<string, XLSX.CellObject[][]>, name = "values.xlsx"): File {
  const book = XLSX.utils.book_new();
  for (const [sheet, rows] of Object.entries(sheets)) {
    const ws: XLSX.WorkSheet = {};
    rows.forEach((row, r) => row.forEach((cell, c) => { ws[XLSX.utils.encode_cell({ r, c })] = cell; }));
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: Math.max(...rows.map((x) => x.length)) - 1 } });
    XLSX.utils.book_append_sheet(book, ws, sheet);
  }
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], name);
}
const s = (v: string): XLSX.CellObject => ({ t: "s", v });
const n = (v: number, z?: string): XLSX.CellObject => ({ t: "n", v, ...(z ? { z } : {}) });

describe("readFile", () => {
  it("reads a workbook's first sheet as the cells show, percent and currency formats included", async () => {
    const file = workbook({
      Months: [[s(""), s("Aug 2026"), s("Sep 2026")], [s("Revenue"), n(1200, "#,##0.00 \"€\""), n(1350.5, "#,##0.00 \"€\"")], [s("Churn"), n(0.025, "0.0%"), n(0.031, "0.0%")]],
      Other: [[s("x")]],
    });
    const r = await readFile(file);
    expect(r).toMatchObject({ ok: true, sheets: ["Months", "Other"], sheet: "Months" });
    if (!r.ok) return;
    expect(r.text).toBe("\tAug 2026\tSep 2026\nRevenue\t1,200.00 €\t1,350.50 €\nChurn\t2.5%\t3.1%");
    const read = readPaste(r.text, CTX);
    expect(read.ok && read.values.map((v) => [v.metricId, v.period, v.value])).toEqual([
      [1, "2026-08-01", 1200], [1, "2026-09-01", 1350.5], [2, "2026-08-01", 2.5], [2, "2026-09-01", 3.1],
    ]);
  });

  it("reads the sheet asked for, and quotes a cell that holds a tab or a line break as a paste does", async () => {
    const file = workbook({ A: [[s("a")]], B: [[s("Revenue"), s("Oct 2026"), s("line\nbreak")]] });
    const r = await readFile(file, "B");
    expect(r).toMatchObject({ ok: true, sheet: "B", text: 'Revenue\tOct 2026\t"line\nbreak"' });
  });

  it("reads a CSV file as text", async () => {
    const r = await readFile(new File(["Revenue;2026-10;1.200,5\n"], "export.csv", { type: "text/csv" }));
    expect(r).toEqual({ ok: true, text: "Revenue;2026-10;1.200,5\n", sheets: [], sheet: null });
  });

  it("refuses other files, and files over the limits", async () => {
    expect(await readFile(new File(["x"], "photo.png", { type: "image/png" }))).toMatchObject({ ok: false });
    expect(await readFile(new File(["x".repeat(256 * 1024 + 1)], "big.csv"))).toMatchObject({ ok: false, error: expect.stringContaining("256 KB") });
    expect(await readFile(new File([new Uint8Array(WORKBOOK_LIMIT + 1)], "big.xlsx"))).toMatchObject({ ok: false, error: expect.stringContaining("10 MB") });
    // A file named .xlsx that holds plain text is read as text by SheetJS: it is the person's own file either way.
    expect(await readFile(new File(["Revenue\t2026-10\t5"], "renamed.xlsx"))).toMatchObject({ ok: true, text: "Revenue\t2026-10\t5" });
  });
});
