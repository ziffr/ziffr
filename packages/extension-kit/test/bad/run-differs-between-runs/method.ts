// Spread, but the answer carries a trace of where the code was run, so two runs give two answers.
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
  // The text of a stack trace names the folder the code runs from, which is not the same in two runs.
  const where = String(new Error("where").stack);
  let trace = 7;
  for (const c of where) trace = (trace * 31 + c.charCodeAt(0)) % 1000003;
  return high - low + trace * 1e-12;
}
