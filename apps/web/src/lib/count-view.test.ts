// What is not an open (spec 0031): a prefetch, a HEAD. A plain page request is.
import { describe, expect, it, vi } from "vitest";

let sent: Record<string, string> = {};
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers(sent) }));
vi.mock("next/server", () => ({ after: () => {} }));

describe("isNotAnOpen", () => {
  it("is true for prefetches and HEAD, false for a plain request", async () => {
    const { isNotAnOpen } = await import("./count-view");
    for (const h of <Record<string, string>[]>[{ "next-router-prefetch": "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }, { "x-ziffr-no-count": "1" }]) { sent = h; expect(await isNotAnOpen()).toBe(true); }
    sent = { accept: "text/html" };
    expect(await isNotAnOpen()).toBe(false);
  });
});
