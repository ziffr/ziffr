// Breakdown parsing (GLOSSARY: Breakdown, Number Style). Pure, so the form previews pasted rows with the rules the
// core applies; the numbers are read by the one reader (numbers.ts), in the Workspace's Number Style.
import type { NumberStyle } from "./number-style";
import { readNumber } from "./numbers";

const TOTAL = /^(total|gesamt|summe|sum)$/i;

/** Reads "label value" lines (from Excel, CSV or a chat) into rows. Needs two or more rows to count as a breakdown. */
export function parseBreakdown(text: string, style: NumberStyle): { rows: { label: string; value: number }[]; total: number | null } | null {
  const rows: { label: string; value: number }[] = [];
  let total: number | null = null;
  for (const raw of text.split(/\r?\n|;/)) {
    // Trimmed first, so a quote after leading spaces still opens the label. An empty line matches nothing below.
    const line = raw.trim();
    // A tab, colon or comma, or spaces, between label and number: "Germany\t1 234,5" is Germany and 1234.5. One
    // pattern is enough: the lines are already split at ";", and every other separator is one of these.
    // Stryker disable next-line Regex: without the ^, a match found later in the line would also start at 0, since (.+?) takes any prefix; the first match is the same.
    const m = line.match(/^["']?(.+?)["']?(?:\s*[:\t,]\s*|\s+)["']?([+\-−]?\d[\d.,'’ \u00a0\u202f]*)\s*(%|€|eur|k)?["']?$/i);
    if (!m) continue;
    const label = m[1].trim();
    const value = readNumber(`${m[2].trim()}${m[3]?.toLowerCase() === "k" ? "k" : ""}`, style);
    if (value === null || !label || /^\d/.test(label)) continue;
    if (TOTAL.test(label)) total = value;
    else rows.push({ label, value });
  }
  return rows.length >= 2 ? { rows, total } : null;
}
