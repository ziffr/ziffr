// /api/unsubscribe/invitations/{token} over HTTP (spec 0040, ticket 5): a GET only asks, a POST (the button, or a mail
// client's one-click) stops invitation emails to the address the signed token names; anything else is 404; the page names nobody.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@ziffr/core/db";
import { signInvitationStopToken } from "@ziffr/core/invitation-stop";
import { GET, POST } from "./route";

const saved = process.env.ZIFFR_SECRETS_KEY;
beforeAll(() => { process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 3).toString("base64"); });
afterAll(() => { if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved; });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = (method: string) => new Request("http://ziffr.test/api/unsubscribe/invitations/t", { method, body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined });
const stopped = async (key: string) => Boolean((await db().from("invitation_stops").select("address_key").eq("address_key", key).maybeSingle()).data);

describe("/api/unsubscribe/invitations/{token}", () => {
  it("asks on GET, stops on POST, and names nobody", async () => {
    const key = `route-${Date.now()}@example.test`;
    const token = signInvitationStopToken(key)!;
    const asked = await GET(req("GET"), ctx(token));
    expect(asked.status).toBe(200);
    const html = await asked.text();
    expect(html).toMatch(/<form method="post">/);
    expect(html).not.toContain("route-");
    expect(asked.headers.get("cache-control")).toBe("no-store");
    expect(await stopped(key)).toBe(false);
    const done = await POST(req("POST"), ctx(token));
    expect(done.status).toBe(200);
    expect(await stopped(key)).toBe(true);
    expect((await POST(req("POST"), ctx(token))).status).toBe(200);
    await db().from("invitation_stops").delete().eq("address_key", key);
  });
  it("is 404 for a token that was not signed here, for GET and POST alike", async () => {
    for (const bad of ["nope", "bmlhQGV4YW1wbGUudGVzdA." + "A".repeat(43)]) {
      expect((await GET(req("GET"), ctx(bad))).status).toBe(404);
      expect((await POST(req("POST"), ctx(bad))).status).toBe(404);
    }
  });
});
