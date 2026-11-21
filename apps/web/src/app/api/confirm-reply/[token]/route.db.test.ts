// /api/confirm-reply/{token} over HTTP (ticket #513): a GET only shows the held reply and records nothing (a mail scanner
// opening the link changes nothing), the Confirm button's POST records it once, and an unknown, used or malformed link
// is the same 404 page. The rest is in packages/core/src/held-replies.db.test.ts.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deliverPrompt } from "@ziffr/core/deliveries";
import { parseInbound, receiveEmail } from "@ziffr/core/inbound-email";
import { rowsOf, valuesOf, workspace } from "@ziffr/core/test/db-fixtures";
import { GET, POST } from "./route";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const DOMAIN = "in.ziffr.example.test";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test", ZIFFR_INBOUND_DOMAIN: DOMAIN, ZIFFR_INBOUND_SECRET: "i".repeat(40) };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } saved.AUTHSERV = process.env.ZIFFR_INBOUND_AUTHSERV_ID; delete process.env.ZIFFR_INBOUND_AUTHSERV_ID; });
afterAll(() => { for (const [k, v] of Object.entries(saved)) { const name = k === "AUTHSERV" ? "ZIFFR_INBOUND_AUTHSERV_ID" : k; if (v === undefined) delete process.env[name]; else process.env[name] = v; } });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = (method: string) => new Request("http://ziffr.test/api/confirm-reply/t", { method });

describe("/api/confirm-reply/{token}", () => {
  it("shows on GET, records on POST once, and answers 404 for any link that does not work", async () => {
    const w = await workspace("Secret Project"); cleanups.push(w.cleanup);
    const sara = await w.person("owner", { email: `sara-${randomUUID().slice(0, 8)}@example.test` });
    const annMail = `ann-${randomUUID().slice(0, 8)}@example.test`;
    const ann = await w.person("member", { email: annMail });
    const m = await w.metric(sara, { name: "Field visits", sources: ["web_form", "mail"] }); await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const replyToken = String((await rowsOf("deliveries", { workspace_id: w.id, recipient_id: ann, kind: "prompt" }))[0].reply_token);
    const raw = [`From: Ann <${annMail}>`, `To: Ziffr <reply+${replyToken}@${DOMAIN}>`, "Subject: Re: x", `Message-ID: <${randomUUID()}@mail.example.test>`, "Content-Type: text/plain; charset=utf-8", "", "<b>42</b> visits"].join("\r\n");
    expect(await receiveEmail(await parseInbound(raw))).toBe("held");
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${annMail}" subject:"Confirm your reply"`)}`)).json() as { messages: { ID: string }[] };
    const text = ((await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json()) as { Text: string }).Text;
    const token = /\/api\/confirm-reply\/([A-Za-z0-9_-]{43})/.exec(text)![1];
    const asked = await GET(req("GET"), ctx(token));
    expect(asked.status).toBe(200);
    const html = await asked.text();
    expect(html).toMatch(/<form method="post">/);
    // The reply is shown as text, never as markup.
    expect(html).toContain("&lt;b&gt;42&lt;/b&gt;");
    expect(html).not.toContain("<b>42");
    expect(html).not.toMatch(/Secret Project|ann-|sara-/);
    expect(await valuesOf(m.id)).toEqual([]);
    const done = await POST(req("POST"), ctx(token));
    expect(done.status).toBe(200);
    expect(await valuesOf(m.id)).toMatchObject([{ value: 42, source: "mail" }]);
    expect((await POST(req("POST"), ctx(token))).status).toBe(404);
    expect((await GET(req("GET"), ctx(token))).status).toBe(404);
    expect((await GET(req("GET"), ctx("x".repeat(43)))).status).toBe(404);
    expect((await POST(req("POST"), ctx("nonsense"))).status).toBe(404);
    expect(await valuesOf(m.id)).toHaveLength(1);
  });
});
