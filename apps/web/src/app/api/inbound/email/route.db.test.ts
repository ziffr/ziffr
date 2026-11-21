// POST /api/inbound/email over HTTP (spec 0004, ticket #73): the signature, its age, the size limit, and one reply
// end to end: a real Prompt email from Mailpit, answered through the webhook, records the value.
import { createHmac, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deliverPrompt } from "@ziffr/core/deliveries";
import { valuesOf, workspace } from "@ziffr/core/test/db-fixtures";
import { POST } from "./route";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SECRET = "w".repeat(40);
const SETTINGS = {
  ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test",
  ZIFFR_INBOUND_DOMAIN: "in.ziffr.example.test", ZIFFR_INBOUND_SECRET: SECRET,
};
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });

const sign = (body: string, ts = Math.floor(Date.now() / 1000), secret = SECRET) => ({ "x-ziffr-timestamp": String(ts), "x-ziffr-signature": `sha256=${createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex")}` });
const post = (body: string, headers: Record<string, string>) => POST(new Request("http://ziffr.test/api/inbound/email", { method: "POST", body, headers: { "content-type": "message/rfc822", ...headers } }));
const MESSAGE = "From: a@example.test\r\nTo: reply+" + "x".repeat(32) + "@in.ziffr.example.test\r\nSubject: Re\r\n\r\n12";

describe("POST /api/inbound/email", () => {
  it("answers 404 unless signed with the secret a moment ago, and 404 when inbound mail is not set up", async () => {
    expect((await post(MESSAGE, {})).status).toBe(404);
    expect((await post(MESSAGE, sign(MESSAGE, undefined, "z".repeat(40)))).status).toBe(404);
    expect((await post(MESSAGE, sign(MESSAGE, Math.floor(Date.now() / 1000) - 600))).status).toBe(404);
    expect((await post(MESSAGE + " changed", sign(MESSAGE))).status).toBe(404);
    const ok = await post(MESSAGE, sign(MESSAGE));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ outcome: "unknown_token" });
    delete process.env.ZIFFR_INBOUND_DOMAIN;
    expect((await post(MESSAGE, sign(MESSAGE))).status).toBe(404);
    process.env.ZIFFR_INBOUND_DOMAIN = SETTINGS.ZIFFR_INBOUND_DOMAIN;
  });
  it("refuses a message over 1 MB before reading its signature, also when it does not say its length", async () => {
    const big = MESSAGE + "x".repeat(1024 * 1024);
    expect((await post(big, sign(big))).status).toBe(413);
    // Streamed in pieces with no Content-Length: reading stops at the limit.
    const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ > 40) c.close(); else c.enqueue(chunk); } });
    const res = await POST(new Request("http://ziffr.test/api/inbound/email", { method: "POST", body: stream, headers: sign("x"), duplex: "half" } as RequestInit));
    expect(res.status).toBe(413);
    expect(sent).toBeLessThan(40);
    expect((await post(MESSAGE, { ...sign(MESSAGE), "content-length": "12abc" })).status).toBe(413);
  });
  /** A real Prompt email from Mailpit and a reply to it as the person's mail client writes one, with or without the provider's vouching header. */
  async function promptAndReply(vouched: boolean) {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner", { email: `sara-${randomUUID().slice(0, 8)}@example.test` });
    const annMail = `ann-${randomUUID().slice(0, 8)}@example.test`;
    const ann = await w.person("member", { email: annMail });
    const m = await w.metric(sara, { name: "Orders", sources: ["web_form", "mail"] }); await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${annMail}"`)}`)).json() as { messages: { ID: string }[] };
    const prompt = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { ReplyTo: { Address: string }[]; Subject: string; Text: string };
    const quoted = prompt.Text.split("\n").map((l) => `> ${l}`).join("\r\n");
    const body = [...(vouched ? [`Authentication-Results: mx.provider.test; dmarc=pass header.from=example.test`] : []), `From: Ann <${annMail}>`, `To: ${prompt.ReplyTo[0].Address}`, `Subject: Re: ${prompt.Subject}`, `Message-ID: <${randomUUID()}@client.test>`, "Content-Type: text/plain; charset=utf-8", "", "17", "", "On Tuesday, Ziffr wrote:", quoted].join("\r\n");
    return { m, ann, body };
  }
  it("records the value from a vouched-for reply to a real Prompt email", async () => {
    process.env.ZIFFR_INBOUND_AUTHSERV_ID = "mx.provider.test";
    try {
      const { m, ann, body } = await promptAndReply(true);
      expect(await (await post(body, sign(body))).json()).toEqual({ outcome: "recorded" });
      expect(await valuesOf(m.id)).toMatchObject([{ value: 17, submitter_id: ann, source: "mail" }]);
    } finally {
      delete process.env.ZIFFR_INBOUND_AUTHSERV_ID;
    }
  });
  it("holds the value from an unvouched reply and records nothing (ticket #513)", async () => {
    delete process.env.ZIFFR_INBOUND_AUTHSERV_ID;
    const { m, body } = await promptAndReply(false);
    expect(await (await post(body, sign(body))).json()).toEqual({ outcome: "held" });
    expect(await valuesOf(m.id)).toEqual([]);
  });
});
