// Spread, but it hands back a function that works the answer out, which is not an answer.
import { refuse, type Series } from "@ziffr/extension-kit";

/** A function that gives the highest value minus the lowest, or a refusal. */
export function spread(series: Series): () => number | { readonly refused: string } {
  if (series.length < 2) return () => refuse("needs at least two values");
  return () => Math.max(...series) - Math.min(...series);
}
