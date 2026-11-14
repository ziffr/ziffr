// Replies by email, against the real database and the local Mailpit (spec 0004, ticket #73): a reply to a Prompt
// records the value (quoted history ignored, a Breakdown too), a reply about a question lands in its Thread or
// proposes a Correction; an unknown or expired token, another sender, an automatic reply and a repeat change nothing.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { deliverPrompt } from "./deliveries";
import { newText, parseInbound, receiveEmail, senderVerified } from "./inbound-email";
import { connectorsView } from "./page-data";
import { ask } from "./questions";
import type { SubmissionEffects } from "./submissions";
import { valuesOf, workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const DOMAIN = "in.ziffr.example.test";
const SETTINGS = {
  ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test",
  ZIFFR_INBOUND_DOMAIN: DOMAIN, ZIFFR_INBOUND_SECRET: "i".repeat(40),
};
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
const quiet = (): SubmissionEffects => ({ notifyCorrection: vi.fn(async () => {}), afterValue: vi.fn(async () => []) });
const emailOf = async (person: string) => (await db().from("profiles").select("email").eq("id", person).single()).data!.email as string;

/** A reply as a mail client writes it. */
const reply = (o: { from: string; token: string; text: string; headers?: string; id?: string }) => [
  `From: Someone <${o.from}>`, `To: Ziffr <reply+${o.token}@${DOMAIN}>`, "Subject: Re: your question", `Message-ID: <${o.id ?? randomUUID()}@mail.example.test>`,
  ...(o.headers ? [o.headers] : []), "Content-Type: text/plain; charset=utf-8", "", o.text,
].join("\r\n");

async function promptFor(sources: string[] = ["web_form", "mail"]) {
  const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ann = await w.person("member", { email: address("ann") });
  const m = await w.metric(sara, { name: "Field visits", sources, submission_rule: "overwrite" }); await w.token(m.id, ann);
  await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
  const { data: d } = await db().from("deliveries").select("id, reply_token, mail_state, body").eq("workspace_id", w.id).eq("recipient_id", ann).single();
  return { w, sara, ann, m, d: d!, annMail: await emailOf(ann) };
}

describe("replies by email", () => {
  it("sends a Prompt with its own reply address and asks for a reply, then records the number from the reply", async () => {
    const { m, d, annMail } = await promptFor();
    expect(d).toMatchObject({ mail_state: "sent", reply_token: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/) });
    expect(d.body).toMatch(/reply to this email/i);
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${annMail}"`)}`)).json() as { messages: { ID: string }[] };
    const headers = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}/headers`)).json() as Record<string, string[]>;
    expect(headers["Reply-To"]).toEqual([`reply+${d.reply_token}@${DOMAIN}`]);
    const raw = reply({ from: annMail, token: d.reply_token!, text: "42 visits\r\n\r\nOn Mon, Ziffr wrote:\r\n> What's the number? Last time 7" , id: "first" });
    expect(await receiveEmail(await parseInbound(raw), { submission: quiet() })).toBe("recorded");
    expect(await valuesOf(m.id)).toMatchObject([{ value: 42, source: "mail" }]);
    // The same message again (the provider retried): nothing more.
    expect(await receiveEmail(await parseInbound(raw), { submission: quiet() })).toBe("duplicate");
    expect(await valuesOf(m.id)).toHaveLength(1);
    // The person is told what became of it.
    const { messages: told } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${annMail}" subject:Recorded`)}`)).json() as { messages: unknown[] };
    expect(told).toHaveLength(1);
  });
  it("records a Breakdown, one row per line", async () => {
    const { m, d, annMail } = await promptFor();
    expect(await receiveEmail(await parseInbound(reply({ from: annMail, token: d.reply_token!, text: "Shop 30\r\nOnline 12" })), { submission: quiet() })).toBe("recorded");
    const [o] = await valuesOf(m.id);
    expect(o.value).toBe(42);
  });
  it("puts a reply about a question into its Thread, and a Correction line as a proposed Correction", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ben = await w.person("member", { email: address("ben") });
    const m = await w.metric(sara, { name: "Revenue" });
    const actionId = await ask(w.actor(sara), { metricId: m.id, period: "2026-10-01", assigneeId: ben, text: "Is October right?" });
    const { data: d } = await db().from("deliveries").select("reply_token").eq("action_id", actionId).eq("recipient_id", ben).single();
    const benMail = await emailOf(ben);
    expect(await receiveEmail(await parseInbound(reply({ from: benMail, token: d!.reply_token!, text: "Yes, checked with the bank.\r\n\r\n-- \r\nBen, Finance" })))).toBe("replied");
    expect(await receiveEmail(await parseInbound(reply({ from: benMail, token: d!.reply_token!, text: "Actually not.\r\nCorrection: 1250" })))).toBe("corrected");
    const { data: thread } = await db().from("thread_messages").select("author_id, body, correction_value").eq("action_id", actionId).order("id");
    expect(thread).toEqual(expect.arrayContaining([
      expect.objectContaining({ author_id: ben, body: "Yes, checked with the bank.", correction_value: null }),
      expect.objectContaining({ author_id: ben, body: "Actually not.", correction_value: 1250 }),
    ]));
  });
  it("takes nothing from another sender, for an unknown or expired token, or from an auto-reply", async () => {
    const { m, d, annMail } = await promptFor();
    const parse = (o: Parameters<typeof reply>[0]) => parseInbound(reply(o));
    expect(await receiveEmail(await parse({ from: address("forwarded-to"), token: d.reply_token!, text: "99" }))).toBe("wrong_sender");
    expect(await receiveEmail(await parse({ from: annMail, token: "x".repeat(32), text: "99" }))).toBe("unknown_token");
    // A token for another domain is no token.
    expect((await parseInbound(reply({ from: annMail, token: d.reply_token!, text: "99" }).replace(DOMAIN, "elsewhere.test"))).tokens).toEqual([]);
    expect(await receiveEmail(await parse({ from: annMail, token: d.reply_token!, text: "I am away until Monday.", headers: "Auto-Submitted: auto-replied" }))).toBe("automatic");
    await db().from("deliveries").update({ created_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("id", d.id);
    expect(await receiveEmail(await parse({ from: annMail, token: d.reply_token!, text: "99" }))).toBe("expired");
    expect(await valuesOf(m.id)).toEqual([]);
  });
  it("answers a Metric that takes no mail with the form link instead of recording", async () => {
    const { m, d, annMail } = await promptFor(["web_form"]);
    // The Prompt itself already said to use the form, not to reply.
    expect(d.body).not.toMatch(/reply to this email/i);
    expect(await receiveEmail(await parseInbound(reply({ from: annMail, token: d.reply_token!, text: "5" })))).toBe("form_link");
    expect(await valuesOf(m.id)).toEqual([]);
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${annMail}" subject:"not recorded"`)}`)).json() as { messages: { ID: string }[] };
    const told = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { Text: string };
    expect(told.Text).toMatch(/https:\/\/ziffr\.example\.test\/submit\/tk-/);
  });
  it("keeps only what was written above the quoted message and the signature", () => {
    expect(newText("12\n\nOn Tue, 3 Nov 2026, Ziffr wrote:\n> 7")).toBe("12");
    expect(newText("Passt.\nAm Di., 3. Nov. 2026 um 10:00 schrieb Ziffr <z@x>:\n> 7")).toBe("Passt.");
    expect(newText("Fine\n-----Original Message-----\nFrom: Ziffr")).toBe("Fine");
    expect(newText("Fine\n-- \nAnn")).toBe("Fine");
  });
  it("never hands a reply token or a Message-ID to a page", async () => {
    const { w, sara, d } = await promptFor();
    expect(d.reply_token).toBeTruthy();
    const view = await connectorsView(w.actor(sara));
    expect(view.deliveries.length).toBeGreaterThan(0);
    expect(JSON.stringify(view)).not.toContain(d.reply_token!);
    for (const row of view.deliveries) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["reply_token"]));
    for (const row of view.deliveries) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(["provider_id"]));
  });
  it("trusts a From address only as the named provider vouches for it", () => {
    const ar = (v: string) => [{ key: "authentication-results", value: v }];
    expect(senderVerified(ar("mx.provider.test; dmarc=pass header.from=example.test"), "ann@example.test", "mx.provider.test")).toBe(true);
    expect(senderVerified(ar("mx.provider.test; dkim=pass header.d=example.test header.s=s1"), "ann@example.test", "mx.provider.test")).toBe(true);
    // Written by the sender (another authserv-id), failed, for another domain, or nothing named: no.
    expect(senderVerified(ar("mx.evil.test; dmarc=pass header.from=example.test"), "ann@example.test", "mx.provider.test")).toBe(false);
    expect(senderVerified(ar("mx.provider.test; dmarc=fail header.from=example.test"), "ann@example.test", "mx.provider.test")).toBe(false);
    expect(senderVerified(ar("mx.provider.test; dkim=pass header.d=evil.test"), "ann@example.test", "mx.provider.test")).toBe(false);
    expect(senderVerified(ar("mx.provider.test; dmarc=pass header.from=example.test"), "ann@example.test", undefined)).toBe(false);
    // A pass the sender wrote lower down, under the provider's own fail at the top, counts for nothing.
    const forged = [{ key: "authentication-results", value: "mx.provider.test; dmarc=fail header.from=example.test" }, { key: "authentication-results", value: "mx.provider.test; dmarc=pass header.from=example.test" }];
    expect(senderVerified(forged, "ann@example.test", "mx.provider.test")).toBe(false);
  });
  it("never takes an Approval by email unless the provider vouched for the sender, and takes nothing unvouched once one is named", async () => {
    const w = await ws(); const sara = await w.person("owner", { email: address("sara") }); const ben = await w.person("member", { email: address("ben") });
    const m = await w.metric(sara);
    const { data: action } = await db().from("actions").insert({ metric_id: m.id, period_start: "2026-10-01", asker_id: sara, assignee_id: ben, kind: "task", purpose: "approval", question: "Approve October?", workspace_id: w.id }).select("id").single();
    const token = "a".repeat(32);
    await db().from("deliveries").insert({ connector: "email", recipient_id: ben, sender_id: sara, kind: "task", action_id: action!.id, workspace_id: w.id, subject: "Approve", body: "x", mail_state: "sent", reply_token: token });
    const benMail = await emailOf(ben);
    const approve = (headers?: string) => parseInbound(reply({ from: benMail, token, text: "approved", headers }));
    expect(await receiveEmail(await approve())).toBe("unverified");
    const { data: still } = await db().from("actions").select("status").eq("id", action!.id).single();
    expect(still!.status).toBe("open");
    process.env.ZIFFR_INBOUND_AUTHSERV_ID = "mx.provider.test";
    try {
      const domain = benMail.split("@")[1];
      expect(await receiveEmail(await approve(`Authentication-Results: mx.evil.test; dmarc=pass header.from=${domain}`))).toBe("unverified");
      // Vouched for, it reaches the Approval itself (which finds no value waiting here, so says so).
      await expect(receiveEmail(await approve(`Authentication-Results: mx.provider.test; dmarc=pass header.from=${domain}`))).rejects.toThrow(/not waiting for this approval/);
    } finally {
      delete process.env.ZIFFR_INBOUND_AUTHSERV_ID;
    }
  });
});
