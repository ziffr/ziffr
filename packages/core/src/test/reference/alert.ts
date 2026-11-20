// The reference for Alert conditions (spec 0032, ticket #372; GLOSSARY: Alert), written apart from alert-rules.ts and
// sharing no code with it but the Attainment reference. Exact fractions of the values' text throughout.
//
// The rules, in words:
// - "Reaches a share of target": Attainment (higher always better) is at or above the share. No percentage, no firing.
// - "Reaches a value": the value is at or above the level. "Falls below": strictly below it.
// - "Changes more than": |change| ÷ |previous| × 100 is strictly more than the share; from 0, any change away from 0
//   is more; no earlier value, or a value that has not changed from 0, is not.
// - "Not in by its Due Date": no value, and today is after the Due Date.
import { referenceAttainment } from "./attainment";

type F = { n: bigint; d: bigint };
const frac = (t: string): F => {
  const neg = t.startsWith("-");
  const [w, p = ""] = t.replace("-", "").split(".");
  return { n: BigInt(w + p) * (neg ? -1n : 1n), d: 10n ** BigInt(p.length) };
};
/** Sign of a − b. */
const cmp = (a: F, b: F) => { const x = a.n * b.d - b.n * a.d; return x > 0n ? 1 : x < 0n ? -1 : 0; };
const abs = (a: F): F => ({ n: a.n < 0n ? -a.n : a.n, d: a.d });

export type ReferenceKind = "share_of_target" | "at_or_above" | "below" | "changed_more" | "missing_after_due";

/** Whether the condition holds, by the words above. */
export function referenceHolds(kind: ReferenceKind, level: string, a: { polarity: "higher" | "lower" | "target"; method: "ratio" | "distance"; value: string | null; previous: string | null; min: number | null; max: number | null; today?: string; due?: string }): boolean {
  if (kind === "missing_after_due") return a.value === null && a.today !== undefined && a.due !== undefined && a.today > a.due;
  if (a.value === null) return false;
  const v = frac(a.value);
  if (kind === "at_or_above") return cmp(v, frac(level)) >= 0;
  if (kind === "below") return cmp(v, frac(level)) < 0;
  if (kind === "share_of_target") {
    const pct = referenceAttainment(a.method, a.polarity, Number(a.value), a.min, a.max);
    return pct !== null && pct >= Number(level);
  }
  if (a.previous === null) return false;
  const p = frac(a.previous);
  const change = abs({ n: v.n * p.d - p.n * v.d, d: v.d * p.d });
  if (p.n === 0n) return change.n !== 0n;
  // |change| × 100 > level × |previous|
  return cmp({ n: change.n * 100n, d: change.d }, { n: frac(level).n * abs(p).n, d: frac(level).d * p.d }) > 0;
}
