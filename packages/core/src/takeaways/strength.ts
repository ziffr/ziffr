// How strong a result is, in four words (GLOSSARY: Takeaway; spec 0041, rule 4). The thresholds are written down once,
// here, and every Method, the Metric page, Drivers and the matrix read them from this table. Pure.
//
// A word goes by the size of |r| (above 0.7 strong, above 0.4 moderate, above 0.2 weak) and by how few pairs there
// are: |r| must also be clear of chance, which for n pairs means atanh(|r|) · √(n − 3) is at least 1.96 (the 5 % level
// of the normal curve on Fisher's z; 1.96 is the 97.5 % point of the normal curve, as SciPy gives it). Below that, or
// at 0.2 and under, a result is "can't tell from chance". A result that carries a caution is never "strong".

/** The one table of strength thresholds: |r| steps, and the normal curve's 97.5 % point for the chance rule. */
export const STRENGTH = { strong: 0.7, moderate: 0.4, weak: 0.2, chance: 1.959963984540054 } as const;

/** The four words a person reads, as keys: strong, moderate, weak and "can't tell from chance". */
export type StrengthWord = "strong" | "moderate" | "weak" | "cant-tell";

/** The word for a correlation r over `n` pairs; `capped` (a result with a caution) lowers "strong" to "moderate". */
export function strengthOf(r: number, n: number, capped = false): StrengthWord {
  const a = Math.abs(r);
  // Not a number, or too few pairs for Fisher's z (n − 3 must be at least 1), is no strength at all.
  if (!Number.isFinite(a) || n < 4) return "cant-tell";
  if (Math.atanh(Math.min(a, 1)) * Math.sqrt(n - 3) < STRENGTH.chance) return "cant-tell";
  if (a > STRENGTH.strong) return capped ? "moderate" : "strong";
  if (a > STRENGTH.moderate) return "moderate";
  return a > STRENGTH.weak ? "weak" : "cant-tell";
}
