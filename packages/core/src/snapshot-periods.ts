// The periods a Snapshot is taken for (spec 0013; GLOSSARY: Snapshot, Period). Pure. A Snapshot period is a week,
// a month or a quarter; Metrics keep their own periods of day, week and month. A Snapshot keeps a Metric's values for
// the periods that end on or before the Snapshot period's last day: for a quarter, a monthly Metric's three months
// and those before; a weekly one's weeks that end in it; a daily one's days.
import { addDays, addMonths, addWeeks, endOfMonth, format, isValid, parseISO, startOfISOWeek, startOfMonth } from "date-fns";
import type { CanvasData, Period, Point } from "./types";

/** How long a Snapshot period is. */
export type SnapshotPeriodKind = "week" | "month" | "quarter";

/** Every Snapshot period length, for checking what a browser sends. */
export const SNAPSHOT_PERIOD_KINDS: SnapshotPeriodKind[] = ["week", "month", "quarter"];

/** One Snapshot period: its length, first and last day (yyyy-mm-dd) and its name. */
export type SnapshotPeriod = { kind: SnapshotPeriodKind; start: string; end: string; label: string };

const day = (d: Date) => format(d, "yyyy-MM-dd");

/** The first day of the period of this length that a date falls in. */
function startOf(kind: SnapshotPeriodKind, d: Date): Date {
  if (kind === "week") return startOfISOWeek(d);
  const m = startOfMonth(d);
  return kind === "month" ? m : new Date(m.getFullYear(), Math.floor(m.getMonth() / 3) * 3, 1);
}

/** The period of this length starting on `start`; null unless `start` is the first day of one. */
export function snapshotPeriod(kind: SnapshotPeriodKind, start: string): SnapshotPeriod | null {
  if (!SNAPSHOT_PERIOD_KINDS.includes(kind) || typeof start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const d = parseISO(start);
  if (!isValid(d) || day(startOf(kind, d)) !== start) return null;
  if (kind === "week") return { kind, start, end: day(addDays(d, 6)), label: `Week of ${format(d, "d MMM yyyy")}` };
  if (kind === "month") return { kind, start, end: day(endOfMonth(d)), label: format(d, "MMMM yyyy") };
  return { kind, start, end: day(endOfMonth(addMonths(d, 2))), label: `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}` };
}

/** The period of this length that a day (yyyy-mm-dd) falls in. */
export function periodContaining(kind: SnapshotPeriodKind, date: string): SnapshotPeriod {
  return snapshotPeriod(kind, day(startOf(kind, parseISO(date))))!;
}

/** The periods of this length before the one `today` falls in, newest first: the last complete one comes first. */
export function completePeriods(kind: SnapshotPeriodKind, today: string, count: number): SnapshotPeriod[] {
  const current = parseISO(periodContaining(kind, today).start);
  const back = (n: number) => (kind === "week" ? addWeeks(current, -n) : addMonths(current, kind === "month" ? -n : -3 * n));
  return Array.from({ length: Math.max(0, count) }, (_, i) => snapshotPeriod(kind, day(back(i + 1)))!);
}

/** The last day of a Metric's period that starts on `start`. */
export function metricPeriodEnd(period: Period, start: string): string {
  const d = parseISO(start);
  if (period === "month") return day(endOfMonth(d));
  if (period === "week") return day(addDays(d, 6));
  return start;
}

/** Whether a Metric's period that starts on `start` is complete by the Snapshot period's last day. */
export function inSnapshot(period: Period, start: string, end: string): boolean {
  return metricPeriodEnd(period, start) <= end;
}

/** The starts of a Metric's periods that lie wholly inside a Snapshot period: those that must be Locked before an
 * automatic Snapshot is taken early. A week that starts before the Snapshot period or ends after it is not one. */
export function metricPeriodsIn(period: Period, p: SnapshotPeriod): string[] {
  const out: string[] = [];
  // From the start of the Metric period the Snapshot period begins in.
  const first = parseISO(p.start);
  let d = period === "week" ? startOfISOWeek(first) : period === "month" ? startOfMonth(first) : first;
  for (let guard = 0; guard < 400; guard++) {
    const start = day(d);
    if (start > p.end) break;
    if (start >= p.start && metricPeriodEnd(period, start) <= p.end) out.push(start);
    d = period === "month" ? addMonths(d, 1) : period === "week" ? addWeeks(d, 1) : addDays(d, 1);
  }
  return out;
}

/** A Metric's points kept by a Snapshot that ends on `end`. */
export function cutPoints(points: readonly Point[], period: Period, end: string): Point[] {
  return points.filter((p) => inSnapshot(period, p.period, end));
}

/** The data with some Metrics cut, each at its own day (`ends` by Metric id); the others stay whole. For a deck
 * whose widgets of a Metric all draw it as of a day: only that is sent (spec 0013). */
export function dataAsOfEach(data: CanvasData, ends: ReadonlyMap<number, string>): CanvasData {
  if (!ends.size) return data;
  const out = { ...data, series: { ...data.series }, breakdowns: { ...data.breakdowns }, pending: { ...data.pending }, locked: { ...data.locked } };
  for (const m of data.metrics) {
    const end = ends.get(m.id);
    if (!end) continue;
    const one = dataAsOf({ ...data, metrics: [m], series: { [m.slug]: data.series[m.slug] ?? [] }, breakdowns: { [m.id]: data.breakdowns?.[m.id] ?? {} }, pending: { [m.id]: data.pending?.[m.id] ?? [] }, locked: { [m.id]: data.locked?.[m.id] ?? [] } }, end);
    out.series[m.slug] = one.series[m.slug];
    out.breakdowns[m.id] = one.breakdowns[m.id];
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
    pending: keepPeriods(data.pending),
    locked: keepPeriods(data.locked),
  };
}
