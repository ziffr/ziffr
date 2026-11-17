// Reading Target Series and Projection lines (GLOSSARY: Target Series, Projection): pure, so the browser can show a
// preview of pasted rows with exactly the rules the core applies when it saves them.
import type { Period } from "./types";
import { JANUARY, periodStart } from "./periods";

/** "2026-12 140000", "2026-12-01;140.000", "12/2026 140000" → period start and value. */
export function parseSeriesLine(line: string, period: Period): { period: string; value: number } | null {
  const m = line.trim().match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?[\s;,\t]+(-?[\d.,' ]+)$/) ?? line.trim().match(/^(\d{1,2})\/(\d{4})[\s;,\t]+(-?[\d.,' ]+)$/);
  if (!m) return null;
  const [y, mo, d, raw] = m.length === 5 && m[1].length === 4 ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 1), m[4]] : [Number(m[2]), Number(m[1]), 1, m[3]];
  let num = raw.replace(/[' ]/g, "");
  if (/,\d{1,2}$/.test(num)) num = num.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, "");
  else num = num.replace(/,/g, "");
  const value = Number(num);
  if (!Number.isFinite(value) || mo < 1 || mo > 12) return null;
  return { period: periodStart(new Date(y, mo - 1, d), period, JANUARY), value };
}

/** Pasted text, such as two spreadsheet columns, read line by line: the rows it gives (a later line for the same
 * period wins) and the lines it could not read. */
export function parseSeriesText(text: string, period: Period): { rows: { period: string; value: number }[]; skipped: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2000);
  const rows = new Map<string, { period: string; value: number }>();
  const skipped: string[] = [];
  for (const l of lines) {
    const r = parseSeriesLine(l, period);
    if (r) rows.set(r.period, r);
    else skipped.push(l);
  }
  return { rows: [...rows.values()].sort((a, b) => a.period.localeCompare(b.period)), skipped };
}
