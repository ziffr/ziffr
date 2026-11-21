// Values from programs, against the real database (spec 0002, ticket #49): the same rules as a form or Slack, the
// daily limit, and idempotency keys.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { admitValues, once, submitObservation, VALUES_PER_DAY } from "./api-submissions";
import { db } from "./db";
import type { SubmissionEffects } from "./submissions";
import { opened, valuesOf, workspace } from "./test/db-fixtures";
import { saveWorkflow, setMetricWorkflow } from "./workflows";
import { JANUARY, periodStart } from "./periods";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });
const thisMonth = () => periodStart(new Date(), "month", JANUARY);

async function keyFor(w: Awaited<ReturnType<typeof ws>>, person: string, scopes: ("metrics:read" | "values:submit")[] = ["values:submit"]) {
  const { id, secret } = await createAccessKey(w.actor(person, "member"), { name: "Shop export", scopes, expiresOn: inDays(30) });
  return { id, key: (await actorForKey(secret)) as KeyActor };
}

describe("submitObservation", () => {
  it("records a value under the key's creator, naming the key, through the Submission Rule", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara, { submission_rule: "add" }); await w.token(m.id, ben);
    const { id, key } = await keyFor(w, ben, ["metrics:read", "values:submit"]);
    expect(await submitObservation(key, m.slug, { value: 40 }, quiet())).toMatchObject({ ok: true, status: "recorded", period: thisMonth(), value: 40 });
    expect(await submitObservation(key, m.slug, { value: 2, breakdown: [{ label: "Shop", value: 2 }] }, quiet())).toMatchObject({ ok: true, value: 42 });
    expect(await valuesOf(m.id)).toMatchObject([{ value: 42, submitter_id: ben, source: "api" }]);
    const { data: obs } = await db().from("observations").select("id, access_key_id").eq("metric_id", m.id).single();
    expect(obs!.access_key_id).toBe(id);
    const { data: rows } = await db().from("breakdown_rows").select("id, label, value").eq("observation_id", obs!.id);
    expect(await opened("breakdown_rows", w.id, rows, { dropId: true })).toEqual([{ label: "Shop", value: 2 }]);
  });
  it("keeps every Breakdown row of values with breakdowns sent at the same moment (spec 0022, #126)", async () => {
    const w = await ws(); const ben = await w.person("member");
    const add = await w.metric(ben, { submission_rule: "add" }); await w.token(add.id, ben);
    const { key } = await keyFor(w, ben);
    // Eight values at once into an empty period, each with rows: one is recorded, seven added to it. Every row counts:
    // labels already there (in any case) are added to, new ones kept, and nothing carries float noise.
    const sent = Array.from({ length: 8 }, (_, i) => ({ value: 0.3 + i, breakdown: [{ label: i % 2 ? "shop" : "Shop", value: 0.1 }, { label: "Web", value: 0.2 }, { label: `Partner ${i}`, value: i }] }));
    const results = await Promise.all(sent.map((v) => submitObservation(key, add.slug, v, quiet())));
    expect(results.every((r) => r.ok)).toBe(true);
    const { data: obs } = await db().from("observations").select("id, value").eq("metric_id", add.id).single();
    expect(Number(obs!.value)).toBe(30.4);
    const { data: rows } = await db().from("breakdown_rows").select("id, label, value, position").eq("observation_id", obs!.id).order("position");
    const byLabel = Object.fromEntries((await opened("breakdown_rows", w.id, rows)).map((r) => [r.label.toLowerCase(), Number(r.value)]));
    expect(byLabel).toEqual({ shop: 0.8, web: 1.6, ...Object.fromEntries(sent.map((_, i) => [`partner ${i}`, i])) });
    expect((rows ?? []).map((r) => r.position)).toEqual(Array.from({ length: 10 }, (_, i) => i));

    // Rejecting a second value at once: one is recorded with its rows, every other one refused.
    const reject = await w.metric(ben, { submission_rule: "reject" }); await w.token(reject.id, ben);
    const refused = await Promise.all([1, 2, 3, 4].map((v) => submitObservation(key, reject.slug, { value: v, breakdown: [{ label: "Shop", value: v }] }, quiet())));
    expect(refused.filter((r) => r.ok)).toHaveLength(1);
    const { data: one } = await db().from("observations").select("id, value").eq("metric_id", reject.id).single();
    const { data: oneRows } = await db().from("breakdown_rows").select("value").eq("observation_id", one!.id);
    expect((oneRows ?? []).map((r) => Number(r.value))).toEqual([Number(one!.value)]);

    // Overwriting at once: one value stays, and its rows are those of one value, never a mix of two.
    const over = await w.metric(ben, { submission_rule: "overwrite" }); await w.token(over.id, ben);
    await Promise.all(["A", "B", "C", "D"].map((l) => submitObservation(key, over.slug, { value: 2, breakdown: [{ label: `${l}1`, value: 1 }, { label: `${l}2`, value: 1 }] }, quiet())));
    const { data: last } = await db().from("observations").select("id").eq("metric_id", over.id).single();
    const { data: kept } = await db().from("breakdown_rows").select("id, label").eq("observation_id", last!.id).order("position");
    const labels = (await opened("breakdown_rows", w.id, kept)).map((r) => r.label as string);
    expect(labels).toHaveLength(2);
    expect(labels[1]).toBe(`${labels[0][0]}2`);
  });
  it("takes a named past period, refuses a future or misaligned one, and a Derived Metric", async () => {
    const w = await ws(); const ben = await w.person("member");
    const m = await w.metric(ben); await w.token(m.id, ben);
    const { key } = await keyFor(w, ben);
    expect(await submitObservation(key, m.slug, { value: 7, period: "2026-01-01" }, quiet())).toMatchObject({ ok: true, period: "2026-01-01" });
    expect(await submitObservation(key, m.slug, { value: 7, period: "2026-01-15" }, quiet())).toMatchObject({ ok: false, reason: "refused" });
    expect(await submitObservation(key, m.slug, { value: 7, period: "2099-01-01" }, quiet())).toMatchObject({ ok: false, reason: "refused" });
    const d = await w.metric(ben, { formula: `{${m.slug}} * 2` }); await w.token(d.id, ben);
    expect(await submitObservation(key, d.slug, { value: 1 }, quiet())).toMatchObject({ ok: false, reason: "refused" });
  });
  it("takes API values only where the Metric's API Source is on, apart from its form link (spec 0012)", async () => {
    const w = await ws(); const ben = await w.person("member");
    const formOnly = await w.metric(ben, { sources: ["web_form"] }); await w.token(formOnly.id, ben);
    const apiOnly = await w.metric(ben, { sources: ["api"] }); await w.token(apiOnly.id, ben);
    const slackOnly = await w.metric(ben, { sources: ["slack"] }); await w.token(slackOnly.id, ben);
    const { key } = await keyFor(w, ben, ["metrics:read", "values:submit"]);
    expect(await submitObservation(key, formOnly.slug, { value: 1 }, quiet())).toMatchObject({ ok: false, reason: "refused" });
    expect(await submitObservation(key, slackOnly.slug, { value: 1 }, quiet())).toMatchObject({ ok: false, reason: "refused" });
    expect(await submitObservation(key, apiOnly.slug, { value: 1 }, quiet())).toMatchObject({ ok: true, status: "recorded" });
  });
  it("turns a value for a locked period into a proposed Correction and says locked", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); await w.token(m.id, ben);
    await db().from("period_states").insert({ metric_id: m.id, period_start: thisMonth(), state: "locked" });
    const { key } = await keyFor(w, ben);
    expect(await submitObservation(key, m.slug, { value: 9 }, quiet())).toMatchObject({ ok: false, reason: "locked" });
    expect(await valuesOf(m.id)).toEqual([]);
  });
  it("waits for Approval of an Unusual Value", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(sara, { target_max: 10 }); await w.token(m.id, ann);
    const wf = await saveWorkflow(w.actor(sara), null, "Check", { dueWorkingDays: 2, steps: [{ type: "check", changePct: 50, outsideTarget: true }, { type: "approve", approvers: [ben] }, { type: "publish", lock: false }] });
    await setMetricWorkflow(w.actor(sara), m.id, wf);
    const { key } = await keyFor(w, ann);
    expect(await submitObservation(key, m.slug, { value: 500 })).toMatchObject({ ok: true, status: "awaiting_approval", value: 500 });
  });
  it("refuses a key without values:submit, a Metric the creator does not see, and one they do not submit to", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const hidden = await w.metric(sara); const own = await w.metric(ben);
    const other = await ws("Other"); const zoe = await other.person("owner"); const foreign = await other.metric(zoe);
    const { key } = await keyFor(w, ben);
    await expect(submitObservation((await keyFor(w, ben, ["metrics:read"])).key, own.slug, { value: 1 })).rejects.toEqual(expect.any(Forbidden));
    await expect(submitObservation(key, hidden.slug, { value: 1 })).rejects.toEqual(expect.any(Forbidden));
    await expect(submitObservation(key, foreign.slug, { value: 1 })).rejects.toEqual(expect.any(Forbidden));
    // Not a Submitter: said to a key that may read, hidden from one that may only submit.
    await expect(submitObservation(key, own.slug, { value: 1 })).rejects.toEqual(expect.any(Forbidden));
    expect(await submitObservation((await keyFor(w, ben, ["metrics:read", "values:submit"])).key, own.slug, { value: 1 })).toMatchObject({ ok: false, reason: "not_submitter" });
  });
  it("tell a key that may only submit nothing of the values already there", async () => {
    const w = await ws(); const ben = await w.person("member");
    const reject = await w.metric(ben, { name: "Revenue", submission_rule: "reject" }); await w.token(reject.id, ben);
    const add = await w.metric(ben, { name: "Orders", submission_rule: "add" }); await w.token(add.id, ben);
    await w.value(reject.id, "2026-03-01", 48200, ben); await w.value(add.id, "2026-03-01", 1234, ben);
    const { key } = await keyFor(w, ben);
    const refused = await submitObservation(key, reject.slug, { value: 0, period: "2026-03-01" }, quiet());
    expect(refused).toMatchObject({ ok: false, reason: "refused" });
    const added = await submitObservation(key, add.slug, { value: 1, period: "2026-03-01" }, quiet());
    expect(added).toMatchObject({ ok: true, value: 1, detail: "Recorded." });
    expect(JSON.stringify([refused, added])).not.toMatch(/\b48[,.]?200\b|\b1[,.]?23[45]\b|Revenue|Orders/);
    // A key that may read gets the full words, as its creator would.
    const reader = (await keyFor(w, ben, ["metrics:read", "values:submit"])).key;
    expect(await submitObservation(reader, add.slug, { value: 1, period: "2026-03-01" }, quiet())).toMatchObject({ ok: true, value: 1236 });
  });
});

describe("the daily limit and idempotency keys", () => {
  it(`refuse the ${VALUES_PER_DAY + 1}st value in 24 hours and say when to retry`, async () => {
    const w = await ws(); const ben = await w.person("member"); const { id, key } = await keyFor(w, ben);
    const log = (n: number, at: Date) => ({ key_id: id, method: "POST", route: "/api/v1/metrics/m/observations", status: 201, submitted: n, at: at.toISOString() });
    await db().from("access_log").insert([log(500, new Date(Date.now() - 23 * 3_600_000)), log(499, new Date()), log(300, new Date(Date.now() - 25 * 3_600_000))]);
    expect(await admitValues(key)).toEqual({ ok: true });
    await db().from("access_log").insert(log(1, new Date()));
    const refused = await admitValues(key);
    expect(refused.ok).toBe(false);
    // The 500 from 23 hours ago free up in about an hour.
    expect(!refused.ok && refused.retryAfter).toBeGreaterThan(3000);
    expect(!refused.ok && refused.retryAfter).toBeLessThanOrEqual(3600);
  });
  it("answer a repeat with the first answer, a different body with a conflict, and keep no refusal for the limit", async () => {
    const w = await ws(); const ben = await w.person("member"); const { key } = await keyFor(w, ben);
    const run = vi.fn(async () => ({ status: 201, body: { status: "recorded" } }));
    expect(await once(key, "abc", { value: 1, slug: "m" }, run)).toEqual({ status: 201, body: { status: "recorded" } });
    expect(await once(key, "abc", { slug: "m", value: 1 }, run)).toEqual({ status: 201, body: { status: "recorded" }, replayed: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(await once(key, "abc", { value: 2, slug: "m" }, run)).toEqual({ conflict: "different_body" });
    const other = await keyFor(w, ben);
    expect(await once(other.key, "abc", { value: 2, slug: "m" }, run)).toEqual({ status: 201, body: { status: "recorded" } });
    const limited = vi.fn(async () => ({ status: 429, body: {}, keep: false }));
    await once(key, "later", { value: 3 }, limited);
    await once(key, "later", { value: 3 }, limited);
    expect(limited).toHaveBeenCalledTimes(2);
  });
});
