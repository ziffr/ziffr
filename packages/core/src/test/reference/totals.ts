// The reference for Totals (spec 0058, "Team totals"; GLOSSARY: Total), written apart from totals.ts: the periods are
// walked one by one and each is decided from the rules as written, on exact numbers.
// - a part counts in a period that starts on or after its first period and, where it has a last one, not after that;
// - a reader is given a period only if the Total is open, or they see every part counting in it; a period in which no
//   part counts is none;
// - its number is the exact sum of every counting part's number for it, and none where one of them has none;
// - targets added up: each counting part's target() for the period (its Target Series value, else the one number of its
//   Target Range), under the same rules, for every period a part has a value or a Target Series value in.
import type { Point } from "../../types";
import { referenceRangeNumber } from "./derived";
import { exactOf, plus, ZERO, type Exact } from "./exact";

/** One part as the reference takes it: its window, its values and its targets, and whether the reader sees it. */
export type ReferencePart = { first: string; last: string | null; seen: boolean; values: readonly Point[]; min: number | null; max: number | null; series: readonly Point[] };

// A value given later for a period replaces an earlier one.
const byPeriod = (points: readonly Point[]) => new Map(points.map((p) => [p.period, p.value]));

function walk(parts: readonly ReferencePart[], open: boolean, periods: Set<string>, numberOf: (part: ReferencePart, period: string) => Exact | null): { period: string; value: Exact }[] {
  const out: { period: string; value: Exact }[] = [];
  for (const period of [...periods].sort()) {
    let counted = 0;
    let missing = false;
    let hidden = false;
    let sum = ZERO;
    for (const part of parts) {
      if (period < part.first || (part.last !== null && period > part.last)) continue;
      counted++;
      if (!part.seen) hidden = true;
      const n = numberOf(part, period);
      if (n === null) missing = true;
      else sum = plus(sum, n);
    }
    if (counted > 0 && !missing && (open || !hidden)) out.push({ period, value: sum });
  }
  return out;
}

/** A Total's values for one reader. */
export function referenceTotal(parts: readonly ReferencePart[], open: boolean) {
  const periods = new Set(parts.flatMap((p) => p.values.map((v) => v.period)));
  return walk(parts, open, periods, (part, period) => (byPeriod(part.values).has(period) ? exactOf(byPeriod(part.values).get(period)!) : null));
}

/** The targets of a Total's parts added up, for one reader. */
export function referenceTotalTargets(parts: readonly ReferencePart[], open: boolean) {
  const periods = new Set(parts.flatMap((p) => [...p.values, ...p.series].map((v) => v.period)));
  return walk(parts, open, periods, (part, period) => {
    const given = byPeriod(part.series);
    if (!given.has(period)) return referenceRangeNumber(part.min, part.max);
    return Number.isFinite(given.get(period)) ? exactOf(given.get(period)!) : null;
  });
}
