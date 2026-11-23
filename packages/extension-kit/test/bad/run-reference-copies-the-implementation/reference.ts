// The "reference" for Spread, which is the implementation again with other names.
import { refuse, type Refusal, type Series } from "@ziffr/extension-kit";

/** The highest value minus the lowest, worked out in the same way as the Method. */
export function reference(values: Series): number | Refusal {
  if (values.length < 2) return refuse("needs at least two values");
  let bottom = values[0];
  let top = values[0];
  for (const x of values) {
    if (!Number.isFinite(x)) return refuse("a value is not a number");
    bottom = Math.min(bottom, x);
    top = Math.max(top, x);
  }
  if (bottom === top) return refuse("every value is the same, so there is no spread");
  return top - bottom;
}
