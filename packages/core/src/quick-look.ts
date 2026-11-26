// A Metric's quick look (GLOSSARY: Quick look, Metric): what the slide-over beside a list or Widget draws, for one
// Metric by its slug. Security: only a Metric the person sees (visibility through visibleMetricIds), and a Metric that
// is not there is answered exactly like one that is not shared, so the quick look never confirms that a Metric exists.
// Only the fields the panel draws leave here: no description, owner id or settings; the Calculation Note (spec 0060), and
// a Derived Metric's formula only written with names of Metrics the person sees, all of them.
import type { Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { yearStartOf } from "./fiscal-year";
import { formulaInWords } from "./calculation-note";
import { recordingOffer, type RecordingOffer } from "./record-own-value";
import { peopleIn } from "./submissions";
import { getAllSeries } from "./workspace-data";
import { numberStyleOf } from "./workspace-settings";
import type { NumberStyle } from "./number-style";
import type { YearStart } from "./periods";
import type { Metric, Point } from "./types";

/** The Metric fields the panel draws, no more. */
export type QuickLookMetric = Pick<Metric, "name" | "slug" | "period" | "sources" | "decimals" | "unit" | "unit_position" | "polarity" | "target_min" | "target_max" | "calculation_note"> & {
  derived: boolean;
  /** A Derived Metric's formula with its inputs' names, null when one of them is not shared with this person. */
  formula: string | null;
};

/** What the quick look draws: the Metric, its last 30 values, the owner's name, how this Workspace writes periods and numbers, and the form behind Record a value when the person submits the Metric. */
export type QuickLook = { record: RecordingOffer | null; metric: QuickLookMetric; points: Point[]; ownerName: string | null; yearStart: YearStart; numberStyle: NumberStyle };

/** The same words for a Metric that is not there and one the person may not see. */
export const QUICK_LOOK_REFUSAL = "This Metric is not shared with you.";

/** The quick look of the Metric with this slug, or a refusal that says nothing of whether it exists. */
export async function metricQuickLook(actor: Actor, slug: string): Promise<QuickLook> {
  const ws = actor.workspaceId;
  const [{ metrics, series }, people, yearStart, numberStyle] = await Promise.all([getAllSeries(ws, { points: 30 }), peopleIn(ws), yearStartOf(ws), numberStyleOf(ws)]);
  const metric = metrics.find((m) => m.slug === String(slug ?? ""));
  // Looked up either way, so a missing Metric costs the same work as an unshared one.
  const visible = await visibleMetricIds(ws, actor.personId, metrics);
  if (!metric || !visible.has(metric.id)) throw new Error(QUICK_LOOK_REFUSAL);
  const { name, period, sources, decimals, unit, unit_position, polarity, target_min, target_max } = metric;
  const calculation_note = metric.calculation_note ?? null;
  const formula = metric.formula ? formulaInWords(metric.formula, metrics.filter((m) => visible.has(m.id))) : null;
  // Only for a Metric this person submits (recordingOffer checks, as on the Metric's page).
  const record = await recordingOffer(actor, metric.id);
  return { record, metric: { name, slug: metric.slug, period, sources, decimals, unit, unit_position, polarity, target_min, target_max, calculation_note, derived: Boolean(metric.formula), formula }, points: series[metric.slug] ?? [], ownerName: people.find((p) => p.id === metric.owner_id)?.name ?? null, yearStart, numberStyle };
}
