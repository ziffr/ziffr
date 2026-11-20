// /api/unsubscribe/digest/{token} over HTTP (spec 0031, ticket #368): a GET only asks, a POST (the button, or a mail
// client's one-click) stops; a changed or unknown token is 404 and the page names nobody. The rest is in
// usage-digest.db.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { usageDigestOptedOut } from "@ziffr/core/usage-digest";
import { signDigestToken } from "@ziffr/core/usage-digest-token";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { GET, POST } from "./route";

const saved = process.env.ZIFFR_JOB_SECRET;
beforeAll(() => { process.env.ZIFFR_JOB_SECRET = "j".repeat(40); });
afterAll(() => { if (saved === undefined) delete process.env.ZIFFR_JOB_SECRET; else process.env.ZIFFR_JOB_SECRET = saved; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const req = (method: string) => new Request("http://ziffr.test/api/unsubscribe/digest/t", { method, body: method === "POST" ? "List-Unsubscribe=One-Click" : undefined });

describe("/api/unsubscribe/digest/{token}", () => {
  it("asks on GET, stops on POST, and names nobody", async () => {
    const w = await workspace("Secret Project"); cleanups.push(w.cleanup);
    const sara = await w.person("owner", { email: "sara-digest@example.test" });
    const token = signDigestToken(sara)!;
    const asked = await GET(req("GET"), ctx(token));
    expect(asked.status).toBe(200);
    const html = await asked.text();
    expect(html).toMatch(/<form method="post">/);
    expect(html).not.toMatch(/Secret Project|sara-digest/);
    expect(await usageDigestOptedOut(w.actor(sara))).toBe(false);
    expect((await POST(req("POST"), ctx(token))).status).toBe(200);
    expect(await usageDigestOptedOut(w.actor(sara))).toBe(true);
  });

  it("answers 404 for a token it did not sign, and the same page for each kind of failure", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const good = signDigestToken(sara)!;
    const bad = [`${good.slice(0, -2)}AA`, "nonsense", "x".repeat(300)];
    const pages: string[] = [];
    for (const t of bad) {
      const g = await GET(req("GET"), ctx(t)); const p = await POST(req("POST"), ctx(t));
      expect([g.status, p.status]).toEqual([404, 404]);
      pages.push(await p.text());
    }
    // A genuine token of a person who is gone says the same as for anyone: the link tells nothing about accounts.
    const gone = signDigestToken("t-nobody")!;
    expect((await GET(req("GET"), ctx(gone))).status).toBe(200);
    expect((await POST(req("POST"), ctx(gone))).status).toBe(200);
    expect(new Set(pages).size).toBe(1);
    expect(await (await import("@ziffr/core/usage-digest")).usageDigestOptedOut(w.actor(sara))).toBe(false);
  });
});
