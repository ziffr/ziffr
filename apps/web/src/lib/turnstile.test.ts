// The check against bots on the sign-in form (spec 0021, ticket 8): passed only on Cloudflare's "success": true for
// this Ziffr's secret; closed when Cloudflare cannot be asked. Cloudflare itself is stood in for at the fetch boundary.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { turnstilePassed, turnstileSiteKey } = await import("./turnstile");

const ENV = { ZIFFR_TURNSTILE_SITE_KEY: "site", ZIFFR_TURNSTILE_SECRET: "secret" };
afterEach(() => { vi.unstubAllGlobals(); });
const cloudflare = (answer: unknown, ok = true) => {
  const calls: { url: string; body: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { body: URLSearchParams }) => {
    calls.push({ url, body: String(init.body) });
    return { ok, json: async () => answer };
  });
  return calls;
};

describe("Turnstile", () => {
  it("is off, and passes everything, without both settings", async () => {
    expect(turnstileSiteKey({ ZIFFR_TURNSTILE_SITE_KEY: "site" })).toBeNull();
    expect(await turnstilePassed(undefined, null, {})).toBe(true);
  });

  it("asks Cloudflare with the secret, the answer and the address, and passes on success only", async () => {
    const calls = cloudflare({ success: true });
    expect(await turnstilePassed("answer", "203.0.113.7", ENV)).toBe(true);
    expect(calls[0].url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(calls[0].body).toBe("secret=secret&response=answer&remoteip=203.0.113.7");
    cloudflare({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await turnstilePassed("answer", null, ENV)).toBe(false);
    cloudflare({ success: "true" });
    expect(await turnstilePassed("answer", null, ENV)).toBe(false);
  });

  it("refuses a missing or oversized answer without asking, and stays closed when Cloudflare fails", async () => {
    const calls = cloudflare({ success: true });
    expect(await turnstilePassed("", null, ENV)).toBe(false);
    expect(await turnstilePassed(undefined, null, ENV)).toBe(false);
    expect(await turnstilePassed("x".repeat(3000), null, ENV)).toBe(false);
    expect(calls).toHaveLength(0);
    cloudflare({ success: true }, false);
    expect(await turnstilePassed("answer", null, ENV)).toBe(false);
    vi.stubGlobal("fetch", async () => { throw new Error("offline"); });
    expect(await turnstilePassed("answer", null, ENV)).toBe(false);
  });
});
