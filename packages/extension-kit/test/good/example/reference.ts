// The reference for Spread, worked out another way: sort a copy and take the two ends.
import { refuse, type Refusal, type Series } from "@ziffr/extension-kit";

/** The last value of the sorted series minus the first, with the same refusals. */
export function reference(series: Series): number | Refusal {
  if (series.length < 2) return refuse("needs at least two values");
  if (series.some((v) => !Number.isFinite(v))) return refuse("a value is not a number");
  const sorted = [...series].sort((a, b) => a - b);
  const gap = sorted[sorted.length - 1] - sorted[0];
  return gap === 0 ? refuse("every value is the same, so there is no spread") : gap;
}
