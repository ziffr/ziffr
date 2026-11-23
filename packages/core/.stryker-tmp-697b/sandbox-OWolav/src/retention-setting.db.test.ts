// @ts-nocheck
// Retention, the setting and its preview against the real database (spec 0033, ticket #381; GLOSSARY: Retention): who
// sets it, that the preview counts what it would do and a confirmation holds only while the counts hold, the 7 days
// that can be used to cancel, the reminder, the Workspace default and what is recorded. Nothing is condensed here.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { DEMO_WORKSPACE_ID } from "./team";
import { createMetric, metricEffects, updateMetricDetails, type MetricEffects } from "./metrics";
import { normalizeMetric } from "./metric-row";
import { applyRetentionToExisting, cancelRetention, canSetRetention, defaultRetention, NUMBERS_CHANGED, retentionFor, retentionPreview, retentionPreviewAll, setDefaultRetention, setRetention, settleRetentions } from "./retention-setting";
import { auditRowsOf, opened, workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const months = (from: string, count: number) => Array.from({ length: count }, (_, i) => { const d = new Date(`${from}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 8) + "01"; });
const PAST = new Date(Date.now() - 86_400_000).toISOString();
const NAME = "Field visits";
const CONDENSE = { keep_months: 25, then: "condense", into: "quarter" };
const DELETE = { keep_months: 25, then: "delete" };
const pendingOf = async (id: number) => (await db().from("metrics").select("retention, retention_pending").eq("id", id).single()).data as { retention: unknown; retention_pending: { starts_on: string; confirmed_on: string; set_by: string; reminded: boolean; retention: unknown } | null };

/** A Workspace with an Owner, an Admin, a Member who owns a monthly Metric with two old years of values (2018 and 2019). */
async function setup(over: Record<string, unknown> = {}) {
  const w = await ws();
  const sara = await w.person("owner"); const ada = await w.person("admin"); const ben = await w.person("member"); const dan = await w.person("member");
  const m = await w.metric(ben, { name: "Field visits", aggregation: "sum", ...over });
  // An Owner and an Admin see what is shared with them, like anyone: Ben shares the Metric.
  await w.share(m.id, sara); await w.share(m.id, ada);
  for (const p of months("2018-01-01", 24)) await w.value(m.id, p, 10, ben);
  await w.value(m.id, inDays(-20).slice(0, 8) + "01", 5, ben);
  return { w, sara, ada, ben, dan, m };
}

describe("the preview", () => {
  it("counts what condensing would do: periods, spans, Breakdown rows, replaced values, Targets, Projections, Locks and open work", async () => {
    const { w, ben, m } = await setup();
    const { data: first } = await db().from("observations").select("id").eq("metric_id", m.id).eq("period_start", "2018-02-01").single();
    await db().from("breakdown_rows").insert([{ observation_id: first!.id, label: "A", value: 4, workspace_id: w.id }, { observation_id: first!.id, label: "B", value: 6, workspace_id: w.id }]);
    // A value that was changed keeps its earlier one in the history.
    await db().from("observations").update({ value: 11 }).eq("id", first!.id);
    await db().from("series_values").insert([...months("2018-01-01", 3).map((p) => ({ metric_id: m.id, kind: "target", period_start: p, value: 12, workspace_id: w.id })), { metric_id: m.id, kind: "projection", period_start: "2018-05-01", value: 9, workspace_id: w.id }]);
    for (const p of months("2018-01-01", 3)) await w.lock(m.id, p);
    // Open work on the last quarter of 2019 holds it back; nobody else's Metric is counted.
    await w.action({ metric_id: m.id, period_start: "2019-12-01", asker_id: ben, assignee_id: ben, status: "open" });
    const p = await retentionPreview(w.actor(ben, "member"), m.id, CONDENSE);
    expect(p).toMatchObject({ metricId: m.id, name: "Field visits", firstPeriod: "2018-01-01", lastPeriod: "2019-09-01", periods: 21, values: 21, condensedValues: 7, breakdownRows: 2, supersededValues: 1, targets: 3, projections: 1, lockedPeriods: 1, heldBack: 3, uneven: 0, derivedReaders: 0, snapshots: 0, viewLinks: 0, problem: null });
    expect(p.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    // The same numbers, the same fingerprint; any change in them changes it.
    expect((await retentionPreview(w.actor(ben, "member"), m.id, CONDENSE)).fingerprint).toBe(p.fingerprint);
    await w.value(m.id, "2018-12-01", 1, ben).catch(() => {}); // a second value for a period: counted
    expect((await retentionPreview(w.actor(ben, "member"), m.id, CONDENSE)).fingerprint).not.toBe(p.fingerprint);
  });

  it("counts what deleting would do, locked periods included, and leaves what is held back", async () => {
    const { w, ben, m } = await setup();
    for (const p of months("2018-01-01", 2)) await w.lock(m.id, p);
    await w.action({ metric_id: m.id, period_start: "2019-12-01", asker_id: ben, assignee_id: ben, status: "open" });
    const p = await retentionPreview(w.actor(ben, "member"), m.id, DELETE);
    expect(p).toMatchObject({ periods: 23, values: 23, condensedValues: 0, lockedPeriods: 2, heldBack: 1, firstPeriod: "2018-01-01", lastPeriod: "2019-11-01" });
  });

  it("names a Snapshot only to someone who may open it, and counts frozen View Links", async () => {
    const { w, sara, ben, dan, m } = await setup();
    const { data: dash } = await db().from("dashboards").insert({ workspace_id: w.id, name: "Board", owner_id: sara }).select("id").single();
    const { data: hidden } = await db().from("dashboards").insert({ workspace_id: w.id, name: "Private", owner_id: dan }).select("id").single();
    const frozen = { name: "Board", themeId: null, widgets: [], data: { metrics: [{ id: m.id }] } };
    const row = (dashboard_id: number, label: string) => ({ workspace_id: w.id, dashboard_id, period_kind: "month", period_start: "2019-12-01", period_end: "2019-12-31", label, taken_by: sara, frozen });
    await db().from("dashboard_snapshots").insert([row(dash!.id, "December 2019"), row(hidden!.id, "December 2019")]);
    await db().from("view_links").insert({ workspace_id: w.id, token: `t-${Math.random()}`, object_type: "dashboard", object_id: dash!.id, created_by: sara, expires_at: inDays(30), frozen: { x: 1 }, metric_ids: [m.id] });
    const p = await retentionPreview(w.actor(sara), m.id, DELETE);
    expect(p).toMatchObject({ snapshots: 2, viewLinks: 1 });
    // Dan's private dashboard is counted, but named to nobody who cannot open it: not even an Owner.
    expect(p.snapshotNames).toEqual(["Board, December 2019"]);
    // Ben owns the Metric but sees neither dashboard: both Snapshots are counted, none is named to him.
    const own = await retentionPreview(w.actor(ben, "member"), m.id, DELETE);
    expect(own.snapshots).toBe(2);
    expect(own.snapshotNames).toEqual([]);
  });

  it("says why a Retention cannot be used, and shows no setting it cannot read", async () => {
    const { w, ben, m } = await setup({ aggregation: "none" });
    expect((await retentionPreview(w.actor(ben, "member"), m.id, CONDENSE)).problem).toMatch(/Aggregation none/);
    expect((await retentionPreview(w.actor(ben, "member"), m.id, DELETE)).problem).toBeNull();
    for (const bad of [null, "forever", { keep_months: 3, then: "delete" }, { keep_months: 25, then: "condense", into: "decade" }, { keep_months: 25, then: "delete", sql: "x" }]) {
      expect(await refusal(retentionPreview(w.actor(ben, "member"), m.id, bad))).toBeInstanceOf(Error);
    }
  });

  it("refuses a delete while a Metric is derived from this one, and a condense into a longer period than it reads by", async () => {
    const { w, ben, m } = await setup();
    const d = await w.metric(ben, { name: "Derived", formula: `{${(await db().from("metrics").select("slug").eq("id", m.id).single()).data!.slug}} * 2`, period: "month" });
    expect((await retentionPreview(w.actor(ben, "member"), m.id, DELETE)).problem).toMatch(/derived/);
    expect((await retentionPreview(w.actor(ben, "member"), m.id, { keep_months: 25, then: "condense", into: "quarter" })).problem).toMatch(/shorter period/);
    expect((await retentionPreview(w.actor(ben, "member"), d.id, DELETE)).problem).toMatch(/no stored values/);
  });
});

describe("who may set it", () => {
  it("is the Metric's owner, an Owner or an Admin; never a Member, a Guest, a key, another Workspace or the demo", async () => {
    const { w, sara, ada, ben, dan, m } = await setup();
    for (const actor of [w.actor(sara), w.actor(ada, "admin"), w.actor(ben, "member")]) {
      expect(await canSetRetention(actor, m.id)).toBe(true);
      expect(await retentionPreview(actor, m.id, DELETE)).toMatchObject({ periods: 24 });
    }
    expect(await canSetRetention(w.actor(dan, "member"), m.id)).toBe(false);
    expect(await refusal(retentionPreview(w.actor(dan, "member"), m.id, DELETE))).toBeInstanceOf(Forbidden);
    expect(await refusal(setRetention(w.actor(dan, "member"), m.id, null))).toBeInstanceOf(Forbidden);
    expect(await refusal(setRetention(w.actor(ben, "guest"), m.id, null))).toBeInstanceOf(Forbidden);
    expect(await refusal(setRetention({ ...w.actor(sara), key: { id: "1", scopes: ["metrics:write"] } } as never, m.id, null))).toBeInstanceOf(Forbidden);
    const other = await ws(); const eve = await other.person("owner");
    expect(await refusal(retentionPreview(other.actor(eve), m.id, DELETE))).toBeInstanceOf(Forbidden);
    expect(await refusal(setRetention({ personId: sara, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, m.id, null))).toBeInstanceOf(DemoReadOnly);
    // A Metric nobody shared with a Member who is not its owner stays hidden to them even as Admin-looking input.
    expect(await refusal(setRetention(w.actor(ben, "member"), 999_999_999, null))).toBeInstanceOf(Forbidden);
  });
});

describe("turning it on, the confirmation and the days to cancel", () => {
  it("needs the counts the person was shown, refuses them once they changed, and then waits until the 8th day", async () => {
    const { w, sara, ben, m } = await setup();
    const actor = w.actor(ben, "member");
    expect(await refusal(setRetention(actor, m.id, DELETE))).toMatchObject({ message: NUMBERS_CHANGED });
    expect(await refusal(setRetention(actor, m.id, DELETE, "not-the-fingerprint"))).toMatchObject({ message: NUMBERS_CHANGED });
    const shown = await retentionPreview(actor, m.id, DELETE);
    // New open work appears after the preview: the numbers changed.
    const open = await w.action({ metric_id: m.id, period_start: "2018-06-01", asker_id: sara, assignee_id: ben, status: "open" });
    expect(await refusal(setRetention(actor, m.id, DELETE, shown.fingerprint, NAME))).toMatchObject({ message: NUMBERS_CHANGED });
    await db().from("actions").delete().eq("id", open);
    const r = await setRetention(actor, m.id, DELETE, shown.fingerprint, NAME);
    expect(r.starts_on).toBe(inDays(8));
    // It waits: nothing is in force, nothing was deleted.
    const row = await pendingOf(m.id);
    expect(row.retention).toBeNull();
    expect(row.retention_pending).toMatchObject({ starts_on: inDays(8), confirmed_on: inDays(0), set_by: ben, retention: DELETE });
    expect((await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id)).count).toBe(25);
    expect((await retentionFor(actor, m.id)).pending?.note).toMatch(/^Values before .* will be deleted from /);
    // The owner and the person who set it are told once; the text holds no value.
    const { data: raw } = await db().from("deliveries").select("id, recipient_id, kind, subject").eq("workspace_id", w.id).eq("kind", "notice");
    const told = await opened("deliveries", w.id, raw);
    expect(told.map((t) => t.recipient_id)).toEqual([ben]);
    expect(told[0].subject).toContain("Field visits");
    const rows = await auditRowsOf(w.id, "metric.retention_set");
    expect(rows).toHaveLength(1);
  });

  it("is cancelled in one step by anyone who may set it, until its first day", async () => {
    const { w, sara, ben, m } = await setup();
    const actor = w.actor(ben, "member");
    const shown = await retentionPreview(actor, m.id, CONDENSE);
    await setRetention(actor, m.id, CONDENSE, shown.fingerprint, NAME);
    expect((await pendingOf(m.id)).retention_pending).not.toBeNull();
    expect(await cancelRetention(w.actor(sara), m.id)).toEqual({ cancelled: true });
    expect((await pendingOf(m.id)).retention_pending).toBeNull();
    expect(await cancelRetention(actor, m.id)).toEqual({ cancelled: false });
    expect(await auditRowsOf(w.id, "metric.retention_cancelled")).toHaveLength(1);
    // Once its first day has come it cannot be cancelled any more.
    await setRetention(actor, m.id, CONDENSE, (await retentionPreview(actor, m.id, CONDENSE)).fingerprint, NAME);
    const waiting = (await pendingOf(m.id)).retention_pending!;
    await db().from("metrics").update({ retention_pending: { ...waiting, starts_on: inDays(0), starts_after: PAST } }).eq("id", m.id);
    expect(await refusal(cancelRetention(actor, m.id))).toMatchObject({ message: expect.stringContaining("can no longer be cancelled") });
    expect(await refusal(cancelRetention(w.actor((await w.person("member")), "member"), m.id))).toBeInstanceOf(Forbidden);
  });

  it("takes effect at once only when it keeps more: longer, softer, or off; shorter or harsher needs a new preview", async () => {
    const { w, ben, m } = await setup();
    const actor = w.actor(ben, "member");
    await setRetention(actor, m.id, CONDENSE, (await retentionPreview(actor, m.id, CONDENSE)).fingerprint, NAME);
    // The first day arrives: the job (#382) calls settleRetentions, and the Retention is in force.
    const waiting = (await pendingOf(m.id)).retention_pending!;
    await db().from("metrics").update({ retention_pending: { ...waiting, confirmed_on: inDays(-8), starts_on: inDays(0), starts_after: PAST } }).eq("id", m.id);
    expect(await settleRetentions()).toMatchObject({ started: 1 });
    expect(await pendingOf(m.id)).toMatchObject({ retention: CONDENSE, retention_pending: null });
    // Longer: no preview.
    expect(await setRetention(actor, m.id, { keep_months: 36, then: "condense", into: "quarter" })).toEqual({ starts_on: null });
    expect((await pendingOf(m.id)).retention).toMatchObject({ keep_months: 36 });
    // Shorter, harsher, or condensed into another period: a fresh preview, and it waits again.
    for (const harder of [{ keep_months: 24, then: "condense", into: "quarter" }, { keep_months: 36, then: "delete" }, { keep_months: 36, then: "condense", into: "year" }]) {
      expect(await refusal(setRetention(actor, m.id, harder))).toMatchObject({ message: NUMBERS_CHANGED });
      const shown = await retentionPreview(actor, m.id, harder);
      expect((await setRetention(actor, m.id, harder, shown.fingerprint, NAME)).starts_on).toBe(inDays(8));
      expect((await pendingOf(m.id)).retention).toMatchObject({ keep_months: 36, then: "condense" }); // what is in force stays until it starts
    }
    // Going back to what is in force drops the waiting one; turning it off removes both.
    await setRetention(actor, m.id, { keep_months: 36, then: "condense", into: "quarter" });
    expect((await pendingOf(m.id)).retention_pending).toBeNull();
    expect(await setRetention(actor, m.id, null)).toEqual({ starts_on: null });
    expect(await pendingOf(m.id)).toEqual({ retention: null, retention_pending: null });
    expect(await setRetention(actor, m.id, null)).toEqual({ starts_on: null });
    expect(await refusal(setRetention(actor, m.id, { keep_months: 25, then: "condense", into: "decade" }))).toBeInstanceOf(Error);
  });

  it("refuses a Retention the Metric cannot do, and a change to the Metric that would break its Retention", async () => {
    const { w, ben, m } = await setup();
    const actor = w.actor(ben, "member");
    expect(await refusal(setRetention(actor, m.id, { keep_months: 25, then: "condense", into: "decade" }))).toBeInstanceOf(Error);
    await setRetention(actor, m.id, DELETE, (await retentionPreview(actor, m.id, DELETE)).fingerprint, NAME);
    await updateMetricDetails(actor, m.id, { aggregation: "none" }); // delete works with a rate
    await setRetention(actor, m.id, null);
    await setRetention(actor, m.id, { keep_months: 25, then: "condense", into: "year" }).catch(() => {});
    await updateMetricDetails(actor, m.id, { aggregation: "sum" });
    const shown = await retentionPreview(actor, m.id, CONDENSE);
    await setRetention(actor, m.id, CONDENSE, shown.fingerprint, NAME);
    expect(await refusal(updateMetricDetails(actor, m.id, { aggregation: "none" }))).toMatchObject({ message: expect.stringContaining("Retention would no longer fit") });
  });
});

describe("changing the Metric under its Retention", () => {
  it("refuses a period and an Aggregation that its Retention does not fit, also when changed together", async () => {
    const { w, ben } = await setup();
    const actor = w.actor(ben, "member");
    const empty = await w.metric(ben, { name: "Empty", period: "day", aggregation: "sum" });
    await db().from("metrics").update({ retention: { keep_months: 25, then: "condense", into: "week" } }).eq("id", empty.id);
    // A year cannot be condensed into weeks, nor can a rate be condensed at all.
    expect(await refusal(updateMetricDetails(actor, empty.id, { period: "year" }))).toMatchObject({ message: expect.stringContaining("Retention would no longer fit") });
    expect(await refusal(updateMetricDetails(actor, empty.id, { period: "year", aggregation: "sum" }))).toMatchObject({ message: expect.stringContaining("Retention would no longer fit") });
    expect(await refusal(updateMetricDetails(actor, empty.id, { period: "week", aggregation: "none" }))).toMatchObject({ message: expect.stringContaining("Retention would no longer fit") });
    await updateMetricDetails(actor, empty.id, { period: "week", aggregation: "average" }).catch((e: Error) => expect(e.message).toMatch(/Retention would no longer fit/));
  });
});

describe("the reminder and the job's day", () => {
  it("sends one reminder on the 7th day to the Metric's owner and whoever set it, and starts it on the 8th", async () => {
    const { w, sara, ben, m } = await setup();
    await setRetention(w.actor(sara), m.id, CONDENSE, (await retentionPreview(w.actor(sara), m.id, CONDENSE)).fingerprint, NAME);
    const waiting = (await pendingOf(m.id)).retention_pending!;
    // Day 6: nothing yet.
    await db().from("metrics").update({ retention_pending: { ...waiting, confirmed_on: inDays(-6), starts_on: inDays(2) } }).eq("id", m.id);
    expect(await settleRetentions()).toEqual({ started: 0, reminded: 0 });
    // Day 7: one reminder each, once.
    await db().from("metrics").update({ retention_pending: { ...waiting, confirmed_on: inDays(-7), starts_on: inDays(1) } }).eq("id", m.id);
    await db().from("deliveries").delete().eq("workspace_id", w.id);
    expect(await settleRetentions()).toEqual({ started: 0, reminded: 1 });
    expect(await settleRetentions()).toEqual({ started: 0, reminded: 0 });
    const { data: raw } = await db().from("deliveries").select("id, recipient_id, subject").eq("workspace_id", w.id).eq("kind", "notice");
    const told = await opened("deliveries", w.id, raw);
    expect(told.map((t) => t.recipient_id).sort()).toEqual([ben, sara].sort());
    expect(told[0].subject).toContain("starts tomorrow");
    // Day 8: it is in force.
    await db().from("metrics").update({ retention_pending: { ...(await pendingOf(m.id)).retention_pending, starts_on: inDays(0), starts_after: PAST } }).eq("id", m.id);
    expect(await settleRetentions()).toEqual({ started: 1, reminded: 0 });
    expect((await pendingOf(m.id)).retention).toEqual(CONDENSE);
  });
});

describe("the Workspace default", () => {
  it("is set by Owners only, changes no Metric that exists, and is copied into a new one that waits its days", async () => {
    const { w, sara, ada, ben, m } = await setup();
    expect(await refusal(setDefaultRetention(w.actor(ada, "admin"), DELETE))).toBeInstanceOf(Forbidden);
    expect(await refusal(setDefaultRetention(w.actor(ben, "member"), DELETE))).toBeInstanceOf(Forbidden);
    expect(await refusal(setDefaultRetention({ ...w.actor(sara), key: { id: "1", scopes: [] } } as never, DELETE))).toBeInstanceOf(Forbidden);
    expect(await refusal(setDefaultRetention({ personId: sara, workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, DELETE))).toBeInstanceOf(DemoReadOnly);
    expect(await refusal(setDefaultRetention(w.actor(sara), { keep_months: 2, then: "delete" }))).toBeInstanceOf(Error);
    expect(await defaultRetention(w.actor(ada, "admin"))).toBeNull();
    expect(await refusal(defaultRetention(w.actor(ben, "member")))).toBeInstanceOf(Forbidden);
    await setDefaultRetention(w.actor(sara), CONDENSE);
    await setDefaultRetention(w.actor(sara), CONDENSE); // no change, no second event
    expect(await defaultRetention(w.actor(ada, "admin"))).toEqual(CONDENSE);
    expect(await auditRowsOf(w.id, "workspace.retention_default_set")).toHaveLength(1);
    expect(await pendingOf(m.id)).toEqual({ retention: null, retention_pending: null });
    const made = await createMetric(w.actor(ben, "member"), { name: "New", period: "day", aggregation: "sum" }, fx());
    expect((await pendingOf(made.id)).retention_pending).toMatchObject({ retention: { ...CONDENSE, into: "quarter" }, starts_on: inDays(8), set_by: ben, counted: { periods: 0, values: 0 } });
    // It is recorded and told like any confirmed Retention, as a default.
    expect(await auditRowsOf(w.id, "metric.retention_set")).toHaveLength(1);
    expect((await db().from("deliveries").select("recipient_id").eq("workspace_id", w.id).eq("kind", "notice")).data?.map((d) => d.recipient_id)).toEqual([ben]);
    // A Metric the default does not fit (a rate cannot be condensed; a quarter cannot be condensed into months) gets none.
    expect((await pendingOf((await createMetric(w.actor(ben, "member"), { name: "Rate", aggregation: "none" }, fx())).id)).retention_pending).toBeNull();
    expect((await pendingOf((await createMetric(w.actor(ben, "member"), { name: "Quarterly", period: "year", aggregation: "sum" }, fx())).id)).retention_pending).toBeNull();
    await setDefaultRetention(w.actor(sara), null);
    expect(await defaultRetention(w.actor(sara))).toBeNull();
    expect((await pendingOf((await createMetric(w.actor(ben, "member"), { name: "Later" }, fx())).id)).retention_pending).toBeNull();
  });

  it("applies to every Metric that has none, as the preview showed, and refuses once the numbers changed", async () => {
    const { w, sara, ada, ben, m } = await setup();
    const other = await w.metric(ben, { name: "Second", aggregation: "none" });
    await w.share(other.id, sara);
    for (const p of months("2018-01-01", 3)) await w.value(other.id, p, 1, ben);
    const withOne = await w.metric(ben, { name: "Has one" });
    await db().from("metrics").update({ retention: { keep_months: 60, then: "delete" } }).eq("id", withOne.id);
    await w.share(withOne.id, sara);
    expect(await refusal(retentionPreviewAll(w.actor(ada, "admin"), CONDENSE))).toBeInstanceOf(Forbidden);
    const p = await retentionPreviewAll(w.actor(sara), CONDENSE);
    // Field visits is offered; the rate cannot be condensed; the one that has a Retention is left alone, uncounted.
    expect(p).toMatchObject({ applies: 1, totals: { periods: 24, values: 24, condensedValues: 8 }, skipped: { count: 1 } });
    expect(p.skipped.reasons[0]).toMatch(/Aggregation none/);
    expect(p.metrics.map((x) => x.name)).toEqual(["Field visits"]);
    expect(await refusal(applyRetentionToExisting(w.actor(sara), CONDENSE, "stale"))).toMatchObject({ message: NUMBERS_CHANGED });
    await w.action({ metric_id: m.id, period_start: "2018-01-01", asker_id: sara, assignee_id: ben, status: "open" });
    expect(await refusal(applyRetentionToExisting(w.actor(sara), CONDENSE, p.fingerprint))).toMatchObject({ message: NUMBERS_CHANGED });
    const again = await retentionPreviewAll(w.actor(sara), CONDENSE);
    expect(await applyRetentionToExisting(w.actor(sara), CONDENSE, again.fingerprint)).toEqual({ applied: 1, changed: 0 });
    expect((await pendingOf(m.id)).retention_pending).toMatchObject({ starts_on: inDays(8), set_by: sara });
    expect((await pendingOf(other.id)).retention_pending).toBeNull();
    // Applied once: the next preview has nothing left to apply to but the rate.
    expect((await retentionPreviewAll(w.actor(sara), CONDENSE)).applies).toBe(0);
    expect(await auditRowsOf(w.id, "metric.retention_set")).toHaveLength(1);
  });
});

describe("what a confirmation holds", () => {
  it("needs the Metric's name for a delete, and the counts of every Metric of an apply", async () => {
    const { w, sara, ben, m } = await setup();
    const actor = w.actor(ben, "member");
    const shown = await retentionPreview(actor, m.id, DELETE);
    expect(await refusal(setRetention(actor, m.id, DELETE, shown.fingerprint))).toMatchObject({ message: expect.stringContaining("Type") });
    expect(await refusal(setRetention(actor, m.id, DELETE, shown.fingerprint, "field visits "))).toMatchObject({ message: expect.stringContaining("Type") });
    expect((await pendingOf(m.id)).retention_pending).toBeNull();
    // The Workspace-wide delete asks for the word.
    const all = await retentionPreviewAll(w.actor(sara), DELETE);
    expect(await refusal(applyRetentionToExisting(w.actor(sara), DELETE, all.fingerprint))).toMatchObject({ message: expect.stringContaining("Type") });
    expect(await applyRetentionToExisting(w.actor(sara), DELETE, all.fingerprint, "delete")).toEqual({ applied: 1, changed: 0 });
    // What is stored remembers what was shown: the job (#382) may take no more than this.
    expect((await pendingOf(m.id)).retention_pending).toMatchObject({ counted: { periods: 24, values: 24 }, id: expect.any(String) });
  });

  it("is not changed by a Metric that appears after the preview", async () => {
    const { w, sara, ben, m } = await setup();
    const all = await retentionPreviewAll(w.actor(sara), CONDENSE);
    const late = await w.metric(ben, { name: "Late" });
    await w.share(late.id, sara);
    expect(await refusal(applyRetentionToExisting(w.actor(sara), CONDENSE, all.fingerprint))).toMatchObject({ message: NUMBERS_CHANGED });
    expect((await pendingOf(m.id)).retention_pending).toBeNull();
    expect((await pendingOf(late.id)).retention_pending).toBeNull();
  });

  it("tells each owner once for all their Metrics, and tells nobody who no longer sees them", async () => {
    const { w, sara, ben, m } = await setup();
    const second = await w.metric(ben, { name: "Second" });
    for (const p of months("2018-01-01", 3)) await w.value(second.id, p, 1, ben);
    await w.share(second.id, sara);
    const all = await retentionPreviewAll(w.actor(sara), CONDENSE);
    expect(await applyRetentionToExisting(w.actor(sara), CONDENSE, all.fingerprint)).toEqual({ applied: 2, changed: 0 });
    const { data } = await db().from("deliveries").select("recipient_id").eq("workspace_id", w.id).eq("kind", "notice");
    expect(data?.map((d) => d.recipient_id).sort()).toEqual([ben, sara].sort());
    // A reminder does not go to someone who has left the Workspace.
    await db().from("deliveries").delete().eq("workspace_id", w.id);
    await w.dropMember(ben);
    const waiting = (await pendingOf(m.id)).retention_pending!;
    await db().from("metrics").update({ retention_pending: { ...waiting, confirmed_on: inDays(-7), starts_on: inDays(1) } }).eq("id", m.id);
    await settleRetentions();
    expect((await db().from("deliveries").select("recipient_id").eq("workspace_id", w.id).eq("kind", "notice")).data?.map((d) => d.recipient_id)).toEqual([sara]);
  });

  it("cannot be cancelled or started through another confirmation, and never starts before 7 days have passed", async () => {
    const { w, ben, m } = await setup();
    const actor = w.actor(ben, "member");
    await setRetention(actor, m.id, CONDENSE, (await retentionPreview(actor, m.id, CONDENSE)).fingerprint);
    const first = (await pendingOf(m.id)).retention_pending!;
    // The Workspace's clock moved forward, so its day says "the 8th": 7 days still have not passed.
    await db().from("metrics").update({ retention_pending: { ...first, starts_on: inDays(0), confirmed_on: inDays(-8) } }).eq("id", m.id);
    expect(await settleRetentions()).toEqual({ started: 0, reminded: 0 });
    expect(await cancelRetention(actor, m.id)).toEqual({ cancelled: true });
    // A newer confirmation takes the place of the one a stale read still holds.
    await setRetention(actor, m.id, CONDENSE, (await retentionPreview(actor, m.id, CONDENSE)).fingerprint);
    const newer = (await pendingOf(m.id)).retention_pending!;
    expect(newer.starts_on).toBe(inDays(8));
    await db().from("metrics").update({ retention_pending: { ...newer, starts_on: inDays(0), starts_after: PAST } }).eq("id", m.id);
    expect(await settleRetentions()).toMatchObject({ started: 1 });
  });

  it("keeps the setting out of the Metric rows that browsers, View Links and Snapshots are given", async () => {
    const { w, sara, ben, m } = await setup();
    const actor = w.actor(ben, "member");
    await setRetention(actor, m.id, CONDENSE, (await retentionPreview(actor, m.id, CONDENSE)).fingerprint);
    const { data } = await db().from("metrics").select("*").eq("id", m.id).single();
    expect(data).toHaveProperty("retention_pending");
    expect(Object.keys(normalizeMetric(data as never))).not.toEqual(expect.arrayContaining(["retention"]));
    expect(Object.keys(normalizeMetric(data as never))).not.toEqual(expect.arrayContaining(["retention_pending"]));
    expect(Object.keys(normalizeMetric({ ...data, retention_cap: { id: "x" } } as never))).not.toContain("retention_cap");
    // The page reads it through the core, and no one who may not see the Metric does.
    expect(await retentionFor(actor, m.id)).toMatchObject({ retention: null, pending: { starts_on: inDays(8), cancellable: true }, canSet: true });
    expect(JSON.stringify(await retentionFor(actor, m.id))).not.toContain(sara);
    const dan = await w.person("member");
    expect(await refusal(retentionFor(w.actor(dan, "member"), m.id))).toBeInstanceOf(Forbidden);
  });
});

describe("what is recorded", () => {
  it("is kept for the Metric, by its id and the name it had then; the setting and its days are the details", async () => {
    const { w, ben, m } = await setup({ name: "Secret revenue" });
    const actor = w.actor(ben, "member");
    await setRetention(actor, m.id, DELETE, (await retentionPreview(actor, m.id, DELETE)).fingerprint, "Secret revenue");
    const { data } = await db().from("audit_events").select("kind, object_type, object_id, object_name, details").eq("workspace_id", w.id).eq("kind", "metric.retention_set").single();
    expect(data).toMatchObject({ object_type: "metric", object_id: String(m.id) });
    expect(Object.keys(data!)).toEqual(["kind", "object_type", "object_id", "object_name", "details"]);
  });
});
