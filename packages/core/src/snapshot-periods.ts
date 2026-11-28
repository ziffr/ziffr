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

/** The first day by which any value in the data is complete: the earliest last day of a Metric period (or condensed
 * span) with a value. Null without any value. A Snapshot keeps values from earlier periods too (`dataAsOf`), so one
 * ending on or after this day holds a value and one ending before it holds none. */
export function firstValueEnd(data: CanvasData): string | null {
  const ends = data.metrics.flatMap((m) => [
    ...(data.series[m.slug] ?? []).map((p) => periodEnd(p.period, m.period)),
    ...Object.keys(data.breakdowns?.[m.id] ?? {}).map((start) => periodEnd(start, m.period)),
    ...(data.condensed?.[m.id] ?? []).map((c) => c.periodEnd),
  ]);
  return ends.sort()[0] ?? null;
}

/** One finished period offered for a Snapshot: whether a Snapshot of it would hold any value, and the id of the one
 * there is already (a period holds only one), null when there is none the asker may open. */
export type SnapshotChoice = SnapshotPeriod & { hasValues: boolean; takenId: number | null };

/** For each period length: the finished periods offered, newest first, and, when none of them holds a value but a
 * later one will, the day from which the first such Snapshot can be taken. Says nothing else about the values. */
export type SnapshotChoices = Record<SnapshotPeriodKind, { periods: SnapshotChoice[]; firstFrom: string | null }>;

/** How many finished periods of a length are offered to take a Snapshot of. */
export const offeredPeriods = (kind: SnapshotPeriodKind) => (kind === "week" ? 12 : 8);

/** Whether an offered period can be taken: it has values and no Snapshot yet. */
export const isFree = (p: SnapshotChoice) => p.hasValues && p.takenId === null;

/** The periods offered on `today`, for values first complete on `first` (`firstValueEnd`); undefined rules none out
 * (a dashboard without Metrics). `taken` are the Snapshots there are, as far as the asker may open them. */
export function snapshotChoicesFor(first: string | null | undefined, today: string, yearStart: YearStart, taken?: readonly { id: number; kind: SnapshotPeriodKind; start: string }[]): SnapshotChoices {
  return Object.fromEntries(SNAPSHOT_PERIOD_KINDS.map((kind) => {
    const periods = completePeriods(kind, today, offeredPeriods(kind), yearStart).map((p) => ({
      ...p,
      hasValues: first === undefined || (first !== null && first <= p.end),
      takenId: taken?.find((s) => s.kind === kind && s.start === p.start)?.id ?? null,
    }));
    const firstFrom = !first || periods[0].hasValues ? null : shiftPeriod(periodContaining(kind, first, yearStart).end, "day", 1);
    return [kind, { periods, firstFrom }];
  })) as SnapshotChoices;
}

const KIND_WORDS: Record<SnapshotPeriodKind, { one: string; every: string; choose: string }> = {
  week: { one: "week", every: "weekly", choose: "Week" },
  month: { one: "month", every: "monthly", choose: "Month" },
  quarter: { one: "quarter", every: "quarterly", choose: "Quarter" },
  half: { one: "half-year", every: "half-yearly", choose: "Half-year" },
  year: { one: "year", every: "yearly", choose: "Year" },
};

/** "Monday 30 November", with the year when it is not today's. */
function dayWords(day: string, today: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
  return `${part({ weekday: "long" })} ${d.getUTCDate()} ${part({ month: "long" })}${day.slice(0, 4) === today.slice(0, 4) ? "" : ` ${day.slice(0, 4)}`}`;
}

/** What to say when no offered period of this length can be taken; null when one can. */
export function noValuesWords(choices: SnapshotChoices, kind: SnapshotPeriodKind, today: string): string | null {
  const { periods, firstFrom } = choices[kind];
  if (periods.some(isFree)) return null;
  const words = KIND_WORDS[kind];
  const first = periods.some((p) => p.hasValues)
    ? `Every finished ${words.one} with values has a Snapshot already.`
    : firstFrom
      ? `No finished ${words.one} has values yet. Your first ${words.every} Snapshot can be taken from ${dayWords(firstFrom, today)}.`
      : "The Metrics on this dashboard have no values yet. Take a Snapshot once a period with values is over.";
  const other = SNAPSHOT_PERIOD_KINDS.find((k) => choices[k].periods.some(isFree));
  return other ? `${first} Or choose ${KIND_WORDS[other].choose} under Period, which has a finished period you can take.` : first;
}
