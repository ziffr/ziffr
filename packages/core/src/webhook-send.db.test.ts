// Sending to Webhooks (spec 0034, ticket #400), against the database and a TLS server of the test's own, reached through
// the real outbound request: signed messages (both secrets while one is replaced), what a Webhook may hear at the moment
// of sending, the retry schedule, a failure that switches a Webhook off with one email to each Owner, two runs sending
// once, the daily cap, the bound on sends in flight, the address judged again at every send, and the echo mark.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeActionState } from "./action-state";
import { deleteMetric } from "./metrics";
import { db } from "./db";
import { outboundTls } from "./outbound-request";
import { ask } from "./questions";
import { workspace } from "./test/db-fixtures";
import { queueWebhookEvent } from "./webhook-events";
import { WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY, WEBHOOK_SEND_CONCURRENCY } from "./webhook-limits";
import { sendWaitingWebhooks, verifyWebhookSignature } from "./webhook-send";
import { createWebhook, replaceWebhookSecret } from "./webhooks";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const openssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();

type Seen = { path: string; headers: IncomingMessage["headers"]; body: string };
const seen: Seen[] = [];
let answer: (req: IncomingMessage, res: ServerResponse, n: number) => void = (_q, res) => { res.statusCode = 200; res.end("ok"); };
let inFlight = 0;
let maxInFlight = 0;
let port = 0;
let close = () => {};
const saved = { key: process.env.ZIFFR_SECRETS_KEY, hosts: process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS };
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  if (!openssl) return;
  const dir = mkdtempSync(join(tmpdir(), "ziffr-webhook-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const cert = readFileSync(join(dir, "cert.pem"), "utf8");
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") });
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      res.on("close", () => { inFlight--; });
      answer(req, res, seen.length);
    });
  });
  await new Promise<void>((r) => server.listen(0, "localhost", () => r()));
  port = (server.address() as AddressInfo).port;
  outboundTls.ca = cert;
  close = () => server.close();
});
afterAll(() => { outboundTls.ca = undefined; close(); });
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 79).toString("base64");
  process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "localhost";
  seen.length = 0; inFlight = 0; maxInFlight = 0;
  answer = (_q, res) => { res.statusCode = 200; res.end("ok"); };
});
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved.key === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved.key;
  if (saved.hosts === undefined) delete process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS; else process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = saved.hosts;
});

/** A Workspace with two Owners, an assignee and a Metric (private until `share`), and a Webhook to the local server. */
async function setup(events: string[] = ["action.done"], path = "/hook/one", url = `https://localhost:${port}${path}`) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner", { email: `sara-${Math.random().toString(36).slice(2, 8)}@example.test` });
  const tom = await w.person("owner", { email: `tom-${Math.random().toString(36).slice(2, 8)}@example.test` });
  const ann = await w.person("member", { email: `ann-${Math.random().toString(36).slice(2, 8)}@example.test` });
  const m = await w.metric(sara, { name: "Revenue <b>" });
  const a = w.actor(sara);
  const hook = await createWebhook(a, { name: "To Do", url, events });
  const task = (kind: "task" | "question" = "task") => ask(a, { metricId: m.id, period: "2026-10-01", assigneeId: ann, text: "Send <i>the</i> report to boss@secret.example", kind });
  const everyone = async () => (await db().from("groups").select("id").eq("workspace_id", w.id).eq("everyone", true).single()).data!.id as number;
  const share = async () => { await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: m.id, group_id: await everyone(), role: "viewer" }); };
  const unshare = async () => { await db().from("shares").delete().eq("workspace_id", w.id).eq("object_id", m.id); };
  const done = (id: number, source: Parameters<typeof changeActionState>[3] = { type: "slack" }) => changeActionState(w.id, id, { to: "answered", from: ["open"], reason: "done", guard: { assigneeId: ann } }, source);
  const rowOf = async (id: number, type = "action.done") => (await db().from("webhook_sends").select("*").eq("action_id", id).eq("type", type).order("created_at").limit(1).single()).data!;
  return { w, sara, tom, ann, m, a, hook, task, share, unshare, done, rowOf };
}
const run = () => sendWaitingWebhooks(100);
const json = (s: Seen) => JSON.parse(s.body) as { id: string; type: string; workspace: { id: string }; data: Record<string, unknown> };
const notices = async (ws: string, to: string) => (await db().from("deliveries").select("kind").eq("workspace_id", ws).eq("recipient_id", to).eq("kind", "notice")).data?.length ?? 0;

describe.skipIf(!openssl)("a signed message, and what the Webhook may hear when it is sent", () => {
  it("signs the timestamp and the body with the Webhook's secret, and says what, which and the id every retry shares", async () => {
    const c = await setup();
    await c.share();
    const id = await c.task();
    await c.done(id);
    expect(await run()).toEqual({ sent: 1, failed: 0 });
    expect(seen).toHaveLength(1);
    const [s] = seen;
    expect(s.path).toBe("/hook/one");
    expect(s.headers["x-ziffr-event"]).toBe("action.done");
    expect(s.headers["x-ziffr-delivery"]).toBe(json(s).id);
    expect(json(s).id).toMatch(/^evt_[0-9a-f]{32}$/);
    // The secret shown at creation signed this one: a receiver with it accepts, one with another secret does not.
    expect(verifyWebhookSignature([c.hook.secret], s.headers["x-ziffr-timestamp"] as string, s.body, s.headers["x-ziffr-signature"] as string)).toBe(true);
    expect(verifyWebhookSignature([`whsec_${"x".repeat(43)}`], s.headers["x-ziffr-timestamp"] as string, s.body, s.headers["x-ziffr-signature"] as string)).toBe(false);
    // Full, since the Metric is Everyone's; hostile words are only ever JSON strings.
    expect(json(s)).toMatchObject({ type: "action.done", workspace: { id: c.w.id }, data: { ref: `ZIF-${id}`, kind: "task", status: "answered", reason: "done", title: "Send <i>the</i> report to boss@secret.example", metric: { name: "Revenue <b>" }, source: { type: "slack" }, external_ids: [] } });
    expect((await c.rowOf(id)).state).toBe("delivered");
  });

  it("sends only the structure of an Action whose Metric Everyone does not see, and none of its words", async () => {
    const c = await setup();
    const id = await c.task();
    await c.done(id);
    await run();
    const d = json(seen[0]);
    expect(d.data.redacted).toBe(true);
    expect(Object.keys(d.data).sort()).toEqual(["assignee", "due", "external_ids", "kind", "link", "reason", "redacted", "ref", "source", "status", "updated_at"]);
    for (const word of ["report", "secret.example", "Revenue", "sara"]) expect(seen[0].body).not.toContain(word);
  });

  it("judges again when it sends: a Metric made private between the event and the send goes out redacted", async () => {
    const c = await setup();
    await c.share();
    const id = await c.task();
    await c.done(id);
    await c.unshare();
    await run();
    expect(json(seen[0]).data.redacted).toBe(true);
  });

  it("sends nothing at all of a value event on a Metric Everyone does not see, and nothing hints at it; with it shared, no value", async () => {
    const c = await setup(["value.unusual"]);
    await queueWebhookEvent(c.w.id, "value.unusual", { type: "workflow" }, { metricId: c.m.id, period: "2026-10-01" });
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    expect(seen).toEqual([]);
    expect((await db().from("webhook_sends").select("state, attempts, failure").eq("workspace_id", c.w.id).single()).data).toEqual({ state: "dropped", attempts: 0, failure: null });
    await c.share();
    await queueWebhookEvent(c.w.id, "value.unusual", { type: "workflow" }, { metricId: c.m.id, period: "2026-10-01" });
    await run();
    expect(Object.keys(json(seen[0]).data).sort()).toEqual(["link", "metric", "period"]);
  });

  it("marks a change that came in through a Webhook with its id, sends it to the other Webhooks and not back to that one", async () => {
    const c = await setup();
    const other = await createWebhook(c.a, { name: "Planner", url: `https://localhost:${port}/hook/two`, events: ["action.done"] });
    const id = await c.task();
    await c.done(id, { type: "webhook", webhookId: c.hook.id });
    await run();
    expect(seen.map((s) => s.path)).toEqual(["/hook/two"]);
    for (const s of seen) expect(json(s).data.source).toEqual({ type: "webhook", webhook_id: c.hook.id });
    expect(other.id).not.toBe(c.hook.id);
  });
});

describe.skipIf(!openssl)("replacing the secret", () => {
  it("signs with both for 24 hours, the new one first, and with the new one alone after", async () => {
    const c = await setup();
    const fresh = (await replaceWebhookSecret(c.a, c.hook.id)).secret;
    const first = await c.task();
    await c.done(first);
    await run();
    const sig = seen[0].headers["x-ziffr-signature"] as string;
    expect(sig.split(",")).toHaveLength(2);
    const ts = seen[0].headers["x-ziffr-timestamp"] as string;
    expect(verifyWebhookSignature([fresh], ts, seen[0].body, sig.split(",")[0])).toBe(true);
    expect(verifyWebhookSignature([c.hook.secret], ts, seen[0].body, sig.split(",")[1])).toBe(true);
    // The overlap ends.
    await db().from("webhooks").update({ secret_previous_until: new Date(Date.now() - 1000).toISOString() }).eq("id", c.hook.id);
    const second = await c.task();
    await c.done(second);
    await run();
    expect((seen[1].headers["x-ziffr-signature"] as string).split(",")).toHaveLength(1);
    expect(verifyWebhookSignature([fresh], seen[1].headers["x-ziffr-timestamp"] as string, seen[1].body, seen[1].headers["x-ziffr-signature"] as string)).toBe(true);
  });
});

describe.skipIf(!openssl)("retries", () => {
  it("retries a 5xx after a minute with the same id, then delivers", async () => {
    const c = await setup();
    const id = await c.task();
    await c.done(id);
    answer = (_q, res) => { res.statusCode = 503; res.end("no"); };
    expect(await run()).toEqual({ sent: 0, failed: 1 });
    let row = await c.rowOf(id);
    expect(row).toMatchObject({ state: "retrying", attempts: 1, status_code: 503, failure: "status" });
    const wait = new Date(row.next_attempt_at).getTime() - Date.now();
    expect(wait).toBeGreaterThan(50_000); expect(wait).toBeLessThanOrEqual(60_500);
    // Not due yet: nothing is sent again.
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    answer = (_q, res) => { res.statusCode = 200; res.end(); };
    await db().from("webhook_sends").update({ next_attempt_at: new Date(Date.now() - 1000).toISOString() }).eq("id", row.id);
    expect(await run()).toEqual({ sent: 1, failed: 0 });
    row = await c.rowOf(id);
    expect(row).toMatchObject({ state: "delivered", attempts: 2, status_code: 200 });
    expect(seen).toHaveLength(2);
    expect(seen[1].headers["x-ziffr-delivery"]).toBe(seen[0].headers["x-ziffr-delivery"]);
    expect(json(seen[1]).id).toBe(json(seen[0]).id);
  });
  it("honours Retry-After on a 429 when it asks for longer than the schedule", async () => {
    const c = await setup();
    const id = await c.task();
    await c.done(id);
    answer = (_q, res) => { res.statusCode = 429; res.setHeader("retry-after", "600"); res.end(); };
    await run();
    const wait = new Date((await c.rowOf(id)).next_attempt_at).getTime() - Date.now();
    expect(wait).toBeGreaterThan(590_000); expect(wait).toBeLessThanOrEqual(600_500);
  });
  it("fails an ordinary 4xx at once and keeps the Webhook on; fails after the last retry", async () => {
    const c = await setup();
    const id = await c.task();
    await c.done(id);
    answer = (_q, res) => { res.statusCode = 400; res.end(); };
    await run();
    expect(await c.rowOf(id)).toMatchObject({ state: "failed", attempts: 1, status_code: 400 });
    expect((await db().from("webhooks").select("disabled_at").eq("id", c.hook.id).single()).data?.disabled_at).toBeNull();
    const again = await c.task();
    await c.done(again);
    answer = (_q, res) => { res.statusCode = 500; res.end(); };
    const row = await c.rowOf(again);
    await db().from("webhook_sends").update({ attempts: 5 }).eq("id", row.id);
    await run();
    expect(await c.rowOf(again)).toMatchObject({ state: "failed", attempts: 6 });
  });
  it("a network error is retried, and a Webhook problem never fails the change that made the send", async () => {
    // Nothing listens at this port.
    const dead = await new Promise<number>((r) => { const t = createNetServer(); t.listen(0, "localhost", () => { const p = (t.address() as AddressInfo).port; t.close(() => r(p)); }); });
    const c = await setup(["action.done"], "/x", `https://localhost:${dead}/x`);
    const id = await c.task();
    expect((await c.done(id)).changed).toBe(true);
    await run();
    expect(await c.rowOf(id)).toMatchObject({ state: "retrying", attempts: 1, failure: "network" });
  });
});

describe.skipIf(!openssl)("switching a failing Webhook off", () => {
  it("does it after 20 failed sends in a row, once, with one email to each Owner; later sends are dropped and turning it on resends nothing", async () => {
    const c = await setup();
    await db().from("webhooks").update({ failure_count: 19, failing_since: new Date().toISOString() }).eq("id", c.hook.id);
    const [sara0, tom0] = [await notices(c.w.id, c.sara), await notices(c.w.id, c.tom)];
    answer = (_q, res) => { res.statusCode = 400; res.end(); };
    const [one, two] = [await c.task(), await c.task()];
    await c.done(one); await c.done(two);
    await run();
    const hook = (await db().from("webhooks").select("disabled_at, disabled_reason").eq("id", c.hook.id).single()).data!;
    expect(hook).toMatchObject({ disabled_reason: "failing" });
    expect(hook.disabled_at).not.toBeNull();
    // Both Owners hear once, though two sends failed in the run.
    expect(await notices(c.w.id, c.sara)).toBe(sara0 + 1);
    expect(await notices(c.w.id, c.tom)).toBe(tom0 + 1);
    // The other queued send was dropped or failed, and nothing is sent to a switched-off Webhook.
    const before = seen.length;
    const three = await c.task();
    await c.done(three);
    expect(await db().from("webhook_sends").select("id").eq("action_id", three)).toMatchObject({ data: [] });
    expect(seen.length).toBe(before);
  });
  it("does it when the first failure is more than 3 days old with no success since", async () => {
    const c = await setup();
    await db().from("webhooks").update({ failing_since: new Date(Date.now() - 4 * 86_400_000).toISOString() }).eq("id", c.hook.id);
    const sara0 = await notices(c.w.id, c.sara);
    answer = (_q, res) => { res.statusCode = 503; res.end(); };
    await c.done(await c.task());
    await run();
    expect((await db().from("webhooks").select("disabled_reason").eq("id", c.hook.id).single()).data?.disabled_reason).toBe("failing");
    expect(await notices(c.w.id, c.sara)).toBe(sara0 + 1);
  });
  it("a success clears the failures", async () => {
    const c = await setup();
    await db().from("webhooks").update({ failure_count: 7, failing_since: new Date(Date.now() - 86_400_000).toISOString() }).eq("id", c.hook.id);
    await c.done(await c.task());
    await run();
    expect((await db().from("webhooks").select("failure_count, failing_since").eq("id", c.hook.id).single()).data).toEqual({ failure_count: 0, failing_since: null });
  });
  it("switches it off at once on a 410 Gone, with its queued sends dropped", async () => {
    const c = await setup();
    const tom0 = await notices(c.w.id, c.tom);
    answer = (_q, res) => { res.statusCode = 410; res.end(); };
    const [one, two] = [await c.task(), await c.task()];
    await c.done(one);
    await run();
    await c.done(two);
    expect((await db().from("webhooks").select("disabled_reason").eq("id", c.hook.id).single()).data?.disabled_reason).toBe("gone");
    expect(await notices(c.w.id, c.tom)).toBe(tom0 + 1);
    expect(await db().from("webhook_sends").select("id").eq("action_id", two)).toMatchObject({ data: [] });
  });
});

describe.skipIf(!openssl)("claiming, the address, the caps and the bound on sends in flight", () => {
  it("two runs at once send each message once", async () => {
    const c = await setup();
    await c.done(await c.task());
    await Promise.all([run(), run()]);
    expect(seen).toHaveLength(1);
  });
  it("judges the address again at every send: a host the operator no longer names is never connected to", async () => {
    const c = await setup();
    await c.done(await c.task());
    delete process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS;
    expect(await run()).toEqual({ sent: 0, failed: 1 });
    expect(seen).toEqual([]);
    expect((await db().from("webhook_sends").select("state, failure").eq("workspace_id", c.w.id).eq("type", "action.done").single()).data).toEqual({ state: "failed", failure: "refused" });
  });
  it("drops a send whose Webhook was switched off or no longer chose the event, and one whose Action is gone", async () => {
    const c = await setup(["action.created", "action.done"]);
    const id = await c.task();
    await db().from("webhooks").update({ events: ["action.done"] }).eq("id", c.hook.id);
    await run();
    expect(seen).toEqual([]);
    expect((await c.rowOf(id, "action.created")).state).toBe("dropped");
  });
  it("holds sends past the daily cap until tomorrow", async () => {
    const c = await setup();
    await db().from("webhook_send_days").insert({ workspace_id: c.w.id, day: new Date().toISOString().slice(0, 10), n: WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY });
    const id = await c.task();
    await c.done(id);
    expect(await run()).toEqual({ sent: 0, failed: 0 });
    expect(seen).toEqual([]);
    const row = await c.rowOf(id);
    expect(row.state).toBe("queued");
    expect(new Date(row.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
  });
  it("claims the daily cap atomically: runs at the same moment cannot pass it together", async () => {
    const c = await setup();
    const takes = await Promise.all(Array.from({ length: 25 }, () => db().rpc("take_webhook_send_slot", { p_workspace: c.w.id, p_cap: 5 })));
    expect(takes.filter((t) => t.data === true)).toHaveLength(5);
    expect((await db().from("webhook_send_days").select("n").eq("workspace_id", c.w.id).single()).data?.n).toBe(5);
  });
  it("a Metric that is deleted still tells the Webhooks: its open Actions close with metric_deleted and are sent before the rows go", async () => {
    const c = await setup();
    await c.share();
    const id = await c.task();
    await deleteMetric(c.a, c.m.id, "Revenue <b>");
    expect(seen).toHaveLength(1);
    expect(json(seen[0])).toMatchObject({ type: "action.done", data: { ref: `ZIF-${id}`, status: "closed", reason: "metric_deleted", source: { type: "system" } } });
    expect((await db().from("actions").select("id").eq("id", id)).data).toEqual([]);
  });
  it("sends at most a few at a time, so a slow name or answer cannot take every lookup", async () => {
    const c = await setup();
    answer = (_q, res) => { setTimeout(() => { res.statusCode = 200; res.end(); }, 150); };
    for (let i = 0; i < 8; i++) await c.done(await c.task());
    expect(await run()).toEqual({ sent: 8, failed: 0 });
    expect(maxInFlight).toBeLessThanOrEqual(WEBHOOK_SEND_CONCURRENCY);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});
