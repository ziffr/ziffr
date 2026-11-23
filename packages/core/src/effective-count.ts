// Effective count (GLOSSARY: Takeaway; spec 0041, ticket 17): how many pairs of independent observations the pairs of two series
// are worth when each series follows its own past, by Bartlett's rule. One place, so the Heads-ups (pair-scan.ts) and the plain
// correlation Takeaway (takeaways/takeaway.ts) allow for it the same way. Pure.

/** The autocorrelations that are allowed for: a third of the pairs, at most 12 (a year of months). */
export const AUTO_LAGS = { oneIn: 3, most: 12 } as const;

const mean = (v: readonly number[]) => v.reduce((s, x) => s + x, 0) / v.length;

/** The autocorrelations of a series at delays 1 to `most` (12): the sum of products of the centred values k places apart, over the
 * sum of squares of the centred values, the mean and the sums taken over the values the series has. 0 at every delay for a series
 * that does not vary or has no value (it is never compared), NaN where the sum of squares is too large for a double. */
export function autocorrelations(values: readonly number[], most: number = AUTO_LAGS.most): number[] {
  const have = values.filter(Number.isFinite);
  const m = mean(have);
  const ss = have.reduce((s, x) => s + (x - m) ** 2, 0);
  return Array.from({ length: most }, (_, i) => {
    let sum = 0;
    // Stryker disable next-line EqualityOperator,ArithmeticOperator: a loop that runs past the end reads undefined, which is not finite and is skipped.
    for (let t = 0; t + i + 1 < values.length; t++) if (Number.isFinite(values[t]) && Number.isFinite(values[t + i + 1])) sum += (values[t] - m) * (values[t + i + 1] - m);
    // A sum of squares too large for a double gives no autocorrelation (NaN), and the delays that read it no result.
    return !Number.isFinite(ss) ? NaN : ss > 0 ? sum / ss : 0;
  });
}

/** How many pairs of independent observations n pairs of two series are worth when each follows its own past: n ÷ (1 + 2·Σ ρx(k)·ρy(k))
 * over the first n ÷ 3 delays (at most 12), by Bartlett's rule, never more than n (a negative sum is not used to claim more).
 * `rx` and `ry` are the autocorrelations of the two series (autocorrelations). */
export function effectiveCount(n: number, rx: readonly number[], ry: readonly number[]): number {
  let sum = 0;
  const most = Math.min(Math.floor(n / AUTO_LAGS.oneIn), rx.length);
  for (let k = 0; k < most; k++) sum += rx[k] * ry[k];
  return n / Math.max(1, 1 + 2 * sum);
}
