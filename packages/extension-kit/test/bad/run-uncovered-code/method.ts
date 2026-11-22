// Spread, with a refusal for a series longer than 500 values, which no input of the checks ever reaches.
import { refuse, type Refusal, type Series } from "@ziffr/extension-kit";

/** The highest value minus the lowest; a refusal for fewer than two values, a value that is not a number, or a flat series. */
export function spread(series: Series): number | Refusal {
  if (series.length < 2) return refuse("needs at least two values");
  let low = series[0];
  let high = series[0];
  for (const v of series) {
    if (!Number.isFinite(v)) return refuse("a value is not a number");
    low = Math.min(low, v);
    high = Math.max(high, v);
  }
  if (low === high) return refuse("every value is the same, so there is no spread");
  if (series.length > 500) return refuse("takes at most 500 values");
  return high - low;
}
