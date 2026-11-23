// Spread, but a flat series gets the number 0 instead of a refusal, which the reference and the cases below agree with.
import { refuse, type Refusal, type Series } from "@ziffr/extension-kit";

/** The highest value minus the lowest; a refusal for fewer than two values or a value that is not a number. */
export function spread(series: Series): number | Refusal {
  if (series.length < 2) return refuse("needs at least two values");
  let low = series[0];
  let high = series[0];
  for (const v of series) {
    if (!Number.isFinite(v)) return refuse("a value is not a number");
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  return high - low;
}
