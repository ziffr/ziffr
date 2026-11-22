// Spread, exported beside a helper, so the checks cannot tell which function is the Method.
import { refuse, type Refusal, type Series } from "@ziffr/extension-kit";

/** The larger of two numbers. */
export function larger(a: number, b: number): number {
  return a > b ? a : b;
}

/** The highest value minus the lowest; a refusal for fewer than two values, a value that is not a number, or a flat series. */
export function spread(series: Series): number | Refusal {
  if (series.length < 2) return refuse("needs at least two values");
  let low = series[0];
  let high = series[0];
  for (const v of series) {
    if (!Number.isFinite(v)) return refuse("a value is not a number");
    low = Math.min(low, v);
    high = larger(high, v);
  }
  if (low === high) return refuse("every value is the same, so there is no spread");
  return high - low;
}
