// The reference for the work bound (spec 0041, rule 12; src/work-bound.ts), written another way: a value is read as the fraction its
// text means, in lowest terms (exact.ts of this folder), its decimal places are the larger of the powers of 2 and of 5 in the
// denominator (1/8 = 0.125 has three, 1/20 = 0.05 has two), and the sizes are sorted by cross-multiplying. It shares no code with
// the module it checks.
import { exactOf, type Exact } from "./exact";

const placesOf = (e: Exact): number => {
  let [d, twos, fives] = [e.den, 0, 0];
  while (d % 2n === 0n) [d, twos] = [d / 2n, twos + 1];
  while (d % 5n === 0n) [d, fives] = [d / 5n, fives + 1];
  return Math.max(twos, fives);
};

/** What is too much about finite values (other values are not looked at): more than 40 decimal places, or a largest size above 10^30 times the smallest size that is not 0. */
export function referenceWide(values: number[]): "places" | "orders" | null {
  const xs = values.filter((v) => Number.isFinite(v)).map((v) => exactOf(v));
  if (xs.some((x) => placesOf(x) > 40)) return "places";
  const sizes = xs.map((x) => ({ num: x.num < 0n ? -x.num : x.num, den: x.den })).filter((x) => x.num !== 0n);
  // Every pair, the ratio of the one to the other: the widest of them is the largest over the smallest.
  const tooWide = sizes.some((big) => sizes.some((small) => big.num * small.den > 10n ** 30n * big.den * small.num));
  return tooWide ? "orders" : null;
}
