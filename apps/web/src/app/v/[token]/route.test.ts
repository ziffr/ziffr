// Opening a View Link leaves its token out of the address (GLOSSARY: View Link, lib/view-address.ts).
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { OPEN_SECONDS, tokenFor, viewCookie, viewKey } from "@/lib/view-address";
import { GET } from "./route";

// Made here, not written out, so no scanner takes it for a real one.
const SAMPLE = "for-a-test-only-not-a-real-lin";
const TOKEN = Buffer.from(SAMPLE).toString("base64url");
const open = (token: string, init: { url?: string; headers?: Record<string, string> } = {}) =>
  GET(new NextRequest(init.url ?? `http://ziffr.test/v/${encodeURIComponent(token)}`, { headers: init.headers }), { params: Promise.resolve({ token }) });

describe("opening a View Link", () => {
  it("goes on to an address without the token, relative to the host it was opened on", async () => {
    const res = await open(TOKEN, { url: `http://ziffr.test/v/${TOKEN}?utm=${TOKEN}` });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`/v/open/${viewKey(TOKEN)}`);
    expect(viewKey(TOKEN)).not.toContain(TOKEN.slice(0, 8));
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("keeps the token in a cookie for that link's page alone, which scripts cannot read", async () => {
    const cookies = (await open(TOKEN)).headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain(`${viewCookie(viewKey(TOKEN))}=${TOKEN};`);
    expect(cookies[0]).toContain(`Path=/v/open/${viewKey(TOKEN)};`);
    expect(cookies[0]).toContain(`Max-Age=${OPEN_SECONDS}`);
    expect(cookies[0]).toMatch(/HttpOnly/i);
    expect(cookies[0]).toMatch(/SameSite=lax/i);
    expect(cookies[0]).not.toMatch(/Secure/i);
  });

  it("marks the cookie Secure over HTTPS, also behind a proxy", async () => {
    expect((await open(TOKEN, { headers: { "x-forwarded-proto": "https" } })).headers.getSetCookie()[0]).toMatch(/Secure/i);
    expect((await open(TOKEN, { url: `https://ziffr.test/v/${TOKEN}` })).headers.getSetCookie()[0]).toMatch(/Secure/i);
  });

  it("sets nothing for what cannot be a token and goes on to the page that says so", async () => {
    for (const bad of ["a;b", "x".repeat(201), "a b", "../x"]) {
      const res = await open(bad);
      expect(res.headers.get("location")).toBe("/v/open/gone");
      expect(res.headers.getSetCookie()).toEqual([]);
    }
  });

  it("gives a page only its own link's token", () => {
    const other = `${TOKEN}x`;
    expect(tokenFor(viewKey(TOKEN), TOKEN)).toBe(TOKEN);
    expect(tokenFor(viewKey(TOKEN), other)).toBeNull();
    expect(tokenFor(viewKey(other), TOKEN)).toBeNull();
    expect(tokenFor(viewKey(TOKEN), undefined)).toBeNull();
    expect(tokenFor("gone", TOKEN)).toBeNull();
  });
});
