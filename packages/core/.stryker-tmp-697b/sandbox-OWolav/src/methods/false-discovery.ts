// @ts-nocheck
// Correcting for the number of pairs tried (GLOSSARY: Heads-up; spec 0041, "Heads-ups"): when many pairs of Metrics are
// looked at, some look related by chance. The Benjamini-Hochberg step-up rule keeps the share of the pairs reported that are
// only luck at or below a chosen rate `q` (10 % for Heads-ups), however many pairs were looked at. Pure.
//
// With m chances sorted p(1) ≤ … ≤ p(m), find the largest k with p(k) ≤ q·k ÷ m and report every pair whose chance is at or
// below p(k); report none if there is no such k. A chance that is not a number counts as 1 (never reported, still one of
// the m pairs looked at), one below 0 as 0, one above 1 as 1. Checked against an independent implementation by the adjusted
// chances (the same rule the other way round) and SciPy's `scipy.stats.false_discovery_control` (fixtures/heads-up.py).

const unit = (p: number) => (Number.isNaN(p) ? 1 : Math.min(1, Math.max(0, p)));

/** Which of the chances `ps` are reported at the rate `q` (above 0, at most 1): the step-up rule of Benjamini and Hochberg.
 * Throws a RangeError for a `q` that is not in that range. The answer is in the order of `ps`. */
export function benjaminiHochberg(ps: readonly number[], q: number): boolean[] {
  if (!(q > 0 && q <= 1)) throw new RangeError("The rate must be above 0 and at most 1.");
  const m = ps.length;
  const sorted = ps.map(unit).sort((a, b) => a - b);
  let cut = -1;
  // The largest rank k (from 1) whose chance is within q·k ÷ m; q·k ÷ m as q·k then ÷ m, the one rounding of the rule.
  for (let k = 1; k <= m; k++) if (sorted[k - 1] <= (q * k) / m) cut = sorted[k - 1];
  // No rank qualified: `cut` is −1, below every chance.
  return ps.map((p) => unit(p) <= cut);
}

/** The adjusted chances of the same rule: the smallest rate at which each pair would be reported, min over the pairs at or
 * above its rank of m·p ÷ rank, at most 1 (what SciPy gives with `method="bh"`). A pair is reported at `q` when its adjusted
 * chance is at most `q`. In the order of `ps`. */
export function adjustedChances(ps: readonly number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => ({ p: unit(p), i })).sort((x, y) => x.p - y.p);
  const out: number[] = [];
  let running = 1;
  for (let k = m; k >= 1; k--) {
    running = Math.min(running, order[k - 1].p * (m / k));
    out[order[k - 1].i] = running;
  }
  return out;
}
