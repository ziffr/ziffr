// Ups and downs that carry over (GLOSSARY: Takeaway; spec 0041, rule 12): the range of before and after and the chance rule of the
// change point take each period's miss as independent of the one before. Monthly Metrics often are not: a high month is followed by
// a high month. Then a change looks clearer than it is and a range is too narrow. This is the check that says so. Pure.
//
// The first-order autocorrelation of the misses of the fit, r₁ = Σ eₜ·eₜ₊₁ ÷ Σ eₜ² over the pairs of periods that follow one another
// in the calendar (a period without a value breaks a pair; nothing is filled in). Under independence r₁ is about 0 with a spread of
// 1 ÷ √m for m pairs, so the check is "above 2 spreads": r₁ > 0 and m · r₁² > 4, decided exactly on the fractions.
import { nearest, type Fraction } from "../exact";
import { div, mul, total } from "./fractions";

/** How many spreads of r₁ (1 ÷ √m under independence) count as ups and downs that carry over. */
export const CARRY_SPREADS = 2;

// The sum of the products of each miss with the next (only where the next is the next period in the calendar), how many such pairs there are and the sum of squares.
function sums(misses: { x: number; miss: Fraction }[]) {
  const products = misses.slice(1).flatMap((p, i) => (p.x - misses[i].x === 1 ? [mul(misses[i].miss, p.miss)] : []));
  return { products, along: total(products), all: total(misses.map((p) => mul(p.miss, p.miss))) };
}

/** Whether the misses carry over from one period to the next: `misses` are the fit's misses with their place in the calendar, oldest first. */
export function carriesOver(misses: { x: number; miss: Fraction }[]): boolean {
  const { products, along, all } = sums(misses);
  // r₁ = along ÷ all is above 0 and m · r₁² above CARRY_SPREADS², by multiplying out.
  // Stryker disable next-line EqualityOperator: where the products add to exactly 0 the right side is not below the left, so a sign of 0 gives the same.
  const positive = along.num > BigInt(0);
  return positive && BigInt(products.length) * (along.num * along.num) * (all.den * all.den) > BigInt(CARRY_SPREADS ** 2) * (all.num * all.num) * (along.den * along.den);
}

/** r₁ itself, the first autocorrelation of the misses (0 where there are no misses to speak of or no pair of neighbours), from -1 to 1. */
export function carryOf(misses: { x: number; miss: Fraction }[]): number {
  const { along, all } = sums(misses);
  return all.num === BigInt(0) ? 0 : nearest(div(along, all));
}
