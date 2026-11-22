// The Webhook log, the test event and Send again (spec 0034, ticket #401), against the database. Sending itself is
// tested in webhook-send.db.test.ts, so the job is replaced here by one that does nothing: what is checked is who may
// read and queue, the limit of one test a minute, that only a failed send goes again, and another Workspace's rows.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { mailHostResolver } from "./mail-hosts";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { resendWebhookSend, sendTestWebhook, webhookLog } from "./webhook-log";
import { createWebhook, setWebhookEnabled } from "./webhooks";

vi.mock("./webhook-send", () => ({ sendWebhookNow: vi.fn(async () => {}) }));
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const saved = process.env.ZIFFR_SECRETS_KEY;
const realLookup = mailHostResolver.lookup;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => {
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 81).toString("base64");
  mailHostResolver.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved;
});
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
const URL1 = "https://n8n.example.test/webhook/abc";

describe("the log, the test and Send again", () => {
  it("queues one test a minute, shows it in the log and refuses a second", async () => {
    const w = await ws(); const owner = await w.person("owner"); const a = w.actor(owner);
    const { id } = await createWebhook(a, { name: "Hook", url: URL1 });
    await sendTestWebhook(a, id);
    const log = await webhookLog(a, id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ type: "ping", state: "queued", about: null });
    expect((await refusal(sendTestWebhook(a, id)))?.message).toMatch(/Wait a minute/);
  });

  it("sends a failed send again, and nothing else, and not from a switched-off Webhook", async () => {
    const w = await ws(); const owner = await w.person("owner"); const a = w.actor(owner);
    const { id } = await createWebhook(a, { name: "Hook", url: URL1 });
    const { data: rows } = await db().from("webhook_sends").insert([
      { workspace_id: w.id, webhook_id: id, type: "ping", source_type: "app", state: "failed", attempts: 6, failure: "timeout" },
      { workspace_id: w.id, webhook_id: id, type: "ping", source_type: "app", state: "delivered", attempts: 1, status_code: 200 },
    ]).select("id, state");
    const failed = rows!.find((r) => r.state === "failed")!.id as string;
    const delivered = rows!.find((r) => r.state === "delivered")!.id as string;
    expect((await refusal(resendWebhookSend(a, delivered)))?.message).toMatch(/failed can be sent again/);
    await setWebhookEnabled(a, id, false);
    expect(await refusal(resendWebhookSend(a, failed))).toBeInstanceOf(Forbidden);
    expect(await refusal(sendTestWebhook(a, id))).toBeInstanceOf(Forbidden);
    await setWebhookEnabled(a, id, true);
    await resendWebhookSend(a, failed);
    const { data } = await db().from("webhook_sends").select("state, attempts, failure").eq("id", failed).single();
    expect(data).toEqual({ state: "queued", attempts: 0, failure: null });
  });

  it("is for Owners and Admins, answers another Workspace's rows as not found, and is refused in the demo", async () => {
    const w = await ws(); const other = await ws();
    const owner = await w.person("owner"); const member = await w.person("member"); const admin = await w.person("admin");
    const otherOwner = await other.person("owner");
    const { id } = await createWebhook(w.actor(owner), { name: "Hook", url: URL1 });
    await sendTestWebhook(w.actor(owner), id);
    expect(await webhookLog(w.actor(admin, "admin"), id)).toHaveLength(1);
    expect(await refusal(webhookLog(w.actor(member, "member"), id))).toBeInstanceOf(Forbidden);
    expect(await refusal(sendTestWebhook(w.actor(member, "member"), id))).toBeInstanceOf(Forbidden);
    expect((await refusal(webhookLog(other.actor(otherOwner), id)))?.message).toBe("That Webhook was not found.");
    expect(await refusal(sendTestWebhook(other.actor(otherOwner), id))).toBeInstanceOf(Forbidden);
    const { data } = await db().from("webhook_sends").select("id").eq("webhook_id", id).limit(1).single();
    expect(await refusal(resendWebhookSend(other.actor(otherOwner), String(data!.id)))).toBeInstanceOf(Forbidden);
    expect(await refusal(webhookLog({ ...w.actor(owner), workspaceId: DEMO_WORKSPACE_ID } as never, id))).toBeInstanceOf(DemoReadOnly);
  });

  it("lets one of several tests made at the same moment through", async () => {
    const w = await ws(); const owner = await w.person("owner"); const a = w.actor(owner);
    const { id } = await createWebhook(a, { name: "Hook", url: URL1 });
    const results = await Promise.allSettled([sendTestWebhook(a, id), sendTestWebhook(a, id), sendTestWebhook(a, id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await webhookLog(a, id)).toHaveLength(1);
  });

  it("makes a send wait a minute after it was tried, notes the resend in the Audit Log, and refuses a trial whose Webhooks the operator switched off", async () => {
    const w = await ws(); const owner = await w.person("owner"); const a = w.actor(owner);
    const { id } = await createWebhook(a, { name: "Hook", url: URL1 });
    const { data } = await db().from("webhook_sends").insert({ workspace_id: w.id, webhook_id: id, type: "ping", source_type: "app", state: "failed", attempts: 1, failure: "status", status_code: 400, last_attempt_at: new Date().toISOString() }).select("id").single();
    expect((await refusal(resendWebhookSend(a, String(data!.id))))?.message).toMatch(/Wait a minute/);
    await db().from("webhook_sends").update({ last_attempt_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", String(data!.id));
    await resendWebhookSend(a, String(data!.id));
    const { data: events } = await db().from("audit_events").select("kind").eq("workspace_id", w.id).eq("kind", "webhook.resent");
    expect(events).toHaveLength(1);
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", w.id);
    process.env.ZIFFR_TRIAL_WEBHOOKS = "false";
    try {
      expect(await refusal(sendTestWebhook(a, id))).toBeInstanceOf(Forbidden);
      expect(await refusal(resendWebhookSend(a, String(data!.id)))).toBeInstanceOf(Forbidden);
    } finally { delete process.env.ZIFFR_TRIAL_WEBHOOKS; }
  });
});
