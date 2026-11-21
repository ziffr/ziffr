// Retention, the daily job against the real database (spec 0033, ticket #382; GLOSSARY: Retention, Condensed Value):
// that it condenses exactly what a person confirmed and no more, that every Display Period at or above the Condensed
// Value shows the same numbers afterwards, that two calls run once, that a stopped run resumes, that a check that does
// not match leaves the span alone, that nothing is deleted without a download to be had first, and that the demo is never
// touched.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { condensedFor, discardCondensed, storeCondensed } from "./condensed-values";
import { db, seedingDemo } from "./db";
import { shownSeries, type DisplayPeriod } from "./display-periods";
import { DEMO_WORKSPACE_ID } from "./team";
import { retentionJob, MAX_VALUES_PER_RUN } from "./retention-job";
import * as setting from "./retention-setting";
import { cancelRetention, retentionFor, retentionPreview, retentionValuesCsv, setRetention } from "./retention-setting";
import { getMetrics } from "./workspace-data";
import { auditRowsOf, workspace } from "./test/db-fixtures";

// The job's planning is wrapped so one test can make a run fail; every other call is the real thing.
vi.mock("./retention-setting", async (orig) => {
  const real = await orig<typeof import("./retention-setting")>();
  return { ...real, planRetention: vi.fn(real.planRetention) };
});

vi.setConfig({ testTimeout: 180_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { vi.mocked(setting.planRetention).mockClear(); for (const c of cleanups.splice(0)) await c(); });
const TODAY = new Date().toISOString().slice(0, 10);
const inDays = (n: number, from = TODAY) => { const d = new Date(`${from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysFrom = (from: string, count: number) => Array.from({ length: count }, (_, i) => inDays(i, from));
const CONDENSE = { keep_months: 25, then: "condense", into: "month" } as const;
const DELETE = { keep_months: 25, then: "delete" } as const;
/** The job, for one test's Workspace only: other test files make Retentions of their own at the same time. */
const job = (w: { id: string }, now?: Date) => retentionJob(now, { workspaceId: w.id });

/** A Workspace with a Member who owns a daily Metric (and so may set its Retention). */
async function setup(over: Record<string, unknown> = {}) {
  const w = await workspace();
  cleanups.push(w.cleanup);
  const ben = await w.person("member");
  const m = await w.metric(ben, { name: "Field visits", period: "day", aggregation: "sum", ...over });
  return { w, ben, m, actor: w.actor(ben, "member") };
}
type World = Awaited<ReturnType<typeof setup>>;

/** Stores values in bulk: one per given day, a few decimals so sums are exact only if added exactly. */
async function bulk(w: World["w"], metricId: number, owner: string, rows: { period: string; value: number }[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db().from("observations").insert(rows.slice(i, i + 500).map((r) => ({ metric_id: metricId, period_start: r.period, value: r.value, submitter_id: owner, source: "api", workspace_id: w.id })));
    if (error) throw new Error(`setup failed: ${JSON.stringify(error)}`);
  }
}
const valuesFor = (periods: string[], skip: (i: number) => boolean = () => false) => periods.flatMap((period, i) => (skip(i) ? [] : [{ period, value: Number(((i % 9) * 1.1 + 0.35).toFixed(2)) }]));
const count = async (table: string, metricId: number, before = "9999-12-31") => (await db().from(table).select("*", { count: "exact", head: true }).eq("metric_id", metricId).lt("period_start", before)).count ?? 0;

/** What a person confirmed: the Retention in force, with the cap the preview's counts make (what the page does in two steps, and the job's first day). */
async function turnOn(w: World["w"], actor: World["actor"], metricId: number, retention: unknown) {
  const p = await retentionPreview(actor, metricId, retention);
  const cap = { id: randomUUID(), confirmed_on: TODAY, periods: p.periods, values: p.values, held_back_periods: p.heldBack, held_back_values: p.heldBackValues };
  await db().from("metrics").update({ retention, retention_pending: null, retention_cap: cap }).eq("id", metricId);
  return { p, cap };
}

/** What a widget shows for the Metric by a Display Period, from what the database holds now. */
async function shownBy(w: World["w"], metricId: number, display: DisplayPeriod) {
  const metric = (await getMetrics(w.id)).find((x) => x.id === metricId)!;
  const { data: obs } = await db().from("observations").select("period_start, value").eq("metric_id", metricId).order("period_start").order("created_at").order("id");
  const { data: targets } = await db().from("series_values").select("period_start, value").eq("metric_id", metricId).eq("kind", "target").order("period_start");
  const shown = shownSeries(metric, {
    metrics: [metric], series: { [metric.slug]: (obs ?? []).map((o) => ({ period: String(o.period_start), value: Number(o.value) })) },
    targets: { [metricId]: (targets ?? []).map((t) => ({ period: String(t.period_start), value: Number(t.value) })) },
    yearStart: 1, today: TODAY, condensed: await condensedFor(w.id, [metricId]),
  }, display);
  return { points: shown.points.map((p) => [p.period, p.value, p.held, p.length, p.through]), targets: shown.targets ? [shown.targets.at, shown.targets.line] : null, combined: shown.combined };
}
const SPANS: DisplayPeriod[] = ["month", "quarter", "year"];

describe("condensing", () => {
  it.each(["sum", "average", "last"] as const)("condenses exactly what was confirmed, keeps every longer Display Period's numbers, and folds Targets in (%s)", async (aggregation) => {
    const { w, ben, m, actor } = await setup({ aggregation });
    const old = daysFrom("2022-01-01", 90);
    // Gaps, Breakdown rows, a changed value (its earlier one is kept), a Lock, Targets: all of the span's detail.
    await bulk(w, m.id, ben, [...valuesFor(old, (i) => i % 11 === 3 || (i > 60 && i < 70)), ...valuesFor([inDays(-3), inDays(-2)])]);
    const { data: first } = await db().from("observations").select("id").eq("metric_id", m.id).eq("period_start", "2022-01-02").single();
    await db().from("breakdown_rows").insert([{ observation_id: first!.id, label: "A", value: 1, workspace_id: w.id }]);
    await db().from("observations").update({ value: 4.4 }).eq("id", first!.id);
    await db().from("series_values").insert([...daysFrom("2022-01-01", 31).map((p) => ({ metric_id: m.id, kind: "target", period_start: p, value: 2.2, workspace_id: w.id })), { metric_id: m.id, kind: "projection", period_start: "2022-02-01", value: 9, workspace_id: w.id }]);
    await w.lock(m.id, "2022-01-05");
    const before = await Promise.all(SPANS.map((d) => shownBy(w, m.id, d)));
    const { p } = await turnOn(w, actor, m.id, CONDENSE);
    expect(p).toMatchObject({ condensedValues: 3, breakdownRows: 1, supersededValues: 1 });

    const out = await job(w);
    expect(out).toMatchObject({ metrics: 1, condensed: 3, periods: p.periods, values: p.values, mismatches: 0, failed: 0 });
    // The originals, their history, Breakdown rows, Targets and Projections of the old periods are gone; recent ones stay.
    expect(await count("observations", m.id, "2023-01-01")).toBe(0);
    expect(await count("observation_history", m.id)).toBe(0);
    expect(await count("series_values", m.id, "2023-01-01")).toBe(0);
    expect((await db().from("breakdown_rows").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
    expect(await count("observations", m.id)).toBe(2);
    // Three Condensed Values, locked only where every period was: January had one Lock among many.
    const condensed = (await condensedFor(w.id, [m.id]))[m.id];
    expect(condensed.map((c) => [c.period, c.locked])).toEqual([["2022-01-01", false], ["2022-02-01", false], ["2022-03-01", false]]);
    // The invariant: by every Display Period at or above the Condensed Value's, exactly what it was.
    const after = await Promise.all(SPANS.map((d) => shownBy(w, m.id, d)));
    expect(after).toEqual(before);
    expect(await auditRowsOf(w.id, "retention.run")).toHaveLength(1);
    const { data: runs } = await db().from("retention_runs").select("state, attempts").eq("metric_id", m.id);
    expect(runs).toEqual([{ state: "done", attempts: 1 }]);
  });

  it("does the work once when two calls come at the same time", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 90)));
    await turnOn(w, actor, m.id, CONDENSE);
    const [a, b] = await Promise.all([job(w), job(w)]);
    expect(a.condensed + b.condensed).toBe(3);
    expect(a.claimedElsewhere + b.claimedElsewhere).toBe(1);
    expect((await db().from("retention_runs").select("id").eq("metric_id", m.id)).data).toHaveLength(1);
    expect((await condensedFor(w.id, [m.id]))[m.id]).toHaveLength(3);
    // A third call the same day finds the day claimed and done.
    expect(await job(w)).toMatchObject({ condensed: 0, claimedElsewhere: 1 });
  });

  it("takes over a run that stopped, finishing the span it left half done", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 90)));
    await turnOn(w, actor, m.id, CONDENSE);
    // The server went away after January's Condensed Value was stored and before its originals went, 20 minutes ago.
    await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "month", span: "2022-01-01" });
    await db().from("retention_runs").insert({ workspace_id: w.id, metric_id: m.id, day: TODAY, claimed_at: new Date(Date.now() - 20 * 60_000).toISOString() });
    // A fresh claim is respected...
    await db().from("retention_runs").update({ claimed_at: new Date().toISOString() }).eq("metric_id", m.id);
    expect(await job(w)).toMatchObject({ claimedElsewhere: 1, condensed: 0 });
    // ...a claim whose lease ran out is taken over, and the half-made span is checked and finished.
    await db().from("retention_runs").update({ claimed_at: new Date(Date.now() - 20 * 60_000).toISOString() }).eq("metric_id", m.id);
    expect(await job(w)).toMatchObject({ condensed: 3, mismatches: 0 });
    expect(await count("observations", m.id)).toBe(0);
    expect((await db().from("retention_runs").select("attempts, state").eq("metric_id", m.id).single()).data).toEqual({ attempts: 2, state: "done" });
  });

  it("carries on the next day where its budget of values ran out", async () => {
    const { w, ben, m, actor } = await setup();
    const n = MAX_VALUES_PER_RUN + 300;
    await bulk(w, m.id, ben, valuesFor(daysFrom("2008-01-01", n)));
    await turnOn(w, actor, m.id, DELETE);
    const day1 = await job(w);
    expect(day1.values).toBe(MAX_VALUES_PER_RUN);
    expect(await count("observations", m.id)).toBe(300);
    // Nothing more the same day (the day is claimed); the next day takes the rest.
    expect(await job(w)).toMatchObject({ values: 0 });
    const day2 = await job(w, new Date(Date.now() + 86_400_000));
    expect(day2.values).toBe(300);
    expect(await count("observations", m.id)).toBe(0);
  });

  it("leaves a span alone when the check does not match, and does it right the next day", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 31)));
    await turnOn(w, actor, m.id, CONDENSE);
    // A Condensed Value that stands for something else than the originals (as if it were made wrongly).
    await db().from("condensed_values").insert({ id: randomUUID(), workspace_id: w.id, metric_id: m.id, period_start: "2022-01-01", period_end: "2022-01-31", span: "month", held: 31, of: 31, payload: JSON.stringify({ sum: "999", last: null, target: null }) });
    const out = await job(w);
    expect(out).toMatchObject({ condensed: 0, mismatches: 1 });
    expect(await count("observations", m.id)).toBe(31);
    expect((await condensedFor(w.id, [m.id]))[m.id]).toBeUndefined();
    expect(await auditRowsOf(w.id, "retention.mismatch")).toHaveLength(1);
    expect((await retentionFor(actor, m.id)).status).toMatchObject({ stopped: false, note: expect.stringContaining("left as it is") });
    // The wrong one is gone: the next day condenses it from the originals.
    expect(await job(w, new Date(Date.now() + 86_400_000))).toMatchObject({ condensed: 1, mismatches: 0 });
    expect((await condensedFor(w.id, [m.id]))[m.id][0]).toMatchObject({ sum: expect.not.stringMatching(/^999$/) });
    expect((await retentionFor(actor, m.id)).status).toBeNull();
  });

  it("holds back periods open work holds, and condenses them the day after it is closed", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 90)));
    const action = await w.action({ metric_id: m.id, period_start: "2022-02-10", asker_id: ben, assignee_id: ben, status: "open" });
    const { cap } = await turnOn(w, actor, m.id, CONDENSE);
    expect(cap).toMatchObject({ periods: 62, held_back_periods: 28 });
    expect(await job(w)).toMatchObject({ condensed: 2 });
    expect((await condensedFor(w.id, [m.id]))[m.id].map((c) => c.period)).toEqual(["2022-01-01", "2022-03-01"]);
    expect(await count("observations", m.id)).toBe(28);
    await db().from("actions").update({ status: "closed" }).eq("id", action);
    // Freed, it is within what was confirmed (the confirmation said it was held back).
    expect(await job(w, new Date(Date.now() + 86_400_000))).toMatchObject({ condensed: 1, needConfirmation: 0 });
    expect(await count("observations", m.id)).toBe(0);
  });
  it("never takes back a Condensed Value whose originals are gone, and leaves one condensed into another period alone", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 90)));
    const action = await w.action({ metric_id: m.id, period_start: "2022-02-10", asker_id: ben, assignee_id: ben, status: "open" });
    await turnOn(w, actor, m.id, CONDENSE);
    expect(await job(w)).toMatchObject({ condensed: 2 });
    // January stands alone now: the database does not take it back, whoever asks and whatever they saw of the answer.
    const [january] = (await db().from("condensed_values").select("id").eq("metric_id", m.id).eq("period_start", "2022-01-01")).data!;
    expect(await discardCondensed(w.id, january.id)).toBe(false);
    expect((await condensedFor(w.id, [m.id]))[m.id].map((c) => c.period)).toEqual(["2022-01-01", "2022-03-01"]);
    // One made and not gone on with (February's originals are all there) is taken back.
    const february = await storeCondensed(w.actor(ben, "member"), { metricId: m.id, into: "month", span: "2022-02-01" });
    expect(await discardCondensed(w.id, february)).toBe(true);
    // The Retention is confirmed again, into quarters, once the open work is closed: the quarter would swallow the months
    // condensed already, so it is left as it is, with its months and its February.
    await db().from("actions").update({ status: "closed" }).eq("id", action);
    await turnOn(w, actor, m.id, { keep_months: 25, then: "condense", into: "quarter" });
    const out = await job(w, new Date(Date.now() + 86_400_000));
    expect(out).toMatchObject({ condensed: 0, mismatches: 1 });
    expect((await condensedFor(w.id, [m.id]))[m.id].map((c) => [c.period, c.into])).toEqual([["2022-01-01", "month"], ["2022-03-01", "month"]]);
    expect(await count("observations", m.id)).toBe(28);
    expect((await retentionFor(actor, m.id)).status?.note).toMatch(/another period/);
  });
});

describe("holding to what a person confirmed", () => {
  it("does nothing when more old values arrived since, and says why", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 90)));
    await turnOn(w, actor, m.id, DELETE);
    await bulk(w, m.id, ben, [{ period: "2021-12-31", value: 7 }]);
    const out = await job(w);
    expect(out).toMatchObject({ needConfirmation: 1, values: 0 });
    expect(await count("observations", m.id)).toBe(91);
    expect(await auditRowsOf(w.id, "retention.needs_confirmation")).toHaveLength(1);
    expect((await retentionFor(actor, m.id)).status?.note).toMatch(/confirm it again/);
    // The same words the next day add no second event.
    await job(w, new Date(Date.now() + 86_400_000));
    expect(await auditRowsOf(w.id, "retention.needs_confirmation")).toHaveLength(1);
    expect(await count("observations", m.id)).toBe(91);
  });

  it("never runs a Retention without a confirmation on record", async () => {
    const { w, ben, m } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 30)));
    await db().from("metrics").update({ retention: DELETE }).eq("id", m.id);
    expect(await job(w)).toMatchObject({ metrics: 1, needConfirmation: 1, values: 0 });
    expect(await count("observations", m.id)).toBe(30);
    expect((await db().from("retention_runs").select("id").eq("metric_id", m.id)).data).toEqual([]);
  });

  it("starts a confirmed Retention on its day, with what was shown as its cap, and takes no more than that", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 90)));
    const shown = await retentionPreview(actor, m.id, CONDENSE);
    await setRetention(actor, m.id, CONDENSE, shown.fingerprint);
    // Before its day it does nothing but wait (and cancelling is still possible).
    expect(await job(w)).toMatchObject({ started: 0, metrics: 0 });
    const waiting = (await db().from("metrics").select("retention_pending").eq("id", m.id).single()).data!.retention_pending as { starts_on: string };
    expect(waiting.starts_on).toBe(inDays(8));
    // Day 8: the job settles it first, then works.
    const later = new Date(Date.now() + 8 * 86_400_000 + 3_600_000);
    expect(await job(w, later)).toMatchObject({ started: 1, condensed: 3, values: 90 });
    const row = (await db().from("metrics").select("retention, retention_pending, retention_cap").eq("id", m.id).single()).data!;
    expect(row).toMatchObject({ retention: CONDENSE, retention_pending: null, retention_cap: { periods: 90, values: 90, confirmed_on: TODAY } });
    await expect(cancelRetention(actor, m.id)).resolves.toEqual({ cancelled: false });
  });
});

describe("deleting", () => {
  it("has a download of exactly what it will delete, written in the Audit Log, and deletes exactly that", async () => {
    const { w, ben, m, actor } = await setup();
    const old = daysFrom("2022-01-01", 40);
    await bulk(w, m.id, ben, [...valuesFor(old), ...valuesFor([inDays(-5)])]);
    const { data: first } = await db().from("observations").select("id").eq("metric_id", m.id).eq("period_start", "2022-01-02").single();
    await db().from("breakdown_rows").insert([{ observation_id: first!.id, label: "North", value: 1, workspace_id: w.id }]);
    await db().from("observations").update({ value: 8.8 }).eq("id", first!.id);
    await db().from("series_values").insert([{ metric_id: m.id, kind: "target", period_start: "2022-01-03", value: 3, workspace_id: w.id }, { metric_id: m.id, kind: "projection", period_start: "2022-01-04", value: 3, workspace_id: w.id }]);
    await w.lock(m.id, "2022-01-05");
    // Open work holds one period back: neither in the download nor deleted.
    await w.action({ metric_id: m.id, period_start: "2022-02-02", asker_id: ben, assignee_id: ben, status: "open" });
    const { p } = await turnOn(w, actor, m.id, DELETE);
    const csv = await retentionValuesCsv(actor, m.id, DELETE);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe('"Metric","Period","What","Value","Label","Recorded on","Source"');
    const kinds = (what: string) => lines.filter((l) => l.includes(`"${what}"`)).length;
    expect(kinds("value")).toBe(p.values);
    expect([kinds("earlier value"), kinds("breakdown row"), kinds("target")]).toEqual([p.supersededValues, p.breakdownRows, 1]);
    expect(csv).toContain('"North"');
    expect(csv).not.toContain('"2022-02-02"');
    expect(await auditRowsOf(w.id, "export.retention_values")).toHaveLength(1);
    // Someone who may not set the Retention gets nothing.
    const dan = await w.person("member");
    await expect(retentionValuesCsv(w.actor(dan, "member"), m.id, DELETE)).rejects.toThrow();

    const out = await job(w);
    expect(out).toMatchObject({ values: p.values, periods: p.periods, heldBack: 0 });
    // Everything older is gone but the held period; the recent value stays; the Projection, Lock and history went with it.
    expect((await db().from("observations").select("period_start").eq("metric_id", m.id).order("period_start")).data?.map((o) => o.period_start)).toEqual(["2022-02-02", inDays(-5)]);
    expect(await count("observation_history", m.id)).toBe(0);
    expect(await count("series_values", m.id)).toBe(0);
    expect((await db().from("period_states").select("period_start").eq("metric_id", m.id)).data).toEqual([]);
    expect((await db().from("breakdown_rows").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
    expect((await db().from("breakdown_history").select("id", { count: "exact", head: true }).eq("workspace_id", w.id)).count).toBe(0);
    expect(await auditRowsOf(w.id, "retention.run")).toHaveLength(1);
  });

  it("refuses a download of nothing, and one that does not fit the Metric", async () => {
    const { w, ben, m, actor } = await setup({ aggregation: "none" });
    await bulk(w, m.id, ben, valuesFor([inDays(-3)]));
    await expect(retentionValuesCsv(actor, m.id, DELETE)).rejects.toThrow(/Nothing would go/);
    await expect(retentionValuesCsv(actor, m.id, CONDENSE)).rejects.toThrow(/Aggregation none/);
    await expect(retentionValuesCsv(actor, m.id, null)).rejects.toThrow(/Pick how long/);
  });
});

describe("failing", () => {
  it("stops a Metric after three failed runs in a row, rolled back, and starts clean with a new confirmation", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 30)));
    const { cap } = await turnOn(w, actor, m.id, DELETE);
    vi.mocked(setting.planRetention).mockRejectedValue(new Error("boom"));
    const days = [0, 1, 2].map((n) => new Date(Date.now() + n * 86_400_000));
    expect(await job(w, days[0])).toMatchObject({ failed: 1, stopped: 0 });
    expect(await job(w, days[1])).toMatchObject({ failed: 1, stopped: 0 });
    expect(await job(w, days[2])).toMatchObject({ failed: 1, stopped: 1 });
    expect(await count("observations", m.id)).toBe(30);
    expect(await auditRowsOf(w.id, "retention.stopped")).toHaveLength(1);
    expect((await retentionFor(actor, m.id)).status).toMatchObject({ stopped: true, note: expect.stringContaining("Stopped after three runs") });
    expect((await db().from("retention_runs").select("state").eq("metric_id", m.id)).data).toEqual([{ state: "failed" }, { state: "failed" }, { state: "failed" }]);
    // Stopped: it is not even planned the next day.
    vi.mocked(setting.planRetention).mockClear();
    expect(await job(w, new Date(Date.now() + 3 * 86_400_000))).toMatchObject({ stopped: 1, failed: 0 });
    expect(setting.planRetention).not.toHaveBeenCalled();
    // A new confirmation starts it clean.
    vi.mocked(setting.planRetention).mockRestore();
    await db().from("metrics").update({ retention_cap: { ...cap, id: randomUUID() } }).eq("id", m.id);
    expect(await job(w, new Date(Date.now() + 4 * 86_400_000))).toMatchObject({ stopped: 0, values: 30 });
  });
});

describe("what it never touches", () => {
  it("the demo, even with a Retention set on one of its Metrics", async () => {
    const own = await setup();
    await bulk(own.w, own.m.id, own.ben, valuesFor(daysFrom("2022-01-01", 10)));
    await turnOn(own.w, own.actor, own.m.id, DELETE);
    const cap = { id: "demo", confirmed_on: TODAY, periods: 999, values: 999, held_back_periods: 0, held_back_values: 0 };
    // The demo's people are made by its seed, which a test database has not run: a person of its own for the Metric.
    const owner = `t-${randomUUID()}`;
    await db().from("profiles").insert({ id: owner, name: "Demo owner", role: "", color: "#000" });
    const demo = await seedingDemo(async () => {
      const { data, error } = await db().from("metrics").insert({ slug: `demo-${randomUUID().slice(0, 8)}`, name: "Demo ret", owner_id: owner, workspace_id: DEMO_WORKSPACE_ID, unit: "", format: "number", decimals: 0, period: "day", aggregation: "sum", submission_rule: "overwrite", polarity: "higher", sources: ["api"], retention: DELETE, retention_cap: cap }).select("id").single();
      if (error) throw new Error(JSON.stringify(error));
      await db().from("observations").insert({ metric_id: data!.id, period_start: "2022-01-01", value: 1, source: "api", workspace_id: DEMO_WORKSPACE_ID });
      return data!.id as number;
    });
    try {
      // Asked for the demo itself, the job finds nothing to do; a Workspace of its own is done as usual.
      expect(await retentionJob(undefined, { workspaceId: DEMO_WORKSPACE_ID })).toMatchObject({ metrics: 0, values: 0 });
      expect(await job(own.w)).toMatchObject({ metrics: 1, values: 10 });
      expect(await count("observations", demo)).toBe(1);
      expect((await db().from("retention_runs").select("id", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID)).count).toBe(0);
    } finally {
      await seedingDemo(async () => { await db().from("observations").delete().eq("metric_id", demo); await db().from("metrics").delete().eq("id", demo); });
      await db().from("profiles").delete().eq("id", owner);
    }
  });

  it("a Metric of another Workspace's claim, and the bookkeeping goes with a deleted Workspace", async () => {
    const { w, ben, m, actor } = await setup();
    await bulk(w, m.id, ben, valuesFor(daysFrom("2022-01-01", 10)));
    await turnOn(w, actor, m.id, DELETE);
    await job(w);
    expect((await db().from("retention_runs").select("id").eq("workspace_id", w.id)).data).toHaveLength(1);
    expect((await db().from("retention_state").select("metric_id").eq("workspace_id", w.id)).data).toHaveLength(1);
    // A claim names its Workspace: another Workspace's id claims nothing.
    const other = await workspace();
    cleanups.push(other.cleanup);
    expect((await db().rpc("claim_retention_run", { p_ws: other.id, p_metric: m.id, p_day: "2030-01-01" })).data).toBeNull();
    await w.cleanup();
    expect((await db().from("retention_runs").select("id").eq("workspace_id", w.id)).data).toEqual([]);
    expect((await db().from("retention_state").select("metric_id").eq("workspace_id", w.id)).data).toEqual([]);
  });
});
