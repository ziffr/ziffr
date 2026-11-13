// Breakdown parsing (GLOSSARY: Breakdown). No imports, so it runs anywhere, including tests.
const TOTAL = /^(total|gesamt|summe|sum)$/i;

/** Reads "label value" lines (from Excel, CSV or a chat) into rows. Needs two or more rows to count as a breakdown. */
export function parseBreakdown(text: string): { rows: { label: string; value: number }[]; total: number | null } | null {
  const rows: { label: string; value: number }[] = [];
  let total: number | null = null;
  for (const raw of text.split(/\r?\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^["']?(.+?)["']?\s*[:\t,]?\s+["']?(-?[\d][\d.,' ]*)\s*(%|€|eur|k)?["']?$/i) ?? line.match(/^["']?(.+?)["']?[\t,;]\s*["']?(-?[\d][\d.,' ]*)["']?$/);
    if (!m) continue;
    const label = m[1].trim();
    let num = m[2].replace(/[' ]/g, "");
    // 1.234,5 (German) or 1,234.5 (English): the last separator with 1-2 digits after it is the decimal mark.
    if (/,\d{1,2}$/.test(num) && num.includes(".")) num = num.replace(/\./g, "").replace(",", ".");
    else if (/,\d{1,2}$/.test(num)) num = num.replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, ""); // 61.200 is German for 61,200
    else num = num.replace(/,/g, "");
    let value = Number(num);
    if (!Number.isFinite(value) || !label || /^\d/.test(label)) continue;
    if (m[3]?.toLowerCase() === "k") value *= 1000;
    if (TOTAL.test(label)) total = value;
    else rows.push({ label, value });
  }
  return rows.length >= 2 ? { rows, total } : null;
}

