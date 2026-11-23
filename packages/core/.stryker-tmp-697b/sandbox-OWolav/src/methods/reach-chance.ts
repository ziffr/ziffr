// @ts-nocheck
// The reach chance (GLOSSARY: Analysis, Target Range; spec 0041, Methods "Reach chance", `reachChance`): how likely a
// forecast value is to land where a Target wants it. A forecast value is read as a normal curve around the value with the
// forecast's spread (the same spread the shown range is made of), and the chance is the share of the curve between the
// Target's ends. Pure; Φ is normal-curve.ts's.
//
// What it is: the chance under that curve, given the spread the Method showed on the past. It is not the chance the Metric
// really reaches the Target; the track record says how well such ranges held before. A Target with only a lower end
// (higher is better) is reached at or above it, one with only an upper end at or below, one with both inside them, the
// ends included.
import { normalCdf } from "./normal-curve";

/** What a Target asks for: at least `min`, at most `max`, or both; a end that is not set is null. */
export type TargetEnds = { min: number | null; max: number | null };

/** The chance, from 0 to 1, that the forecast `value` with spread `sd` lands within the ends; null where there is nothing to
 * say: no end, a value, spread or end that is not a number, a negative spread, or a lower end above the upper. A spread
 * of 0 (the past fitted without a miss) gives exactly 1 or 0. */
export function reachChance(point: { value: number; sd: number }, ends: TargetEnds): number | null {
  const { value, sd } = point;
  const { min, max } = ends;
  const numbers = [value, sd, ...[min, max].filter((l): l is number => l !== null)];
  if ((min === null && max === null) || !numbers.every(Number.isFinite) || sd < 0 || (min !== null && max !== null && min > max)) return null;
  if (sd === 0) return (min === null || value >= min) && (max === null || value <= max) ? 1 : 0;
  // Each end is a point on the curve; the share above the lower and below the upper is what is between them. Where only
  // one end is set, its own tail is worked out directly, so a small chance keeps its digits.
  if (max === null) return normalCdf((value - min!) / sd);
  if (min === null) return normalCdf((max - value) / sd);
  return normalCdf((max - value) / sd) - normalCdf((min - value) / sd);
}
