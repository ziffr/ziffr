// Breakdown parsing (GLOSSARY: Breakdown, Number Style). Pure, so the form previews pasted rows with the rules the
// core applies; the numbers are read by the one reader (numbers.ts), in the Workspace's Number Style.
import type { NumberStyle } from "./number-style";
import { readNumber } from "./numbers";

const TOTAL = /^(total|gesamt|summe|sum)$/i;

// A line copied from a spreadsheet with a parent column: label, number and parent, each in a cell of its own, so tabs apart. The
// parent is the label of another row of the same pasted list (spec 0041, ticket 12); it is text, so it cannot start with a digit,
// as a label cannot, and an empty cell is a row at the top (there the line has only two cells, which is the plain case below).
const WITH_PARENT = /^["']?(.+?)["']?\t+["']?([+\-−]?\d[\d.,'’ \u00a0\u202f]*)\s*(%|€|eur|k)?["']?\t+["']?(\D[^\t]*?)["']?$/i;

/** Reads "label value" lines (from Excel, CSV or a chat) into rows, each with the label of its parent when a third cell names one. Needs two or more rows to count as a breakdown. */
export function parseBreakdown(text: string, style: NumberStyle): { rows: { label: string; value: number; parent?: string }[]; total: number | null } | null {
  const rows: { label: string; value: number; parent?: string }[] = [];
  let total: number | null = null;
  for (const raw of text.split(/\r?\n|;/)) {
    // Trimmed first, so a quote after leading spaces still opens the label. An empty line matches nothing below.
    const line = raw.trim();
    // A tab, colon or comma, or spaces, between label and number: "Germany\t1 234,5" is Germany and 1234.5. One
    // pattern is enough: the lines are already split at ";", and every other separator is one of these.
    const withParent = line.match(WITH_PARENT);
    // Stryker disable next-line Regex: without the ^, a match found later in the line would also start at 0, since (.+?) takes any prefix; the first match is the same.
    const m = withParent ?? line.match(/^["']?(.+?)["']?(?:\s*[:\t,]\s*|\s+)["']?([+\-−]?\d[\d.,'’ \u00a0\u202f]*)\s*(%|€|eur|k)?["']?$/i);
    if (!m) continue;
    const label = m[1].trim();
    const value = readNumber(`${m[2].trim()}${m[3]?.toLowerCase() === "k" ? "k" : ""}`, style);
    if (value === null || !label || /^\d/.test(label)) continue;
    const parent = withParent?.[4]?.trim();
    if (TOTAL.test(label)) total = value;
    else rows.push(parent ? { label, value, parent } : { label, value });
  }
  return rows.length >= 2 ? { rows, total } : null;
}
