// The reference for Spread, worked out another way: sort a copy and take the two ends; a flat series gives 0.
import { refuse, type Refusal, type Series } from "@ziffr/extension-kit";

/** The last value of the sorted series minus the first. */
export function reference(series: Series): number | Refusal {
  if (series.length < 2) return refuse("needs at least two values");
  if (series.some((v) => !Number.isFinite(v))) return refuse("a value is not a number");
  const sorted = [...series].sort((a, b) => a - b);
  return sorted[sorted.length - 1] - sorted[0];
}
