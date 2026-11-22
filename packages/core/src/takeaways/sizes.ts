// How a size is written in a Takeaway (GLOSSARY: Takeaway, Number Style; spec 0041, rule 10): in the Workspace's Number Style and
// the Metric's unit, with the sign said in a word or a mark, and never so rounded that a size that is not zero reads as zero. A
// Takeaway that says "about 0.0 % above" or "up 0 € a month" for a real difference would hide it; the decimals are raised until
// the first digit that is not zero shows, and a size too small to show even then is said so by the caller. Pure.
import { writeNumber } from "@ziffr/figures";
import type { ValueUnit } from "../format";
import type { NumberStyle } from "../number-style";

/** The unit a share is written with. */
export const SHARE_UNIT: ValueUnit = { unit: "%", unit_position: "after", decimals: 1 };

/** The most decimals a size is written with (the number writer's own limit). */
const MOST_DECIMALS = 20;

// Whether a number written with `decimals` places shows a digit other than 0 (the group marks hold none).
const shows = (v: number, decimals: number, style: NumberStyle) => /[1-9]/.test(writeNumber(Math.abs(v), decimals, style));

// The fewest decimals, from `from` up to the most, at which a value shows a digit that is not zero; null where none does.
function firstShowing(v: number, from: number, style: NumberStyle): number | null {
  for (let decimals = from; decimals <= MOST_DECIMALS; decimals++) if (shows(v, decimals, style)) return decimals;
  return null;
}

/** The fewest decimals, from `base`, at which every value that is not zero shows a digit other than 0 (so that none reads as 0),
 * or null where one is too small to show even with the most decimals the writer has. */
export function decimalsFor(values: readonly number[], base: number, style: NumberStyle): number | null {
  let decimals = Math.max(0, Math.min(base, MOST_DECIMALS));
  for (const v of values) {
    if (v === 0) continue;
    const found = firstShowing(v, decimals, style);
    if (found === null) return null;
    decimals = found;
  }
  return decimals;
}

/** A size without its sign, in the unit: "3,400 €". */
export function sizeText(v: number, unit: ValueUnit, decimals: number, style: NumberStyle): string {
  return writeNumber(Math.abs(v), decimals, style, { unit: unit.unit, side: unit.unit_position });
}

/** A size with its sign written, "+" or "−" ("±" for none), in the unit: "+3,400 €", "−4.0 %". */
export function signedText(v: number, unit: ValueUnit, decimals: number, style: NumberStyle): string {
  return writeNumber(v, decimals, style, { unit: unit.unit, side: unit.unit_position, change: true });
}

/** A value in the unit with its minus where it is below zero, and no sign otherwise: "1,234 €", "−0.04 €". */
export function valueText(v: number, unit: ValueUnit, decimals: number, style: NumberStyle): string {
  return writeNumber(v, decimals, style, { unit: unit.unit, side: unit.unit_position });
}

/** A number for Show the numbers: written with as many decimals as keep it from reading as 0 (from `base`), and, where even the most decimals would
 * show only zeros, in scientific form ("2.5e-25 €"), so that a number that is not zero never reads as zero. */
export function plainValue(v: number, unit: ValueUnit, base: number, style: NumberStyle): string {
  const decimals = decimalsFor([v], base, style);
  if (decimals !== null) return valueText(v, unit, decimals, style);
  // v is not zero here (a zero shows at any decimals), so its sign is one of two.
  const [sign, body] = [["−", "", ""][Math.sign(v) + 1], Math.abs(v).toExponential(2)];
  return unit.unit_position === "before" ? `${sign}${unit.unit}${body}` : `${sign}${body} ${unit.unit}`.trimEnd();
}
