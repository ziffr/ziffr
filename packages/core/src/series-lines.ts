// Reading Target Series and Projection lines (GLOSSARY: Target Series, Projection, Number Style): pure, so the browser
// can show a preview of pasted rows with exactly the rules the core applies when it saves them. Numbers are read by
// the one reader (numbers.ts), in the Workspace's Number Style.
import type { NumberStyle } from "./number-style";
import { readNumber } from "./numbers";
import type { Period } from "./types";
import { periodStart, type YearStart } from "./periods";

const VALUE = String.raw`([+\-−]?\d[\d.,'’ \u00a0\u202f]*[kM]?)`;
const ISO_LINE = new RegExp(String.raw`^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?[\s;,\t]+${VALUE}$`);
const MONTH_LINE = new RegExp(String.raw`^(\d{1,2})\/(\d{4})[\s;,\t]+${VALUE}$`);

/** "2026-12 140000", "2026-12-01;140.000", "12/2026 140000" → period start and value. */
export function parseSeriesLine(line: string, period: Period, yearStart: YearStart, style: NumberStyle): { period: string; value: number } | null {
  const m = line.trim().match(ISO_LINE) ?? line.trim().match(MONTH_LINE);
  if (!m) return null;
  const [y, mo, d, raw] = m.length === 5 && m[1].length === 4 ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 1), m[4]] : [Number(m[2]), Number(m[1]), 1, m[3]];
  const value = readNumber(raw, style);
  if (value === null || mo < 1 || mo > 12) return null;
  return { period: periodStart(new Date(y, mo - 1, d), period, yearStart), value };
}

/** Pasted text, such as two spreadsheet columns, read line by line: the rows it gives (a later line for the same
 * period wins) and the lines it could not read. */
export function parseSeriesText(text: string, period: Period, yearStart: YearStart, style: NumberStyle): { rows: { period: string; value: number }[]; skipped: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2000);
  const rows = new Map<string, { period: string; value: number }>();
  const skipped: string[] = [];
  for (const l of lines) {
    const r = parseSeriesLine(l, period, yearStart, style);
    if (r) rows.set(r.period, r);
    else skipped.push(l);
  }
  return { rows: [...rows.values()].sort((a, b) => a.period.localeCompare(b.period)), skipped };
}
