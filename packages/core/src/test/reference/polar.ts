// The reference for what the polar and radar marks draw (spec 0041, ticket 10; GLOSSARY: View Design). Written apart from
// polar-marks.ts: months are whole numbers (year * 12 + month) so no date function is shared with it, values are whole
// numbers and every position is an exact fraction, taken to the nearest double only when compared.
// - A radar's window is `window` periods counted back from the newest period any Metric has a value in, counting periods,
//   never values; a Metric's latest is its newest value inside it, none inside it is a gap.
// - A spoke's position is (v - lowest) / (highest - lowest) over the window's values (and the period just before the
//   latest, when asked for); with one value or all equal there is no range and no position.
// - A polar plot's grid is every month from `from` to `to`; a position is v / the highest value; it is refused with fewer
//   than 3 or more than 12 months, a value below 0, or only zeros.
import { fraction, nearestDoubleOf, type Exact } from "./exact";

/** A month as a whole number: 2026-01 is 2026 * 12. */
export const monthIndex = (year: number, month: number) => year * 12 + (month - 1);
/** The first day of a month, written from its whole number. */
export const monthStart = (i: number) => `${String(Math.floor(i / 12)).padStart(4, "0")}-${String((i % 12) + 1).padStart(2, "0")}-01`;

/** A value of a month, with why it is not a whole month (if it is not). */
export type RefPoint = { m: number; v: number; note?: string; condensed?: boolean };

/** What the reference says a spoke is. */
export type RefSpoke = { kind: "gap" } | { kind: "running"; m: number; v: number; note: string } | { kind: "norange"; m: number; v: number } | { kind: "placed"; m: number; v: number; at: Exact; note?: string };

/** What the reference says a radar is: a refusal (Condensed Values in a window), or each spoke and, with `against`, the period before. */
export type RefRadar = { refused: true } | { refused: false; now: RefSpoke[]; before: RefSpoke[] };

/** The radar of Metrics' monthly values by the rules above. */
export function referenceRadar(metrics: RefPoint[][], window: number, against: boolean): RefRadar {
  const all = metrics.flat().map((p) => p.m);
  const end = all.length ? Math.max(...all) : 0;
  const now: RefSpoke[] = [];
  const before: RefSpoke[] = [];
  for (const points of metrics) {
    const inside = points.filter((p) => p.m > end - window && p.m <= end);
    if (inside.some((p) => p.condensed)) return { refused: true };
    if (inside.length === 0) {
      now.push({ kind: "gap" });
      before.push({ kind: "gap" });
      continue;
    }
    const latest = inside.reduce((a, b) => (b.m > a.m ? b : a));
    const prev = against ? points.find((p) => p.m === latest.m - 1) : undefined;
    if (prev?.condensed) return { refused: true };
    // A period still running is written but neither sets the scale nor sits on it.
    const values = [...inside.filter((p) => p.note !== "so far").map((p) => p.v), ...(prev && prev.note !== "so far" ? [prev.v] : [])];
    const [lo, hi] = [Math.min(...values), Math.max(...values)];
    const spoke = (p: RefPoint | undefined): RefSpoke => (!p ? { kind: "gap" } : p.note === "so far" ? { kind: "running", m: p.m, v: p.v, note: p.note } : hi === lo ? { kind: "norange", m: p.m, v: p.v } : { kind: "placed", m: p.m, v: p.v, at: fraction(BigInt(p.v - lo), BigInt(hi - lo)), note: p.note });
    now.push(spoke(latest));
    before.push(spoke(prev));
  }
  return { refused: false, now, before };
}

/** What the reference says a polar plot is: why it is refused, or each month of the grid with its exact position. */
export type RefPolar = { refused: "few" | "many" | "negative" | "zeros" | "none" | "condensed" | "running" } | { refused: false; closed: boolean; months: { m: number; at: Exact | null; note?: string }[] };

/** The polar plot of monthly values over the months `from` to `to`. */
export function referencePolar(points: RefPoint[], from: number, to: number): RefPolar {
  const inside = points.filter((p) => p.m >= from && p.m <= to);
  if (inside.length === 0) return { refused: "none" };
  if (inside.some((p) => p.condensed)) return { refused: "condensed" };
  // The circle starts at the first month with a value.
  const first = Math.min(...inside.map((p) => p.m));
  const n = to - first + 1;
  if (n > 12) return { refused: "many" };
  if (n < 3) return { refused: "few" };
  if (inside.some((p) => p.v < 0)) return { refused: "negative" };
  // A month still running is written, but neither sets the top nor sits on the scale.
  const whole = inside.filter((p) => p.note !== "so far");
  if (whole.length === 0) return { refused: "running" };
  const top = Math.max(...whole.map((p) => p.v));
  if (top === 0) return { refused: "zeros" };
  const months = Array.from({ length: n }, (_, i) => {
    const p = inside.find((q) => q.m === first + i);
    return { m: first + i, at: p && p.note !== "so far" ? fraction(BigInt(p.v), BigInt(top)) : null, note: p?.note };
  });
  // The line closes for one whole year of months with a place at both ends.
  return { refused: false, closed: n === 12 && months[0].at !== null && months[11].at !== null, months };
}

/** The distance from the centre of a radar's place, exactly: 12 % of the radius for the lowest value, all of it for the highest. */
export const referenceRadius = (at: Exact): Exact => fraction(3n * at.den + 22n * at.num, 25n * at.den);

export { nearestDoubleOf };
