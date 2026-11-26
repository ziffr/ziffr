// Retention, the setting and its preview (spec 0033, ticket #381; GLOSSARY: Retention, Condensed Value, Snapshot): a
// Metric's Retention and the Workspace's default for new Metrics, the preview that shows in counts what a Retention
// would do, the confirmation that needs it, the 7 days in which a confirmed Retention can be cancelled, and who is told.
// Nothing here condenses or deletes a value: the daily job is a later ticket (#382); it calls `settleRetentions` for the
// days and the reminders, and must not take more than a confirmation `counted`. Only Owners set the Workspace default; a
// Metric's own is set by its Metric Owner, an Owner or an Admin. A program never sets one (the API and the MCP Server
// only read it). The preview holds counts and the names of Snapshots the person may open, never a value; the setting
// itself is not part of the Metric rows that reach browsers, View Links and Snapshots (`retentionFor` reads it).
import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";
import { keptIds } from "./snapshots";
import { openOne, openRows } from "./sealed-columns";
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { csvLine } from "./audit-kinds";
import { refuseInDemo } from "./demo";
import { deliverNotice } from "./deliveries";
import { visibleDashboards, visibleMetricIds } from "./access";
import { formulaInputs } from "./formula";
import { isLonger } from "./display-periods";
import { yearStartOf } from "./fiscal-year";
import { periodEnd, periodStart, type YearStart } from "./periods";
import { firstRunDay, parseRetention, reminderDay, retentionPlan, retentionProblem, keptFrom, CANCEL_DAYS, type CondenseInto, type Retention, type RetentionMetric, type RetentionPlan } from "./retention-rules";
import { DELETE_WORD, NUMBERS_CHANGED, capOf, needsConfirmation, retentionWords, storedPending, storedRetention, dayWords, pendingNote, type Counted, type PendingRetention } from "./retention-words";
import { localTime } from "./workspace-clock";
import { openRow } from "./sealed-columns";
import { workspaceCipher } from "./workspace-keys";
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
  /** Older periods left alone because open work holds them, and the values they hold (kept in the confirmation: freed
   * later, they are what the person was told about). Not part of the fingerprint: the count of periods is. */
  heldBack: number;
  heldBackValues: number;
  /** Older periods left as they are because condensing them would show a longer Display Period differently. */
  uneven: number;
  /** Derived Metrics that read this one: a count, which may include ones the person cannot see (no name is given). */
  derivedReaders: number;
  /** Snapshots and frozen View Links that already hold these periods: they keep what they showed. Counted for the
   * Workspace, so they include ones the person cannot open; only those they can open are named. */
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

/** The most Snapshots one preview names (it counts them all). */
const MAX_SNAPSHOTS_READ = 200;
const MAX_NAMES = 10;
const MAX_ROWS = 100;
/** The most Metrics one Workspace-wide preview works on, and how many in parallel. */
const MAX_METRICS = 5000;
const PARALLEL = 4;

/** What the database counts per period (retention_periods): values, Breakdown rows and Superseded Values. */
export type PeriodCount = { period_start: string; values_held: number; breakdown_rows: number; superseded: number };

/** The states of a period that its Workflow has not finished: such a period is held back. */
const OPEN_STATES = ["asked", "submitted", "approval"];

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
  // The name is sealed with the Workspace Key (spec 0028): opened here, before anyone is asked to type or is told it.
  const m = await openOne("metrics", actor.workspaceId, (await db().from("metrics").select(COLUMNS).eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle()).data as Record<string, unknown> | null) as Row | null;
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

/** What the periods of a Metric are, for a Retention on `today`: the checks that refuse it (a Metric that cannot be
 * condensed, Derived Metrics that read it), what the Metric holds older than the keep time, and the plan the rules
 * make of it. The preview and the daily job both ask here, so what a person was shown is what the job works from.
 * Reads only. */
export async function planRetention(ws: string, m: Pick<Row, "id" | "slug" | "period" | "aggregation" | "formula">, setting: Retention, today: string, ys: YearStart, metrics: Metric[]) {
  const none = { problem: null as string | null, derivedReaders: 0, cutoff: keptFrom(today, setting.keep_months), held: [] as PeriodCount[], plan: null as unknown as RetentionPlan, targetRows: [] as { period_start: string }[], projectionRows: [] as { period_start: string }[] };
  const metric: RetentionMetric = { period: m.period as Period, aggregation: m.aggregation, formula: m.formula };
  const problem = retentionProblem(setting, metric);
  if (problem) return { ...none, problem };
  const readers = metrics.filter((o) => o.formula && formulaInputs(o.formula).includes(m.slug));
  none.derivedReaders = readers.length;
  if (setting.then === "delete" && readers.length) return { ...none, problem: "Another Metric is derived from this one, so its values cannot be deleted. Condense them, or change the Derived Metric first." };
  if (setting.then === "condense" && readers.some((o) => isLonger(setting.into, o.period))) return { ...none, problem: "A Derived Metric reads this one by a shorter period than it would be condensed into. Pick a shorter period, or change the Derived Metric first." };
  const cutoff = none.cutoff;
  const [held, locked, openStates, openActions, targetRows, projectionRows] = await Promise.all([
    allRows<PeriodCount>((from, to) => db().rpc("retention_periods", { p_ws: ws, p_metric: m.id, p_cutoff: cutoff }).range(from, to)),
    allRows<{ period_start: string }>((from, to) => db().from("period_states").select("period_start").eq("metric_id", m.id).eq("state", "locked").lt("period_start", cutoff).order("period_start").range(from, to)),
    allRows<{ period_start: string }>((from, to) => db().from("period_states").select("period_start").eq("metric_id", m.id).in("state", OPEN_STATES).lt("period_start", cutoff).order("period_start").range(from, to)),
    // Open Actions, and those closed with a Correction still waiting for a decision (it would write into the period).
    Promise.all([
      allRows<{ period_start: string }>((from, to) => db().from("actions").select("period_start").eq("workspace_id", ws).eq("metric_id", m.id).in("status", ["open", "answered"]).lt("period_start", cutoff).order("id").range(from, to)),
      allRows<{ period_start: string }>((from, to) => db().from("actions").select("period_start, thread_messages!inner(id)").eq("workspace_id", ws).eq("metric_id", m.id).eq("thread_messages.correction_status", "proposed").lt("period_start", cutoff).order("id").range(from, to)),
    ]).then(([a, b]) => [...a, ...b]),
    allRows<{ period_start: string }>((from, to) => db().from("series_values").select("period_start").eq("workspace_id", ws).eq("metric_id", m.id).eq("kind", "target").lt("period_start", cutoff).order("period_start").range(from, to)),
    allRows<{ period_start: string }>((from, to) => db().from("series_values").select("period_start").eq("workspace_id", ws).eq("metric_id", m.id).eq("kind", "projection").lt("period_start", cutoff).order("period_start").range(from, to)),
  ]);
  const lockedSet = new Set(locked.map((l) => l.period_start));
  const open = new Set([...openStates, ...openActions].map((h) => h.period_start));
  const plan = retentionPlan(setting, metric, held.map((h) => ({ period: h.period_start, locked: lockedSet.has(h.period_start), heldBack: open.has(h.period_start) })), today, ys);
  return { ...none, held, plan, targetRows, projectionRows };
}

/** What a Retention does to one Metric on `today`, in counts. Reads only; `m` is a Metric the actor may set. The counts
 * come from the database per period, so a Metric with years of values is one call, not one per value. */
async function previewMetric(actor: Actor, m: Row, setting: Retention, today: string, ys: YearStart, ctx: { metrics: Metric[]; visible: Set<number>; dashboards: Map<number, string> }): Promise<RetentionPreview> {
  const ws = actor.workspaceId;
  const empty: Omit<RetentionPreview, "fingerprint"> = { metricId: m.id, name: m.name, setting, keptFrom: keptFrom(today, setting.keep_months), firstPeriod: null, lastPeriod: null, periods: 0, values: 0, condensedValues: 0, breakdownRows: 0, supersededValues: 0, targets: 0, projections: 0, lockedPeriods: 0, heldBack: 0, heldBackValues: 0, uneven: 0, derivedReaders: 0, snapshots: 0, viewLinks: 0, snapshotNames: [], problem: null };
  const finish = (p: Omit<RetentionPreview, "fingerprint">): RetentionPreview => ({ ...p, fingerprint: fingerprintOf([p.setting, p.keptFrom, p.firstPeriod, p.lastPeriod, p.periods, p.values, p.condensedValues, p.breakdownRows, p.supersededValues, p.targets, p.projections, p.lockedPeriods, p.heldBack, p.uneven, p.derivedReaders, p.snapshots, p.viewLinks, p.problem]) });
  const r = await planRetention(ws, m, setting, today, ys, ctx.metrics);
  empty.derivedReaders = r.derivedReaders;
  if (r.problem) return finish({ ...empty, problem: r.problem });
  const { cutoff, held, plan, targetRows, projectionRows } = r;
  const affected = new Set(setting.then === "delete" ? plan.delete : plan.condense.flatMap((c) => c.periods));
  const spans = new Set(plan.condense.map((c) => c.period));
  const hit = held.filter((h) => affected.has(h.period_start));
  const sum = (key: "values_held" | "breakdown_rows" | "superseded") => hit.reduce((n, h) => n + h[key], 0);
  const sorted = [...affected].sort();
  const heldBack = new Set(plan.heldBack);

  const into: CondenseInto | null = setting.then === "condense" ? setting.into : null;
  const targets = targetRows.filter((t) => (into ? spans.has(periodStart(t.period_start, into, ys)) : affected.has(t.period_start))).length;
  // A Projection of a past period older than the Retention goes in both modes: it was never an Observation.
  const projections = projectionRows.filter((p) => periodEnd(p.period_start, m.period as Period) < cutoff).length;

  const { snapshots, names } = sorted.length ? await snapshotsHolding(actor, m.id, sorted[0], ctx) : { snapshots: 0, names: [] };
  const viewLinks = sorted.length ? await frozenViewLinks(ws, m.id, today) : 0;
  return finish({
    ...empty, firstPeriod: sorted[0] ?? null, lastPeriod: sorted[sorted.length - 1] ?? null,
    periods: affected.size, values: sum("values_held"), condensedValues: plan.condense.length, breakdownRows: sum("breakdown_rows"), supersededValues: sum("superseded"),
    targets, projections, lockedPeriods: setting.then === "delete" ? plan.deletedLocked : plan.condense.filter((c) => c.locked).length,
    heldBack: plan.heldBack.length, heldBackValues: held.filter((h) => heldBack.has(h.period_start)).reduce((n, h) => n + h.values_held, 0), uneven: plan.uneven.length, snapshots, viewLinks, snapshotNames: names,
  });
}

/** Snapshots that kept this Metric and reach into the affected periods, counted for the Workspace and named only where
 * the actor may open them: its dashboard and every Metric it kept. */
export async function snapshotsHolding(actor: Actor, metricId: number, from: string, ctx: { visible: Set<number>; dashboards: Map<number, string> }): Promise<{ snapshots: number; names: string[] }> {
  // A Snapshot lists the Metrics it kept in its frozen part (`metricIds`, ids only); one frozen before sealing in
  // `data.metrics`. Both are asked, and a Snapshot found by either counts once.
  const base = () => db().from("dashboard_snapshots").select("id, dashboard_id, label, ids:frozen->metricIds, legacy:frozen->data->metrics", { count: "exact" })
    .eq("workspace_id", actor.workspaceId).is("deleted_at", null).not("frozen", "is", null).gte("period_end", from);
  const [byIds, byLegacy] = await Promise.all([
    base().contains("frozen->metricIds", JSON.stringify([metricId])).order("id").limit(MAX_SNAPSHOTS_READ),
    base().contains("frozen->data->metrics", JSON.stringify([{ id: metricId }])).order("id").limit(MAX_SNAPSHOTS_READ),
  ]);
  const found = new Map<number, { id: number; dashboard_id: number; label: string; ids?: unknown; legacy?: unknown }>();
  for (const r of [...(byIds.data ?? []), ...(byLegacy.data ?? [])] as unknown as { id: number; dashboard_id: number; label: string }[]) found.set(r.id, r);
  const rows = [...found.values()].sort((a, b) => a.id - b.id);
  const count = Math.max(byIds.count ?? 0, 0) + Math.max(byLegacy.count ?? 0, 0);
  const names = rows.filter((r) => ctx.dashboards.has(r.dashboard_id) && (keptIds(r) ?? [-1]).every((k) => ctx.visible.has(k))).slice(0, MAX_NAMES).map((r) => `${ctx.dashboards.get(r.dashboard_id)}, ${r.label}`);
  return { snapshots: count || rows.length, names };
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
type Context = Awaited<ReturnType<typeof context>>;

/** What a Retention would do to one Metric, in counts: the preview the page shows before anything is turned on. For
 * the Metric's owner, an Owner or an Admin; the setting comes from a browser and is checked like any other input. */
export async function retentionPreview(actor: Actor, metricId: number, rawSetting: unknown): Promise<RetentionPreview> {
  const m = await settableMetric(actor, Number(metricId));
  const setting = parsed(rawSetting);
  if (!setting) throw new Error("Pick how long to keep values, and what then happens, to see what it would do.");
  const [ys, today, ctx] = await Promise.all([yearStartOf(actor.workspaceId), workspaceToday(actor.workspaceId), context(actor)]);
  return previewMetric(actor, m, setting, today, ys, ctx);
}

/** What a Workspace-wide setting would do to every Metric the Owner may set that has none: the Metrics, each with its
 * preview, and the reasons for those left out. */
async function previewEverything(actor: Actor, rawSetting: unknown) {
  refuseInDemo(actor);
  if (actor.key || actor.role !== "owner") throw new Forbidden("Only Owners apply a Retention to every Metric.");
  const setting = parsed(rawSetting);
  if (!setting) throw new Error("Pick how long to keep values, and what then happens, to see what it would do.");
  const [ys, today, ctx] = await Promise.all([yearStartOf(actor.workspaceId), workspaceToday(actor.workspaceId), context(actor)]);
  // Names are sealed: the Metrics come in their order of making and are sorted by their opened names here.
  const { data: sealed } = await db().from("metrics").select(COLUMNS).eq("workspace_id", actor.workspaceId).order("id").limit(MAX_METRICS);
  const data = (await openRows("metrics", actor.workspaceId, sealed as Record<string, unknown>[] | null)).sort((a, b) => String(a.name).localeCompare(String(b.name)) || Number(a.id) - Number(b.id));
  const reasons = new Map<string, number>();
  const candidates: Row[] = [];
  for (const m of (data ?? []) as Row[]) {
    // Only Metrics the Owner sees, with no Retention in force or waiting.
    if (!ctx.visible.has(m.id) || storedRetention(m.retention) || storedPending(m.retention_pending)) continue;
    const why = retentionProblem(setting, { period: m.period as Period, aggregation: m.aggregation, formula: m.formula });
    if (why) reasons.set(why, (reasons.get(why) ?? 0) + 1);
    else candidates.push(m);
  }
  const previews: RetentionPreview[] = [];
  for (let i = 0; i < candidates.length; i += PARALLEL) previews.push(...(await Promise.all(candidates.slice(i, i + PARALLEL).map((m) => previewMetric(actor, m, setting, today, ys, ctx)))));
  // A Metric the setting cannot be used on (a Derived Metric reads it) is left out with its reason, not offered.
  const usable: { row: Row; preview: RetentionPreview }[] = [];
  previews.forEach((preview, i) => {
    if (preview.problem) reasons.set(preview.problem, (reasons.get(preview.problem) ?? 0) + 1);
    else usable.push({ row: candidates[i], preview });
  });
  return { setting, ys, today, ctx, usable, reasons, fingerprint: fingerprintOf([setting, usable.map((u) => [u.preview.metricId, u.preview.fingerprint])]) };
}

/** What the Workspace's setting would do to every existing Metric that has none (Apply to existing Metrics), in
 * counts. Owners only. */
export async function retentionPreviewAll(actor: Actor, rawSetting: unknown): Promise<WorkspaceRetentionPreview> {
  const { setting, usable, reasons, fingerprint } = await previewEverything(actor, rawSetting);
  const previews = usable.map((u) => u.preview);
  const sum = (key: keyof WorkspaceRetentionPreview["totals"]) => previews.reduce((n, p) => n + p[key], 0);
  const totals = { periods: sum("periods"), values: sum("values"), condensedValues: sum("condensedValues"), breakdownRows: sum("breakdownRows"), supersededValues: sum("supersededValues"), targets: sum("targets"), projections: sum("projections"), lockedPeriods: sum("lockedPeriods"), heldBack: sum("heldBack"), snapshots: sum("snapshots"), viewLinks: sum("viewLinks") };
  const skipped = { count: [...reasons.values()].reduce((a, b) => a + b, 0), reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([why, n]) => `${n}: ${why}`) };
  return { setting, metrics: previews.slice(0, MAX_ROWS), applies: previews.length, skipped, totals, fingerprint };
}

/** Tells people about Metrics, each only about those they still see: a notice goes to a recipient who is still a member
 * and sees the Metric, never to anyone else. Names only, never a value. `link` is where the notice leads. */
async function tell(ws: string, metrics: Pick<Row, "id" | "slug" | "name">[], recipients: string[], subject: string, text: (seen: Pick<Row, "id" | "slug" | "name">[]) => string): Promise<void> {
  const ids = [...new Set(recipients)];
  const { data: members } = await db().from("memberships").select("user_id").eq("workspace_id", ws).in("user_id", ids);
  const all = await getMetrics(ws);
  for (const { user_id: recipientId } of members ?? []) {
    const seen = await visibleMetricIds(ws, recipientId, all);
    const mine = metrics.filter((m) => seen.has(m.id));
    if (!mine.length) continue;
    try {
      await deliverNotice(ws, { recipientId, senderId: null, subject, text: text(mine), link: mine.length === 1 ? `/metrics/${mine[0].slug}` : "/metrics" });
    } catch {
      // A message that cannot go must not undo a setting that was saved: the Metric page says it all the same.
      console.error("Retention: a notice could not be written");
    }
  }
}

const summary = (r: Retention | null) => (r ? retentionWords(r) : "none").slice(0, 120);

/** The words of the notice the Metric's owner and the person who set it get when a Retention is scheduled. */
function scheduledText(m: Pick<Row, "name">, p: PendingRetention): string {
  return `${pendingNote(p, keptFrom(p.starts_on, p.retention.keep_months))} That is the Retention of ${m.name}: ${retentionWords(p.retention)}. Until ${dayWords(p.starts_on)} it can be cancelled on the Metric page; nothing is condensed or deleted before then.`;
}

/** A confirmation, as stored: when it starts at the earliest, and what the person was shown. */
function newPending(setting: Retention, who: string, today: string, counted: Counted): PendingRetention {
  return { id: randomUUID(), retention: setting, starts_on: firstRunDay(today), starts_after: new Date(Date.now() + CANCEL_DAYS * 86_400_000).toISOString(), confirmed_on: today, set_by: who, counted, told: true, reminded: false };
}

/** Whether a waiting Retention's first day has come: the day, and at least 7 days since it was confirmed, whatever the
 * Workspace's clock says by then (a changed time zone cannot shorten the days to cancel it in). */
const started = (p: PendingRetention, today: string, now: Date) => p.starts_on <= today && Date.parse(p.starts_after) <= now.getTime();

/** What a confirmation of a delete asks the person to type, besides having seen the counts. */
function assertTyped(setting: Retention, expected: string, typed: unknown): void {
  if (setting.then === "delete" && String(typed ?? "").trim() !== expected) throw new Error(`Type "${expected}" to confirm deleting.`);
}

/** Writes a confirmed Retention as waiting, or in force when it needs no confirmation, and records it. A change that
 * keeps less needs `shown`, the fingerprint of the counts the person saw, and the typed name for a delete. With
 * `quiet` the caller tells people once for many Metrics; with `free` only a Metric that still has none is written. */
async function store(actor: Actor, m: Row, setting: Retention | null, confirm: { shown: string | null; typed: unknown }, when: { today: string; ys: YearStart; ctx: Context }, how: { quiet?: boolean; free?: boolean; applied?: boolean } = {}): Promise<{ pending: PendingRetention | null; changed: boolean }> {
  const active = storedRetention(m.retention);
  const waiting = storedPending(m.retention_pending);
  const update = async (values: Record<string, unknown>): Promise<boolean> => {
    let q = db().from("metrics").update(values).eq("id", m.id).eq("workspace_id", actor.workspaceId);
    if (how.free) q = q.is("retention", null).is("retention_pending", null);
    const { data, error } = await q.select("id");
    if (error) throw new Error("The Retention could not be saved.");
    return Boolean(data?.length);
  };
  if (!setting) {
    if (!active && !waiting) return { pending: null, changed: false };
    await update({ retention: null, retention_pending: null, retention_cap: null });
    await audit(actor, { kind: "metric.retention_set", object: { type: "metric", id: m.id, name: m.name }, details: { from: summary(active), to: "none" } });
    return { pending: null, changed: true };
  }
  const problem = retentionProblem(setting, { period: m.period as Period, aggregation: m.aggregation, formula: m.formula });
  if (problem) throw new Error(problem);
  // The same setting again, with the counts shown: how a Retention the job holds back or stopped is confirmed anew.
  const again = Boolean(active) && JSON.stringify(active) === JSON.stringify(setting) && !waiting && confirm.shown !== null;
  if (!needsConfirmation(active, setting) && !again) {
    if (JSON.stringify(active) === JSON.stringify(setting) && !waiting) return { pending: null, changed: false };
    // Longer, or softer, than what is in force: it takes effect now and any waiting one is dropped (it was stricter).
    await update({ retention: setting, retention_pending: null });
    await audit(actor, { kind: "metric.retention_set", object: { type: "metric", id: m.id, name: m.name }, details: { from: summary(active), to: summary(setting) } });
    return { pending: null, changed: true };
  }
  // A setting that deletes or condenses more must come with the counts the person was shown, and they must still hold.
  const preview = await previewMetric(actor, m, setting, when.today, when.ys, when.ctx);
  if (preview.problem) throw new Error(preview.problem);
  if (confirm.shown !== preview.fingerprint) throw new Error(NUMBERS_CHANGED);
  if (!how.applied) assertTyped(setting, m.name, confirm.typed);
  const pending = newPending(setting, actor.personId, when.today, { periods: preview.periods, values: preview.values, held_back_periods: preview.heldBack, held_back_values: preview.heldBackValues });
  if (!(await update({ retention_pending: pending }))) return { pending: null, changed: false };
  await audit(actor, { kind: "metric.retention_set", object: { type: "metric", id: m.id, name: m.name }, details: { from: summary(active), to: summary(setting), starts_on: pending.starts_on, ...(how.applied ? { applied_to_all: true } : {}) } });
  if (!how.quiet) await tell(actor.workspaceId, [m], [m.owner_id, actor.personId], `Retention of ${m.name}`, () => scheduledText(m, pending));
  return { pending, changed: true };
}

/** Sets a Metric's Retention, or turns it off with null. Turning it on, keeping values for less time, condensing into
 * another period or going from condensing to deleting needs `shown`, the fingerprint of the preview the person saw (if
 * what it would do has changed since, it is refused: "The numbers changed; look again."), and for a delete `typed`, the
 * Metric's name; the Retention then waits 7 days to be cancelled in. Making it longer, softer, or turning it off takes
 * effect at once. For the Metric's owner, an Owner or an Admin; never from a program. */
export async function setRetention(actor: Actor, metricId: number, rawSetting: unknown, shown?: unknown, typed?: unknown): Promise<{ starts_on: string | null }> {
  const m = await settableMetric(actor, Number(metricId));
  const setting = parsed(rawSetting);
  const [ys, today, ctx] = await Promise.all([yearStartOf(actor.workspaceId), workspaceToday(actor.workspaceId), context(actor)]);
  const r = await store(actor, m, setting, { shown: typeof shown === "string" ? shown : null, typed }, { today, ys, ctx });
  return { starts_on: r.pending?.starts_on ?? null };
}

/** Cancels a confirmed Retention that has not started: nothing was condensed or deleted. Anyone who may set it may
 * cancel it, until its first day. */
export async function cancelRetention(actor: Actor, metricId: number): Promise<{ cancelled: boolean }> {
  const m = await settableMetric(actor, Number(metricId));
  const waiting = storedPending(m.retention_pending);
  if (!waiting) return { cancelled: false };
  if (started(waiting, await workspaceToday(actor.workspaceId), new Date())) throw new Error(`It started on ${dayWords(waiting.starts_on)} and can no longer be cancelled. Turn it off instead; what it has done stays done.`);
  // Only the confirmation that was read: a newer one confirmed in between is not cancelled by this.
  const { data, error } = await db().from("metrics").update({ retention_pending: null }).eq("id", m.id).eq("workspace_id", actor.workspaceId).eq("retention_pending->>id", waiting.id).select("id");
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
 * 7 days like a Metric's own. `shown` is the fingerprint of that preview, which holds the counts of every Metric in it:
 * if anything it would do has changed, nothing is applied, and a Metric whose numbers change while it runs is left out
 * (`changed`). For a delete `typed` is the word "delete". Owners only. Each Metric's owner gets one notice for all the
 * Metrics they own. */
export async function applyRetentionToExisting(actor: Actor, rawSetting: unknown, shown: unknown, typed?: unknown): Promise<{ applied: number; changed: number }> {
  const all = await previewEverything(actor, rawSetting);
  if (typeof shown !== "string" || shown !== all.fingerprint) throw new Error(NUMBERS_CHANGED);
  assertTyped(all.setting, DELETE_WORD, typed);
  const done: { row: Row; pending: PendingRetention }[] = [];
  let changed = 0;
  for (const { row, preview } of all.usable) {
    try {
      const r = await store(actor, row, all.setting, { shown: preview.fingerprint, typed }, { today: all.today, ys: all.ys, ctx: all.ctx }, { quiet: true, free: true, applied: true });
      if (r.pending) done.push({ row, pending: r.pending });
      else changed++;
    } catch (e) {
      if ((e as Error).message !== NUMBERS_CHANGED) throw e;
      changed++;
    }
  }
  // One notice for each owner, and one for the person who applied it, naming what they own (or see).
  const metrics = done.map((d) => d.row);
  const by = new Map<string, typeof metrics>();
  for (const m of metrics) by.set(m.owner_id, [...(by.get(m.owner_id) ?? []), m]);
  const starts = done[0]?.pending.starts_on;
  for (const [owner, own] of [...by, [actor.personId, metrics] as const]) {
    await tell(actor.workspaceId, own, [owner], "Retention set for your Metrics", (seen) => `A Retention was set: ${retentionWords(all.setting)}. It starts on ${dayWords(starts!)}, for ${seen.slice(0, 10).map((s) => s.name).join(", ")}${seen.length > 10 ? ` and ${seen.length - 10} more` : ""}. Until then each can be cancelled on its Metric page; nothing is condensed or deleted before.`);
  }
  return { applied: done.length, changed };
}

/** The Retention a Metric made now would start with: the Workspace default when it fits the Metric, waiting 7 days like
 * any confirmed one (it can be cancelled on the Metric page), or null. Nothing was counted for it (a new Metric holds no
 * values), which is what the daily job holds it to. */
export async function defaultRetentionFor(ws: string, who: string, metric: RetentionMetric, today?: string): Promise<PendingRetention | null> {
  const { data } = await db().from("workspaces").select("default_retention").eq("id", ws).maybeSingle();
  const setting = storedRetention(data?.default_retention);
  if (!setting || retentionProblem(setting, metric)) return null;
  return newPending(setting, who, today ?? (await workspaceToday(ws)), { periods: 0, values: 0, held_back_periods: 0, held_back_values: 0 });
}

/** Records a default Retention copied into a new Metric, and tells its owner, like any confirmed one. */
export async function announceDefaultRetention(actor: Actor, m: Pick<Row, "id" | "slug" | "name" | "owner_id">, pending: PendingRetention): Promise<void> {
  await audit(actor, { kind: "metric.retention_set", object: { type: "metric", id: m.id, name: m.name }, details: { from: "none", to: summary(pending.retention), starts_on: pending.starts_on, from_default: true } });
  await tell(actor.workspaceId, [m], [m.owner_id, actor.personId], `Retention of ${m.name}`, () => scheduledText(m, pending));
}

/** Refuses a change to a Metric's period or Aggregation that would leave its Retention, in force or waiting, with
 * something it cannot do (a Metric with Aggregation none cannot be condensed). Words for people. */
export function assertRetentionFits(m: { retention?: unknown; retention_pending?: unknown; formula?: string | null }, next: { period: Period; aggregation: Metric["aggregation"] }): void {
  for (const r of [storedRetention(m.retention), storedPending(m.retention_pending)?.retention ?? null]) {
    const problem = r ? retentionProblem(r, { ...next, formula: m.formula }) : null;
    if (problem) throw new Error(`Its Retention would no longer fit: ${problem} Turn the Retention off first.`);
  }
}

/** For the daily job (#382) and nothing else: lets a confirmed Retention take effect on its first day (the 8th, and not
 * before 7 days have passed), and sends the one reminder on the 7th day to its Metric's owner and the person who set it,
 * if they still see the Metric. Works in each Workspace's own day; a Metric is handled once, so calling it twice a day
 * does no harm. `only` limits it to one Workspace (a test of the job). The job must hold a Metric to what the person confirmed (`counted`) and ask again for more. */
export async function settleRetentions(now = new Date(), only?: { workspaceId: string }): Promise<{ started: number; reminded: number }> {
  const read = await allRows<Row & { workspace_id: string }>((from, to) => {
    const q = db().from("metrics").select(`${COLUMNS}, workspace_id`).not("retention_pending", "is", null);
    return (only ? q.eq("workspace_id", only.workspaceId) : q).order("id").range(from, to);
  });
  // Names are sealed (spec 0028): opened in the Workspace each Metric belongs to, since this reads across Workspaces.
  const rows: (Row & { workspace_id: string })[] = [];
  for (const m of read) rows.push((await openOne("metrics", m.workspace_id, m as Record<string, unknown>)) as Row & { workspace_id: string });
  const zones = new Map<string, string>();
  let begun = 0;
  let reminded = 0;
  for (const m of rows) {
    const p = storedPending(m.retention_pending);
    if (!p) continue;
    if (!zones.has(m.workspace_id)) zones.set(m.workspace_id, await workspaceToday(m.workspace_id, now));
    const today = zones.get(m.workspace_id)!;
    // Only the confirmation that was read (by its id), so a cancel or a newer confirmation at the same moment wins.
    if (started(p, today, now)) {
      const { data } = await db().from("metrics").update({ retention: p.retention, retention_pending: null, retention_cap: capOf(p) }).eq("id", m.id).eq("workspace_id", m.workspace_id).eq("retention_pending->>id", p.id).select("id");
      if (data?.length) begun++;
    } else if (!p.reminded && today >= reminderDay(p.confirmed_on) && today < p.starts_on) {
      const { data } = await db().from("metrics").update({ retention_pending: { ...p, reminded: true } }).eq("id", m.id).eq("workspace_id", m.workspace_id).eq("retention_pending->>id", p.id).select("id");
      if (!data?.length) continue;
      reminded++;
      await tell(m.workspace_id, [m], [m.owner_id, p.set_by], `Retention of ${m.name} starts tomorrow`, () => `${pendingNote(p, keptFrom(p.starts_on, p.retention.keep_months))} Tomorrow is the first day. Until then it can be cancelled on the Metric page; nothing is condensed or deleted before.`);
    }
  }
  return { started: begun, reminded };
}

/** A Metric's Retention as its page shows it: in force, and waiting with its note, what the daily job last had to say (to
 * those who may set it only), and whether the actor may set it. The actor sees the Metric (the page has checked); `set_by`
 * and the other bookkeeping of a confirmation stay here. */
export async function retentionFor(actor: Actor, metricId: number): Promise<{ retention: Retention | null; pending: { retention: Retention; starts_on: string; note: string; cancellable: boolean } | null; canSet: boolean; status: { note: string; stopped: boolean; lastRunOn: string | null } | null }> {
  const { data } = await db().from("metrics").select("id, retention, retention_pending").eq("id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || !(await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId))).has(data.id)) throw new Forbidden();
  const p = storedPending(data.retention_pending);
  const today = await workspaceToday(actor.workspaceId);
  const canSet = await canSetRetention(actor, metricId);
  // What the job says (a check that did not match, numbers that grew, a stop) is for those who decide about the Retention.
  const { data: state } = canSet ? await db().from("retention_state").select("note, stopped, last_run_on").eq("metric_id", metricId).eq("workspace_id", actor.workspaceId).maybeSingle() : { data: null };
  return {
    retention: storedRetention(data.retention),
    pending: p && { retention: p.retention, starts_on: p.starts_on, note: pendingNote(p, keptFrom(p.starts_on, p.retention.keep_months)), cancellable: !started(p, today, new Date()) },
    canSet,
    status: state && (state.note || state.stopped) ? { note: String(state.note ?? ""), stopped: state.stopped === true, lastRunOn: state.last_run_on ? String(state.last_run_on) : null } : null,
  };
}

/** The most rows one download of the values a Retention would remove holds. */
const EXPORT_ROWS = 250_000;

/** The values a Retention would remove from one Metric, as a CSV (the download offered before a delete): every value of
 * the periods the preview counted, the earlier values they replaced, their Breakdown rows and Targets, so a person who
 * must let go of them can keep a copy. Written in the Audit Log like any export, in counts. For those who may set the
 * Metric's Retention. */
export async function retentionValuesCsv(actor: Actor, metricId: number, rawSetting: unknown): Promise<string> {
  const m = await settableMetric(actor, Number(metricId));
  const setting = parsed(rawSetting);
  if (!setting) throw new Error("Pick how long to keep values, and what then happens, to download what it would remove.");
  const ws = actor.workspaceId;
  const [ys, today, metrics] = await Promise.all([yearStartOf(ws), workspaceToday(ws), getMetrics(ws)]);
  const r = await planRetention(ws, m, setting, today, ys, metrics);
  if (r.problem) throw new Error(r.problem);
  const periods = new Set(setting.then === "delete" ? r.plan.delete : r.plan.condense.flatMap((c) => c.periods));
  if (!periods.size) throw new Error("Nothing would go today, so there is nothing to download.");
  // Counted first, from what the database counts per period, so a Metric with too many values is refused before any is read.
  if (r.held.filter((h) => periods.has(h.period_start)).reduce((n, h) => n + h.values_held + h.superseded + h.breakdown_rows, 0) > EXPORT_ROWS) throw new Error("There are too many values to download at once. Ask whoever runs Ziffr for a copy of the database instead.");
  const sorted = [...periods].sort();
  const [first, last] = [sorted[0], sorted[sorted.length - 1]];
  const [valuesRead, earlierRead, targetsRead] = await Promise.all([
    allRows<{ id: number; period_start: string; value: unknown; source: string | null; created_at: string }>((a, b) => db().from("observations").select("id, period_start, value, value_sealed, source, created_at").eq("workspace_id", ws).eq("metric_id", m.id).gte("period_start", first).lte("period_start", last).order("period_start").order("created_at").order("id").range(a, b)),
    allRows<{ observation_id: number; period_start: string; value: unknown; source: string | null; recorded_at: string }>((a, b) => db().from("observation_history").select("id, observation_id, period_start, value, value_sealed, source, recorded_at").eq("workspace_id", ws).eq("metric_id", m.id).gte("period_start", first).lte("period_start", last).order("period_start").order("id").range(a, b)),
    allRows<{ period_start: string; value: unknown }>((a, b) => db().from("series_values").select("metric_id, kind, period_start, value, value_sealed").eq("workspace_id", ws).eq("metric_id", m.id).eq("kind", "target").gte("period_start", first).lte("period_start", last).order("period_start").order("id").range(a, b)),
  ]);
  // Values are sealed with the Workspace Key (spec 0028): opened here; one that does not open is left out of the copy.
  const [values, earlier, targets] = await Promise.all([openRows("observations", ws, valuesRead), openRows("observation_history", ws, earlierRead), openRows("series_values", ws, targetsRead)]) as unknown as [
    { id: number; period_start: string; value: unknown; source: string | null; created_at: string }[], { observation_id: number; period_start: string; value: unknown; source: string | null; recorded_at: string }[], { period_start: string; value: unknown }[]];
  const inPeriods = <T extends { period_start: string; value: unknown }>(rows: T[]) => rows.filter((x) => periods.has(x.period_start) && typeof x.value === "number");
  const lines: unknown[][] = [];
  for (const v of inPeriods(values)) lines.push([v.period_start, "value", v.value, "", String(v.created_at).slice(0, 10), v.source]);
  for (const v of inPeriods(earlier)) lines.push([v.period_start, "earlier value", v.value, "", String(v.recorded_at).slice(0, 10), v.source]);
  // Every Breakdown row of every value that goes (also of the earlier values), not only the latest: the job deletes them all.
  const periodOf = new Map<number, string>([...inPeriods(values).map((v) => [v.id, v.period_start] as const), ...inPeriods(earlier).map((v) => [v.observation_id, v.period_start] as const)]);
  const ids = [...periodOf.keys()];
  const cipher = await workspaceCipher(ws);
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [rows, history] = await Promise.all([
      allRows<{ id: number; observation_id: number; parent_id: number | null; label: string; value: unknown; value_sealed: unknown }>((a, b) => db().from("breakdown_rows").select("id, observation_id, parent_id, label, value, value_sealed").eq("workspace_id", ws).in("observation_id", chunk).order("id").range(a, b)),
      allRows<{ id: number; row_id: number | null; observation_id: number; parent_row_id: number | null; label: string; value: unknown; value_sealed: unknown }>((a, b) => db().from("breakdown_history").select("id, row_id, observation_id, parent_row_id, label, value, value_sealed").eq("workspace_id", ws).in("observation_id", chunk).order("id").range(a, b)),
    ]);
    // Labels are sealed with the Workspace Key; one that does not open reads as a dash, never as ciphertext. A replaced row's label is sealed for its row's id.
    // Values are sealed too (spec 0028 step 2): a row whose value does not open is left out of the copy.
    // A part names the row it was a part of in a last column, so a sum of the rows can leave the parts out (spec 0041, ticket 12).
    const nameOf = new Map<number, string>();
    for (const b of rows) nameOf.set(b.id, openRow(cipher, "breakdown_rows", b).label || "–");
    for (const b of history) nameOf.set(b.row_id ?? -b.id, openRow(cipher, "breakdown_rows", { ...b, id: b.row_id ?? b.id }).label || "–");
    for (const b of rows) {
      const o = openRow(cipher, "breakdown_rows", b);
      if (typeof o.value === "number") lines.push([periodOf.get(b.observation_id), "breakdown row", o.value, o.label || "–", "", "", b.parent_id === null ? "" : nameOf.get(b.parent_id) ?? ""]);
    }
    for (const b of history) {
      const o = openRow(cipher, "breakdown_history", b);
      if (typeof o.value === "number") lines.push([periodOf.get(b.observation_id), "earlier breakdown row", o.value, nameOf.get(b.row_id ?? -b.id) ?? "–", "", "", b.parent_row_id === null ? "" : nameOf.get(b.parent_row_id) ?? ""]);
    }
  }
  for (const t of inPeriods(targets)) lines.push([t.period_start, "target", t.value, "", "", ""]);
  if (lines.length > EXPORT_ROWS) throw new Error("There are too many values to download at once. Ask whoever runs Ziffr for a copy of the database instead.");
  lines.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  await audit(actor, { kind: "export.retention_values", object: { type: "metric", id: m.id, name: m.name }, details: { periods: periods.size, rows: lines.length } });
  return csvLine(["Metric", "Period", "What", "Value", "Label", "Recorded on", "Source", "Part of"]) + lines.map((l) => csvLine([m.name, ...l, ...(l.length < 7 ? [""] : [])])).join("");
}
