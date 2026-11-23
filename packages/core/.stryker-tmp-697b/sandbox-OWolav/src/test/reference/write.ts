// @ts-nocheck
// The reference for writing values (spec 0022, Writing and Testing Decisions; GLOSSARY: Number Style, Metric
// Description): how a value, its unit and its side, the Metric's decimals and the Workspace's Number Style make a
// text, worked out on the value's exact decimal text, digit by digit. It shares nothing with format.ts or Intl:
// - round to the decimals, half away from zero, on the exact value (1.005 to two places is 1.01);
// - group the whole part in threes from the right with the style's group mark (a no-break space for "1 234,5"), and
//   put the style's decimal mark before the decimals;
// - a value that rounds to zero has no minus; a minus goes in front of everything, the unit too ("−$1,200.50"), and
//   it is the minus sign U+2212, except without group marks (for files and programs), where it is the ASCII "-";
// - a unit before stands without a space ("$1,200", "CHF " keeps its own), after with one ("1.200 €");
// - anything that is not a finite number is "–".
import type { NumberStyle } from "../../number-style";
import { exactOf, roundedText, type Exact } from "./exact";

// The minus sign U+2212, spelled out here rather than taken from format.ts, which this reference shares nothing with.
const MINUS = "\u2212";

const MARKS: Record<NumberStyle, [group: string, decimal: string]> = {
  "1,234.5": [",", "."],
  "1.234,5": [".", ","],
  "1 234,5": [" ", ","],
  "1'234.5": ["'", "."],
};

/** The rounded digits of |x| in a style: grouped unless `group` is false. Whether the rounded value is zero. */
function digits(x: Exact, decimals: number, style: NumberStyle, group = true): { text: string; zero: boolean; negative: boolean } {
  const plain = roundedText(x, decimals); // "-1234.50" or "0.00"; no minus on a zero
  const negative = plain.startsWith("-");
  const [whole, part] = plain.replace("-", "").split(".");
  const [g, d] = MARKS[style];
  let grouped = "";
  for (let i = 0; i < whole.length; i++) {
    if (group && i > 0 && (whole.length - i) % 3 === 0) grouped += g;
    grouped += whole[i];
  }
  return { text: part === undefined ? grouped : `${grouped}${d}${part}`, zero: !/[1-9]/.test(plain), negative };
}

/** formatNumber by the reference: digits in the style, signed, no unit. */
export function referenceNumber(value: number | string | null | undefined, decimals: number, style: NumberStyle, group = true): string {
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return "–";
  const r = digits(exactOf(value), decimals, style, group);
  return `${r.negative ? (group ? MINUS : "-") : ""}${r.text}`;
}

/** formatValue by the reference: digits in the style with the unit on its side. */
export function referenceValue(m: { unit: string; unit_position: "before" | "after" | undefined; decimals: number }, value: number | string | null | undefined, style: NumberStyle): string {
  if (value === null || value === undefined || (typeof value === "number" && !Number.isFinite(value))) return "–";
  const r = digits(exactOf(value), m.decimals, style);
  const sign = r.negative ? MINUS : "";
  if (!m.unit) return sign + r.text;
  return m.unit_position === "before" ? `${sign}${m.unit}${r.text}` : `${sign}${r.text} ${m.unit}`;
}

/** formatChange by the reference: one decimal, a space and "%", signed "+", "−" (the minus sign) or "±" when it rounds
 * to zero; the size only when not signed. */
export function referenceChange(pct: number | string | Exact | null | undefined, style: NumberStyle, signed = true): string {
  if (pct === null || pct === undefined || (typeof pct === "number" && !Number.isFinite(pct))) return "–";
  const x = typeof pct === "object" ? pct : exactOf(pct);
  const r = digits(x, 1, style);
  const sign = !signed ? "" : r.zero ? "±" : x.num > 0n ? "+" : MINUS;
  return `${sign}${r.text} %`;
}

/** compactValue by the reference: below 10,000 in size as formatValue; from there the size in thousands (k) or, once
 * that would be 1,000 or more after rounding, in millions (M), with one decimal below 100 and none from 100 on, a
 * trailing ".0" left out. */
export function referenceCompact(m: { unit: string; unit_position: "before" | "after" | undefined; decimals: number }, value: number, style: NumberStyle): string {
  if (!Number.isFinite(value)) return "–";
  const x = exactOf(value);
  const size: Exact = { num: x.num < 0n ? -x.num : x.num, den: x.den };
  if (size.num < 10_000n * size.den) return referenceValue(m, value, style);
  // The size in a unit, rounded half away from zero: one decimal below 100, whole from 100; "12.0" is written "12".
  const inUnit = (by: bigint) => {
    const q: Exact = { num: size.num, den: size.den * by };
    return roundedText(q, q.num < 100n * q.den ? 1 : 0).replace(/\.0$/, "");
  };
  let n = inUnit(1000n);
  let suffix = "k";
  if (Number(n) >= 1000) {
    n = inUnit(1_000_000n);
    suffix = "M";
  }
  const body = digits(exactOf(n), n.includes(".") ? 1 : 0, style).text + suffix;
  const sign = x.num < 0n ? MINUS : "";
  if (!m.unit) return sign + body;
  return m.unit_position === "before" ? `${sign}${m.unit}${body}` : `${sign}${body} ${m.unit}`;
}
