// A Metric's quick look (GLOSSARY: Quick look, Metric): what the slide-over beside a list or Widget draws, for one
// Metric by its slug. Security: only a Metric the person sees (visibility through visibleMetricIds), and a Metric that
// is not there is answered exactly like one that is not shared, so the quick look never confirms that a Metric exists.
// Only the fields the panel draws leave here (of its Target Series only the target in effect): no description, owner id or settings; the Calculation Note (spec 0060), a
// Derived Metric's formula only written with names of Metrics the person sees, all of them, and the latest period's
// Value Notes as the note core gives them to this person (spec 0064).
import type { Actor } from "./actor";
import { allSeriesFor, visibleMetricIds } from "./access";
import { yearStartOf } from "./fiscal-year";
import { formulaInWords } from "./calculation-note";
import { recordingOffer, type RecordingOffer } from "./record-own-value";
import { currentValueNotes, type ShownNote } from "./value-notes";
import { peopleIn } from "./submissions";
import { noValuesWords } from "./total-rules";
import { numberStyleOf } from "./workspace-settings";
import { workspaceToday } from "./retention-setting";
import { targetInEffect, type TargetInEffect } from "./target-in-effect";
import { getSeriesValues } from "./workspace-data";
import type { NumberStyle } from "./number-style";
import type { YearStart } from "./periods";
import type { Metric, Point } from "./types";

/** The Metric fields the panel draws, no more. */
export type QuickLookMetric = Pick<Metric, "name" | "slug" | "period" | "sources" | "decimals" | "unit" | "unit_position" | "polarity" | "target_min" | "target_max" | "calculation_note" | "total"> & {
  derived: boolean;
  /** A Derived Metric's formula with its inputs' names, null when one of them is not shared with this person. */
  formula: string | null;
  /** What stands where it has no value to show this person. */
  empty: string;
};

/** What the quick look draws: the Metric, its last 30 values, the target in effect, the latest one's Value Notes, newest first, the owner's name, how this Workspace writes periods and numbers, and the form behind Record a value when the person submits the Metric. */
export type QuickLook = { record: RecordingOffer | null; metric: QuickLookMetric; points: Point[]; notes: ShownNote[]; target: TargetInEffect; ownerName: string | null; yearStart: YearStart; numberStyle: NumberStyle };

/** The same words for a Metric that is not there and one the person may not see. */
export const QUICK_LOOK_REFUSAL = "This Metric is not shared with you.";

/** The quick look of the Metric with this slug, or a refusal that says nothing of whether it exists. */
export async function metricQuickLook(actor: Actor, slug: string): Promise<QuickLook> {
  const ws = actor.workspaceId;
  const [{ metrics, series, targets: aimed }, people, yearStart, numberStyle] = await Promise.all([allSeriesFor(actor, { points: 30 }), peopleIn(ws), yearStartOf(ws), numberStyleOf(ws)]);
  const metric = metrics.find((m) => m.slug === String(slug ?? ""));
  // Looked up either way, so a missing Metric costs the same work as an unshared one.
  const visible = await visibleMetricIds(ws, actor.personId, metrics);
  if (!metric || !visible.has(metric.id)) throw new Error(QUICK_LOOK_REFUSAL);
  const { name, period, sources, decimals, unit, unit_position, polarity, target_min, target_max } = metric;
  const calculation_note = metric.calculation_note ?? null;
  // A Total's formula only names its parts for the core's rules: it is none anyone wrote.
  const formula = metric.formula && !metric.total ? formulaInWords(metric.formula, metrics.filter((m) => visible.has(m.id))) : null;
  // Only for a Metric this person submits (recordingOffer checks, as on the Metric's page).
  const record = await recordingOffer(actor, metric.id);
  const points = series[metric.slug] ?? [];
  const latest = points.at(-1)?.period;
  const notes = latest ? (await currentValueNotes(actor, metric.id, [latest]))[latest] ?? [] : [];
  // Read only after the visibility check; a Total that takes its Metrics' targets has those, added up for this person.
  const [targets, today] = await Promise.all([metric.total?.targets === "parts" ? aimed : getSeriesValues(ws, [metric.id]).then((v) => v.targets), workspaceToday(ws)]);
  const target = targetInEffect(metric, { latest, today, yearStart }, targets[metric.id], numberStyle);
  return { record, target, metric: { name, slug: metric.slug, period, sources, decimals, unit, unit_position, polarity, target_min, target_max, calculation_note, derived: Boolean(metric.formula) && !metric.total, formula, total: metric.total, empty: noValuesWords(metric) }, points, notes, ownerName: people.find((p) => p.id === metric.owner_id)?.name ?? null, yearStart, numberStyle };
}
