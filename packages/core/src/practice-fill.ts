// Filling Metrics of a Practice Workspace with made-up numbers (spec 0063, #1267; GLOSSARY: Practice Workspace, Import):
// those a Set up from a Pack made, so its dashboards and slides show something, and what the copy of the demo lacks for
// year on year and annual progress. Values are written as imports in batches, targets as a Target Series; a period that
// has a value, and a Metric that has a Target Series, are left as they are.
// SECURITY: only ever in a Practice Workspace, and asked only by the person it was made for. It writes to Metrics of
// that Workspace alone, also ones its made-up people own.
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { refuseInDemo } from "./demo";
import { yearStartOf } from "./fiscal-year";
import { scanWorkspace } from "./heads-ups";
import { sealedSeriesSaves } from "./metrics";
import { periodEnd } from "./periods";
import { practiceFor } from "./practice";
import { madeUpPeriods, madeUpTargets, madeUpValues, type MadeUpMetric } from "./practice-numbers";
import { workspaceToday } from "./retention-setting";
import { openRows } from "./sealed-columns";
import type { Metric, YearStart } from "./types";
import { allRows, getMetrics } from "./workspace-data";
import { ValueWriter } from "./workspace-import";

/** Metrics filled in one step, so the screen can say how far it is; a daily Metric is several hundred values. */
export const FILL_METRICS_PER_STEP = 4;
/** Target Series points saved in one call. */
const SERIES_BATCH = 500;

/** How far filling a Set up is. `next` is where the next step starts. */
export type PracticeFillStep = { done: boolean; next: number; filled: number; of: number; values: number; targets: number };

// Two presses at once would write the same periods twice: one fill per Workspace at a time in this process.
const busy = new Set<string>();

type Ground = { workspaceId: string; today: string; yearStart: YearStart; onlyBefore: boolean };

/** The made-up values and targets of one Metric, written. */
async function fillOne(g: Ground, m: Metric): Promise<{ values: number; targets: number }> {
  const ws = g.workspaceId;
  const rows = await allRows<Record<string, unknown>>((from, to) => db().from("observations").select("id, metric_id, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", m.id).order("id").range(from, to));
  const existing = new Map<string, number>();
  const taken = new Set<string>();
  for (const r of await openRows("observations", ws, rows)) {
    taken.add(String(r.period_start));
    if (typeof r.value === "number") existing.set(String(r.period_start), r.value);
  }
  const made: MadeUpMetric = { seed: m.name, period: m.period, polarity: m.polarity, unit: m.unit ?? "", format: m.format, decimals: m.decimals, targetMin: m.target_min === null ? null : Number(m.target_min), targetMax: m.target_max === null ? null : Number(m.target_max) };
  const periods = madeUpPeriods(m.period, g.today, g.yearStart);
  // For the copy of the demo only what lies before its first value: what it leaves open at the end is still asked for.
  const first = [...taken].sort()[0];
  const wanted = periods.filter((p) => !taken.has(p) && (!g.onlyBefore || (first !== undefined && p < first)));
  // A Metric that is calculated takes no values; a Breakdown is never made up.
  const values = m.formula ? new Map<string, number>() : madeUpValues(made, periods, existing);
  const writer = new ValueWriter(ws);
  const now = Date.now();
  let written = 0;
  for (const p of wanted) {
    const value = values.get(p);
    if (value === undefined) continue;
    const recorded = new Date(Math.min(now, Date.parse(`${periodEnd(p, m.period)}T09:00:00Z`) + 86_400_000)).toISOString();
    await writer.add(m.id, { kind: "value", metric: "", period: p, value, recordedAt: recorded });
    written++;
  }
  await writer.flush();
  return { values: written, targets: await fillTargets(g, m, made, new Map([...existing, ...values])) };
}

/** A Target Series for the previous and the whole current fiscal year, for a Metric that has none. A band to stay inside
 * is left as it is, and so is a calculated Metric without a Target Range, whose level nothing here knows. */
async function fillTargets(g: Ground, m: Metric, made: MadeUpMetric, values: ReadonlyMap<string, number>): Promise<number> {
  if (m.polarity === "target" || (m.formula && made.targetMin === null && made.targetMax === null)) return 0;
  const { count, error } = await db().from("series_values").select("id", { count: "exact", head: true }).eq("workspace_id", g.workspaceId).eq("metric_id", m.id).eq("kind", "target");
  if (error) throw new Error("The targets could not be read.");
  if (count) return 0;
  const points = [...madeUpTargets(made, madeUpPeriods(m.period, g.today, g.yearStart, true), values)].map(([period, value]) => ({ period, value }));
  for (let i = 0; i < points.length; i += SERIES_BATCH) {
    const saves = await sealedSeriesSaves(g.workspaceId, m.id, "target", points.slice(i, i + SERIES_BATCH));
    const { error: failed } = await db().rpc("set_series_values", { p_metric: m.id, p_kind: "target", p_saves: saves, p_removes: [], p_note: "Made-up targets" });
    if (failed) throw new Error("The targets could not be saved.");
  }
  return points.length;
}

/** The Metrics of a Practice Workspace that are named and not archived, in the order of their ids. */
async function metricsOf(workspaceId: string, ids: ReadonlySet<number> | null): Promise<Metric[]> {
  return (await getMetrics(workspaceId)).filter((m) => !m.archived_at && (ids === null || ids.has(m.id))).sort((a, b) => a.id - b.id);
}

const groundOf = async (workspaceId: string, onlyBefore: boolean): Promise<Ground> => ({ workspaceId, today: await workspaceToday(workspaceId), yearStart: await yearStartOf(workspaceId), onlyBefore });

/** Whether made-up numbers are offered to this person here: their own Practice Workspace. */
export async function offersMadeUpNumbers(actor: Actor): Promise<boolean> {
  return !actor.key && (await practiceFor(actor.workspaceId)) === actor.personId;
}

/** Fills what a new copy of the demo lacks from the start of the previous fiscal year: earlier values, and Target
 * Series. For the core's own making of a Practice Workspace; refuses any other Workspace. */
export async function fillCopiedNumbers(workspaceId: string): Promise<void> {
  if (!(await practiceFor(workspaceId))) throw new Forbidden();
  const g = await groundOf(workspaceId, true);
  for (const m of await metricsOf(workspaceId, null)) await fillOne(g, m);
}

/**
 * Takes one step of filling the Metrics that Set ups from an installed Pack made, in the actor's own Practice
 * Workspace: from `after`, a few Metrics. Call again with `next` until `done`; running it again later adds only periods
 * that have no value yet.
 */
export async function fillSetUpNumbers(actor: Actor, installId: number, after = 0): Promise<PracticeFillStep> {
  refuseInDemo(actor);
  if (actor.key || (await practiceFor(actor.workspaceId)) !== actor.personId) throw new Forbidden("Made-up numbers are only for your own Practice Workspace.");
  const ws = actor.workspaceId;
  const { data: setups, error } = await db().from("pack_setups").select("id").eq("workspace_id", ws).eq("install_id", Number(installId));
  if (error) throw new Error("The Set up could not be read.");
  const items = setups?.length ? await allRows<{ object_id: number }>((from, to) => db().from("pack_setup_items").select("object_id").eq("workspace_id", ws).eq("kind", "metric").in("setup_id", setups.map((s) => s.id as number)).order("id").range(from, to)) : [];
  const metrics = await metricsOf(ws, new Set(items.map((i) => Number(i.object_id))));
  const start = Number.isSafeInteger(after) && after > 0 ? after : 0;
  if (busy.has(ws)) throw new Error("Numbers are being filled in already.");
  busy.add(ws);
  try {
    const g = await groundOf(ws, false);
    let values = 0;
    let targets = 0;
    const step = metrics.slice(start, start + FILL_METRICS_PER_STEP);
    for (const m of step) {
      const made = await fillOne(g, m);
      values += made.values;
      targets += made.targets;
    }
    const next = start + step.length;
    const done = next >= metrics.length;
    if (values || targets) await audit(actor, { kind: "workspace.practice_filled", object: { type: "workspace", id: ws }, details: { metrics: step.length, values, targets } });
    // Heads-ups are looked for once everything is there; one that fails comes with the daily look.
    if (done && metrics.length) await scanWorkspace(ws, new Date().toISOString()).catch((e) => console.error("Made-up numbers: no Heads-ups yet:", (e as Error).message));
    return { done, next, filled: next, of: metrics.length, values, targets };
  } finally {
    busy.delete(ws);
  }
}
