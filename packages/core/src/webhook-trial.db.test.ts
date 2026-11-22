// Webhooks in Trial Workspaces (spec 0037, "Trial Workspaces"; ticket #646; GLOSSARY: Webhook, Trial Workspace), against
// the real database: a trial adds Webhooks within its limit (also when several are made at once), reaches public
// addresses only whatever the operator lists, and has none where the operator switched them off; the demo has none.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { mailHostResolver } from "./mail-hosts";
import { workspace } from "./test/db-fixtures";
import { trialWebhooksOn, webhookRules } from "./webhook-trial";
import { trialLimitOf } from "./trial-limits";
import { createWebhook, deleteWebhook, listWebhooks } from "./webhooks";
import { sendTestWebhook } from "./webhook-log";
import { authenticateWebhookRequest } from "./webhook-inbound";
import { signWebhookBody } from "./webhook-send";

const TRIAL_WEBHOOKS_MAX = trialLimitOf("webhooks").default;
const TRIAL_WEBHOOK_SENDS_PER_DAY = trialLimitOf("webhookSendsPerDay").default;

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const NAMES = ["ZIFFR_TRIAL_LIMIT_WEBHOOKS", "ZIFFR_TRIAL_LIMIT_WEBHOOK_SENDS_PER_DAY", "ZIFFR_SECRETS_KEY", "ZIFFR_WEBHOOK_PRIVATE_HOSTS", "ZIFFR_TRIAL_WEBHOOKS", "ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE", "ZIFFR_LIMIT_WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY"];
const saved: Record<string, string | undefined> = {};
const realLookup = mailHostResolver.lookup;
const cleanups: (() => Promise<void>)[] = [];
beforeEach(() => {
  for (const n of NAMES) { saved[n] = process.env[n]; delete process.env[n]; }
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 78).toString("base64");
  mailHostResolver.lookup = async (host) => (host.endsWith("inside.example.test") ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "93.184.216.34", family: 4 }]);
});
afterEach(async () => {
  mailHostResolver.lookup = realLookup;
  for (const c of cleanups.splice(0)) await c().catch(() => {});
  for (const n of NAMES) { if (saved[n] === undefined) delete process.env[n]; else process.env[n] = saved[n]; }
});
const URL1 = "https://n8n.example.test/webhook/abcdef123456";
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** An Owner of a Trial Workspace, and of an ordinary one for comparison. */
async function trial() { const w = await workspace(); cleanups.push(w.cleanup); await w.trial(inDays(5)); return { w, a: w.actor(await w.person("owner")) }; }
async function ordinary() { const w = await workspace(); cleanups.push(w.cleanup); return { w, a: w.actor(await w.person("owner")) }; }

describe("the rules", () => {
  it("are on unless the operator says otherwise, and anything unclear counts as off", () => {
    for (const on of [undefined, "", " true ", "1", "ON", "yes"]) expect(trialWebhooksOn({ ZIFFR_TRIAL_WEBHOOKS: on })).toBe(true);
    for (const off of ["false", "0", "off", "no", "nope", "falsee"]) expect(trialWebhooksOn({ ZIFFR_TRIAL_WEBHOOKS: off })).toBe(false);
  });

  it("are smaller in a trial, never larger than the operator's own limits, and never list private hosts", async () => {
    process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "n8n.lan";
    const t = await trial(); const o = await ordinary();
    expect(await webhookRules(t.w.id)).toMatchObject({ trial: true, allowed: true, maxWebhooks: TRIAL_WEBHOOKS_MAX, sendsPerDay: TRIAL_WEBHOOK_SENDS_PER_DAY, privateHosts: [] });
    expect(await webhookRules(o.w.id)).toMatchObject({ trial: false, allowed: true, maxWebhooks: 5, sendsPerDay: 10_000, privateHosts: ["n8n.lan"] });
    process.env.ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE = "1";
    process.env.ZIFFR_LIMIT_WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY = "100";
    expect(await webhookRules(t.w.id)).toMatchObject({ maxWebhooks: 1, sendsPerDay: 100 });
  });

  it("follow the Trial Limits: their numbers are the trial's, and 0 Webhooks switches them off for trials", async () => {
    const t = await trial();
    process.env.ZIFFR_TRIAL_LIMIT_WEBHOOKS = "3";
    process.env.ZIFFR_TRIAL_LIMIT_WEBHOOK_SENDS_PER_DAY = "50";
    expect(await webhookRules(t.w.id)).toMatchObject({ trial: true, allowed: true, maxWebhooks: 3, sendsPerDay: 50 });
    const made = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createWebhook(t.a, { name: `W${i}`, url: URL1 })));
    expect(made.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    process.env.ZIFFR_TRIAL_LIMIT_WEBHOOKS = "0";
    expect(await webhookRules(t.w.id)).toMatchObject({ trial: true, allowed: false, why: expect.stringContaining("switched off") });
    expect(await listWebhooks(t.a)).toHaveLength(3);
  });

  it("stop an ended trial's Webhooks and say why", async () => {
    const t = await trial();
    await w_end(t.w.id);
    expect(await webhookRules(t.w.id)).toMatchObject({ trial: true, allowed: false, why: expect.stringContaining("ended") });
  });
});
async function w_end(id: string) {
  await db().from("workspaces").update({ trial_ends_at: inDays(-1) }).eq("id", id);
}

describe("making Webhooks in a trial", () => {
  it("lets a trial add two, refuses the third, and makes room when one is deleted", async () => {
    const { a } = await trial();
    await createWebhook(a, { name: "One", url: URL1 });
    await createWebhook(a, { name: "Two", url: URL1 });
    const e = await refusal(createWebhook(a, { name: "Three", url: URL1 }));
    expect(e?.message).toContain("This trial already has 2 Webhooks");
    expect(await listWebhooks(a)).toHaveLength(2);
    await deleteWebhook(a, (await listWebhooks(a))[0].id);
    await createWebhook(a, { name: "Room", url: URL1 });
  });

  it("holds the limit when several are made at once", async () => {
    const { a } = await trial();
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => createWebhook(a, { name: `W${i}`, url: URL1 })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(TRIAL_WEBHOOKS_MAX);
    expect(await listWebhooks(a)).toHaveLength(TRIAL_WEBHOOKS_MAX);
  });

  it("ignores the operator's private hosts: a host an ordinary Workspace may use is refused in a trial", async () => {
    process.env.ZIFFR_WEBHOOK_PRIVATE_HOSTS = "inside.example.test,10.0.0.5,localhost";
    const o = await ordinary(); const t = await trial();
    await createWebhook(o.a, { name: "Own n8n", url: "https://inside.example.test/hook" });
    for (const url of ["https://inside.example.test/hook", "https://10.0.0.5/hook", "https://localhost/hook"]) {
      const e = await refusal(createWebhook(t.a, { name: "Inside", url }));
      expect(e?.message, url).toMatch(/inside this server's own network/);
    }
    expect(await listWebhooks(t.a)).toEqual([]);
    // Public addresses work.
    await createWebhook(t.a, { name: "Public", url: URL1 });
  });

  it("is refused where the operator switched Webhooks off for trials (the setting's value, not only the word false), and only for trials", async () => {
    const t = await trial(); const o = await ordinary();
    for (const off of ["false", "off", "typo"]) {
      process.env.ZIFFR_TRIAL_WEBHOOKS = off;
      expect(await refusal(createWebhook(t.a, { name: "X", url: URL1 })), off).toBeInstanceOf(Forbidden);
      expect(await refusal(sendTestWebhook(t.a, "00000000-0000-4000-8000-000000000000")), off).toBeInstanceOf(Forbidden);
    }
    await createWebhook(o.a, { name: "Ordinary", url: URL1 });
    expect(await listWebhooks(t.a)).toEqual([]);
    delete process.env.ZIFFR_TRIAL_WEBHOOKS;
    await createWebhook(t.a, { name: "Back on", url: URL1 });
  });

  it("is refused once the trial has ended", async () => {
    const t = await trial();
    await w_end(t.w.id);
    expect(await refusal(createWebhook(t.a, { name: "Late", url: URL1 }))).toBeInstanceOf(Forbidden);
  });
});

describe("a trial's Webhooks answer nothing while they are off", () => {
  it("takes no request back where the operator switched trial Webhooks off", async () => {
    const t = await trial();
    const made = await createWebhook(t.a, { name: "Back", url: URL1 }); const id = made.id;
    const body = "{}"; const timestamp = String(Math.floor(Date.now() / 1000));
    const signed = { timestamp, body, signature: signWebhookBody([made.secret], Number(timestamp), body) };
    expect((await authenticateWebhookRequest(id, signed)).ok).toBe(true);
    process.env.ZIFFR_TRIAL_WEBHOOKS = "false";
    expect(await authenticateWebhookRequest(id, { ...signed, body: "{}" })).toEqual({ ok: false, why: "no_such" });
    // Unsigned requests are judged on the signature first.
    expect(await authenticateWebhookRequest(id, { timestamp: null, signature: null, body })).toEqual({ ok: false, why: "not_found" });
    delete process.env.ZIFFR_TRIAL_WEBHOOKS;
  });
});
