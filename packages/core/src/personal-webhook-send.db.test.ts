// What a Personal Webhook sends so far (spec 0037, ticket #641; GLOSSARY: Personal Webhook): its test `ping`, signed and
// through the real outbound request to a TLS server of the test's own, and when it does not send: the Workspace's switch
// off, the person no longer an Owner, Admin or Member, the person's daily cap, and an event that is not about anything the person may hear.
// A failing one switches itself off and tells its person, not the Owners.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { outboundTls } from "./outbound-request";
import { createPersonalWebhook, ownPersonalWebhookLog, sendTestPersonalWebhook, setPersonalWebhooksAllowed } from "./personal-webhooks";
import { workspace } from "./test/db-fixtures";
import { PERSONAL_WEBHOOK_SENDS_PER_PERSON_PER_DAY, WEBHOOK_FAILURES_BEFORE_OFF } from "./webhook-limits";
import { sendWaitingWebhooks, verifyWebhookSignature } from "./webhook-send";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const openssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();
type Seen = { path: string; headers: IncomingMessage["headers"]; body: string };
const seen: Seen[] = [];
let answer: (req: IncomingMessage, res: ServerResponse) => void = (_q, res) => { res.statusCode = 200; res.end("ok"); };
let port = 0;
let close = () => {};
const saved = { key: process.env.ZIFFR_SECRETS_KEY, hosts: process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS };
const cleanups: (() => Promise<void>)[] = [];

beforeAll(async () => {
  if (!openssl) return;
  const dir = mkdtempSync(join(tmpdir(), "ziffr-pwebhook-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const cert = readFileSync(join(dir, "cert.pem"), "utf8");
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => { seen.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks).toString("utf8") }); answer(req, res); });
  });
  await new Promise<void>((r) => server.listen(0, "localhost", () => r()));
  port = (server.address() as AddressInfo).port;
  outboundTls.ca = cert;
  close = () => server.close();
});
afterAll(() => { outboundTls.ca = undefined; close(); });
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 83).toString("base64");
  process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "localhost";
  seen.length = 0;
  answer = (_q, res) => { res.statusCode = 200; res.end("ok"); };
});
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved.key === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved.key;
  if (saved.hosts === undefined) delete process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS; else process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = saved.hosts;
});

async function setup(events: string[] = ["action.created"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const owner = await w.person("owner"); const ana = await w.person("member");
  await setPersonalWebhooksAllowed(w.actor(owner), true);
  const A = w.actor(ana, "member");
  const { id, secret } = await createPersonalWebhook(A, { name: "Ana's", url: `https://localhost:${port}/mine`, events });
  return { w, owner, ana, A, id, secret };
}
const logOf = async (id: string) => ((await db().from("webhook_sends").select("type, state, status_code, failure").eq("webhook_id", id).order("created_at")).data ?? []);

describe.skipIf(!openssl)("a Personal Webhook's test", () => {
  it("sends a signed ping with its name and nothing of the Workspace, at most once a minute", async () => {
    const { A, id, secret, w } = await setup();
    await sendTestPersonalWebhook(A, id);
    expect(seen).toHaveLength(1);
    const body = JSON.parse(seen[0].body);
    expect(body.type).toBe("ping");
    expect(verifyWebhookSignature([secret], String(seen[0].headers["x-ziffr-timestamp"]), seen[0].body, String(seen[0].headers["x-ziffr-signature"]))).toBe(true);
    expect(seen[0].body).not.toContain(w.id);
    expect((await ownPersonalWebhookLog(A, id)).map((e) => [e.type, e.state, e.statusCode])).toEqual([["ping", "delivered", 200]]);
    expect((await sendTestPersonalWebhook(A, id).then(() => null, (e: Error) => e))?.message).toMatch(/Wait a minute/);
    expect(seen).toHaveLength(1);
  });

  it("counts the send against the person's day and the Workspace's", async () => {
    const { A, id, w, ana } = await setup();
    await sendTestPersonalWebhook(A, id);
    expect((await db().from("webhook_person_send_days").select("n").eq("workspace_id", w.id).eq("person_id", ana).single()).data?.n).toBe(1);
    expect((await db().from("webhook_send_days").select("n").eq("workspace_id", w.id).single()).data?.n).toBe(1);
  });

  it("waits for tomorrow past the person's daily cap, without sending", async () => {
    const { A, id, w, ana } = await setup();
    await db().from("webhook_person_send_days").insert({ workspace_id: w.id, person_id: ana, day: new Date().toISOString().slice(0, 10), n: PERSONAL_WEBHOOK_SENDS_PER_PERSON_PER_DAY });
    await sendTestPersonalWebhook(A, id);
    expect(seen).toHaveLength(0);
    expect(await logOf(id)).toMatchObject([{ type: "ping", state: "queued" }]);
  });
});

describe.skipIf(!openssl)("when a Personal Webhook does not send", () => {
  const queue = async (id: string, w: { id: string }, type = "ping") => { await db().from("webhook_sends").insert({ workspace_id: w.id, webhook_id: id, type, source_type: "app" }); };

  it("drops a queued send when the Workspace's switch is off, and when the person is no longer a Member", async () => {
    const x = await setup();
    await queue(x.id, x.w);
    await db().from("workspaces").update({ personal_webhooks_allowed: false }).eq("id", x.w.id);
    await sendWaitingWebhooks(50, x.w.id);
    expect(await logOf(x.id)).toMatchObject([{ state: "dropped" }]);
    await db().from("webhook_sends").delete().eq("webhook_id", x.id);
    await db().from("workspaces").update({ personal_webhooks_allowed: true }).eq("id", x.w.id);
    // A role made Guest by a way that skips the core still stops it, because the send asks the database.
    await db().from("webhooks").update({ owner_id: x.ana }).eq("id", x.id);
    await db().from("memberships").update({ role: "guest" }).eq("workspace_id", x.w.id).eq("user_id", x.ana);
    await queue(x.id, x.w);
    await sendWaitingWebhooks(50, x.w.id);
    expect(seen).toHaveLength(0);
  });

  it("sends nothing for an event that is not about anything its person may hear, and leaves no row to say so", async () => {
    const x = await setup(["action.created"]);
    await queue(x.id, x.w, "action.created");
    await sendWaitingWebhooks(50, x.w.id);
    expect(seen).toHaveLength(0);
    expect(await logOf(x.id)).toEqual([]);
  });

  it("switches itself off after repeated failures and tells its person, not the Owners", async () => {
    const x = await setup();
    answer = (_q, res) => { res.statusCode = 400; res.end("no"); };
    await db().from("webhooks").update({ failure_count: WEBHOOK_FAILURES_BEFORE_OFF - 1, failing_since: new Date().toISOString() }).eq("id", x.id);
    await queue(x.id, x.w);
    await sendWaitingWebhooks(50, x.w.id);
    expect((await db().from("webhooks").select("disabled_reason").eq("id", x.id).single()).data?.disabled_reason).toBe("failing");
    const { data: notes } = await db().from("deliveries").select("recipient_id").eq("workspace_id", x.w.id).eq("kind", "notice");
    expect((notes ?? []).map((n) => n.recipient_id)).toEqual([x.ana]);
    const { data: ev } = await db().from("audit_events").select("kind").eq("workspace_id", x.w.id).eq("kind", "webhook.personal_switched_off_failing");
    expect(ev).toHaveLength(1);
  });
});
