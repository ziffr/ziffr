// Retention, the setting and its preview (spec 0033, ticket #381; GLOSSARY: Retention, Condensed Value, Snapshot): a
// Metric's Retention and the Workspace's default for new Metrics, the preview that shows in counts what a Retention
// would do, the confirmation that needs it, the 7 days in which a confirmed Retention can be cancelled, and who is told.
// Nothing here condenses or deletes a value: the daily job is a later ticket (#382); it calls `settleRetentions` for the
// days and the reminders. Only Owners set the Workspace default; a Metric's own is set by its Metric Owner, an Owner or
// an Admin. A program never sets one (the API and the MCP Server only read it). The preview holds counts and the names of
// Snapshots the person may open, never a value.
import { createHash } from "node:crypto";
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { refuseInDemo } from "./demo";
import { deliverNotice } from "./deliveries";
import { visibleDashboards, visibleMetricIds } from "./access";
import { formulaInputs } from "./formula";
import { isLonger } from "./display-periods";
import { yearStartOf } from "./fiscal-year";
import { periodEnd, periodStart, type YearStart } from "./periods";
import { firstRunDay, parseRetention, reminderDay, retentionPlan, retentionProblem, keptFrom, type CondenseInto, type Retention, type RetentionMetric } from "./retention-rules";
import { NUMBERS_CHANGED, needsConfirmation, retentionWords, storedPending, storedRetention, dayWords, pendingNote, type PendingRetention } from "./retention-words";
import { localTime } from "./workspace-clock";
import { allRows, getMetrics } from "./workspace-data";
import type { Metric, Period } from "./types";

export { NUMBERS_CHANGED };

/** What a preview counts for one Metric: periods and values, never a number a value held. */
export type RetentionPreview = {
  metricId: number;
  /** The Metric's name, which the person sees (the core only previews a Metric they may set). */
  name: string;
  setting: Retention;
  /** The first day whose values are kept; periods ending before it are older than the Retention. */
  keptFrom: string;
  /** The first and last period the Retention would touch, or null when it touches none. */
  firstPeriod: string | null;
  lastPeriod: string | null;
  /** Periods deleted, or condensed (each stands in a span). */
  periods: number;
  /** Stored values of those periods. */
  values: number;
  /** Condense: the Condensed Values that would be made. */
  condensedValues: number;
  breakdownRows: number;
  /** Superseded Values (earlier values and replaced Breakdown rows) of those periods. */
  supersededValues: number;
  /** Target rows that go (delete) or are folded into a Condensed Value (condense). */
  targets: number;
  /** Projections of past periods older than the Retention: deleted in both modes. */
  projections: number;
  lockedPeriods: number;
  /** Older periods left alone because open work holds them. */
  heldBack: number;
  /** Older periods left as they are because condensing them would show a longer Display Period differently. */
  uneven: number;
  /** Derived Metrics that read this one. */
  derivedReaders: number;
  /** Snapshots and frozen View Links that already hold these periods: they keep what they showed. */
  snapshots: number;
  viewLinks: number;
  /** Snapshots among those the person may open, by dashboard and label (at most ten). */
  snapshotNames: string[];
  /** Why the setting cannot be used on this Metric, or null. */
  problem: string | null;
  /** Of the counts above: a confirmation sends it back, and the core compares it with what it finds then. */
  fingerprint: string;
};

/** The preview of one Retention over many Metrics (the Workspace's Apply to existing Metrics). */
export type WorkspaceRetentionPreview = {
  setting: Retention;
  /** Metrics that would get it, with what it would do to each (the first 100 by name). */
  metrics: RetentionPreview[];
  /** How many Metrics get it, and how many are left alone, with the reasons of the commonest. */
  applies: number;
  skipped: { count: number; reasons: string[] };
  totals: Pick<RetentionPreview, "periods" | "values" | "condensedValues" | "breakdownRows" | "supersededValues" | "targets" | "projections" | "lockedPeriods" | "heldBack" | "snapshots" | "viewLinks">;
  fingerprint: string;
};

/** How many ids or dates one lookup asks the database about at once (its filter list, not a limit of Ziffr's). */
const AT_A_TIME = 300;
/** The most Metrics a Workspace preview works on in parallel. */
const PARALLEL = 4;
/** Snapshots read at most per Metric to count and name them. */
const MAX_SNAPSHOTS_READ = 2000;
const MAX_NAMES = 10;
const MAX_ROWS = 100;

/** The states of a period that its Workflow has not finished: such a period is held back. */
const OPEN_STATES = ["asked", "submitted", "approval"];

const chunks = <T,>(items: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += AT_A_TIME) out.push(items.slice(i, i + AT_A_TIME));
  return out;
};

/** The calendar day in the Workspace's time zone. */
export async function workspaceToday(ws: string, now = new Date()): Promise<string> {
  const { data } = await db().from("workspaces").select("time_zone").eq("id", ws).maybeSingle();
  return localTime(now, (data?.time_zone as string | undefined) ?? "UTC").day;
}

type Row = Pick<Metric, "id" | "slug" | "name" | "owner_id" | "period" | "aggregation" | "formula"> & { retention: unknown; retention_pending: unknown; archived_at?: string | null };
const COLUMNS = "id, slug, name, owner_id, period, aggregation, formula, retention, retention_pending, archived_at";

/** The Metric, when the actor sees it and may set its Retention: Owners and Admins, and the Metric's own Metric Owner;
 * never a Guest or a key, never in the demo. A Metric of another Workspace, a hidden one and a missing one are refused
 * alike. */
async function settableMetric(actor: Actor, metricId: number): Promise<Row> {
  refuseInDemo(actor);
  if (actor.key || !Number.isInteger(metricId)) throw new Forbidden();
  const { data: m } = await db().from("metrics").select(COLUMNS).eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!m || !(await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId))).has(m.id)) throw new Forbidden();
  if (!(actor.role === "owner" || actor.role === "admin" || (actor.role !== "guest" && m.owner_id === actor.personId))) throw new Forbidden("Only Owners, Admins and the Metric's owner set its Retention.");
  return m as Row;
}

/** Whether the actor may set this Metric's Retention, for showing the controls; the core checks again. */
export async function canSetRetention(actor: Actor, metricId: number): Promise<boolean> {
  return settableMetric(actor, metricId).then(() => true, () => false);
}

/** The setting as the browser sent it, or why it is not one, in words for people. */
function parsed(raw: unknown): Retention | null {
  const r = parseRetention(raw ?? null);
  if (!r.ok) throw new Error(r.reason);
  return r.retention;
}

/** What a Retention does to one Metric on `today`, in counts. Reads only; `m` is a Metric the actor may set. */
async function previewMetric(actor: Actor, m: Row, setting: Retention, today: string, ys: YearStart, ctx: { metrics: Metric[]; visible: Set<number>; dashboards: Map<number, string> }): Promise<RetentionPreview> {
  const ws = actor.workspaceId;
  const empty: Omit<RetentionPreview, "fingerprint"> = { metricId: m.id, name: m.name, setting, keptFrom: keptFrom(today, setting.keep_months), firstPeriod: null, lastPeriod: null, periods: 0, values: 0, condensedValues: 0, breakdownRows: 0, supersededValues: 0, targets: 0, projections: 0, lockedPeriods: 0, heldBack: 0, uneven: 0, derivedReaders: 0, snapshots: 0, viewLinks: 0, snapshotNames: [], problem: null };
  const finish = (p: Omit<RetentionPreview, "fingerprint">): RetentionPreview => ({ ...p, fingerprint: fingerprintOf([p.setting, p.keptFrom, p.firstPeriod, p.lastPeriod, p.periods, p.values, p.condensedValues, p.breakdownRows, p.supersededValues, p.targets, p.projections, p.lockedPeriods, p.heldBack, p.uneven, p.derivedReaders, p.snapshots, p.viewLinks, p.problem]) });
  const metric: RetentionMetric = { period: m.period as Period, aggregation: m.aggregation, formula: m.formula };
  const problem = retentionProblem(setting, metric);
  if (problem) return finish({ ...empty, problem });
  const readers = ctx.metrics.filter((o) => o.formula && formulaInputs(o.formula).includes(m.slug));
  empty.derivedReaders = readers.length;
  if (setting.then === "delete" && readers.length) return finish({ ...empty, problem: "Another Metric is derived from this one, so its values cannot be deleted. Condense them, or change the Derived Metric first." });
  if (setting.then === "condense" && readers.some((o) => isLonger(setting.into, o.period))) return finish({ ...empty, problem: "A Derived Metric reads this one by a shorter period than it would be condensed into. Pick a shorter period, or change the Derived Metric first." });

  const cutoff = empty.keptFrom;
  const [obs, locked, openStates, openActions] = await Promise.all([
    allRows<{ id: number; period_start: string }>((from, to) => db().from("observations").select("id, period_start").eq("workspace_id", ws).eq("metric_id", m.id).lt("period_start", cutoff).order("id").range(from, to)),
    allRows<{ period_start: string }>((from, to) => db().from("period_states").select("period_start").eq("metric_id", m.id).eq("state", "locked").lt("period_start", cutoff).order("period_start").range(from, to)),
    allRows<{ period_start: string }>((from, to) => db().from("period_states").select("period_start").eq("metric_id", m.id).in("state", OPEN_STATES).lt("period_start", cutoff).order("period_start").range(from, to)),
    allRows<{ period_start: string }>((from, to) => db().from("actions").select("period_start").eq("workspace_id", ws).eq("metric_id", m.id).in("status", ["open", "answered"]).lt("period_start", cutoff).order("id").range(from, to)),
  ]);
  const lockedSet = new Set(locked.map((l) => l.period_start));
  const held = new Set([...openStates, ...openActions].map((h) => h.period_start));
  const stored = [...new Set(obs.map((o) => o.period_start))].map((period) => ({ period, locked: lockedSet.has(period), heldBack: held.has(period) }));
  const plan = retentionPlan(setting, metric, stored, today, ys);
  const affected = new Set(setting.then === "delete" ? plan.delete : plan.condense.flatMap((c) => c.periods));
  const spans = new Set(plan.condense.map((c) => c.period));
  const hit = obs.filter((o) => affected.has(o.period_start));
  const sorted = [...affected].sort();

  const count = async (table: string, column: string, values: readonly (string | number)[], extra: (q: any) => any = (q) => q): Promise<number> => { // eslint-disable-line @typescript-eslint/no-explicit-any -- a filter builder of any table
    let n = 0;
    for (const part of chunks(values)) {
      const { count: c } = await extra(db().from(table).select("*", { count: "exact", head: true }).in(column, part as never));
      n += c ?? 0;
    }
    return n;
  };
  const ids = hit.map((o) => o.id);
  const [breakdownRows, replacedValues, replacedRows, targetRows, projectionRows] = await Promise.all([
    count("breakdown_rows", "observation_id", ids, (q) => q.eq("workspace_id", ws)),
    count("observation_history", "period_start", sorted, (q) => q.eq("workspace_id", ws).eq("metric_id", m.id)),
    count("breakdown_history", "observation_id", ids, (q) => q.eq("workspace_id", ws)),
    allRows<{ period_start: string }>((from, to) => db().from("series_values").select("period_start").eq("workspace_id", ws).eq("metric_id", m.id).eq("kind", "target").lt("period_start", cutoff).order("period_start").range(from, to)),
    allRows<{ period_start: string }>((from, to) => db().from("series_values").select("period_start").eq("workspace_id", ws).eq("metric_id", m.id).eq("kind", "projection").lt("period_start", cutoff).order("period_start").range(from, to)),
  ]);
  const into: CondenseInto | null = setting.then === "condense" ? setting.into : null;
  const targets = targetRows.filter((t) => (into ? spans.has(periodStart(t.period_start, into, ys)) : affected.has(t.period_start))).length;
  // A Projection of a past period older than the Retention goes in both modes: it was never an Observation.
  const projections = projectionRows.filter((p) => periodEnd(p.period_start, m.period as Period) < cutoff).length;

  const { snapshots, names } = await snapshotsHolding(actor, m.id, sorted[0] ?? null, ctx);
  const viewLinks = sorted.length ? await frozenViewLinks(ws, m.id, today) : 0;
  return finish({
    ...empty, firstPeriod: sorted[0] ?? null, lastPeriod: sorted[sorted.length - 1] ?? null,
    periods: affected.size, values: hit.length, condensedValues: plan.condense.length, breakdownRows, supersededValues: replacedValues + replacedRows,
    targets, projections, lockedPeriods: setting.then === "delete" ? plan.deletedLocked : plan.condense.filter((c) => c.locked).length,
    heldBack: plan.heldBack.length, uneven: plan.uneven.length, snapshots: sorted.length ? snapshots : 0, viewLinks, snapshotNames: sorted.length ? names : [],
  });
}

/** Snapshots that kept this Metric and reach into the affected periods, counted for the Workspace and named only where
 * the actor may open them: its dashboard and every Metric it kept. */
async function snapshotsHolding(actor: Actor, metricId: number, from: string | null, ctx: { visible: Set<number>; dashboards: Map<number, string> }): Promise<{ snapshots: number; names: string[] }> {
  if (!from) return { snapshots: 0, names: [] };
  const { data } = await db().from("dashboard_snapshots").select("id, dashboard_id, label, kept:frozen->data->metrics").eq("workspace_id", actor.workspaceId).is("deleted_at", null).not("frozen", "is", null).gte("period_end", from).order("id").limit(MAX_SNAPSHOTS_READ);
  const rows = ((data ?? []) as unknown as { id: number; dashboard_id: number; label: string; kept: { id: number }[] | null }[]).filter((r) => (r.kept ?? []).some((k) => Number(k.id) === metricId));
  const names = rows.filter((r) => ctx.dashboards.has(r.dashboard_id) && (r.kept ?? []).every((k) => ctx.visible.has(Number(k.id)))).slice(0, MAX_NAMES).map((r) => `${ctx.dashboards.get(r.dashboard_id)}, ${r.label}`);
  return { snapshots: rows.length, names };
}

/** Frozen View Links, still working, that show this Metric: what they showed stays. */
async function frozenViewLinks(ws: string, metricId: number, today: string): Promise<number> {
  const { count } = await db().from("view_links").select("id", { count: "exact", head: true }).eq("workspace_id", ws).contains("metric_ids", [metricId]).not("frozen", "is", null).is("revoked_at", null).gte("expires_at", today);
  return count ?? 0;
}

/** One short fingerprint of a list of counts, so a confirmation can say "these are the numbers I was shown": the core
 * recomputes the counts and compares. Counts only, never a value. */
function fingerprintOf(parts: readonly unknown[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

/** What a loop over Metrics needs once: the Workspace's Metrics, what the actor sees, and the dashboards they may open. */
async function context(actor: Actor) {
  const metrics = await getMetrics(actor.workspaceId);
  const [visible, dashboards] = await Promise.all([visibleMetricIds(actor.workspaceId, actor.personId, metrics), visibleDashboards(actor.workspaceId, actor.personId)]);
  return { metrics, visible, dashboards: new Map(dashboards.map((d) => [d.id, d.name])) };
}

/** What a Retention would do to one Metric, in counts: the preview the page shows before anything is turned on. For
 * the Metric's owner, an Owner or an Admin; the setting comes from a browser and is checked like any other input. */
export async function retentionPreview(actor: Actor, metricId: number, rawSetting: unknown): Promise<RetentionPreview> {
  const m = await settableMetric(actor, Number(metricId));
  const setting = parsed(rawSetting);
  if (!setting) throw new Error("Pick how long to keep values, and what then happens, to see what it would do.");
  const [ys, today, ctx] = await Promise.all([yearStartOf(actor.workspaceId), workspaceToday(actor.workspaceId), context(actor)]);
  return previewMetric(actor, m, setting, today, ys, ctx);
}

/** The Metrics an Owner's setting would apply to: those the actor may set, in use or archived, that have no Retention
 * and none waiting, with the reason for each one left out. */
async function eligible(actor: Actor, setting: Retention) {
  const ctx = await context(actor);
  const mayAll = actor.role === "owner";
  const applies: Row[] = [];
  const reasons = new Map<string, number>();
  const { data } = await db().from("metrics").select(COLUMNS).eq("workspace_id", actor.workspaceId).order("name").limit(5000);
  for (const m of (data ?? []) as Row[]) {
    if (!mayAll || !ctx.visible.has(m.id)) continue;
    if (storedRetention(m.retention) || storedPending(m.retention_pending)) continue;
    const why = retentionProblem(setting, { period: m.period as Period, aggregation: m.aggregation, formula: m.formula });
    if (why) reasons.set(why, (reasons.get(why) ?? 0) + 1);
    else applies.push(m);
  }
  return { ctx, applies, reasons };
}

/** What the Workspace's setting would do to every existing Metric that has none (Apply to existing Metrics), in counts.
 * Owners only. */
export async function retentionPreviewAll(actor: Actor, rawSetting: unknown): Promise<WorkspaceRetentionPreview> {
  refuseInDemo(actor);
  if (actor.key || actor.role !== "owner") throw new Forbidden("Only Owners apply a Retention to every Metric.");
  const setting = parsed(rawSetting);
  if (!setting) throw new Error("Pick how long to keep values, and what then happens, to see what it would do.");
  const [ys, today, { ctx, applies, reasons }] = await Promise.all([yearStartOf(actor.workspaceId), workspaceToday(actor.workspaceId), eligible(actor, setting)]);
  const all: RetentionPreview[] = [];
  for (let i = 0; i < applies.length; i += PARALLEL) all.push(...(await Promise.all(applies.slice(i, i + PARALLEL).map((m) => previewMetric(actor, m, setting, today, ys, ctx)))));
  // A Metric the setting cannot be used on (a Derived Metric reads it) is left out with its reason, not offered.
  const usable = all.filter((p) => !p.problem);
  for (const p of all) if (p.problem) reasons.set(p.problem, (reasons.get(p.problem) ?? 0) + 1);
  const sum = (key: keyof WorkspaceRetentionPreview["totals"]) => usable.reduce((n, p) => n + (p[key] as number), 0);
  const totals = { periods: sum("periods"), values: sum("values"), condensedValues: sum("condensedValues"), breakdownRows: sum("breakdownRows"), supersededValues: sum("supersededValues"), targets: sum("targets"), projections: sum("projections"), lockedPeriods: sum("lockedPeriods"), heldBack: sum("heldBack"), snapshots: sum("snapshots"), viewLinks: sum("viewLinks") };
  const skipped = { count: [...reasons.values()].reduce((a, b) => a + b, 0), reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([why, n]) => `${n}: ${why}`) };
  return { setting, metrics: usable.slice(0, MAX_ROWS), applies: usable.length, skipped, totals, fingerprint: fingerprintOf([setting, usable.map((p) => [p.metricId, p.fingerprint])]) };
}

/** What a confirmed Retention says to the people it concerns: who must know before values go. Never a value. */
async function tell(ws: string, m: Pick<Row, "slug" | "name" | "owner_id">, people: string[], subject: string, text: string): Promise<void> {
  for (const recipientId of [...new Set(people)]) {
    try {
      await deliverNotice(ws, { recipientId, senderId: null, subject, text, link: `/metrics/${m.slug}` });
    } catch {
      // A message that cannot go must not undo a setting that was saved: the Metric page says it all the same.
      console.error("Retention: a notice could not be written");
    }
  }
}

const summary = (r: Retention | null) => (r ? retentionWords(r) : "none").slice(0, 120);

/** The words of the notice the Metric's owner and the person who set it get when a Retention is scheduled. */
function scheduledText(m: Pick<Row, "name">, p: PendingRetention, cutoff: string): string {
  return `${pendingNote(p, cutoff)} That is the Retention of ${m.name}: ${retentionWords(p.retention)}. Until ${dayWords(p.starts_on)} it can be cancelled on the Metric page; nothing is condensed or deleted before then.`;
}

/** Writes a confirmed Retention as waiting, or in force when it needs no confirmation, and records and tells it. */
async function store(actor: Actor, m: Row, setting: Retention | null, shown: string | null, today: string, ys: YearStart, ctx: Awaited<ReturnType<typeof context>>, extra: { applied?: boolean } = {}): Promise<{ pending: PendingRetention | null; changed: boolean }> {
  const active = storedRetention(m.retention);
  const waiting = storedPending(m.retention_pending);
  if (!setting) {
    if (!active && !waiting) return { pending: null, changed: false };
    const { error } = await db().from("metrics").update({ retention: null, retention_pending: null }).eq("id", m.id).eq("workspace_id", actor.workspaceId);
    if (error) throw new Error("The Retention could not be saved.");
    await audit(actor, { kind: "metric.retention_set", object: { type: "metric", id: m.id, name: m.name }, details: { from: summary(active), to: "none" } });
    return { pending: null, changed: true };
  }
  const problem = retentionProblem(setting, { period: m.period as Period, aggregation: m.aggregation, formula: m.formula });
  if (problem) throw new Error(problem);
  if (!needsConfirmation(active, setting)) {
    if (JSON.stringify(active) === JSON.stringify(setting) && !waiting) return { pending: null, changed: false };
    // Longer, or softer, than what is in force: it takes effect now and any waiting one is dropped (it was stricter).
    const { error } = await db().from("metrics").update({ retention: setting, retention_pending: null }).eq("id", m.id).eq("workspace_id", actor.workspaceId);
    if (error) throw new Error("The Retention could not be saved.");
    await audit(actor, { kind: "metric.retention_set", object: { type: "metric", id: m.id, name: m.name }, details: { from: summary(active), to: summary(setting) } });
    return { pending: null, changed: true };
  }
  // A setting that deletes or condenses more must come with the counts the person was shown, and they must still hold.
  const preview = await previewMetric(actor, m, setting, today, ys, ctx);
  if (preview.problem) throw new Error(preview.problem);
  if (shown !== preview.fingerprint) throw new Error(NUMBERS_CHANGED);
  const pending: PendingRetention = { retention: setting, starts_on: firstRunDay(today), confirmed_on: today, set_by: actor.personId, told: true, reminded: false };
  const { error } = await db().from("metrics").update({ retention_pending: pending }).eq("id", m.id).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The Retention could not be saved.");
  await audit(actor, { kind: "metric.retention_set", object: { type: "metric", id: m.id, name: m.name }, details: { from: summary(active), to: summary(setting), starts_on: pending.starts_on, ...(extra.applied ? { applied_to_all: true } : {}) } });
  await tell(actor.workspaceId, m, [m.owner_id, actor.personId], `Retention of ${m.name}`, scheduledText(m, pending, keptFrom(pending.starts_on, setting.keep_months)));
  return { pending, changed: true };
}

/** Sets a Metric's Retention, or turns it off with null. Turning it on, keeping values for less time, condensing into
 * another period or going from condensing to deleting needs `shown`, the fingerprint of the preview the person saw: if
 * what it would do has changed since, it is refused ("The numbers changed; look again."), and otherwise the Retention
 * waits 7 days to be cancelled in. Making it longer, softer, or turning it off takes effect at once. For the Metric's
 * owner, an Owner or an Admin; never from a program. */
export async function setRetention(actor: Actor, metricId: number, rawSetting: unknown, shown?: unknown): Promise<{ starts_on: string | null }> {
  const m = await settableMetric(actor, Number(metricId));
  const setting = parsed(rawSetting);
  const [ys, today, ctx] = await Promise.all([yearStartOf(actor.workspaceId), workspaceToday(actor.workspaceId), context(actor)]);
  const r = await store(actor, m, setting, typeof shown === "string" ? shown : null, today, ys, ctx);
  return { starts_on: r.pending?.starts_on ?? null };
}

/** Cancels a confirmed Retention that has not started: nothing was condensed or deleted. Anyone who may set it may
 * cancel it, until its first day. */
export async function cancelRetention(actor: Actor, metricId: number): Promise<{ cancelled: boolean }> {
  const m = await settableMetric(actor, Number(metricId));
  const waiting = storedPending(m.retention_pending);
  if (!waiting) return { cancelled: false };
  const today = await workspaceToday(actor.workspaceId);
  if (waiting.starts_on <= today) throw new Error(`It started on ${dayWords(waiting.starts_on)} and can no longer be cancelled. Turn it off instead; what it has done stays done.`);
  const { data, error } = await db().from("metrics").update({ retention_pending: null }).eq("id", m.id).eq("workspace_id", actor.workspaceId).not("retention_pending", "is", null).select("id");
  if (error) throw new Error("The Retention could not be cancelled.");
  if (!data?.length) return { cancelled: false };
  await audit(actor, { kind: "metric.retention_cancelled", object: { type: "metric", id: m.id, name: m.name }, details: { was: summary(waiting.retention), starts_on: waiting.starts_on } });
  return { cancelled: true };
}

/** The Workspace's default Retention, copied into each Metric made from now on (no link back), or null. For Owners and
 * Admins, who see what a new Metric will start with. */
export async function defaultRetention(actor: Actor): Promise<Retention | null> {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins see the Workspace's default Retention.");
  const { data } = await db().from("workspaces").select("default_retention").eq("id", actor.workspaceId).maybeSingle();
  return storedRetention(data?.default_retention);
}

/** Sets the Workspace's default Retention, or removes it with null. Changes no Metric that exists. Owners only: it
 * decides what every Metric made afterwards starts with, and deleting cannot be undone. */
export async function setDefaultRetention(actor: Actor, rawSetting: unknown): Promise<void> {
  refuseInDemo(actor);
  if (actor.key || actor.role !== "owner") throw new Forbidden("Only Owners set the Workspace's default Retention.");
  const setting = parsed(rawSetting);
  const before = await defaultRetention(actor);
  if (JSON.stringify(before) === JSON.stringify(setting)) return;
  const { error } = await db().from("workspaces").update({ default_retention: setting }).eq("id", actor.workspaceId);
  if (error) throw new Error("The default Retention could not be saved.");
  await audit(actor, { kind: "workspace.retention_default_set", object: { type: "workspace", id: actor.workspaceId }, details: { from: summary(before), to: summary(setting) } });
}

/** Applies a Retention to every Metric that has none, as the preview showed (Apply to existing Metrics): each one waits
 * 7 days like a Metric's own. `shown` is the fingerprint of that preview; if what it would do has changed, nothing is
 * applied. Owners only. Returns how many Metrics now wait. */
export async function applyRetentionToExisting(actor: Actor, rawSetting: unknown, shown: unknown): Promise<{ applied: number }> {
  const preview = await retentionPreviewAll(actor, rawSetting);
  if (typeof shown !== "string" || shown !== preview.fingerprint) throw new Error(NUMBERS_CHANGED);
  const [ys, today, { ctx, applies }] = await Promise.all([yearStartOf(actor.workspaceId), workspaceToday(actor.workspaceId), eligible(actor, preview.setting)]);
  let applied = 0;
  for (const m of applies) {
    const p = await previewMetric(actor, m, preview.setting, today, ys, ctx);
    // The Metrics the preview offered are the ones that wait; one that came to be unfit since is left alone.
    if (p.problem) continue;
    const r = await store(actor, m, preview.setting, p.fingerprint, today, ys, ctx, { applied: true });
    if (r.pending) applied++;
  }
  return { applied };
}

/** The Retention a Metric made now would start with: the Workspace default when it fits the Metric, waiting 7 days like
 * any confirmed one (it can be cancelled on the Metric page), or null. */
export async function defaultRetentionFor(ws: string, who: string, metric: RetentionMetric, today?: string): Promise<PendingRetention | null> {
  const { data } = await db().from("workspaces").select("default_retention").eq("id", ws).maybeSingle();
  const setting = storedRetention(data?.default_retention);
  if (!setting || retentionProblem(setting, metric)) return null;
  const day = today ?? (await workspaceToday(ws));
  return { retention: setting, starts_on: firstRunDay(day), confirmed_on: day, set_by: who, told: true, reminded: false };
}

/** Refuses a change to a Metric's period or Aggregation that would leave its Retention, in force or waiting, with
 * something it cannot do (a Metric with Aggregation none cannot be condensed). Words for people. */
export function assertRetentionFits(m: { retention?: unknown; retention_pending?: unknown; formula?: string | null }, next: { period: Period; aggregation: Metric["aggregation"] }): void {
  for (const r of [storedRetention(m.retention), storedPending(m.retention_pending)?.retention ?? null]) {
    const problem = r ? retentionProblem(r, { ...next, formula: m.formula }) : null;
    if (problem) throw new Error(`Its Retention would no longer fit: ${problem} Turn the Retention off first.`);
  }
}

/** For the daily job (#382) and nothing else: lets a confirmed Retention take effect on its first day, and sends the one
 * reminder on the 7th day to its Metric's owner and the person who set it. Works in each Workspace's own day; a Metric
 * is handled once, so calling it twice a day does no harm. */
export async function settleRetentions(now = new Date()): Promise<{ started: number; reminded: number }> {
  const rows = await allRows<Row & { workspace_id: string }>((from, to) => db().from("metrics").select(`${COLUMNS}, workspace_id`).not("retention_pending", "is", null).order("id").range(from, to));
  const zones = new Map<string, string>();
  let started = 0;
  let reminded = 0;
  for (const m of rows) {
    const p = storedPending(m.retention_pending);
    if (!p) continue;
    if (!zones.has(m.workspace_id)) zones.set(m.workspace_id, await workspaceToday(m.workspace_id, now));
    const today = zones.get(m.workspace_id)!;
    if (p.starts_on <= today) {
      // Only the one that is still the waiting one, so a cancel at the same moment wins.
      const { data } = await db().from("metrics").update({ retention: p.retention, retention_pending: null }).eq("id", m.id).eq("workspace_id", m.workspace_id).eq("retention_pending->>starts_on", p.starts_on).select("id");
      if (data?.length) started++;
    } else if (!p.reminded && today >= reminderDay(p.confirmed_on)) {
      const { data } = await db().from("metrics").update({ retention_pending: { ...p, reminded: true } }).eq("id", m.id).eq("workspace_id", m.workspace_id).eq("retention_pending->>starts_on", p.starts_on).select("id");
      if (!data?.length) continue;
      reminded++;
      const text = `${pendingNote(p, keptFrom(p.starts_on, p.retention.keep_months))} Tomorrow is the first day. Until then it can be cancelled on the Metric page; nothing is condensed or deleted before.`;
      await tell(m.workspace_id, m, [m.owner_id, p.set_by], `Retention of ${m.name} starts tomorrow`, text);
    }
  }
  return { started, reminded };
}

/** A Metric's Retention as its page shows it: in force, and waiting with its note. The reader sees the Metric already. */
export function retentionOf(m: { retention?: unknown; retention_pending?: unknown }): { retention: Retention | null; pending: (PendingRetention & { note: string }) | null } {
  const p = storedPending(m.retention_pending);
  return { retention: storedRetention(m.retention), pending: p ? { ...p, note: pendingNote(p, keptFrom(p.starts_on, p.retention.keep_months)) } : null };
}
