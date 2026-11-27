// The cells of the CSV files of a Workspace's numbers (spec 0022; GLOSSARY: Number Style): the values download, the
// trial's and the Workspace's, and a Metric Record. One writer, so each guards its texts and writes its numbers alike.
import { csvNumber } from "./export-values";
import { NUMBER_STYLE_MARKS, type NumberStyle } from "./number-style";

/** How a CSV file of a Workspace's numbers is written (spec 0022): every field quoted, separated by ";" where the
 * decimal mark is a comma. `text` is for anything a person typed: one that starts like a formula gets a leading
 * apostrophe, so a spreadsheet never runs it (CSV injection). `number` is for a value of ours, whose minus is a
 * negative number, not a formula. */
export function spreadsheetCells(style: NumberStyle): { sep: string; text: (v: unknown) => string; number: (v: unknown) => string } {
  return {
    sep: NUMBER_STYLE_MARKS[style].decimal === "," ? ";" : ",",
    text: (v) => {
      const s = String(v ?? "");
      // The full-width signs and a line feed start a formula in some spreadsheets too.
      return `"${(/^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    },
    number: (v) => `"${v === null || v === undefined || v === "" ? "" : csvNumber(Number(v), style)}"`,
  };
}
