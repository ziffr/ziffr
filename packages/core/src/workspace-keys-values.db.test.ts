// Values and Metric names sealed with the Workspace Key, against the real database (spec 0028 step 2, ticket #248;
// GLOSSARY: Workspace Key, Observation, Submission Rule, Breakdown, Target Series): a value is written sealed for its
// row and read opened, "add up" under two writers adds both and sums exactly, plain values from before still read and
// are sealed by the re-encryption job without a history entry, a destroyed key leaves nothing readable, and no sealed
// column holds a known number or name.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { archiveMetric } from "./archived-metrics";
import { createDashboard, placeWidget } from "./dashboards";
import { createMetric, saveSeriesRows } from "./metrics";
import { listSnapshots, openSnapshot, takeSnapshot } from "./snapshots";
import { saveWorkflow } from "./workflows";
import { openWorkflowRow } from "./workflow-rows";
import { reencryptionJob, sealCandidate } from "./workspace-key-job";
import { submitValue, type SubmissionEffects } from "./submissions";
import { getBreakdowns, getMetrics, getObservations, getSeriesValues } from "./workspace-data";
import { destroyWorkspaceKeys, forgetWorkspaceKey, isSealed, workspaceCipher } from "./workspace-keys";
import { workspace } from "./test/db-fixtures";
import { DEMO_WORKSPACE_ID } from "./team";

const saved = process.env.ZIFFR_SECRETS_KEY;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 77).toString("base64"); });
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY;
  else process.env.ZIFFR_SECRETS_KEY = saved;
}, 120_000);

const effects = (): SubmissionEffects => ({ notifyCorrection: async () => {}, afterValue: async () => [] });
const PERIOD = "2026-10-01";

/** A Workspace with an Owner and a Metric made through the core (so its name and target are sealed). */
async function setup(over: { rule?: string; targetMin?: number } = {}) {
  const w = await workspace("Values");
  cleanups.push(async () => { forgetWorkspaceKey(w.id); await w.cleanup(); });
  const owner = await w.person("owner");
  const created = await createMetric(w.actor(owner), { name: "Quiet Heron Visits", period: "month", submissionRule: over.rule ?? "overwrite", targetMin: over.targetMin ?? 5000.25, sources: ["web_form", "api"], submitters: [owner] });
  const { data: tokens } = await db().from("tokens").select("code").eq("metric_id", created.id).eq("submitter_id", owner);
  const code = tokens?.[0]?.code as string;
  return { ...w, owner, metricId: created.id, code };
}

/** A value as a program sends it: a number (with "label n" lines as its Breakdown), for a period. */
const send = (code: string, text: string, period = PERIOD) => {
  const [first, ...lines] = text.split("\n");
  const breakdown = lines.map((l) => ({ label: l.slice(0, l.lastIndexOf(" ")), value: Number(l.slice(l.lastIndexOf(" ") + 1)) }));
  return submitValue({ source: "api", sender: code, text: "", period, value: { value: Number(first), ...(breakdown.length ? { breakdown } : {}) } }, effects());
};

async function rows(table: string, column: string, where: Record<string, unknown>) {
  let q = db().from(table).select("*");
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v as string | number);
  const { data } = await q;
  // Oldest first: the order of a table's rows without an ORDER BY is not promised.
  return (data ?? []).map((r) => r as Record<string, unknown>).filter((r) => column in r).sort((a, b) => Number(a.id) - Number(b.id));
}

describe("a value", () => {
  it("is stored sealed for its row and read as written", async () => {
    const w = await setup();
    const r = await send(w.code, "48271905.37");
    expect(r).toMatchObject({ ok: true, outcome: "recorded" });
    const [row] = await rows("observations", "value", { metric_id: w.metricId });
    expect(row.value).toBeNull();
    expect(isSealed(row.value_sealed as string)).toBe(true);
    expect(JSON.stringify(row)).not.toContain("48271905");
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([48271905.37]);
  });

  it("does not open in another row, and then reads as missing, never as 0", async () => {
    const w = await setup({ rule: "keep_both" });
    await send(w.code, "11", "2026-09-01");
    await send(w.code, "22", "2026-10-01");
    const [a, b] = await rows("observations", "value", { metric_id: w.metricId });
    await db().from("observations").update({ value_sealed: a.value_sealed }).eq("id", b.id as number);
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([11]);
  });

  it("is added up exactly, rounded to 6 decimals, whatever the sealing", async () => {
    const w = await setup({ rule: "add" });
    await send(w.code, "0.1");
    await send(w.code, "0.2");
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([0.3]);
    await send(w.code, "0.0000005");
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([0.300001]);
  });

  it("is added up by two writers at the same moment: both count", async () => {
    const w = await setup({ rule: "add" });
    await send(w.code, "1");
    await Promise.all(Array.from({ length: 6 }, (_, i) => send(w.code, String(10 ** i))));
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([1 + 1 + 10 + 100 + 1000 + 10000 + 100000]);
  });

  it("keeps a Breakdown's rows sealed, merged by label under add, and counts every row once under concurrent writers", async () => {
    const w = await setup({ rule: "add" });
    await send(w.code, "10\nNorth 4\nSouth 6");
    await Promise.all([send(w.code, "5\nnorth 2\nWest 3"), send(w.code, "7\nSouth 7")]);
    const stored = await rows("breakdown_rows", "value", { workspace_id: w.id });
    expect(stored.every((r) => r.value === null && isSealed(r.value_sealed as string) && isSealed(r.label as string))).toBe(true);
    const shown = (await getBreakdowns(w.id, [w.metricId]))[w.metricId][PERIOD];
    expect(Object.fromEntries(shown.map((b) => [b.label, b.value]))).toEqual({ North: 6, South: 13, West: 3 });
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([22]);
  });

  it("replaced goes to the history sealed for the row it was a value of", async () => {
    const w = await setup();
    await send(w.code, "100");
    await send(w.code, "250");
    const { data: history } = await db().from("observation_history").select("*").eq("metric_id", w.metricId);
    expect(history).toHaveLength(1);
    expect(history![0].value).toBeNull();
    const [row] = await rows("observations", "value", { metric_id: w.metricId });
    const cipher = await workspaceCipher(w.id);
    expect(cipher.open({ table: "observations", column: "value", row: row.id as number }, history![0].value_sealed as string)).toBe("100");
  });

  it("is written by the database only as the Metric's Submission Rule says, and only if the period is as the core read it", async () => {
    const w = await setup({ rule: "overwrite" });
    const call = (over: Record<string, unknown>) => db().rpc("record_value", { p_metric: w.metricId, p_period: PERIOD, p_op: "insert", p_new_id: 1, p_value: 1, p_value_sealed: null, p_submitter: w.owner, p_source: "api", p_access_key: null, p_imported: false, p_expect_id: null, p_expect_count: 0, p_expect_value: null, p_expect_rows: null, p_rows: [], ...over });
    // Adding is not what an "overwrite" Metric does; nothing is written.
    expect((await call({ p_op: "add", p_expect_id: 1 })).error).toBeTruthy();
    // A period that is not as the core read it (a value arrived meanwhile) is refused with the retry code.
    await send(w.code, "5");
    expect((await call({ p_op: "insert", p_expect_count: 0 })).error?.code).toBe("ZF409");
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([5]);
  });

  it("is refused for an archived Metric, sealed or not", async () => {
    const w = await setup();
    await send(w.code, "5");
    await archiveMetric(w.actor(w.owner), w.metricId);
    const r = await send(w.code, "6");
    expect(r.ok).toBe(false);
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([5]);
    // Changing the sealed text of a value of an archived Metric by hand is refused too: the check sees the change.
    const [row] = await rows("observations", "value", { metric_id: w.metricId });
    const { error } = await db().from("observations").update({ value_sealed: `${row.value_sealed}x` }).eq("id", row.id as number);
    expect(error?.code).toBe("ZF440");
  });
});

describe("a Metric's name and Target Range, and its Targets and Projections", () => {
  it("are stored sealed and read as written", async () => {
    const w = await setup();
    const [m] = await rows("metrics", "name", { id: w.metricId });
    expect(isSealed(m.name as string)).toBe(true);
    expect(m.target_min).toBeNull();
    expect(isSealed(m.target_min_sealed as string)).toBe(true);
    expect(JSON.stringify(m)).not.toContain("Heron");
    const [read] = await getMetrics(w.id);
    expect(read).toMatchObject({ name: "Quiet Heron Visits", target_min: 5000.25 });
    await saveSeriesRows(w.actor(w.owner), w.metricId, "target", [{ period: PERIOD, value: 91234.5 }], "plan");
    const [point] = await rows("series_values", "value", { metric_id: w.metricId });
    expect(point.value).toBeNull();
    expect(JSON.stringify(point)).not.toContain("91234");
    expect((await getSeriesValues(w.id, [w.metricId])).targets[w.metricId]).toEqual([{ period: PERIOD, value: 91234.5 }]);
  });

  it("are unreadable once the Workspace Key is destroyed", async () => {
    const w = await setup();
    await send(w.code, "9");
    await w.trial("2026-01-01");
    await destroyWorkspaceKeys(w.id);
    forgetWorkspaceKey(w.id);
    // Nothing of the Workspace can be opened any more, and no new key is made in its place.
    await expect(getObservations(w.id, [w.metricId])).rejects.toThrow(/key is gone/);
    await expect(getMetrics(w.id)).rejects.toThrow(/key is gone/);
    const [row] = await rows("observations", "value", { metric_id: w.metricId });
    expect(isSealed(row.value_sealed as string)).toBe(true);
  });
});

describe("rows written before sealing", () => {
  it("read as they are, are added to as sealed values, and are sealed by the job without a history entry", async () => {
    const w = await setup({ rule: "add" });
    const plainId = await w.value(w.metricId, "2026-08-01", 12.5, w.owner);
    await db().from("metrics").update({ name: "Plain name", target_min: 7, target_min_sealed: null }).eq("id", w.metricId);
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([12.5]);
    expect((await getMetrics(w.id))[0]).toMatchObject({ name: "Plain name", target_min: 7 });
    // Added to: the sum is stored sealed.
    await send(w.code, "2.5", "2026-08-01");
    const [added] = await rows("observations", "value", { id: plainId });
    expect(added.value).toBeNull();
    expect(isSealed(added.value_sealed as string)).toBe(true);
    // A plain value of another period, a plain history entry and a plain Target point, sealed by the job.
    const other = await w.value(w.metricId, "2026-07-01", 3.25, w.owner);
    await db().from("series_values").insert({ metric_id: w.metricId, kind: "projection", period_start: "2026-07-01", value: 8.125, workspace_id: w.id });
    const historyBefore = (await db().from("observation_history").select("id", { count: "exact", head: true }).eq("metric_id", w.metricId)).count;
    await archiveMetric(w.actor(w.owner), w.metricId);
    const result = await reencryptionJob({ only: [w.id], seconds: 30 });
    expect(result.errors).toBe(0);
    for (const id of [plainId, other]) {
      const [r] = await rows("observations", "value", { id });
      expect(r.value).toBeNull();
      expect(isSealed(r.value_sealed as string)).toBe(true);
    }
    expect((await db().from("observation_history").select("id", { count: "exact", head: true }).eq("metric_id", w.metricId)).count).toBe(historyBefore);
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value).sort((a, b) => a - b)).toEqual([3.25, 15]);
    expect((await getSeriesValues(w.id, [w.metricId])).projections[w.metricId]).toEqual([{ period: "2026-07-01", value: 8.125 }]);
    expect((await getMetrics(w.id))[0]).toMatchObject({ name: "Plain name", target_min: 7 });
    const [m] = await rows("metrics", "name", { id: w.metricId });
    expect(isSealed(m.name as string)).toBe(true);
    expect(m.target_min).toBeNull();
  });

  it("a Snapshot's data and a Workflow's Check level are sealed by the job too, the draft stays as private, and the database refuses any other change to a frozen part", async () => {
    // Written without a key, as before the upgrade.
    delete process.env.ZIFFR_SECRETS_KEY;
    const w = await setup();
    await w.value(w.metricId, "2026-08-01", 321.5, w.owner);
    const dash = await createDashboard(w.actor(w.owner), "Plain dashboard");
    await placeWidget(w.actor(w.owner), dash, { type: "spec", template: "table", metricIds: [w.metricId], settings: {} });
    const snap = await takeSnapshot(w.actor(w.owner), dash, { kind: "month", start: "2026-08-01" });
    const flow = await saveWorkflow(w.actor(w.owner), null, "Close", { dueWorkingDays: 2, steps: [{ type: "check", changePct: 437, outsideTarget: false }, { type: "publish", lock: false }] });
    const plainFrozen = (await db().from("dashboard_snapshots").select("frozen").eq("id", snap).single()).data!.frozen as { data: { metrics?: unknown }; metricIds?: number[] };
    expect(plainFrozen.data.metrics).toBeTruthy();
    // The key arrives; the job runs.
    process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 77).toString("base64");
    expect((await reencryptionJob({ only: [w.id], seconds: 30 })).errors).toBe(0);
    const frozen = (await db().from("dashboard_snapshots").select("frozen").eq("id", snap).single()).data!.frozen as { data: { sealed?: string; metrics?: unknown }; metricIds: number[] };
    expect(isSealed(frozen.data.sealed)).toBe(true);
    expect(frozen.data.metrics).toBeUndefined();
    expect(frozen.metricIds).toEqual([w.metricId]);
    const [read] = await listSnapshots(w.actor(w.owner), dash);
    expect(read.id).toBe(snap);
    expect((await openSnapshot(w.actor(w.owner), snap)).data.metrics.map((m) => m.slug)).toHaveLength(1);
    const { data: config } = await db().from("workflows").select("config").eq("id", flow).single();
    expect(JSON.stringify(config)).not.toContain("437");
    expect((await openWorkflowRow(w.id, { id: flow, config: config!.config }))!.config).toMatchObject({ steps: [{ type: "check", changePct: 437 }, { type: "publish" }] });
    // A write of the frozen part through seal_json that changes anything but the sealing is refused by the database.
    const tampered = { ...frozen, name: "Another name" };
    const refused = await db().rpc("seal_json", { p_workspace: w.id, p_table: "dashboard_snapshots", p_column: "frozen", p_id: snap, p_was: frozen, p_new: tampered });
    expect(refused.error?.code).toBe("ZF403");
  });

  it("are not overwritten when they changed after the job read them", async () => {
    const w = await setup();
    const id = await w.value(w.metricId, "2026-08-01", 40, w.owner);
    const cipher = await workspaceCipher(w.id);
    const stale = { key: String(id), value: "40", value_sealed: null, original_value: null, original_value_sealed: null };
    await db().from("observations").update({ value: 41 }).eq("id", id);
    expect(await sealCandidate(cipher, w.id, "observations", stale)).toBe("changed");
    expect((await getObservations(w.id, [w.metricId])).map((o) => o.value)).toEqual([41]);
  });
});

describe("the demo and an Installation without a key", () => {
  it("keep plain numbers and still add up", async () => {
    delete process.env.ZIFFR_SECRETS_KEY;
    const w = await setup({ rule: "add" });
    await send(w.code, "0.1");
    await send(w.code, "0.2");
    const [row] = await rows("observations", "value", { metric_id: w.metricId });
    expect(row.value_sealed).toBeNull();
    expect(Number(row.value)).toBe(0.3);
    expect((await workspaceCipher(DEMO_WORKSPACE_ID)).sealing).toBe(false);
  });
});

describe("a sealed Workspace", () => {
  it("leaves no known value or name in any row of the tables that hold them", async () => {
    const w = await setup({ rule: "add", targetMin: 61827.43 });
    await send(w.code, "73910462.58\nZephyr Quarry 31.5\nMarble Falls 42.25");
    await saveSeriesRows(w.actor(w.owner), w.metricId, "projection", [{ period: PERIOD, value: 55512.875 }], "");
    await send(w.code, "1.5");
    const needles = ["73910462", "58", "Zephyr", "Marble", "Quiet Heron", "61827.43", "55512.875"].filter((n) => n.length > 2);
    for (const table of ["observations", "observation_history", "breakdown_rows", "breakdown_history", "series_values", "metrics"]) {
      const { data } = await db().from(table).select("*").eq("workspace_id", w.id);
      const text = JSON.stringify(data);
      for (const n of needles) expect(text, `${table} holds ${n}`).not.toContain(n);
    }
  });
});
