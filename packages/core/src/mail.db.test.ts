// Sending email, against the real database and a real SMTP server (spec 0004, ticket #71): the local Mailpit that
// local Supabase runs (SMTP on 55425, its API on 55424). Sent, failed and retried; nothing in the demo or without
// settings; only to the workspace's own people; no header can be smuggled in.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { askForMissingValues } from "./questions";
import { headerSafe, initialMailState, isAddress, MAX_ATTEMPTS, sendDelivery, sendWaiting, type MailTransport } from "./mail";
import { settingsInEffect } from "./settings-in-effect";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } delete process.env.ZIFFR_INBOUND_DOMAIN; });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;

/** The messages Mailpit holds for an address, with their bodies and headers. */
async function inbox(to: string) {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string; Subject: string }[] };
  return Promise.all(messages.map(async (m) => {
    const full = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json() as { Subject: string; Text: string; From: { Address: string }; To: { Address: string }[]; Bcc: unknown[]; Cc: unknown[] };
    const headers = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}/headers`)).json() as Record<string, string[]>;
    return { ...full, headers };
  }));
}
const deliveryOf = async (wsId: string, recipient: string) => (await db().from("deliveries").select("*").eq("workspace_id", wsId).eq("recipient_id", recipient).order("id", { ascending: false }).limit(1).single()).data!;

describe("sending email", () => {
  it("emails a Prompt to a member's own address and a Contact's stored one, with links that work outside Ziffr", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") });
    const ann = await w.person("member", { email: address("ann") }); const dana = await w.contact({ email: address("dana") });
    const m = await w.metric(sara, { name: "Field visits", sources: ["web_form", "mail"] });
    await w.token(m.id, ann); await w.token(m.id, dana);
    expect(await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara })).toBeTruthy();
    expect(await deliverPrompt({ metricId: m.id, submitterId: dana, senderId: sara })).toBeTruthy();
    for (const person of [ann, dana]) expect(await deliveryOf(w.id, person)).toMatchObject({ mail_state: "sent", attempts: 1, provider_id: expect.any(String), last_error: null });
    const [annMail] = await inbox((await db().from("profiles").select("email").eq("id", ann).single()).data!.email);
    expect(annMail).toMatchObject({ Subject: expect.stringContaining("Field visits"), From: { Address: "ziffr@example.test" } });
    expect(annMail.Text).toMatch(/https:\/\/ziffr\.example\.test\/submit\/tk-/);
    // Replies do not come back yet (ticket #73), so the email does not ask for one.
    expect(annMail.Text).not.toMatch(/reply to this email/i);
    expect(annMail.headers["Auto-Submitted"]).toEqual(["auto-generated"]);
    const { data: contact } = await db().from("contacts").select("email").eq("person_id", dana).single();
    expect(await inbox(contact!.email)).toHaveLength(1);
  });
  it("retries a failed send with growing waits, and gives up after five attempts", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const m = await w.metric(sara); await w.token(m.id, ann);
    process.env.ZIFFR_SMTP_URL = "smtp://127.0.0.1:1"; // nothing listens there
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    process.env.ZIFFR_SMTP_URL = SETTINGS.ZIFFR_SMTP_URL;
    const d = await deliveryOf(w.id, ann);
    expect(d).toMatchObject({ mail_state: "queued", attempts: 1, last_error: expect.stringMatching(/^The mail server refused it/) });
    // Not due yet: the first wait is a minute.
    expect(await sendWaiting()).toMatchObject({ sent: 0 });
    await db().from("deliveries").update({ last_attempt_at: new Date(Date.now() - 120_000).toISOString() }).eq("id", d.id);
    expect((await sendWaiting()).sent).toBeGreaterThanOrEqual(1);
    expect(await deliveryOf(w.id, ann)).toMatchObject({ mail_state: "sent", attempts: 2, last_error: null });
    // A message that keeps failing stops after MAX_ATTEMPTS.
    const broken: MailTransport = async () => { throw Object.assign(new Error("554 no"), { code: "EENVELOPE" }); };
    await db().from("deliveries").update({ mail_state: "queued", attempts: MAX_ATTEMPTS - 1 }).eq("id", d.id);
    expect(await sendDelivery(d.id, broken)).toBe("failed");
    expect(await deliveryOf(w.id, ann)).toMatchObject({ mail_state: "failed", attempts: MAX_ATTEMPTS, last_error: "The mail server refused it (EENVELOPE)." });
    expect(await sendDelivery(d.id)).toBe("skipped");
    // Lowering the tries below what a queued message used marks it failed, so nothing waits silently.
    try {
      process.env.ZIFFR_LIMIT_SEND_ATTEMPTS = "2";
      await db().from("deliveries").update({ mail_state: "queued", attempts: 3, last_error: null }).eq("id", d.id);
      await sendWaiting();
      expect(await deliveryOf(w.id, ann)).toMatchObject({ mail_state: "failed", attempts: 3, last_error: "Gave up after 2 tries." });
    } finally {
      delete process.env.ZIFFR_LIMIT_SEND_ATTEMPTS;
    }
  });
  it("sends a message once, also when the immediate send and the retry job race", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const { data: d } = await db().from("deliveries").insert({ connector: "email", recipient_id: ann, sender_id: sara, kind: "notice", workspace_id: w.id, subject: "Hello", body: "Once.", mail_state: "queued" }).select("id").single();
    const results = await Promise.all([sendDelivery(d!.id), sendDelivery(d!.id), sendDelivery(d!.id)]);
    expect(results.sort()).toEqual(["sent", "skipped", "skipped"]);
    expect(await inbox((await db().from("profiles").select("email").eq("id", ann).single()).data!.email)).toHaveLength(1);
  });
  it("sends nothing without settings, in the demo, or by another Connector, and only to the workspace's own people", async () => {
    expect(initialMailState("email", "any", await settingsInEffect())).toBe("queued");
    expect(initialMailState("slack", "any", await settingsInEffect())).toBe("outbox");
    expect(initialMailState("email", DEMO_WORKSPACE_ID, await settingsInEffect())).toBe("outbox");
    delete process.env.ZIFFR_SMTP_URL;
    expect(initialMailState("email", "any", await settingsInEffect())).toBe("outbox");
    process.env.ZIFFR_SMTP_URL = SETTINGS.ZIFFR_SMTP_URL;
    process.env.ZIFFR_MAIL_FROM = "not an address";
    expect(initialMailState("email", "any", await settingsInEffect())).toBe("outbox");
    process.env.ZIFFR_MAIL_FROM = SETTINGS.ZIFFR_MAIL_FROM;
    // Without the site's address its links would lead nowhere.
    delete process.env.ZIFFR_SITE_URL;
    expect(initialMailState("email", "any", await settingsInEffect())).toBe("outbox");
    process.env.ZIFFR_SITE_URL = SETTINGS.ZIFFR_SITE_URL;
    // Someone of another workspace, though their address is known: not sent.
    const w = await ws(); const other = await ws(); const sara = await w.person("owner", { email: address("sara") });
    const zoe = await other.person("owner", { email: address("zoe") });
    const { data: d } = await db().from("deliveries").insert({ connector: "email", recipient_id: zoe, sender_id: sara, kind: "notice", workspace_id: w.id, subject: "Hi", body: "x", mail_state: "queued" }).select("id").single();
    expect(await sendDelivery(d!.id)).toBe("failed");
    expect((await deliveryOf(w.id, zoe)).last_error).toMatch(/No usable email address/);
  });
  it("lets no header in through a subject or an address", async () => {
    expect(headerSafe("Hi\r\nBcc: victim@example.test")).toBe("Hi Bcc: victim@example.test");
    for (const bad of ["a@b.test\nBcc: x@y.test", "a@b.test, x@y.test", "Name <a@b.test>", "a@b", "@b.test", "a@b.test\r"]) expect(isAddress(bad)).toBe(false);
    expect(isAddress("first.last+tag@sub.example.test")).toBe(true);
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
    const { data: d } = await db().from("deliveries").insert({ connector: "email", recipient_id: ann, sender_id: sara, kind: "notice", workspace_id: w.id, subject: "Numbers\r\nBcc: victim@example.test", body: "Body", mail_state: "queued" }).select("id").single();
    expect(await sendDelivery(d!.id)).toBe("sent");
    const [mail] = await inbox((await db().from("profiles").select("email").eq("id", ann).single()).data!.email);
    expect(mail.Subject).toBe("Numbers Bcc: victim@example.test");
    expect(mail.Bcc ?? []).toEqual([]);
    expect(mail.headers.Bcc).toBeUndefined();
  });
});

describe("queued email", () => {
  it("waits for the deliveries job when many people are asked at once, and is sent by it", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") });
    const annAddress = address("ann"); const ann = await w.person("member", { email: annAddress });
    const m = await w.metric(sara, { name: "Field visits", sources: ["web_form", "mail"] });
    await w.token(m.id, ann);
    expect(await askForMissingValues(w.actor(sara))).toEqual({ asked: 1, stopped: 0 });
    const queued = await deliveryOf(w.id, ann);
    expect(queued).toMatchObject({ kind: "prompt", mail_state: "queued", sent_at: null, attempts: 0 });
    expect(await inbox(annAddress)).toEqual([]);
    // What the deliveries job does for each waiting one.
    expect(await sendDelivery(queued.id)).toBe("sent");
    expect((await deliveryOf(w.id, ann)).mail_state).toBe("sent");
    expect((await inbox(annAddress)).length).toBe(1);
  });
});
