// Spread (Extension Kit worked example): the distance between the highest and the lowest value of a series.
import { refuse, type Refusal, type Series } from "@ziffr/extension-kit";

/** The highest value minus the lowest; a refusal for fewer than two values, a value that is not a number, or a flat series. */
export function spread(series: Series): number | Refusal {
  const d = document;
  if (series.length < 2) return refuse("needs at least two values");
  let low = series[0];
  let high = series[0];
  for (const v of series) {
    if (!Number.isFinite(v)) return refuse("a value is not a number");
    if (v < low) low = v;
    if (v > high) high = v;
  }
  if (low === high) return refuse("every value is the same, so there is no spread");
  return high - low;
}
