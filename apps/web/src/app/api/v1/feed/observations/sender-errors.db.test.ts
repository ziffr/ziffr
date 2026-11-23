// Everything a sender can get wrong when it calls POST /api/v1/feed/observations (spec 0043, ticket 8; GLOSSARY: Feed, Feed
// Key): one table of mistakes, each with the answer a program or a person reading its log needs. A mistake in the request
// itself (no key, not JSON, a field of the wrong shape) is refused whole with a 4xx and an error that names the field, and
// records nothing; a refusal by the Metric's rules is one item's, with a code, and the rest of the batch still runs. The
// rules themselves are proven in feeds.db.test.ts and route.db.test.ts; this file is the sender's side, and
// docs/guides/feeds.md ("When something goes wrong") has a line for each code here.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { addFeedToMetric, createFeed, createFeedKey, revokeFeedKey } from "@ziffr/core/feeds";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { db } from "@ziffr/core/db";
import { periodStart, JANUARY } from "@ziffr/core/periods";
import { POST } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const URL_ = "http://ziffr.test/api/v1/feed/observations";

type Send = { auth?: string | null; type?: string | null; headers?: Record<string, string> };
const send = (body: unknown, o: Send = {}) => {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.auth !== null) headers.authorization = o.auth ?? "";
  if (o.type !== null) headers["content-type"] = o.type ?? "application/json";
  return POST(new Request(URL_, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers }), {} as never);
};

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const m = await w.metric(sara, { name: "Pipeline", sources: ["api"], submission_rule: "reject" });
  const { id: feedId } = await createFeed(w.actor(sara), "CRM");
  await addFeedToMetric(w.actor(sara), m.id, feedId);
  const key = await createFeedKey(w.actor(sara), feedId, { name: "Nightly", expiresOn: inDays(30) });
  return { w, sara, m, feedId, key, bearer: `Bearer ${key.secret}` };
}

describe("a request that is not right is refused whole, with words that name what to fix", () => {
  it("refuses a missing, wrong, revoked or ended key with 401, and a key in the address with 401", async () => {
    const { w, sara, m, key, bearer } = await setup();
    const body = { items: [{ metric: m.slug, value: 1 }] };
    for (const auth of [null, "", "Bearer", "Bearer zk_nope", "Basic abc", key.secret]) {
      const res = await send(body, { auth });
      expect(res.status, String(auth)).toBe(401);
      expect(res.headers.get("www-authenticate")).toBe("Bearer");
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe("unauthorized");
    }
    expect((await POST(new Request(`${URL_}?key=${key.secret}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), {} as never)).status).toBe(401);
    // A key that was revoked is refused from then on, and nothing it sent had been recorded.
    const { id: feedId } = await createFeed(w.actor(sara), "Other");
    const k2 = await createFeedKey(w.actor(sara), feedId, { name: "Short", expiresOn: inDays(5) });
    expect((await send(body, { auth: `Bearer ${k2.secret}` })).status).toBe(200);
    await revokeFeedKey(w.actor(sara), k2.id);
    expect((await send(body, { auth: `Bearer ${k2.secret}` })).status).toBe(401);
    expect((await send(body, { auth: bearer })).status).toBe(200);
  });

  const BAD: [string, unknown, Send, number, RegExp][] = [
    ["not JSON at all", "items: please", {}, 400, /not valid JSON/],
    ["an empty body", "", {}, 400, /not valid JSON/],
    ["the wrong content type", { items: [] }, { type: "text/plain" }, 400, /Content-Type: application\/json/],
    ["no content type", { items: [] }, { type: null }, 400, /Content-Type: application\/json/],
    ["an array instead of an object", [{ metric: "x", value: 1 }], {}, 400, /request|items/],
    ["a body without items", {}, {}, 400, /items/],
    ["items that is not a list", { items: "x" }, {}, 400, /items/],
    ["no items", { items: [] }, {}, 400, /items/],
    ["501 items", { items: Array.from({ length: 501 }, () => ({ metric: "x", value: 1 })) }, {}, 400, /items/],
    ["a field Ziffr does not know, in the body", { items: [{ metric: "x", value: 1 }], extra: 1 }, {}, 400, /extra|Unrecognized/i],
    ["a field Ziffr does not know, in an item", { items: [{ metric: "x", value: 1, unit: "eur" }] }, {}, 400, /items\.0.*(unit|Unrecognized)/i],
    ["an item that is not an object", { items: ["x"] }, {}, 400, /items\.0/],
    ["no metric", { items: [{ value: 1 }] }, {}, 400, /items\.0\.metric/],
    ["a metric that is not a slug (capital letters, spaces)", { items: [{ metric: "Sales Total", value: 1 }] }, {}, 400, /items\.0\.metric: Not a Metric slug/],
    ["a metric of 101 characters", { items: [{ metric: "a".repeat(101), value: 1 }] }, {}, 400, /items\.0\.metric/],
    ["a number written as text", { items: [{ metric: "x", value: "12" }] }, {}, 400, /items\.0\.value/],
    ["a number with a unit or a percent sign", { items: [{ metric: "x", value: "12%" }] }, {}, 400, /items\.0\.value/],
    ["a null value", { items: [{ metric: "x", value: null }] }, {}, 400, /items\.0\.value/],
    ["no value", { items: [{ metric: "x" }] }, {}, 400, /items\.0\.value/],
    ["a number too big to hold (1e999 reads as infinity)", '{"items":[{"metric":"x","value":1e999}]}', {}, 400, /items\.0\.value/],
    ["a period that is not a date", { items: [{ metric: "x", value: 1, period: "October" }] }, {}, 400, /items\.0\.period: A date as YYYY-MM-DD/],
    ["a period written with the time", { items: [{ metric: "x", value: 1, period: "2026-10-01T00:00:00Z" }] }, {}, 400, /items\.0\.period/],
    ["a period that does not exist", { items: [{ metric: "x", value: 1, period: "2026-13-45" }] }, {}, 400, /items\.0\.period/],
    ["a null period", { items: [{ metric: "x", value: 1, period: null }] }, {}, 400, /items\.0\.period/],
    ["a breakdown row without a label", { items: [{ metric: "x", value: 1, breakdown: [{ label: " ", value: 1 }] }] }, {}, 400, /items\.0\.breakdown\.0\.label/],
    ["a breakdown row with a text value", { items: [{ metric: "x", value: 1, breakdown: [{ label: "EU", value: "1" }] }] }, {}, 400, /items\.0\.breakdown\.0\.value/],
    ["a second item that is wrong, among good ones (the second is named)", { items: [{ metric: "x", value: 1 }, { metric: "y", value: "z" }] }, {}, 400, /items\.1\.value/],
    ["an Idempotency-Key with a space or an accent", { items: [{ metric: "x", value: 1 }] }, { headers: { "idempotency-key": "été run" } }, 400, /Idempotency-Key: 1 to 200 visible ASCII/],
    ["an Idempotency-Key of 201 characters", { items: [{ metric: "x", value: 1 }] }, { headers: { "idempotency-key": "k".repeat(201) } }, 400, /Idempotency-Key/],
  ];
  it.each(BAD)("%s: 400, naming the field, and nothing is recorded", async (_what, body, o, status, words) => {
    const { m, bearer } = await setup();
    const res = await send(typeof body === "object" && body !== null && JSON.stringify(body).includes('"x"') ? JSON.parse(JSON.stringify(body).split('"x"').join(JSON.stringify(m.slug))) : body, { auth: bearer, ...o });
    expect(res.status).toBe(status);
    const err = ((await res.json()) as { error: { code: string; message: string } }).error;
    expect(err.code).toBe("invalid_request");
    expect(err.message).toMatch(words);
    const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("metric_id", m.id);
    expect(count).toBe(0);
  });
});

describe("a value the Metric's rules refuse is that item's refusal, with a code, and the rest still runs", () => {
  it("says not_found, duplicate, period and archived as codes, in order, with the HTTP status 200", async () => {
    const { w, sara, m, feedId, bearer } = await setup();
    const archived = await w.metric(sara, { name: "Old", sources: ["api"] }); await addFeedToMetric(w.actor(sara), archived.id, feedId);
    expect((await db().from("metrics").update({ archived_at: new Date().toISOString() }).eq("id", archived.id)).error).toBeNull();
    const off = await w.metric(sara, { name: "Off", sources: ["web_form"] }); await addFeedToMetric(w.actor(sara), off.id, feedId);
    expect((await db().from("metrics").update({ sources: ["web_form"] }).eq("id", off.id)).error).toBeNull();
    const derived = await w.metric(sara, { name: "Twice", formula: `{${m.slug}} * 2`, sources: ["api"] }); await addFeedToMetric(w.actor(sara), derived.id, feedId).catch(() => undefined);
    const day = periodStart(new Date(), "month", JANUARY);
    const middle = `${day.slice(0, 8)}15`;
    const future = `${new Date().getUTCFullYear() + 1}-01-01`;
    const res = await send({ items: [
      { metric: m.slug, value: 1 },                          // recorded
      { metric: m.slug, value: 2 },                          // the second for the period: duplicate (the rule rejects)
      { metric: m.slug, value: 3, period: middle },          // not the first day of a month: period
      { metric: m.slug, value: 4, period: future },          // in the future: period
      { metric: "nobody-has-this", value: 5 },               // not a Metric of this Feed: not_found
      { metric: archived.slug, value: 6 },                   // archived
      { metric: off.slug, value: 7 },                        // its API Source is off: not_found
      { metric: m.slug, value: 8, period: "1999-01-01" },    // long ago: an Import, recorded or refused by the rule, never a 500
    ] }, { auth: bearer });
    expect(res.status).toBe(200);
    const results = ((await res.json()) as { results: { status: string; code?: string; period: string | null }[] }).results;
    expect(results).toHaveLength(8);
    expect(results[0]).toMatchObject({ status: "recorded", period: day });
    expect(results[1]).toMatchObject({ status: "refused", code: "duplicate" });
    expect(results[2]).toMatchObject({ status: "refused", code: "period" });
    expect(results[3]).toMatchObject({ status: "refused", code: "period" });
    expect(results[4]).toMatchObject({ status: "refused", code: "not_found", period: null });
    expect(results[5]).toMatchObject({ status: "refused", code: "archived" });
    // A Feed lists only the Metrics that take values from the API, so one whose API Source is off is not one it can see.
    expect(results[6]).toMatchObject({ status: "refused", code: "not_found" });
    expect(["recorded", "refused"]).toContain(results[7].status);
    for (const r of results.filter((x) => x.status === "refused")) expect(r).toHaveProperty("detail");
  });

  it("takes extreme numbers as numbers or refuses them in words, never a 500: negative, zero, tiny, huge, many digits", async () => {
    const { w, sara, feedId, bearer } = await setup();
    const metrics: { id: number; slug: string }[] = [];
    for (let i = 0; i < 6; i++) { const x = await w.metric(sara, { name: `Edge ${i}`, sources: ["api"], submission_rule: "overwrite" }); await addFeedToMetric(w.actor(sara), x.id, feedId); metrics.push(x); }
    const values = [-5, 0, 1e-12, 1e15, 1e300, 123456789012345.6789];
    const res = await send({ items: metrics.map((x, i) => ({ metric: x.slug, value: values[i] })) }, { auth: bearer });
    expect(res.status).toBe(200);
    const results = ((await res.json()) as { results: { status: string; detail: string }[] }).results;
    for (const [i, r] of results.entries()) expect(["recorded", "refused"], `${values[i]}: ${r.detail}`).toContain(r.status);
  });

  it("takes the same Metric twice in one batch as the Metric's rule says, and never a 500", async () => {
    const { m, bearer } = await setup();
    const res = await send({ items: [{ metric: m.slug, value: 1, period: "2026-01-01" }, { metric: m.slug, value: 2, period: "2026-01-01" }] }, { auth: bearer });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: { status: string; code?: string }[] }).results.map((r) => r.status === "refused" ? r.code : r.status)).toEqual(["recorded", "duplicate"]);
  });

  it("holds a body exactly at the limit, and refuses one over it, in words", async () => {
    const { m, bearer } = await setup();
    const big = JSON.stringify({ items: [{ metric: m.slug, value: 1, breakdown: [{ label: "x".repeat(200), value: 1 }] }], pad: "x".repeat(1024 * 1024) });
    const res = await send(big, { auth: bearer });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/larger than 1 MB/);
  });
});

describe("what the sender is told when ending up on the wrong side of a key", () => {
  it("answers 403 to a person's Access Key, in words that say where a Feed Key is made", async () => {
    const { w, sara, m } = await setup();
    const { secret } = await createAccessKey(w.actor(sara), { name: "Mine", scopes: ["metrics:read", "values:submit"], expiresOn: inDays(5) });
    const res = await send({ items: [{ metric: m.slug, value: 1 }] }, { auth: `Bearer ${secret}` });
    expect(res.status).toBe(403);
    const message = ((await res.json()) as { error: { message: string } }).error.message;
    expect(message).toMatch(/Feed Key/);
    expect(message).toMatch(/Settings → Feeds/);
  });
});
