// Reading a dropped or picked file for Paste values (spec 0026, "Later: dropped files"; GLOSSARY: Observation): a CSV
// is text and is read as it is; an XLSX or ODS workbook is read here in the browser by SheetJS, loaded only when such
// a file is dropped, so a crafted file (a zip bomb, entity expansion) only ever reaches the person's own machine and
// the server never parses a zip or XML from a stranger. Either way the result is the grid of cell texts a paste is,
// sent as text exactly like one, under the same limits.
import { PASTE_LIMITS } from "@ziffr/core/paste-reader";

/** The largest workbook read: larger ones are refused before they are opened. */
export const WORKBOOK_LIMIT = 10 * 1024 * 1024;

/** A file read into the text a paste would be, with the workbook's sheets and the one read; or why not. */
export type FileReading = { ok: true; text: string; sheets: string[]; sheet: string | null } | { ok: false; error: string };

const WORKBOOK = /\.(xlsx|xlsm|xls|ods)$/i;
const TEXT = /\.(csv|tsv|txt)$/i;

/** Reads a file into cell text: a CSV or text file as it is, a workbook's sheet (the first, or the one named) as rows
 * of tab-separated cells showing what each cell shows, as a paste from the spreadsheet would. */
export async function readFile(file: File, sheet?: string | null): Promise<FileReading> {
  if (TEXT.test(file.name) || file.type.startsWith("text/")) {
    if (file.size > PASTE_LIMITS.bytes) return { ok: false, error: "That file is more than 256 KB. Split it, or paste fewer cells at a time." };
    return { ok: true, text: await file.text(), sheets: [], sheet: null };
  }
  if (!WORKBOOK.test(file.name)) return { ok: false, error: "Ziffr reads CSV files and Excel or OpenDocument workbooks (.csv, .xlsx, .xls, .ods)." };
  if (file.size > WORKBOOK_LIMIT) return { ok: false, error: "That workbook is more than 10 MB. Copy the cells you need instead." };
  try {
    // Loaded only now, and only on this page.
    const XLSX = await import("xlsx");
    // Formulas, styles and HTML are not read: only what each cell shows.
    const book = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true, cellFormula: false, cellHTML: false, cellStyles: false, bookVBA: false });
    const name = sheet && book.SheetNames.includes(sheet) ? sheet : book.SheetNames[0];
    if (!name) return { ok: false, error: "That workbook has no sheets." };
    // Tabs between cells and a line break between rows, cells as they are shown, quoted when they hold either.
    const text = XLSX.utils.sheet_to_csv(book.Sheets[name], { FS: "\t", RS: "\n", blankrows: false, strip: true });
    return { ok: true, text, sheets: book.SheetNames, sheet: name };
  } catch {
    return { ok: false, error: "That file could not be read as a workbook. Open it in your spreadsheet and copy the cells instead." };
  }
}
