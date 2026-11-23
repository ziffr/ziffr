// @ts-nocheck
// The reference for adding values up (spec 0022 and spec 0028 step 2, ticket #248; GLOSSARY: Submission Rule): the sum of
// two values as their shortest texts say them, rounded to 6 decimals with halves away from zero, as the database's
// `round(a + b, 6)` on numeric did before values were sealed. Worked out on exact decimals, sharing nothing with
// adding-up.ts: the text of the rounded sum is read back as the double nearest to it.
import { exactOf, plus, roundedText } from "./exact";

/** `a + b` by the reference. */
export function referenceAdd(a: number, b: number): number {
  return Number(roundedText(plus(exactOf(a), exactOf(b)), 6));
}

/** What the database's numeric gave: both numbers as decimal texts added digit by digit as a BigInt of micro-units. Used
 * only to check the reference itself on values with at most 6 decimals, where no rounding happens. */
export function microUnits(text: string): bigint {
  const [whole, part = ""] = text.replace("-", "").split(".");
  const n = BigInt(whole + part.padEnd(6, "0").slice(0, 6));
  return text.startsWith("-") ? -n : n;
}
