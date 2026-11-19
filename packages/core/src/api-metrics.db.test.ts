// Metrics created by programs, against the real database (spec 0003, ticket #66): the scope, the creator's role, the
// demo, the creator as Submitter, fields checked like the form, the first Version naming the key, the daily limit.
// Changing a Target Range, Target Series and Projections (ticket #211): only the creator's Metrics to change, never a
// Guest's, and a refused item writes nothing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { actorForKey, checkKeyRequest, createAccessKey } from "./access-keys";
import { admitMetric, createMetricWithKey, listSeriesWithKey, MetricChangeRefused, METRICS_PER_DAY, setSeriesWithKey, setUnusualValueCheckWithKey, TooManyMetrics, unusualValueCheckWithKey, updateMetricWithKey } from "./api-metrics";
import { submitObservation } from "./api-submissions";
import { db } from "./db";
import { metricEffects, type MetricEffects } from "./metrics";
import { DEMO_WORKSPACE_ID } from "./team";
import { saveWorkflow, setMetricWorkflow, setWorkflowCheck } from "./workflows";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const forbidden = expect.any(Forbidden);
// The real first Version; no Prompt goes out.
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });

async function keyFor(w: Awaited<ReturnType<typeof ws>>, person: string, role: "owner" | "admin" | "member" | "guest" = "member", scopes: ("metrics:read" | "values:submit" | "metrics:write" | "metrics:edit")[] = ["metrics:write"]) {
  const { id, secret } = await createAccessKey(w.actor(person, role), { name: "Setup script", scopes, expiresOn: inDays(30) });
  return { id, secret, key: (await actorForKey(secret)) as KeyActor };
}

describe("createMetricWithKey", () => {
  it("creates a Metric owned by the key's creator, its first Version naming the key", async () => {
    const w = await ws(); const ben = await w.person("member");
    const { key } = await keyFor(w, ben);
    const m = await createMetricWithKey(key, { name: "Weekly signups", unit: "signups", period: "week", submission_rule: "add", polarity: "higher", target_min: 50 }, fx());
    expect(m).toEqual(expect.objectContaining({ slug: "weekly-signups", name: "Weekly signups", unit: "signups", period: "week", target_min: 50, derived: false }));
    const { data: row } = await db().from("metrics").select("id, owner_id, workspace_id, submission_rule, sources").eq("slug", m.slug).eq("workspace_id", w.id).single();
    expect(row).toMatchObject({ owner_id: ben, workspace_id: w.id, submission_rule: "add", sources: ["web_form", "mail", "slack", "telegram", "api"] });
    const { data: version } = await db().from("versions").select("message, author_id").eq("object_type", "metric").eq("object_id", row!.id).single();
    expect(version).toEqual({ message: "Created through the API (key “Setup script”)", author_id: ben });
  });
  it("makes the creator its Submitter when asked, so a key may submit at once", async () => {
    const w = await ws(); const ben = await w.person("member");
    const { key } = await keyFor(w, ben, "member", ["metrics:write", "values:submit"]);
    const effects = fx();
    const m = await createMetricWithKey(key, { name: "Orders", submit: true }, effects);
    expect(effects.promptSubmitter).toHaveBeenCalledTimes(1);
    expect(await submitObservation(key, m.slug, { value: 3 }, { notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) })).toMatchObject({ ok: true, status: "recorded" });
    const plain = await createMetricWithKey(key, { name: "Visits" }, fx());
    const { data: tokens } = await db().from("tokens").select("id").eq("workspace_id", w.id).eq("metric_id", (await db().from("metrics").select("id").eq("slug", plain.slug).eq("workspace_id", w.id).single()).data!.id);
    expect(tokens).toEqual([]);
  });
  it("checks every field like the form: unknown values fall back, long ones are cut", async () => {
    const w = await ws(); const ben = await w.person("member"); const { key } = await keyFor(w, ben);
    const m = await createMetricWithKey(key, { name: `  ${"N".repeat(200)}  `, format: "emoji", period: "hour", decimals: 99, unit: "u".repeat(50), target_min: Number.NaN }, fx());
    expect(m).toMatchObject({ format: "number", period: "month", decimals: 6, target_min: null });
    expect(m.name).toHaveLength(120);
    expect(m.unit).toHaveLength(20);
    await expect(createMetricWithKey(key, { name: "   " }, fx())).rejects.toThrow(/name/);
  });
  it("refuses a key without metrics:write, a Guest's key, a creator who became a Guest, and the demo", async () => {
    const w = await ws(); const ben = await w.person("member"); const gus = await w.person("guest");
    const { key: reader } = await keyFor(w, ben, "member", ["metrics:read"]);
    await expect(createMetricWithKey(reader, { name: "X" }, fx())).rejects.toEqual(forbidden);
    await expect(keyFor(w, gus, "guest")).rejects.toEqual(forbidden);
    expect((await keyFor(w, gus, "guest", ["metrics:read"])).key).toBeTruthy();
    const { secret } = await keyFor(w, ben);
    await db().from("memberships").update({ role: "guest" }).eq("workspace_id", w.id).eq("user_id", ben);
    await expect(createMetricWithKey((await actorForKey(secret))!, { name: "X" }, fx())).rejects.toEqual(forbidden);
    const demoKey: KeyActor = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner", key: { id: "0", scopes: ["metrics:write"] } };
    await expect(createMetricWithKey(demoKey, { name: "X" }, fx())).rejects.toEqual(forbidden);
    const { data } = await db().from("metrics").select("id").eq("workspace_id", w.id);
    expect(data).toEqual([]);
  });
  it(`allow ${METRICS_PER_DAY} new Metrics in 24 hours, also to parallel calls, then say when to retry`, async () => {
    const w = await ws(); const ben = await w.person("member"); const { id, key } = await keyFor(w, ben);
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    for (let i = 0; i < METRICS_PER_DAY - 3; i++) await w.metric(ben, { name: `Old ${i}`, access_key_id: id, created_at: hourAgo });
    for (let i = 0; i < 5; i++) await w.metric(ben, { name: `Older ${i}`, access_key_id: id, created_at: new Date(Date.now() - 25 * 3_600_000).toISOString() });
    // Made in the app, not with the key: they don't count.
    await w.metric(ben, { name: "By hand" });
    expect(await admitMetric(key)).toEqual({ ok: true });
    // Three places left, five calls at once: the database lets exactly three through.
    const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => createMetricWithKey(key, { name: `Burst ${i}` }, fx())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason)).toEqual([expect.any(TooManyMetrics), expect.any(TooManyMetrics)]);
    const refused = await admitMetric(key);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.retryAfter).toBeGreaterThan(22 * 3600);
  });
});

describe("targets with a key", () => {
  it("changes only what the creator may change, as a person's own key, and writes a batch whole or not at all", async () => {
    const w = await ws(); const ben = await w.person("member"); const sara = await w.person("owner");
    const mine = await w.metric(ben, { name: "Revenue" });
    const saras = await w.metric(sara, { name: "Payroll" });
    const { key } = await keyFor(w, ben, "member", ["metrics:read", "metrics:edit"]);
    const { key: reader } = await keyFor(w, ben, "member", ["metrics:read"]);
    // A key made to create Metrics does not change them: metrics:edit is a scope of its own.
    const { key: creating } = await keyFor(w, ben, "member", ["metrics:read", "metrics:write"]);
    await expect(updateMetricWithKey(creating, mine.slug, { target_min: 1 })).rejects.toThrow(/may not metrics edit/);
    await expect(setSeriesWithKey(creating, mine.slug, "target", [{ period: "2027-01-01", value: 1 }])).rejects.toThrow(/may not metrics edit/);
    await expect(updateMetricWithKey(reader, mine.slug, { target_min: 1 })).rejects.toEqual(forbidden);
    await expect(updateMetricWithKey(key, saras.slug, { target_min: 1 })).rejects.toEqual(forbidden);
    expect(await updateMetricWithKey(key, mine.slug, { target_min: 1, target_max: 9 })).toMatchObject({ target_min: 1, target_max: 9 });
    // The Metric's history names the key; nothing but these parts is changed, whatever the patch holds.
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "metric").eq("object_id", mine.id);
    expect(versions?.map((v) => v.message).join(" ")).toContain("key “Setup script”");
    await updateMetricWithKey(key, mine.slug, { target_min: 2, name: "Renamed" } as never);
    const { data: kept } = await db().from("metrics").select("name, target_min").eq("id", mine.id).single();
    expect(kept).toEqual({ name: "Revenue", target_min: 2 });
    await expect(updateMetricWithKey(key, mine.slug, { target_min: 10 })).rejects.toBeInstanceOf(MetricChangeRefused);

    await expect(setSeriesWithKey(key, mine.slug, "target", [{ period: "2027-01-01", value: 5 }, { period: "2027-01-02", value: 5 }])).rejects.toBeInstanceOf(MetricChangeRefused);
    expect(await listSeriesWithKey(key, mine.slug, "target")).toEqual([]);
    expect(await setSeriesWithKey(key, mine.slug, "target", [{ period: "2027-01-01", value: 5 }])).toEqual({ saved: 1, removed: 0 });
    await expect(setSeriesWithKey(key, mine.slug, "projection", [{ period: "2020-01-01", value: 5 }])).rejects.toBeInstanceOf(MetricChangeRefused);
    await expect(setSeriesWithKey(reader, mine.slug, "target", [{ period: "2027-01-01", value: null }])).rejects.toEqual(forbidden);
    // The note names the key, for the Metric's page; programs never read it back.
    const { data } = await db().from("series_values").select("note").eq("metric_id", mine.id);
    expect(data).toEqual([{ note: "Through the API (key “Setup script”)" }]);

    // A creator who is a Guest now: refused, even for their own Metric (the API reads the role on every call).
    const guestKey: KeyActor = { ...key, role: "guest" };
    await expect(setSeriesWithKey(guestKey, mine.slug, "target", [{ period: "2027-01-01", value: null }])).rejects.toThrow(/may not change Metrics/);
  });
});

describe("the Unusual Value check with a key", () => {
  it("changes the check of a Workflow its creator owns, for every Metric sharing it, and nothing else of it", async () => {
    const w = await ws(); const ben = await w.person("member"); const sara = await w.person("owner");
    const revenue = await w.metric(ben, { name: "Revenue" }); const orders = await w.metric(ben, { name: "Orders" });
    const hiddenOne = await w.metric(sara, { name: "Payroll" }); const none = await w.metric(ben, { name: "Visits" });
    const steps = [{ type: "remind" as const, daysBefore: 2 }, { type: "check" as const, changePct: 30, outsideTarget: false }, { type: "publish" as const, lock: true }];
    const bens = await saveWorkflow(w.actor(ben, "member"), null, "Monthly close", { dueWorkingDays: 3, steps });
    for (const m of [revenue, orders]) await setMetricWorkflow(w.actor(ben, "member"), m.id, bens);
    await setMetricWorkflow(w.actor(sara, "owner"), hiddenOne.id, bens);
    const { key } = await keyFor(w, ben, "member", ["metrics:read", "metrics:edit"]);
    const { key: creating } = await keyFor(w, ben, "member", ["metrics:read", "metrics:write"]);

    // Read: the Workflow's name, whose it is, and how many Metrics Ben sees share it (Sara's Payroll is not counted).
    expect(await unusualValueCheckWithKey(key, revenue.slug)).toEqual({ workflow: { name: "Monthly close", yours: true, metrics: 2 }, check: { change_pct: 30, outside_target: false } });
    expect(await unusualValueCheckWithKey(key, none.slug)).toEqual({ workflow: null, check: null });
    await expect(unusualValueCheckWithKey(key, hiddenOne.slug)).rejects.toEqual(forbidden);
    await expect(setUnusualValueCheckWithKey(creating, revenue.slug, { change_pct: 50 })).rejects.toThrow(/may not metrics edit/);
    await expect(setUnusualValueCheckWithKey(key, none.slug, { change_pct: 50 })).rejects.toBeInstanceOf(MetricChangeRefused);
    await expect(setUnusualValueCheckWithKey(key, revenue.slug, { change_pct: 0 })).rejects.toBeInstanceOf(MetricChangeRefused);

    expect((await setUnusualValueCheckWithKey(key, revenue.slug, { change_pct: 50, outside_target: true })).check).toEqual({ change_pct: 50, outside_target: true });
    // The other steps stay, and Orders, which shares the Workflow, has the new check too.
    const { data: wf } = await db().from("workflows").select("config").eq("id", bens).single();
    expect(wf?.config).toEqual({ dueWorkingDays: 3, steps: [{ type: "remind", daysBefore: 2 }, { type: "check", changePct: 50, outsideTarget: true }, { type: "publish", lock: true }] });
    expect((await unusualValueCheckWithKey(key, orders.slug)).check).toEqual({ change_pct: 50, outside_target: true });
    // Written only when the Workflow is as it was read: an edit in the editor meanwhile is never overwritten.
    expect(await setWorkflowCheck(w.actor(ben, "member"), bens, { changePct: 5 }, "2000-01-01T00:00:00+00:00")).toBe(false);
    expect((await unusualValueCheckWithKey(key, orders.slug)).check?.change_pct).toBe(50);
    const { data: versions } = await db().from("versions").select("message").eq("object_type", "workflow").eq("object_id", bens);
    expect(versions?.map((v) => v.message).join(" ")).toContain("key “Setup script”");

    // Sara's Workflow on Ben's Metric: he sees it but may not change it. A Guest's key changes nothing.
    const saras = await saveWorkflow(w.actor(sara, "owner"), null, "Finance", { dueWorkingDays: 0, steps });
    await setMetricWorkflow(w.actor(ben, "member"), orders.id, saras);
    expect((await unusualValueCheckWithKey(key, orders.slug)).workflow).toEqual({ name: "Finance", yours: false, metrics: 1 });
    await expect(setUnusualValueCheckWithKey(key, orders.slug, { change_pct: 5 })).rejects.toThrow(/Only the owner of the Workflow/);
    await expect(setUnusualValueCheckWithKey({ ...key, role: "guest" }, revenue.slug, { change_pct: 5 })).rejects.toThrow(/may not change Metrics/);
  });

  it("is never given to a Guest's key", () => {
    expect(() => checkKeyRequest({ personId: "g", workspaceId: "w", role: "guest" }, ["metrics:read", "metrics:edit"], new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10))).toThrow(/cannot change Metrics/);
  });
});
