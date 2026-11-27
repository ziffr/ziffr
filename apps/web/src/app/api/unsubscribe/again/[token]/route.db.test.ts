// /api/unsubscribe/again/{token} over HTTP (issue #1333): a GET only asks, a POST switches requests by email on
// again, once; an unknown link is 404; the page names nobody. Who may have the link sent is in email-opt-out.db.test.ts.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { emailOptedOut, optOutOfEmail } from "@ziffr/core/email-opt-out";
import { askToResumeEmail } from "@ziffr/core/email-resume";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET, POST } from "./route";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = (method: string) => new Request("http://ziffr.test/api/unsubscribe/again/t", { method });

describe("/api/unsubscribe/again/{token}", () => {
  it("asks on GET, switches the requests on at POST, once, and names nobody", async () => {
    const w = await workspace("Secret Project"); cleanups.push(w.cleanup);
    const sara = await w.person("owner", { email: `sara-${randomUUID().slice(0, 8)}@example.test` });
    const annMail = `ann-${randomUUID().slice(0, 8)}@example.test`;
    const ann = await w.person("member", { email: annMail });
    const m = await w.metric(sara); await w.token(m.id, ann);
    await optOutOfEmail(w.actor(ann, "member"));
    await askToResumeEmail(w.actor(sara), m.id, ann);
    const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${annMail}"`)}`)).json() as { messages: { ID: string }[] };
    const { Text } = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}`)).json() as { Text: string };
    const token = /\/api\/unsubscribe\/again\/([A-Za-z0-9_-]{43})/.exec(Text)![1];
    const asked = await GET(req("GET"), ctx(token));
    expect(asked.status).toBe(200);
    const html = await asked.text();
    expect(html).toMatch(/<form method="post">/);
    expect(html).not.toMatch(/Secret Project|ann-|sara-/);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(true);
    expect((await POST(req("POST"), ctx(token))).status).toBe(200);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(false);
    expect((await POST(req("POST"), ctx(token))).status).toBe(404);
  });
  it("answers 404 for a link it does not know", async () => {
    expect((await GET(req("GET"), ctx("x".repeat(43)))).status).toBe(404);
    expect((await POST(req("POST"), ctx("nonsense"))).status).toBe(404);
  });
});
