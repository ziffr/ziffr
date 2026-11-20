// POST /api/webhooks/{id}/in over HTTP (spec 0034, ticket #402): the same 404 for everything unproven, the size limit, a
// replay, the rate limit, and one done call end to end.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ask } from "@ziffr/core/questions";
import { db } from "@ziffr/core/db";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { signWebhookBody } from "@ziffr/core/webhook-send";
import { createWebhook } from "@ziffr/core/webhooks";
import { WEBHOOK_INBOUND_MAX_BYTES } from "@ziffr/core/webhook-limits";
import { POST } from "./route";

const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const k of ["ZIFFR_SECRETS_KEY", "ZIFFR_WEBHOOK_PRIVATE_HOSTS"]) saved[k] = process.env[k]; process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 82).toString("base64"); process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "localhost"; });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const used = new Set<string>();
/** A signed request with a timestamp of its own each time (a request is taken once, by its timestamp and signature). */
const post = (id: string, body: string, secret: string | null, over: Record<string, string> = {}, wanted?: number) => {
  let at = wanted ?? Math.floor(Date.now() / 1000);
  while (wanted === undefined && used.has(`${id}.${body}.${at}`)) at--;
  used.add(`${id}.${body}.${at}`);
  return POST(new Request(`http://ziffr.test/api/webhooks/${id}/in`, {
    method: "POST", body,
    headers: { "content-type": "application/json", ...(secret ? { "x-ziffr-timestamp": String(at), "x-ziffr-signature": signWebhookBody([secret], at, body) } : {}), ...over },
  }), { params: Promise.resolve({ id }) });
};

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: `sara-${randomUUID().slice(0, 8)}@example.test` });
  const ann = await w.person("member", { email: `ann-${randomUUID().slice(0, 8)}@example.test` });
  const m = await w.metric(sara, { name: "Orders" }); await w.share(m.id, ann);
  const hook = await createWebhook(w.actor(sara), { name: "To Do", url: "https://localhost:9/hook", events: ["action.done"] });
  const id = await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Do it", kind: "task" });
  await db().from("webhook_sends").insert({ workspace_id: w.id, webhook_id: hook.id, type: "action.created", action_id: id, metric_id: m.id, period_start: "2026-10-01", source_type: "app", state: "delivered" });
  return { hook, id };
}

describe("POST /api/webhooks/{id}/in", () => {
  it("answers 404 alike for an unknown id, no signature, a wrong secret and an old timestamp; a signed done answers {changed, status}", async () => {
    const { hook, id } = await setup();
    const body = JSON.stringify({ op: "done", ref: `ZIF-${id}` });
    for (const r of [await post(randomUUID(), body, hook.secret), await post(hook.id, body, null), await post(hook.id, body, `whsec_${"z".repeat(43)}`), await post(hook.id, body, hook.secret, {}, Math.floor(Date.now() / 1000) - 900)]) {
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "not_found" });
    }
    const ok = await post(hook.id, body, hook.secret);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ changed: true, status: "answered" });
    const again = await post(hook.id, body, hook.secret);
    expect(await again.json()).toEqual({ changed: false, status: "answered" });
  });

  it("answers 404 to a replay of the very same request", async () => {
    const { hook, id } = await setup();
    const body = JSON.stringify({ op: "done", ref: `ZIF-${id}` });
    const at = Math.floor(Date.now() / 1000) - 7;
    expect((await post(hook.id, body, hook.secret, {}, at)).status).toBe(200);
    expect((await post(hook.id, body, hook.secret, {}, at)).status).toBe(404);
    // A fresh header of its own does not make it a new request.
    expect((await post(hook.id, body, hook.secret, { "x-ziffr-delivery": "other" }, at)).status).toBe(404);
  });

  it("refuses a body over 16 KB, also when it does not say its length, before looking at it", async () => {
    const { hook } = await setup();
    const big = "x".repeat(WEBHOOK_INBOUND_MAX_BYTES + 1);
    expect((await post(hook.id, big, hook.secret)).status).toBe(413);
    const chunk = new TextEncoder().encode("x".repeat(4096));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ > 20) c.close(); else c.enqueue(chunk); } });
    const res = await POST(new Request(`http://ziffr.test/api/webhooks/${hook.id}/in`, { method: "POST", body: stream, headers: {}, duplex: "half" } as RequestInit), { params: Promise.resolve({ id: hook.id }) });
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(10);
    expect((await post(hook.id, "{}", hook.secret, { "content-length": "12abc" })).status).toBe(413);
  });

  it("answers 400 for a signed body that is not JSON or not an operation, 404 for an Action not sent to it, 409 for what the rules refuse, 429 past 60 a minute", async () => {
    const { hook, id } = await setup();
    expect((await post(hook.id, "not json", hook.secret)).status).toBe(400);
    expect((await post(hook.id, JSON.stringify({ op: "explode", ref: `ZIF-${id}` }), hook.secret)).status).toBe(400);
    expect((await post(hook.id, JSON.stringify({ op: "done", ref: "ZIF-999999999" }), hook.secret)).status).toBe(404);
    expect((await post(hook.id, JSON.stringify({ op: "answer", ref: `ZIF-${id}`, text: "hi" }), hook.secret)).status).toBe(409);
    let last = 0;
    for (let i = 0; i < 60; i++) last = (await post(hook.id, "{}", hook.secret, {}, Math.floor(Date.now() / 1000) - 100 - i)).status;
    expect(last).toBe(429);
    expect((await post(hook.id, "{}", hook.secret, {}, Math.floor(Date.now() / 1000) - 200)).headers.get("retry-after")).toBe("60");
  });
});
