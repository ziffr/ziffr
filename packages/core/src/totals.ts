// How a Total is worked out (GLOSSARY: Total, Derived Metric; spec 0058, "Team totals"). A Total adds up its parts,
// period by period: a part counts from its first period up to its last, and a period has a number only when every part
// counting in it has one. It fails closed: a period is worked out only for a reader who sees every part counted in it,
// unless the Total's owner opened it, so a part is never given away by subtraction. Pure.
import { exactTotal } from "./exact";
import { targetReader } from "./formula";
import type { Metric, Point } from "./types";

/** One part of a Total: the Metric, the first day of the first period it counts in and, once it has left, of the last. */
export type TotalPart = { part: number; first: string; last: string | null };

/** Who reads some series, as far as Totals go: which Metrics they see. `aims`, where given, receives the targets worked
 * out for each Total whose target is its parts' added up, by the Total's id. */
export type TotalsReader = { sees: (metricId: number) => boolean; aims?: Record<number, Point[]> };

/** A reader, with the parts of each Total by its id. */
export type TotalsRead = TotalsReader & { parts: Record<number, readonly TotalPart[]> };

/** The parts counting in the period that starts on `period`. */
export function countedParts(parts: readonly TotalPart[], period: string): number[] {
  return parts.filter((p) => p.first <= period && (p.last === null || period <= p.last)).map((p) => p.part);
}

/** Whether a reader is given a period in which these parts count: some part does, and the Total is open or the reader
 * sees every one of them. */
export function mayShow(open: boolean, counted: readonly number[], sees: TotalsReader["sees"]): boolean {
  return counted.length > 0 && (open || counted.every(sees));
}

/** The sums, oldest first, of the periods among `periods` that are shown and in which every counted part has a number:
 * never a smaller sum for a period in which one is missing, and never a missing one taken as 0. */
export function totalPoints(parts: readonly TotalPart[], numberOf: (part: number, period: string) => number | undefined, periods: Iterable<string>, shown: (counted: number[]) => boolean): Point[] {
  return [...new Set(periods)].sort().flatMap((period) => {
    const counted = countedParts(parts, period);
    if (!shown(counted)) return [];
    const numbers = counted.map((part) => numberOf(part, period));
    return numbers.every((v): v is number => Number.isFinite(v)) ? [{ period, value: exactTotal(numbers, 1) }] : [];
  });
}

/** A Total's series for one reader, from its parts' values, and where its target is its parts' added up, those targets:
 * each period's sum of what target() gives for every counted part, under the same rule of who is shown it. `raw` holds
 * each Metric's values by slug; `targets` the Target Series by Metric id, without which no target is added up. */
export function totalSeries(total: Pick<Metric, "id" | "total">, read: TotalsRead, raw: Record<string, ReadonlyMap<string, number>>, byId: Record<number, Metric>, targets?: Record<number, readonly Point[]>): { points: Point[]; targets: Point[] } {
  const parts = read.parts[total.id] ?? [];
  const shown = (counted: number[]) => mayShow(Boolean(total.total?.open), counted, read.sees);
  const values = new Map(parts.map((p) => [p.part, raw[byId[p.part]?.slug ?? ""]]));
  const periods = [...values.values()].flatMap((v) => [...(v?.keys() ?? [])]);
  const points = totalPoints(parts, (part, period) => values.get(part)?.get(period), periods, shown);
  if (total.total?.targets !== "parts" || !targets) return { points, targets: [] };
  const readers = new Map(parts.flatMap((p) => (byId[p.part] ? [[p.part, targetReader(byId[p.part], targets[p.part] ?? [])] as const] : [])));
  const aimed = parts.flatMap((p) => (targets[p.part] ?? []).map((t) => t.period));
  return { points, targets: totalPoints(parts, (part, period) => readers.get(part)?.(period), [...periods, ...aimed], shown) };
}

/** The periods of a Total that are not approved yet: those in which a counted part's period waits for Approval or was
 * sent back. `open` holds each part's such periods by its id; only periods among the Total's own are named. */
export function totalUnapproved(parts: readonly TotalPart[], open: Record<number, readonly string[]>, periods: readonly Point[]): string[] {
  return periods.map((p) => p.period).filter((period) => countedParts(parts, period).some((part) => open[part]?.includes(period)));
}

/** The Metrics whose numbers rest on a Total: the Totals themselves and the formulas that read one (`reads_total`). */
export function restsOnTotal(metric: Pick<Metric, "total" | "reads_total">): boolean {
  return Boolean(metric.total) || Boolean(metric.reads_total);
}
