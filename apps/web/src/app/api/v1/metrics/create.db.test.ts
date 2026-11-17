// POST /api/v1/metrics over HTTP (spec 0003, ticket #64): status codes, the answer's shape, the error shape and
// Idempotency-Key. Who may create what is proven in the core's api-metrics.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { accessLogOf, workspace } from "@ziffr/core/test/db-fixtures";
import { POST } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function setup(scopes: ("metrics:read" | "values:submit" | "metrics:write")[] = ["metrics:write"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member");
  const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Setup", scopes, expiresOn: inDays(30) });
  const post = (body: unknown, headers: Record<string, string> = {}) => POST(new Request("http://ziffr.test/api/v1/metrics", {
    method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", ...headers },
  }), undefined);
  // Metrics the key made earlier today, for the daily limit.
  const fill = async (n: number) => { for (let i = 0; i < n; i++) await w.metric(ben, { name: `Earlier ${i}`, access_key_id: id }); };
  return { id, post, fill, becomeGuest: () => w.setRole(ben, "guest") };
}

describe("POST /api/v1/metrics", () => {
  it("answers 201 with the Metric, and replays a repeated Idempotency-Key without a second Metric", async () => {
    const { id, post } = await setup();
    const res = await post({ name: "Weekly signups", period: "week", unit: "signups", submission_rule: "add" }, { "idempotency-key": "setup-1" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({
      slug: "weekly-signups", name: "Weekly signups", description: "", period: "week", format: "number", unit: "signups", decimals: 0,
      polarity: "higher", aggregation: "sum", target_min: null, target_max: null, derived: false,
    });
    const again = await post({ name: "Weekly signups", period: "week", unit: "signups", submission_rule: "add" }, { "idempotency-key": "setup-1" });
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    expect((await again.json()).slug).toBe("weekly-signups");
    expect((await post({ name: "Something else" }, { "idempotency-key": "setup-1" })).status).toBe(409);
    // Without a key a second one is made, under its own slug.
    expect((await (await post({ name: "Weekly signups" })).json()).slug).toMatch(/^weekly-signups-/);
    expect((await accessLogOf(id)).map((c) => [c.method, c.route, c.status])).toEqual([
      ["POST", "/api/v1/metrics", 201], ["POST", "/api/v1/metrics", 201], ["POST", "/api/v1/metrics", 409], ["POST", "/api/v1/metrics", 201],
    ]);
  });
  it("creates quarterly and yearly Metrics", async () => {
    const { post } = await setup();
    expect(await (await post({ name: "Quarterly NPS", period: "quarter" })).json()).toMatchObject({ slug: "quarterly-nps", period: "quarter" });
    expect(await (await post({ name: "Audit score", period: "year" })).json()).toMatchObject({ slug: "audit-score", period: "year" });
    expect((await post({ name: "Fortnightly", period: "fortnight" })).status).toBe(400);
  });
  it("answers 429 with Retry-After at the daily limit, and keeps no idempotent answer for it", async () => {
    const { post, fill } = await setup();
    await fill(50);
    const res = await post({ name: "One too many" }, { "idempotency-key": "late" });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await res.json()).error.code).toBe("rate_limited");
  });
  it("answers 400 for a bad body and 403 without the scope", async () => {
    const { post } = await setup();
    for (const bad of ["{", {}, { name: "  " }, { name: "X", period: "hour" }, { name: "X", owner: "someone" }, { name: "X", decimals: 9 }]) {
      const res = await post(bad);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
    const reader = await setup(["metrics:read"]);
    expect((await reader.post({ name: "X" })).status).toBe(403);
  });
  it("answers 403, not 404, when the creator's role may no longer create", async () => {
    const { post, becomeGuest } = await setup();
    await becomeGuest();
    const res = await post({ name: "X" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: { code: "forbidden", message: expect.stringMatching(/role cannot create/i) } });
  });
});
