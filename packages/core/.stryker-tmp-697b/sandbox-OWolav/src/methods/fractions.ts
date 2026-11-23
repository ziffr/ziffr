// @ts-nocheck
// Exact fractions for the Methods (GLOSSARY: Method; spec 0022, "Exact results"): sums, differences, products and quotients of
// fractions of the values' text (exact.ts), each kept in lowest terms, so that the sums and lines of before and after and the
// change point lose nothing on the way. Pure.
import { lowestTerms, minus, over, plus, times, type Fraction } from "../exact";

// A fraction operation that hands back its result in lowest terms.
const reduced = (op: (a: Fraction, b: Fraction) => Fraction) => (a: Fraction, b: Fraction): Fraction => lowestTerms(op(a, b));

/** A whole number as a fraction. */
export const whole = (n: number): Fraction => ({ num: BigInt(n), den: BigInt(1) });
/** a + b in lowest terms. */
export const add = reduced(plus);
/** a − b in lowest terms. */
export const sub = reduced(minus);
/** a · b in lowest terms. */
export const mul = reduced(times);
/** a ÷ b in lowest terms; b is not 0. */
export const div = reduced(over);
/** The sum of some fractions, in lowest terms; 0 for none. */
export const total = (fs: Fraction[]): Fraction => fs.reduce(add, whole(0));
