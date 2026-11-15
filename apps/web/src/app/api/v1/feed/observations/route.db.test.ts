// The Feed endpoints over HTTP (spec 0012, ticket #160): per-item results, the body limit, which keys may call
// which endpoints, Idempotency-Key, the day's limit and what lands in the Access Log. The rules themselves are proven
// in feeds.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { addFeedToMetric, createFeed, createFeedKey, FEED_VALUES_PER_DAY } from "@ziffr/core/feeds";
import { periodStart } from "@ziffr/core/format";
import { accessLogOf, feedBatch, workspace } from "@ziffr/core/test/db-fixtures";
import { POST } from "./route";
import { GET } from "../route";
import { GET as listMetrics } from "../../metrics/route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const call = (secret: string, body: unknown, headers: Record<string, string> = {}) => POST(new Request("http://ziffr.test/api/v1/feed/observations", {
  method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", ...headers },
}), {} as never);
const get = (secret: string, path = "/api/v1/feed") => new Request(`http://ziffr.test${path}`, { headers: { authorization: `Bearer ${secret}` } });

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const m = await w.metric(sara, { name: "Pipeline", submission_rule: "reject" });
  const { id: feedId } = await createFeed(w.actor(sara), "CRM");
  await addFeedToMetric(w.actor(sara), m.id, feedId);
  const { id, secret } = await createFeedKey(w.actor(sara), feedId, { name: "Nightly", expiresOn: inDays(30) });
  return { w, sara, m, id, secret, feedId };
}

describe("POST /api/v1/feed/observations", () => {
  it("answers 200 with a result per item in order, logs the values taken, and replays a repeated Idempotency-Key", async () => {
    const { m, id, secret } = await setup();
    const items = [{ metric: m.slug, value: 5 }, { metric: m.slug, value: 6 }, { metric: "not-mine", value: 1 }];
    const res = await call(secret, { items }, { "idempotency-key": "run-1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [
      { metric: m.slug, period: periodStart(new Date(), "month"), status: "recorded", imported: false, detail: "Recorded." },
      { metric: m.slug, period: periodStart(new Date(), "month"), status: "refused", code: "duplicate", detail: expect.any(String) },
      { metric: "not-mine", period: null, status: "refused", code: "not_found", detail: expect.any(String) },
    ] });
    const again = await call(secret, { items }, { "idempotency-key": "run-1" });
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect((await call(secret, { items: items.slice(1) }, { "idempotency-key": "run-1" })).status).toBe(409);
    expect((await accessLogOf(id)).map(({ status, submitted }) => ({ status, submitted }))).toEqual([{ status: 200, submitted: 1 }, { status: 200, submitted: 0 }, { status: 409, submitted: 0 }]);
  });
  it("answers 400 for a bad or oversized body", async () => {
    const { m, secret } = await setup();
    for (const bad of ["not json", { items: [] }, { items: [{ metric: m.slug, value: "1" }] }, { items: [{ metric: m.slug, value: 1, extra: 1 }] }, { items: [{ metric: m.slug, value: 1, period: "May" }] }])
      expect((await call(secret, bad)).status).toBe(400);
    expect((await call(secret, { items: Array.from({ length: 501 }, () => ({ metric: m.slug, value: 1 })) })).status).toBe(400);
    const huge = { items: [{ metric: m.slug, value: 1, breakdown: Array.from({ length: 500 }, (_, i) => ({ label: `${"x".repeat(190)}${i}`, value: i })) }], pad: "x".repeat(1_100_000) };
    const res = await call(secret, huge);
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toMatch(/larger than 1 MB/);
  });
  it("answers 429 with Retry-After when the batch would cross the Feed's day, and records nothing", async () => {
    const { m, feedId, secret } = await setup();
    for (let n = 0; n < FEED_VALUES_PER_DAY - 1; n += 500) await feedBatch(feedId, Math.min(500, FEED_VALUES_PER_DAY - 1 - n));
    const res = await call(secret, { items: [{ metric: m.slug, value: 1 }, { metric: m.slug, value: 2, period: "2026-01-01" }] });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
  it("counts every claimed item towards the day, refused or locked ones too", async () => {
    const { m, feedId, secret } = await setup();
    for (let n = 0; n < FEED_VALUES_PER_DAY - 3; n += 500) await feedBatch(feedId, Math.min(500, FEED_VALUES_PER_DAY - 3 - n));
    // Both refused (a Metric the Feed does not feed), and still counted: 2 of the 3 left are gone.
    expect((await call(secret, { items: [{ metric: "not-mine", value: 1 }, { metric: "not-mine-either", value: 1 }] })).status).toBe(200);
    expect((await call(secret, { items: [{ metric: m.slug, value: 1 }, { metric: m.slug, value: 2, period: "2026-01-01" }] })).status).toBe(429);
  });
  it("answers 429 while another batch of the Feed is still running", async () => {
    const { m, feedId, secret } = await setup();
    await feedBatch(feedId, 1, { taken: null, finished: false });
    const res = await call(secret, { items: [{ metric: m.slug, value: 1 }] });
    expect(res.status).toBe(429);
    expect((await res.json()).error.message).toMatch(/still running/);
  });
  it("refuses a person's key with 403, and a Feed Key on people's endpoints with 403", async () => {
    const { w, sara, secret } = await setup();
    const { secret: personal } = await createAccessKey(w.actor(sara), { name: "Mine", scopes: ["metrics:read", "values:submit"], expiresOn: inDays(5) });
    expect((await call(personal, { items: [{ metric: "x", value: 1 }] })).status).toBe(403);
    expect((await GET(get(personal), {} as never)).status).toBe(403);
    const res = await listMetrics(get(secret, "/api/v1/metrics"), {} as never);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toMatch(/Feed Key/);
  });
});

describe("GET /api/v1/feed", () => {
  it("names the Feed and its Metrics with the periods that have a value", async () => {
    const { w, sara, m, secret } = await setup();
    await w.value(m.id, "2026-01-01", 42, sara);
    const res = await GET(get(secret), {} as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ name: "CRM", metrics: { items: [expect.objectContaining({ slug: m.slug, name: "Pipeline", period: "month", filled: ["2026-01-01"] })], next: null } });
    expect(JSON.stringify(body)).not.toContain("42");
  });
});
