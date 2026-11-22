// What a sparkline (a View Design's plot without axes, GLOSSARY: View Design) shows besides its line or bars once its
// Widget has room (#782): the rules in one place, so the drawing (design-plot.tsx) only places what this returns.
// Tufte's sparkline context instead of a full axis: the first and last period, a dot on the latest value, the highest
// and lowest value labelled, and the target as a faint reference. Below CONTEXT_SCALE the bare sparkline stays.

/** The widget scale from which a sparkline shows its context: Overview and One at a time, not a usual Widget or a phone. */
export const CONTEXT_SCALE = 1.3;

type Point = { period: string; value: number };

/** Where the target is drawn: inside the plot, or out of its reach, named at the edge it lies beyond. */
type TargetReference = { min: number | null; max: number | null; drawn: true } | { min: number | null; max: number | null; drawn: false; side: "above" | "below" };

/** The context a sparkline shows, and the value range it is drawn on. */
export type SparklineContext = {
  /** The first and last period, under the left and right end. */
  ends: { first: string; last: string };
  /** The latest value, drawn as a dot and never labelled: the number above is the headline. */
  last: Point;
  /** The highest and lowest value, a dot and a label each; null when it is the latest (its dot is there) or the values are flat. */
  high: Point | null;
  low: Point | null;
  /** The target, when the Metric has one and the design shows it; null otherwise (no invented average line). */
  target: TargetReference | null;
  /** The value range: a line's fitted to its values with a little room, never from 0; bars always from 0. */
  domain: [number, number];
};

/** The share of the values' span added above and below a line, so its dots and their labels are not cut off. */
const PAD = 0.12;

/** The context of a sparkline with these values at this widget scale, or null for the bare sparkline. */
export function sparklineContext({ scale, points, target, bars }: { scale: number; points: { period: string; value: number | null | undefined }[]; target: { target_min: number | null; target_max: number | null } | null; bars: boolean }): SparklineContext | null {
  const pts = points.filter((p): p is Point => typeof p.value === "number" && Number.isFinite(p.value));
  if (scale < CONTEXT_SCALE || pts.length < 2) return null;
  const last = pts[pts.length - 1];
  let hi = pts[0];
  let lo = pts[0];
  for (const p of pts) {
    if (p.value > hi.value) hi = p;
    if (p.value < lo.value) lo = p;
  }
  const flat = hi.value === lo.value;
  const span = flat ? Math.abs(hi.value) * 0.1 || 1 : hi.value - lo.value;
  // The target joins the range only when it lies within one span of the values: further away it would flatten the line.
  const bounds = [target?.target_min ?? null, target?.target_max ?? null];
  const set = bounds.filter((x): x is number => x !== null && Number.isFinite(x));
  let ref: TargetReference | null = null;
  let top = hi.value;
  let bottom = lo.value;
  if (set.length) {
    const near = set.every((t) => t >= lo.value - span && t <= hi.value + span);
    if (near) {
      ref = { min: bounds[0], max: bounds[1], drawn: true };
      top = Math.max(top, ...set);
      bottom = Math.min(bottom, ...set);
    } else ref = { min: bounds[0], max: bounds[1], drawn: false, side: Math.min(...set) > hi.value ? "above" : "below" };
  }
  const pad = (top - bottom || span) * PAD;
  // Bars are lengths and start at 0; a line is read by its shape and is fitted to its values.
  const domain: [number, number] = bars ? [Math.min(0, bottom), Math.max(0, top) + pad] : [bottom - pad, top + pad];
  return {
    ends: { first: pts[0].period, last: last.period },
    last,
    high: flat || hi.period === last.period ? null : hi,
    low: flat || lo.period === last.period ? null : lo,
    target: ref,
    domain,
  };
}
