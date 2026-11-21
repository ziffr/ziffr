// Retention, the daily job (spec 0033, ticket #382; GLOSSARY: Retention, Condensed Value, Display Period): once a day it
// lets confirmed Retentions start (settleRetentions), and for every Metric with a Retention in force it condenses or
// deletes the periods older than the keep time, in small steps, writing each run in the Audit Log in counts.
// What it will not do, by design:
//  - take more than a person confirmed: the cap copied from the confirmation (periods, values) holds the old backlog; if
//    the Metric holds more of it than that, the Metric waits for a new confirmation, and an Owner reads why on its page;
//  - delete before checking: a span is condensed in two steps, the Condensed Value first, then the same numbers
//    recomputed from the originals by every Display Period at or above it (the code the widgets use) and compared, exactly;
//    only when they are equal are the originals removed, in one database transaction that also refuses open work and
//    values that arrived since they were counted; on any difference the Condensed Value is taken back and the span stays;
//  - touch a period open work holds back, the demo, a Metric without a cap, or run twice for a day: the day is claimed in
//    retention_runs before work starts, and a run that stopped is taken over once its lease has run out.
// It acts for no person (the route is the job secret's); everything it reads is of the Workspace the Metric belongs to.
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { recordAudit } from "./audit-log";
import { condensedBetween, condensedPointById, discardCondensed, NotCondensed, storeCondensedFor } from "./condensed-values";
import { displayPeriodsFor, isLonger, shownSeries, type Shown } from "./display-periods";
import { yearStartOf } from "./fiscal-year";
import { periodEnd, periodStart, type YearStart } from "./periods";
import { keptFrom, ownPeriodsOf, type Retention, type RetentionPlan } from "./retention-rules";
import { planRetention, settleRetentions, workspaceToday, type PeriodCount } from "./retention-setting";
import { storedCap, storedRetention, type RetentionCap } from "./retention-words";
import { DEMO_WORKSPACE_ID } from "./team";
import type { CondensedPoint } from "./condensed-parts";
import type { Metric, Point } from "./types";
import { allRows, getMetrics } from "./workspace-data";

/** The most original values one Metric's run takes in a day; the next day carries on. Years of daily values take days. */
export const MAX_VALUES_PER_RUN = 5000;
/** The longest one Metric's run works, in milliseconds, and the longest one call works for all Metrics together. */
export const MAX_RUN_MS = 60_000;
const MAX_CALL_MS = 8 * 60_000;
/** The values one database transaction removes in delete mode. */
const BATCH = 1000;
/** Runs of a Metric that fail one after the other until it is stopped. */
export const FAILURES_TO_STOP = 3;
/** Database codes of a removal the database refused (retention_remove_values): open work, values that changed. */
const HELD_CODE = "ZF444";
const CHANGED_CODE = "ZF445";

/** What a call did, in counts. */
export type RetentionJobResult = {
  started: number; reminded: number;
  /** Metrics with a Retention in force that were looked at, and of those: claimed by another call, stopped, held to a new confirmation. */
  metrics: number; claimedElsewhere: number; stopped: number; needConfirmation: number;
  /** Spans condensed, periods and values removed, spans left alone (their check did not match, or values changed), spans left for open work. */
  condensed: number; periods: number; values: number; mismatches: number; heldBack: number;
  /** Metrics whose run failed. */
  failed: number;
};

/** What one Metric's run did. */
type Tally = { condensed: number; periods: number; values: number; breakdownRows: number; superseded: number; targets: number; projections: number; mismatches: number; heldBack: number; more: boolean; note: string | null; needsConfirmation: boolean };
const noTally = (): Tally => ({ condensed: 0, periods: 0, values: 0, breakdownRows: 0, superseded: 0, targets: 0, projections: 0, mismatches: 0, heldBack: 0, more: false, note: null, needsConfirmation: false });

/** What a Metric's page says when its Retention waits for a new confirmation, and when it stopped. */
const NEEDS_CONFIRMATION = "This Retention would take more of the old values than were confirmed: more arrived since. Look at what it would do and confirm it again; until then nothing is condensed or deleted.";
const NO_CONFIRMATION = "This Retention has no confirmation on record. Confirm it again to start it; until then nothing is condensed or deleted.";
const STOPPED = "Stopped after three runs that failed. Nothing was lost. Confirm the Retention again once the cause is fixed; whoever runs Ziffr finds it in the server log.";
const mismatchNote = (span: string) => `A check before condensing did not match for the span starting ${span}, so it was left as it is. Nothing was lost.`;

/** The stored state of a Metric's Retention for the confirmation in force: failures in a row, whether it stopped, what it said. */
async function stateOf(ws: string, metricId: number, confirmation: string | null): Promise<{ failures: number; stopped: boolean; note: string | null }> {
  const { data } = await db().from("retention_state").select("confirmation, failures, stopped, note").eq("workspace_id", ws).eq("metric_id", metricId).maybeSingle();
  // A new confirmation starts clean.
  if (!data || data.confirmation !== confirmation) return { failures: 0, stopped: false, note: null };
  return { failures: Number(data.failures), stopped: data.stopped === true, note: data.note ? String(data.note) : null };
}

/** Writes the state; the note is words only. */
async function saveState(ws: string, metricId: number, confirmation: string | null, s: { failures: number; stopped: boolean; note: string | null }, day: string): Promise<void> {
  const { error } = await db().from("retention_state").upsert({ metric_id: metricId, workspace_id: ws, confirmation, failures: s.failures, stopped: s.stopped, note: s.note?.slice(0, 300) ?? null, last_run_on: day, updated_at: new Date().toISOString() }, { onConflict: "metric_id" });
  if (error) console.error("Retention: the state of a Metric could not be saved");
}

/** The old backlog the cap holds to: the periods and values that were already older than the keep time on the day the
 * Retention was confirmed, those it would touch now and those open work still holds back (they were counted in the
 * confirmation as held back, and may be freed). Together they may not be more than the confirmation counted. What has
 * aged since is the ordinary effect of keeping N months, and is not held to the cap. */
function backlogOf(setting: Retention, own: Metric["period"], cap: RetentionCap, held: readonly PeriodCount[], plan: RetentionPlan, ys: YearStart): { periods: number; values: number } {
  const confirmed = keptFrom(cap.confirmed_on, setting.keep_months);
  const valuesOf = new Map(held.map((h) => [h.period_start, h.values_held]));
  // A period is backlog when it was old enough on the day of the confirmation: it, or for condensing the whole span it belongs to.
  const old = (p: string): boolean => {
    if (setting.then === "delete") return periodEnd(p, own) < confirmed;
    const { last } = ownPeriodsOf(own, periodStart(p, setting.into, ys), setting.into, ys);
    return periodEnd(last, own) < confirmed;
  };
  const hit = [...(setting.then === "delete" ? plan.delete : plan.condense.flatMap((c) => c.periods)), ...plan.heldBack].filter(old);
  return { periods: hit.length, values: hit.reduce((n, p) => n + (valuesOf.get(p) ?? 0), 0) };
}

/** The periods and values the Metric's earlier runs removed under this confirmation (their counts, which a
 * failed run keeps as far as it got). */
async function takenUnder(ws: string, metricId: number, confirmation: string): Promise<{ periods: number; values: number }> {
  const runs = await allRows<{ counts: { periods?: unknown; values?: unknown } | null }>((a, b) => db().from("retention_runs").select("counts").eq("workspace_id", ws).eq("metric_id", metricId).eq("confirmation", confirmation).in("state", ["done", "failed"]).order("id").range(a, b));
  const sum = (k: "periods" | "values") => runs.reduce((n, r) => n + (Number(r.counts?.[k]) || 0), 0);
  return { periods: sum("periods"), values: sum("values") };
}

/** A shown series, in the parts that must come out the same before and after condensing. */
function seenOf(s: Shown): string {
  return JSON.stringify([s.by, s.combined, s.reason ?? null, s.points.map((p) => [p.period, p.value, p.held, p.length, p.toDate, p.through, p.condensed?.into ?? null]), s.targets && [s.targets.at, s.targets.line, s.targets.range, s.targets.note]]);
}

/** Whether every Display Period at or above the Condensed Value's shows the same numbers, and the same Targets, with it
 * standing in for its originals as without it: the series the widgets draw (`shownSeries`), made once from the values and
 * Targets the Metric holds (the span's Targets as they will be once folded into the Condensed Value) and compared exactly.
 * Also gives how many original values the span holds now, for the removal to hold to. */
async function sameAsBefore(ws: string, metric: Metric, point: CondensedPoint, ys: YearStart, today: string): Promise<{ same: boolean; originals: number }> {
  const windows = displayPeriodsFor(metric.period).filter((d) => !isLonger(point.into, d)).map((d) => ({ d, from: periodStart(point.period, d, ys), to: periodEnd(point.periodEnd, d) }));
  const from = windows.reduce((a, w) => (w.from < a ? w.from : a), point.period);
  const to = windows.reduce((a, w) => (w.to > a ? w.to : a), point.periodEnd);
  const [valuesRead, targetsRead, beside] = await Promise.all([
    allRows<Record<string, unknown>>((a, b) => db().from("observations").select("id, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metric.id).gte("period_start", from).lte("period_start", to).order("period_start").order("created_at").order("id").range(a, b)),
    allRows<Record<string, unknown>>((a, b) => db().from("series_values").select("metric_id, kind, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", metric.id).eq("kind", "target").gte("period_start", from).lte("period_start", to).order("period_start").order("id").range(a, b)),
    condensedBetween(ws, metric.id, from, to),
  ]);
  // Values are sealed with the Workspace Key (spec 0028). One that does not open cannot be shown to equal itself: the
  // span is not the same as before, and nothing of it is removed.
  const [values, targets] = await Promise.all([openRows("observations", ws, valuesRead), openRows("series_values", ws, targetsRead)]) as [{ period_start: string; value: unknown }[], { period_start: string; value: unknown }[]];
  if ([...values, ...targets].some((r) => typeof r.value !== "number")) return { same: false, originals: 0 };
  const toPoint = (r: { period_start: string; value: unknown }): Point => ({ period: String(r.period_start), value: Number(r.value) });
  const series = values.map(toPoint);
  const allTargets = targets.map(toPoint);
  const outside = allTargets.filter((t) => t.period < point.period || t.period > point.periodEnd);
  const others = beside.filter((c) => c.period !== point.period);
  const originals = values.filter((v) => String(v.period_start) >= point.period && String(v.period_start) <= point.periodEnd).length;
  const data = (condensed: CondensedPoint[], t: Point[], inWindow: (p: string) => boolean) => ({
    metrics: [metric], series: { [metric.slug]: series.filter((p) => inWindow(p.period)) }, targets: { [metric.id]: t.filter((p) => inWindow(p.period)) },
    yearStart: ys, today, condensed: { [metric.id]: condensed },
  });
  for (const w of windows) {
    const inWindow = (p: string) => p >= w.from && p <= w.to;
    const near = (c: CondensedPoint) => c.period <= w.to && c.periodEnd >= w.from;
    const before = shownSeries(metric, data(others.filter(near), allTargets, inWindow), w.d, { today });
    const after = shownSeries(metric, data([...others, point].filter(near), outside, inWindow), w.d, { today });
    if (seenOf(before) !== seenOf(after)) return { same: false, originals };
  }
  return { same: true, originals };
}

/** The refusal codes of a removal, or null for any other failure. */
const codeOf = (e: unknown): string | null => {
  const c = (e as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : null;
};

/** Removes values with their history through the one transaction that checks open work and the count. */
async function removeValues(ws: string, metricId: number, from: string, to: string, periods: string[] | null, expected: number, states: boolean, condensed: string | null = null): Promise<{ values: number; breakdown_rows: number; superseded: number; targets: number }> {
  const { data, error } = await db().rpc("retention_remove_values", { p_ws: ws, p_metric: metricId, p_from: from, p_to: to, p_periods: periods, p_expected: expected, p_states: states, p_condensed: condensed });
  if (error) throw error;
  return data as { values: number; breakdown_rows: number; superseded: number; targets: number };
}

type Run = { claim: number; ws: string; metric: Metric; setting: Retention; ys: YearStart; today: string; started: number; tally: Tally; metrics: Metric[] };

/** Condenses one span: the Condensed Value, the check, then the removal of the originals. */
async function condenseSpan(r: Run, span: string, into: Extract<Retention, { then: "condense" }>["into"], expected: number): Promise<void> {
  const { ws, metric } = r;
  // Still ours: a run another call took over (its lease ran out) is told apart by the claim being newer than ours.
  await db().from("retention_runs").update({ claimed_at: new Date().toISOString() }).eq("id", r.claim);
  const end = periodEnd(span, into);
  // What is condensed already in the span's days: the very same span (a run that stopped between its two steps left it) is
  // checked like a new one; any other (the Retention was condensed into another period before) is left as it is.
  const { data: beside } = await db().from("condensed_values").select("id, period_start, period_end, span").eq("workspace_id", ws).eq("metric_id", metric.id).lte("period_start", end).gte("period_end", span);
  const same = (beside ?? []).filter((c) => c.period_start === span && c.period_end === end && c.span === into);
  if ((beside ?? []).length > same.length) { r.tally.mismatches++; r.tally.note = `The span starting ${span} overlaps values condensed into another period before, so it was left as it is.`; return; }
  let id: string;
  try {
    id = same.length ? String(same[0].id) : await storeCondensedFor(ws, metric, { metricId: metric.id, into, span });
  } catch (e) {
    // A span that cannot be condensed (it is too recent, it has no values) stays as it is.
    if (e instanceof NotCondensed) { r.tally.mismatches++; r.tally.note = `The span starting ${span} could not be condensed: ${e.message}`; return; }
    throw e;
  }
  // The database takes it back only while the span still holds its originals, so a Condensed Value that stands alone is never lost.
  const take = async () => { await discardCondensed(ws, id); };
  try {
    const point = await condensedPointById(ws, id);
    const checked = point ? await sameAsBefore(ws, metric, point, r.ys, r.today) : { same: false, originals: 0 };
    // Another run finished this span while we were on the way: nothing is left to do.
    if (point && checked.originals === 0) return;
    if (!point || !checked.same) { await take(); r.tally.mismatches++; r.tally.note = mismatchNote(span); await recordAudit(ws, null, { kind: "retention.mismatch", object: { type: "metric", id: metric.id, name: metric.name }, details: { span, into } }); return; }
    const gone = await removeValues(ws, metric.id, point.period, point.periodEnd, null, checked.originals, false, id);
    r.tally.condensed++; r.tally.values += gone.values; r.tally.breakdownRows += gone.breakdown_rows; r.tally.superseded += gone.superseded; r.tally.targets += gone.targets;
    r.tally.periods += expected;
  } catch (e) {
    // Whatever went wrong, a span whose originals are still there goes back to them; the failure is counted by the caller.
    await take().catch(() => {});
    const code = codeOf(e);
    if (code === HELD_CODE) { r.tally.heldBack++; return; }
    if (code === CHANGED_CODE) { r.tally.mismatches++; r.tally.note = mismatchNote(span); return; }
    throw e;
  }
}

/** Deletes periods, oldest first, in transactions of about BATCH values, until the day's budget of values or time is spent. */
async function deletePeriods(r: Run, periods: string[], held: readonly PeriodCount[]): Promise<void> {
  const counts = new Map(held.map((h) => [h.period_start, h.values_held]));
  let batch: string[] = [];
  let values = 0;
  const flush = async (): Promise<boolean> => {
    if (!batch.length) return true;
    const mine = batch;
    const expected = values;
    batch = []; values = 0;
    try {
      const gone = await removeValues(r.ws, r.metric.id, mine[0], mine[mine.length - 1], mine, expected, true);
      r.tally.periods += mine.length; r.tally.values += gone.values; r.tally.breakdownRows += gone.breakdown_rows; r.tally.superseded += gone.superseded; r.tally.targets += gone.targets;
      return true;
    } catch (e) {
      const code = codeOf(e);
      if (code === HELD_CODE) { r.tally.heldBack += mine.length; return false; }
      if (code === CHANGED_CODE) { r.tally.mismatches++; r.tally.note = "Values arrived or changed while it ran, so a batch was left as it is. Nothing was lost."; return false; }
      throw e;
    }
  };
  for (const p of periods) {
    const n = counts.get(p) ?? 0;
    const spent = r.tally.values + values;
    if ((spent > 0 && spent + n > MAX_VALUES_PER_RUN) || Date.now() - r.started > MAX_RUN_MS) { r.tally.more = true; break; }
    if (batch.length && values + n > BATCH) { if (!(await flush())) return; }
    batch.push(p); values += n;
  }
  await flush();
}

/** Deletes the Projections of past periods older than the keep time: in both modes, since a Projection was never a value. */
async function deleteProjections(r: Run, cutoff: string): Promise<void> {
  const rows = await allRows<{ id: number; period_start: string }>((a, b) => db().from("series_values").select("id, period_start").eq("workspace_id", r.ws).eq("metric_id", r.metric.id).eq("kind", "projection").lt("period_start", cutoff).order("id").range(a, b));
  const ids = rows.filter((p) => periodEnd(p.period_start, r.metric.period) < cutoff).map((p) => p.id);
  for (let i = 0; i < ids.length; i += 500) {
    if (Date.now() - r.started > MAX_RUN_MS) { r.tally.more = true; break; }
    const { error } = await db().from("series_values").delete().eq("workspace_id", r.ws).eq("metric_id", r.metric.id).eq("kind", "projection").in("id", ids.slice(i, i + 500));
    if (error) throw new Error("Projections could not be removed.");
    r.tally.projections += Math.min(500, ids.length - i);
  }
}

/** One Metric's day: the plan from what the Metric holds, the cap, then the work in small steps. */
async function work(r: Run, cap: RetentionCap): Promise<void> {
  const { ws, metric, setting, ys, today } = r;
  const plan = await planRetention(ws, metric, setting, today, ys, r.metrics);
  if (plan.problem) { r.tally.note = plan.problem; return; }
  const backlog = backlogOf(setting, metric.period, cap, plan.held, plan.plan, ys);
  // What earlier runs took counts against the cap too: values that arrive for periods already cleared (they are not refused
  // when deleted) must not make room for more than was confirmed.
  const taken = await takenUnder(ws, metric.id, cap.id);
  if (backlog.periods + taken.periods > cap.periods + cap.held_back_periods || backlog.values + taken.values > cap.values + cap.held_back_values) { r.tally.needsConfirmation = true; r.tally.note = NEEDS_CONFIRMATION; return; }
  const valuesOf = new Map(plan.held.map((h) => [h.period_start, h.values_held]));
  if (setting.then === "delete") await deletePeriods(r, plan.plan.delete, plan.held);
  else {
    for (const c of plan.plan.condense) {
      const n = c.periods.reduce((sum, p) => sum + (valuesOf.get(p) ?? 0), 0);
      if (r.tally.values + n > MAX_VALUES_PER_RUN && r.tally.condensed > 0) { r.tally.more = true; break; }
      if (Date.now() - r.started > MAX_RUN_MS) { r.tally.more = true; break; }
      await condenseSpan(r, c.period, setting.into, c.periods.length);
    }
  }
  await deleteProjections(r, plan.cutoff);
}

/** The words an Owner reads on the page and in the Audit Log about a run, counts only. */
const detailsOf = (t: Tally) => ({ condensed: t.condensed, periods: t.periods, values: t.values, breakdown_rows: t.breakdownRows, superseded: t.superseded, targets: t.targets, projections: t.projections, held_back: t.heldBack, mismatches: t.mismatches, more_to_do: t.more });

/** One Metric with a Retention in force, for one day. */
async function runMetric(ws: string, metric: Metric, ctx: { today: string; ys: YearStart; metrics: Metric[] }, out: RetentionJobResult): Promise<void> {
  const { data: raw } = await db().from("metrics").select("retention, retention_cap").eq("id", metric.id).eq("workspace_id", ws).maybeSingle();
  const setting = storedRetention(raw?.retention);
  if (!setting) return;
  out.metrics++;
  const cap = storedCap(raw?.retention_cap);
  const confirmation = cap?.id ?? null;
  const state = await stateOf(ws, metric.id, confirmation);
  if (state.stopped) { out.stopped++; return; }
  // Without a confirmation on record nothing is taken: a Retention is held to what a person was shown.
  if (!cap) {
    out.needConfirmation++;
    if (state.note !== NO_CONFIRMATION) await recordAudit(ws, null, { kind: "retention.needs_confirmation", object: { type: "metric", id: metric.id, name: metric.name }, details: { reason: "no confirmation on record" } });
    await saveState(ws, metric.id, null, { failures: 0, stopped: false, note: NO_CONFIRMATION }, ctx.today);
    return;
  }
  const { data: claimed } = await db().rpc("claim_retention_run", { p_ws: ws, p_metric: metric.id, p_day: ctx.today });
  if (claimed === null || claimed === undefined) { out.claimedElsewhere++; return; }
  await db().from("retention_runs").update({ confirmation: cap.id }).eq("id", claimed);
  const run: Run = { claim: Number(claimed), ws, metric, setting, ys: ctx.ys, today: ctx.today, started: Date.now(), tally: noTally(), metrics: ctx.metrics };
  try {
    await work(run, cap);
  } catch (e) {
    const failures = state.failures + 1;
    const stopped = failures >= FAILURES_TO_STOP;
    console.error(`Retention: a run failed (${codeOf(e) ?? "error"})`);
    await db().from("retention_runs").update({ state: "failed", finished_at: new Date().toISOString(), error: (codeOf(e) ?? "error").slice(0, 100), counts: detailsOf(run.tally) }).eq("id", claimed);
    await saveState(ws, metric.id, confirmation, { failures, stopped, note: stopped ? STOPPED : state.note }, ctx.today);
    if (stopped) { out.stopped++; await recordAudit(ws, null, { kind: "retention.stopped", object: { type: "metric", id: metric.id, name: metric.name }, details: { failures } }); }
    out.failed++;
    return;
  }
  const t = run.tally;
  await db().from("retention_runs").update({ state: "done", finished_at: new Date().toISOString(), counts: detailsOf(t) }).eq("id", claimed);
  if (t.needsConfirmation) {
    out.needConfirmation++;
    if (state.note !== NEEDS_CONFIRMATION) await recordAudit(ws, null, { kind: "retention.needs_confirmation", object: { type: "metric", id: metric.id, name: metric.name }, details: { reason: "more than was confirmed" } });
  }
  await saveState(ws, metric.id, confirmation, { failures: 0, stopped: false, note: t.note }, ctx.today);
  out.condensed += t.condensed; out.periods += t.periods; out.values += t.values; out.mismatches += t.mismatches; out.heldBack += t.heldBack;
  // A run that did nothing writes nothing, so a Metric with nothing old does not fill the log every day.
  if (t.condensed || t.periods || t.projections || t.mismatches || t.heldBack) await recordAudit(ws, null, { kind: "retention.run", object: { type: "metric", id: metric.id, name: metric.name }, details: detailsOf(t) });
}

/** The daily job: lets confirmed Retentions start and sends their reminders, then condenses or deletes for every Metric
 * with a Retention in force (never in the demo), each Metric once a day however many calls come, in small steps that
 * carry on the next day. Answers counts only. Safe to call as often as you like, and from two servers at once. `only` limits
 * it to one Workspace, which is for tests: the route never passes it. */
export async function retentionJob(now = new Date(), only?: { workspaceId: string }): Promise<RetentionJobResult> {
  const settled = await settleRetentions(now, only);
  const out: RetentionJobResult = { started: settled.started, reminded: settled.reminded, metrics: 0, claimedElsewhere: 0, stopped: 0, needConfirmation: 0, condensed: 0, periods: 0, values: 0, mismatches: 0, heldBack: 0, failed: 0 };
  const rows = await allRows<{ id: number; workspace_id: string }>((from, to) => {
    const q = db().from("metrics").select("id, workspace_id").not("retention", "is", null).neq("workspace_id", DEMO_WORKSPACE_ID);
    return (only ? q.eq("workspace_id", only.workspaceId) : q).order("id").range(from, to);
  });
  // The Metrics that were looked at longest ago first (never looked at: first), so a day's time spent on a few Metrics of
  // one Workspace cannot keep the others from ever being reached.
  const states = await allRows<{ metric_id: number; last_run_on: string | null }>((from, to) => db().from("retention_state").select("metric_id, last_run_on").order("metric_id").range(from, to));
  const lastRun = new Map(states.map((x) => [x.metric_id, x.last_run_on ?? ""]));
  rows.sort((a, b) => (lastRun.get(a.id) ?? "").localeCompare(lastRun.get(b.id) ?? "") || a.id - b.id);
  const byWorkspace = new Map<string, number[]>();
  for (const r of rows) byWorkspace.set(r.workspace_id, [...(byWorkspace.get(r.workspace_id) ?? []), r.id]);
  const began = Date.now();
  for (const [ws, ids] of byWorkspace) {
    try {
      const [today, ys, metrics] = await Promise.all([workspaceToday(ws, now), yearStartOf(ws), getMetrics(ws)]);
      for (const id of ids) {
        // What is not reached today is reached by the next call: the day of a Metric is claimed only when it is worked on.
        if (Date.now() - began > MAX_CALL_MS) return out;
        const metric = metrics.find((m) => m.id === id);
        if (!metric || metric.formula) continue;
        try {
          await runMetric(ws, metric, { today, ys, metrics }, out);
        } catch (e) {
          out.failed++;
          console.error(`Retention: a Metric could not be run (${codeOf(e) ?? "error"})`);
        }
      }
    } catch (e) {
      out.failed++;
      console.error(`Retention: a Workspace could not be run (${codeOf(e) ?? "error"})`);
    }
  }
  return out;
}
