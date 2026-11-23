// /api/unsubscribe/invitations/{token} over HTTP (spec 0040, ticket 5): a GET only asks, a POST (the button, or a mail
// client's one-click) stops invitation emails to the address the signed token names; anything else is 404; the page names nobody.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { inviteByEmail } from "@ziffr/core/invitations";
import { mailboxKey, type MailTransport } from "@ziffr/core/mail";
import { signInvitationStopToken } from "@ziffr/core/invitation-stop";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET, POST } from "./route";

const SETTINGS = { ZIFFR_SECRETS_KEY: Buffer.alloc(32, 3).toString("base64"), ZIFFR_SMTP_URL: "smtp://127.0.0.1:1", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const transport: MailTransport = async () => ({ messageId: "test" });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = (method: string) => new Request("http://ziffr.test/api/unsubscribe/invitations/t", { method, body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined });
/** Whether an invitation email to the address still goes out, as the core decides it. */
async function emailed(to: string): Promise<boolean> {
  const w = await workspace("Route test"); cleanups.push(w.cleanup);
  return (await inviteByEmail(w.actor(await w.person("owner")), { email: to, role: "member" }, transport)).emailed;
}

describe("/api/unsubscribe/invitations/{token}", () => {
  it("asks on GET, stops on POST, and names nobody", async () => {
    const key = mailboxKey(`route-${randomUUID().slice(0, 8)}@example.test`);
    const token = signInvitationStopToken(key)!;
    const asked = await GET(req("GET"), ctx(token));
    expect(asked.status).toBe(200);
    const html = await asked.text();
    expect(html).toMatch(/<form method="post">/);
    expect(html).not.toContain("route-");
    expect(asked.headers.get("cache-control")).toBe("no-store");
    expect(await emailed(key)).toBe(true);
    const done = await POST(req("POST"), ctx(token));
    expect(done.status).toBe(200);
    expect(await emailed(key)).toBe(false);
    expect((await POST(req("POST"), ctx(token))).status).toBe(200);
  });
  it("is 404 for a token that was not signed here, for GET and POST alike", async () => {
    for (const bad of ["nope", "bmlhQGV4YW1wbGUudGVzdA." + "A".repeat(43)]) {
      expect((await GET(req("GET"), ctx(bad))).status).toBe(404);
      expect((await POST(req("POST"), ctx(bad))).status).toBe(404);
    }
  });
});
