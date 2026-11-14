// Metrics created by programs, against the real database (spec 0003, ticket #66): the scope, the creator's role, the
// demo, the creator as Submitter, fields checked like the form, the first Version naming the key, the daily limit.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { admitMetric, createMetricWithKey, METRICS_PER_DAY, TooManyMetrics } from "./api-metrics";
import { submitObservation } from "./api-submissions";
import { db } from "./db";
import { metricEffects, type MetricEffects } from "./metrics";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const forbidden = expect.any(Forbidden);
// The real first Version; no Prompt goes out.
const fx = (): MetricEffects => ({ ...metricEffects, promptSubmitter: vi.fn(async () => {}) });

async function keyFor(w: Awaited<ReturnType<typeof ws>>, person: string, role: "owner" | "admin" | "member" | "guest" = "member", scopes: ("metrics:read" | "values:submit" | "metrics:write")[] = ["metrics:write"]) {
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
    expect(row).toMatchObject({ owner_id: ben, workspace_id: w.id, submission_rule: "add", sources: ["web_form", "mail", "slack"] });
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
