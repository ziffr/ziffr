// Filling Metrics of a Practice Workspace with made-up numbers (spec 0063, #1267; GLOSSARY: Practice Workspace, Import):
// those a Set up from a Pack made, so its dashboards and slides show something, and what the copy of the demo lacks for
// year on year and annual progress. Values are written as imports in batches, targets as a Target Series; nothing that
// is there is replaced. The last ended period and the running one stay empty, as does a period a Workflow already works
// on, so asking for values can be tried: made-up numbers start no Approval, task or message.
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
import { madeUpPeriods } from "./practice-numbers";
import { madeUpLevel, madeUpOf, madeUpRelatives, madeUpTargetsOf, type MadeUpMember } from "./practice-relations";
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

/** Which Pack a Metric was set up from: its entry's key and the Repeat's line it was made for. */
type Origin = { pack: string | null; key: string | null; line: number | null };
const NO_ORIGIN: Origin = { pack: null, key: null, line: null };

/** What a Metric holds already, by period: its latest values and its targets, and the periods no value may be made up
 * for: those with one, and those a Workflow works on. */
async function holdingsOf(ws: string, metricId: number) {
  const rows = await allRows<Record<string, unknown>>((from, to) => db().from("observations").select("id, metric_id, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metricId).order("id").range(from, to));
  const targetRows = await allRows<Record<string, unknown>>((from, to) => db().from("series_values").select("id, metric_id, kind, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metricId).eq("kind", "target").order("id").range(from, to));
  const states = await allRows<{ period_start: string }>((from, to) => db().from("period_states").select("period_start").eq("metric_id", metricId).order("period_start").range(from, to));
  const values = new Map<string, number>();
  const taken = new Set<string>(states.map((r) => String(r.period_start)));
  for (const r of await openRows("observations", ws, rows)) {
    taken.add(String(r.period_start));
    if (typeof r.value === "number") values.set(String(r.period_start), r.value);
  }
  const targets = new Map<string, number>();
  for (const r of await openRows("series_values", ws, targetRows)) if (typeof r.value === "number") targets.set(String(r.period_start), r.value);
  return { values, taken, targets };
}

type Holdings = Awaited<ReturnType<typeof holdingsOf>>;

/** A Metric as the generator reads it. */
function memberOf(m: Metric, from: Origin, held?: Holdings): MadeUpMember {
  const made = { seed: m.name, period: m.period, polarity: m.polarity, unit: m.unit ?? "", format: m.format, decimals: m.decimals, targetMin: m.target_min === null ? null : Number(m.target_min), targetMax: m.target_max === null ? null : Number(m.target_max), level: madeUpLevel(from.pack, from.key) };
  return { key: from.key, line: from.line, metric: made, computed: Boolean(m.formula), values: held?.values ?? new Map(), targets: held?.targets ?? new Map() };
}

/** The Metrics set up from one Pack, those of one line together and the lines in the order they were made. */
type Family = { pack: string | null; metrics: { metric: Metric; from: Origin }[] };

/** The made-up values and targets of one Metric, written. */
async function fillOne(g: Ground, m: Metric, family: Family = { pack: null, metrics: [] }): Promise<{ values: number; targets: number }> {
  const ws = g.workspaceId;
  const from = family.metrics.find((x) => x.metric.id === m.id)?.from ?? NO_ORIGIN;
  const held = await holdingsOf(ws, m.id);
  const me = memberOf(m, from, held);
  // What its numbers are worked out from is read too: the others of its line, and those of no line.
  const related = new Set(madeUpRelatives(family.pack, from.key));
  const others = await Promise.all(family.metrics.map(async (x) => {
    if (x.metric.id === m.id) return me;
    const needed = x.from.key !== null && related.has(x.from.key) && (x.from.line === from.line || x.from.line === null);
    return memberOf(x.metric, x.from, needed ? await holdingsOf(ws, x.metric.id) : undefined);
  }));
  const set = { pack: family.pack, members: others.length ? others : [me], yearStart: g.yearStart };
  const periods = madeUpPeriods(m.period, g.today, g.yearStart);
  // For the copy of the demo only what lies before its first value: what it leaves open at the end is still asked for.
  const first = [...held.values.keys()].sort()[0];
  const wanted = periods.filter((p) => !held.taken.has(p) && (!g.onlyBefore || (first !== undefined && p < first)));
  // A Metric that is calculated takes no values; a Breakdown is never made up.
  const values = madeUpOf(set, me, periods);
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
  const targets = madeUpTargetsOf(set, me, madeUpPeriods(m.period, g.today, g.yearStart, true), new Map([...held.values, ...values]));
  return { values: written, targets: await saveTargets(ws, m.id, targets) };
}

/** Made-up targets written as a Target Series, for periods that have none. */
async function saveTargets(ws: string, metricId: number, targets: ReadonlyMap<string, number>): Promise<number> {
  const points = [...targets].map(([period, value]) => ({ period, value }));
  for (let i = 0; i < points.length; i += SERIES_BATCH) {
    const saves = await sealedSeriesSaves(ws, metricId, "target", points.slice(i, i + SERIES_BATCH));
    const { error } = await db().rpc("set_series_values", { p_metric: metricId, p_kind: "target", p_saves: saves, p_removes: [], p_note: "Made-up targets" });
    if (error) throw new Error("The targets could not be saved.");
  }
  return points.length;
}

/** The Metrics of a Practice Workspace that are named and not archived, in the order of their ids. */
async function metricsOf(workspaceId: string, ids: ReadonlySet<number> | null): Promise<Metric[]> {
  return (await getMetrics(workspaceId)).filter((m) => !m.archived_at && (ids === null || ids.has(m.id))).sort((a, b) => a.id - b.id);
}

const groundOf = async (workspaceId: string, onlyBefore: boolean): Promise<Ground> => ({ workspaceId, today: await workspaceToday(workspaceId), yearStart: await yearStartOf(workspaceId), onlyBefore });

/** The Metrics that Set ups from an installed Pack of this Workspace made, with what each was made from. */
async function familyOf(ws: string, installId: number): Promise<Family> {
  const { data: setups, error } = await db().from("pack_setups").select("id").eq("workspace_id", ws).eq("install_id", installId);
  if (error) throw new Error("The Set up could not be read.");
  if (!setups?.length) return { pack: null, metrics: [] };
  const items = await allRows<{ object_id: number; pack_key: string; line_id: number | null }>((from, to) => db().from("pack_setup_items").select("object_id, pack_key, line_id").eq("workspace_id", ws).eq("kind", "metric").in("setup_id", setups.map((s) => s.id as number)).order("id").range(from, to));
  const { data: install } = await db().from("pack_installs").select("pack_id").eq("workspace_id", ws).eq("id", installId).maybeSingle();
  const pack = install ? String(install.pack_id) : null;
  const from = new Map(items.map((i): [number, Origin] => [Number(i.object_id), { pack, key: i.pack_key, line: i.line_id === null ? null : Number(i.line_id) }]));
  const metrics = (await metricsOf(ws, new Set(from.keys()))).map((metric) => ({ metric, from: from.get(metric.id)! }));
  return { pack, metrics: metrics.sort((a, b) => (a.from.line ?? 0) - (b.from.line ?? 0) || a.metric.id - b.metric.id) };
}

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
 * Workspace: from `after`, a few Metrics, as the Pack's numbers belong together. Call again with `next` until `done`;
 * running it again later adds only periods that have no value yet.
 */
export async function fillSetUpNumbers(actor: Actor, installId: number, after = 0): Promise<PracticeFillStep> {
  refuseInDemo(actor);
  if (actor.key || (await practiceFor(actor.workspaceId)) !== actor.personId) throw new Forbidden("Made-up numbers are only for your own Practice Workspace.");
  const ws = actor.workspaceId;
  const family = await familyOf(ws, Number(installId));
  const metrics = family.metrics.map((x) => x.metric).sort((a, b) => a.id - b.id);
  const start = Number.isSafeInteger(after) && after > 0 ? after : 0;
  if (busy.has(ws)) throw new Error("Numbers are being filled in already.");
  busy.add(ws);
  try {
    const g = await groundOf(ws, false);
    let values = 0;
    let targets = 0;
    const step = metrics.slice(start, start + FILL_METRICS_PER_STEP);
    for (const m of step) {
      const made = await fillOne(g, m, family);
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
