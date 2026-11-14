// /api/unsubscribe/{token} over HTTP (spec 0004, ticket #74): a GET only asks, a POST (the button, or a mail
// client's one-click) stops; an unknown token is 404; the page names nobody. The rest is in email-opt-out.db.test.ts.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { deliverPrompt } from "@ziffr/core/deliveries";
import { emailOptedOut } from "@ziffr/core/email-opt-out";
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
const req = (method: string) => new Request("http://ziffr.test/api/unsubscribe/t", { method, body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined });

/** The unsubscribe token in the newest email to an address, read from Mailpit as a mail client would see it. */
async function tokenIn(address: string): Promise<string> {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`)).json() as { messages: { ID: string }[] };
  const headers = await (await fetch(`${MAILPIT}/api/v1/message/${messages[0].ID}/headers`)).json() as Record<string, string[]>;
  return /\/api\/unsubscribe\/([A-Za-z0-9_-]{32})>/.exec(headers["List-Unsubscribe"][0])![1];
}

describe("/api/unsubscribe/{token}", () => {
  it("asks on GET, stops on POST, and names nobody", async () => {
    const w = await workspace("Secret Project"); cleanups.push(w.cleanup);
    const sara = await w.person("owner", { email: `sara-${randomUUID().slice(0, 8)}@example.test` });
    const annMail = `ann-${randomUUID().slice(0, 8)}@example.test`;
    const ann = await w.person("member", { email: annMail });
    const m = await w.metric(sara); await w.token(m.id, ann);
    await deliverPrompt({ metricId: m.id, submitterId: ann, senderId: sara });
    const token = await tokenIn(annMail);
    const asked = await GET(req("GET"), ctx(token));
    expect(asked.status).toBe(200);
    const html = await asked.text();
    expect(html).toMatch(/<form method="post">/);
    expect(html).not.toMatch(/Secret Project|ann-|sara-/);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(false);
    const stopped = await POST(req("POST"), ctx(token));
    expect(stopped.status).toBe(200);
    expect(await emailOptedOut(w.actor(ann, "member"))).toBe(true);
  });
  it("answers 404 for a token it does not know", async () => {
    expect((await GET(req("GET"), ctx("x".repeat(32)))).status).toBe(404);
    expect((await POST(req("POST"), ctx("nonsense"))).status).toBe(404);
  });
});
