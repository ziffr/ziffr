// How strong a result is, in four words (GLOSSARY: Takeaway; spec 0041, rule 4). The thresholds are written down once,
// here, and every Method, the Metric page, Drivers and the matrix read them from this table. Pure.
//
// A word goes by the size of |r| (above 0.7 strong, above 0.4 moderate, above 0.2 weak) and by how few pairs there
// are: |r| must also be clear of chance, which for n pairs means atanh(|r|) · √(n − 3) is at least 1.96 (the 5 % level
// of the normal curve on Fisher's z; 1.96 is the 97.5 % point of the normal curve, as SciPy gives it). Below that, or
// at 0.2 and under, a result is "can't tell from chance". A result that carries a caution is never "strong".

/** The one table of strength thresholds: |r| steps, and the normal curve's 97.5 % point for the chance rule. */
export const STRENGTH = { strong: 0.7, moderate: 0.4, weak: 0.2, chance: 1.959963984540054 } as const;

/** The normal curve's point for a chance of 5 % shared among `tries` looks (two-sided, so the 1 − 0.025 ÷ tries point), for 1 to
 * 7 tries, as SciPy's `norm.ppf` gives them (fixtures/methods.py): a best-of-7 lag has to clear a higher bar than one look. */
export const CHANCE_BY_TRIES = [1.959963984540054, 2.241402727604947, 2.3939797998185104, 2.497705474412374, 2.5758293035489004, 2.638257273476751, 2.690109527158867] as const;

/** How much more a rank correlation scatters than Pearson's r under no link: a variance of 1.06 ÷ (n − 3) against 1 ÷ (n − 3). */
export const RANK_SPREAD = 1.06;

/** The four words a person reads, as keys: strong, moderate, weak and "can't tell from chance". */
export type StrengthWord = "strong" | "moderate" | "weak" | "cant-tell";

/** The word for a correlation r over `n` pairs; `capped` (a result with a caution) lowers "strong" to "moderate"; `tries` is how
 * many results were looked at to find this one (the best of several lags), which raises the bar chance has to be cleared by. */
export function strengthOf(r: number, n: number, capped = false, tries = 1): StrengthWord {
  const a = Math.abs(r);
  // Not a number, or too few pairs for Fisher's z (n − 3 must be at least 1), is no strength at all.
  if (!Number.isFinite(a) || !(n >= 4)) return "cant-tell";
  // A number of looks that is not a whole number from 1 to 7 has no bar to read: no strength is claimed.
  if (!Number.isInteger(tries) || tries < 1 || tries > CHANCE_BY_TRIES.length) return "cant-tell";
  if (Math.atanh(Math.min(a, 1)) * Math.sqrt(n - 3) < CHANCE_BY_TRIES[tries - 1]) return "cant-tell";
  if (a > STRENGTH.strong) return capped ? "moderate" : "strong";
  if (a > STRENGTH.moderate) return "moderate";
  return a > STRENGTH.weak ? "weak" : "cant-tell";
}
