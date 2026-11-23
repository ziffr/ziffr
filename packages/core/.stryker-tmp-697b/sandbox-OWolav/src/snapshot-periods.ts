// @ts-nocheck
// The periods a Snapshot is taken for (spec 0013, spec 0020; GLOSSARY: Snapshot, Period). Pure. A Snapshot period is
// a week, a month, a quarter, a half-year or a year; Metrics keep their own periods. A Snapshot keeps a Metric's
// values for the periods that end on or before the Snapshot period's last day: for a year, a monthly Metric's twelve
// months and those before; a weekly one's weeks that end in it; a daily one's days.
import { isPeriodStart, periodEnd, periodLabel, periodStart, periodStartsIn, shiftPeriod, type YearStart } from "./periods";
import type { CanvasData, Period, Point } from "./types";

/** How long a Snapshot period is. */
export type SnapshotPeriodKind = "week" | "month" | "quarter" | "half" | "year";

/** Every Snapshot period length, for checking what a browser sends. */
export const SNAPSHOT_PERIOD_KINDS: SnapshotPeriodKind[] = ["week", "month", "quarter", "half", "year"];

/** One Snapshot period: its length, first and last day (yyyy-mm-dd) and its name. */
export type SnapshotPeriod = { kind: SnapshotPeriodKind; start: string; end: string; label: string };

/** The period of this length starting on `start`; null unless `start` is the first day of one. Quarters,
 * half-years and years start from the workspace's year start. */
export function snapshotPeriod(kind: SnapshotPeriodKind, start: string, yearStart: YearStart): SnapshotPeriod | null {
  if (!SNAPSHOT_PERIOD_KINDS.includes(kind) || !isPeriodStart(start, kind, yearStart)) return null;
  return { kind, start, end: periodEnd(start, kind), label: periodLabel(start, kind, yearStart) };
}

/** The period of this length that a day (yyyy-mm-dd) falls in. */
export function periodContaining(kind: SnapshotPeriodKind, date: string, yearStart: YearStart): SnapshotPeriod {
  return snapshotPeriod(kind, periodStart(date, kind, yearStart), yearStart)!;
}

/** The periods of this length before the one `today` falls in, newest first: the last complete one comes first. */
export function completePeriods(kind: SnapshotPeriodKind, today: string, count: number, yearStart: YearStart): SnapshotPeriod[] {
  const current = periodContaining(kind, today, yearStart).start;
  return Array.from({ length: Math.max(0, count) }, (_, i) => snapshotPeriod(kind, shiftPeriod(current, kind, -(i + 1)), yearStart)!);
}

/** Whether a Metric's period that starts on `start` is complete by the Snapshot period's last day. */
export function inSnapshot(period: Period, start: string, end: string): boolean {
  return periodEnd(start, period) <= end;
}

/** The most Metric periods one Snapshot period holds: a year of a daily Metric, 366 days, fits. */
export const MAX_METRIC_PERIODS = 400;

/** The starts of a Metric's periods that lie wholly inside a Snapshot period: those that must be Locked before an
 * automatic Snapshot is taken early. A week that starts before the Snapshot period or ends after it is not one. At
 * most MAX_METRIC_PERIODS, which no Snapshot period exceeds.
 */
export function metricPeriodsIn(period: Period, p: SnapshotPeriod, yearStart: YearStart): string[] {
  return periodStartsIn(period, p.start, p.end, yearStart).slice(0, MAX_METRIC_PERIODS);
}

/** A Metric's points kept by a Snapshot that ends on `end`. */
export function cutPoints(points: readonly Point[], period: Period, end: string): Point[] {
  return points.filter((p) => inSnapshot(period, p.period, end));
}

/** The data with some Metrics cut, each at its own day (`ends` by Metric id); the others stay whole. For a deck
 * whose widgets of a Metric all draw it as of a day: only that is sent (spec 0013). */
export function dataAsOfEach(data: CanvasData, ends: ReadonlyMap<number, string>): CanvasData {
  if (!ends.size) return data;
  const out = { ...data, series: { ...data.series }, ...(data.condensed ? { condensed: { ...data.condensed } } : {}), breakdowns: { ...data.breakdowns }, pending: { ...data.pending }, locked: { ...data.locked } };
  for (const m of data.metrics) {
    const end = ends.get(m.id);
    if (!end) continue;
    const one = dataAsOf({ ...data, metrics: [m], series: { [m.slug]: data.series[m.slug] ?? [] }, breakdowns: { [m.id]: data.breakdowns?.[m.id] ?? {} }, ...(data.condensed ? { condensed: { [m.id]: data.condensed[m.id] ?? [] } } : {}), pending: { [m.id]: data.pending?.[m.id] ?? [] }, locked: { [m.id]: data.locked?.[m.id] ?? [] } }, end);
    out.series[m.slug] = one.series[m.slug];
    out.breakdowns[m.id] = one.breakdowns[m.id];
    // The Metric's Condensed Values, cut at its own day (none to take when the data has none).
    Object.assign(out.condensed ?? {}, one.condensed);
    out.pending[m.id] = one.pending[m.id];
    out.locked[m.id] = one.locked[m.id];
  }
  return out;
}

/** The data as of a day: values (and their Breakdowns, Approvals waiting and Locks) of the Metric periods complete
 * by `end`. Targets and Projections stay. A Snapshot keeps this; a widget with `asOf` draws it (spec 0013). */
export function dataAsOf(data: CanvasData, end: string): CanvasData {
  const periodOf = new Map(data.metrics.map((m) => [m.slug, m.period]));
  const periodById = new Map(data.metrics.map((m) => [m.id, m.period]));
  const keepPeriods = (byId: Record<number, string[]>) => Object.fromEntries(Object.entries(byId ?? {}).map(([id, ps]) => [id, ps.filter((p) => inSnapshot(periodById.get(Number(id)) ?? "day", p, end))]));
  return {
    ...data,
    series: Object.fromEntries(Object.entries(data.series).map(([slug, pts]) => [slug, cutPoints(pts, periodOf.get(slug) ?? "day", end)])),
    breakdowns: Object.fromEntries(Object.entries(data.breakdowns ?? {}).map(([id, byPeriod]) => [id, Object.fromEntries(Object.entries(byPeriod).filter(([p]) => inSnapshot(periodById.get(Number(id)) ?? "day", p, end)))])),
    // A Condensed Value is part of the data once its whole span is over by `end`.
    ...(data.condensed ? { condensed: Object.fromEntries(Object.entries(data.condensed).map(([id, cs]) => [id, cs.filter((c) => c.periodEnd <= end)])) } : {}),
    pending: keepPeriods(data.pending),
    locked: keepPeriods(data.locked),
  };
}
