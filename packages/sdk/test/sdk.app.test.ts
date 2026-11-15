// Every SDK call against the running app and its database (spec 0002, ticket #51): paging, ranges, submissions with
// idempotency keys, errors, and waiting out a 429.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { addFeedToMetric, createFeed, createFeedKey } from "@ziffr/core/feeds";
import type { Scope } from "@ziffr/core/actor";
import { db } from "@ziffr/core/db";
import { periodStart } from "@ziffr/core/format";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { Ziffr, ZiffrError } from "../src/index";

const URL = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const collect = async <T>(it: AsyncIterable<T>) => { const out: T[] = []; for await (const x of it) out.push(x); return out; };

async function setup(scopes: Scope[] = ["metrics:read", "values:submit"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member");
  const orders = await w.metric(ben, { name: "Orders", submission_rule: "add" }); await w.token(orders.id, ben);
  const extra = await w.metric(ben, { name: "Visits" });
  await db().from("observations").insert(["2026-01-01", "2026-02-01", "2026-03-01"].map((p, i) => ({ metric_id: extra.id, period_start: p, value: i + 1, source: "api", workspace_id: w.id })));
  const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "SDK test", scopes, expiresOn: inDays(30) });
  return { ben, orders, extra, keyId: id, secret, ziffr: new Ziffr({ url: URL, accessKey: secret }) };
}

describe("@ziffr/sdk against the app", () => {
  it("reads Metrics, values, people and Groups, page by page", async () => {
    const { ben, orders, extra, ziffr } = await setup();
    expect((await ziffr.metrics.list({ limit: 1 })).next).toEqual(expect.any(String));
    expect((await collect(ziffr.metrics.all())).map((m) => m.slug)).toEqual([orders.slug, extra.slug]);
    expect(await ziffr.metrics.get(extra.slug)).toMatchObject({ slug: extra.slug, name: "Visits", derived: false });
    expect((await ziffr.observations.list(extra.slug, { from: "2026-02-01" })).items.map((o) => o.value)).toEqual([2, 3]);
    expect((await collect(ziffr.observations.all(extra.slug, { to: "2026-02-01" }))).map((o) => o.period)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(await collect(ziffr.people.all())).toEqual([{ id: ben, name: expect.any(String), contact: false }]);
    expect((await ziffr.groups.list()).items).toEqual([expect.objectContaining({ everyone: true })]);
  });
  it("submits with an idempotency key by default, and replays one given twice", async () => {
    const { orders, ziffr } = await setup();
    expect(await ziffr.observations.submit(orders.slug, { value: 5 })).toMatchObject({ status: "recorded", value: 5, period: periodStart(new Date(), "month"), replayed: false });
    // A fresh key each call: the Submission Rule adds the second.
    expect((await ziffr.observations.submit(orders.slug, { value: 2 })).value).toBe(7);
    const first = await ziffr.observations.submit(orders.slug, { value: 1, breakdown: [{ label: "Shop", value: 1 }] }, { idempotencyKey: "nightly-1" });
    const again = await ziffr.observations.submit(orders.slug, { value: 1, breakdown: [{ label: "Shop", value: 1 }] }, { idempotencyKey: "nightly-1" });
    expect(first).toMatchObject({ value: 8, replayed: false });
    expect(again).toMatchObject({ value: 8, replayed: true });
  });
  it("creates a Metric, replays a given idempotency key, and submits its first value", async () => {
    const { ziffr } = await setup(["metrics:read", "values:submit", "metrics:write"]);
    const created = await ziffr.metrics.create({ name: "Weekly signups", period: "week", unit: "signups", submit: true }, { idempotencyKey: "setup-1" });
    expect(created).toMatchObject({ slug: "weekly-signups", period: "week", unit: "signups", replayed: false });
    expect(await ziffr.metrics.create({ name: "Weekly signups", period: "week", unit: "signups", submit: true }, { idempotencyKey: "setup-1" })).toMatchObject({ slug: "weekly-signups", replayed: true });
    expect(await ziffr.observations.submit(created.slug, { value: 12 })).toMatchObject({ status: "recorded", value: 12 });
    await expect((await setup()).ziffr.metrics.create({ name: "X" })).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
  it("builds a dashboard and a story, and lists templates (spec 0014)", async () => {
    const { orders, extra, ziffr } = await setup(["metrics:read", "dashboards:read", "dashboards:write"]);
    expect((await ziffr.templates.all({ kind: "dashboard" })).map((t) => t.id)).toEqual(["overview", "deep-dive", "side-by-side"]);
    const d = await ziffr.dashboards.fromTemplate({ template: "side-by-side", fills: [[orders.slug], [extra.slug]] }, { idempotencyKey: "pair-1" });
    expect(d).toMatchObject({ name: "Two metrics side by side", replayed: false });
    expect(await ziffr.dashboards.fromTemplate({ template: "side-by-side", fills: [[orders.slug], [extra.slug]] }, { idempotencyKey: "pair-1" })).toMatchObject({ id: d.id, replayed: true });
    const w = await ziffr.dashboards.addWidget(d.id, { view: "table", metrics: [extra.slug] });
    expect(await ziffr.dashboards.updateWidget(d.id, w.id, { title: "Visits" })).toMatchObject({ id: w.id, title: "Visits" });
    expect(await ziffr.dashboards.removeWidget(d.id, w.id)).toEqual({ removed: w.id });
    expect((await collect(ziffr.dashboards.all())).map((x) => x.id)).toEqual([d.id]);
    const s = await ziffr.dashboards.create({ name: "Draft", kind: "story" });
    const f = await ziffr.stories.addFinding(s.id, { metric: orders.slug, headline: "{metric} grew" });
    expect((await ziffr.stories.updateFinding(s.id, f.id, { kicker: "March" })).words).toMatchObject({ kicker: "March", headline: "{metric} grew" });
    expect(await ziffr.stories.update(s.id, { intro: "First draft." })).toMatchObject({ intro: "First draft." });
  });
  it("throws a ZiffrError with the API's code", async () => {
    const { extra, ziffr } = await setup(["metrics:read"]);
    await expect(ziffr.metrics.get("no-such-metric")).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(ziffr.observations.submit(extra.slug, { value: 1 })).rejects.toMatchObject({ status: 403, code: "forbidden" });
    await expect(new Ziffr({ url: URL, accessKey: "zk_wrong" }).metrics.list()).rejects.toEqual(expect.any(ZiffrError));
  });
  it("waits out a 429 as Retry-After says, or gives up when the wait is too long", async () => {
    const { keyId, ziffr } = await setup();
    // 60 calls that leave the minute's window in about two seconds.
    const at = new Date(Date.now() - 58_500).toISOString();
    await db().from("access_log").insert(Array.from({ length: 60 }, () => ({ key_id: keyId, method: "GET", route: "/api/v1/metrics", status: 200, at })));
    const impatient = await setup();
    await db().from("access_log").insert(Array.from({ length: 60 }, () => ({ key_id: impatient.keyId, method: "GET", route: "/api/v1/metrics", status: 200 })));
    await expect(new Ziffr({ url: URL, accessKey: impatient.secret, maxRetryWait: 5 }).metrics.list()).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    const started = Date.now();
    expect((await ziffr.metrics.list()).items).toHaveLength(2);
    expect(Date.now() - started).toBeGreaterThan(900);
  });
  it("reads a Feed's Metrics and records a batch with a Feed Key (spec 0012)", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Pipeline" });
    const { id: feedId } = await createFeed(w.actor(sara), "CRM");
    await addFeedToMetric(w.actor(sara), m.id, feedId);
    const { secret } = await createFeedKey(w.actor(sara), feedId, { name: "SDK", expiresOn: inDays(30) });
    const ziffr = new Ziffr({ url: URL, accessKey: secret });
    expect((await ziffr.feed.get()).name).toBe("CRM");
    expect((await collect(ziffr.feed.metrics())).map((x) => [x.slug, x.filled])).toEqual([[m.slug, []]]);
    const first = await ziffr.feed.submit([{ metric: m.slug, value: 3, period: "2026-01-01" }, { metric: m.slug, value: 4 }], { idempotencyKey: "crm-1" });
    expect(first.results.map((r) => [r.status, r.imported])).toEqual([["recorded", true], ["recorded", false]]);
    expect((await ziffr.feed.submit([{ metric: m.slug, value: 3, period: "2026-01-01" }, { metric: m.slug, value: 4 }], { idempotencyKey: "crm-1" })).replayed).toBe(true);
    expect((await collect(ziffr.feed.metrics()))[0].filled).toEqual(["2026-01-01", periodStart(new Date(), "month")]);
    // A Feed Key reads nothing else.
    await expect(ziffr.metrics.list()).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});
