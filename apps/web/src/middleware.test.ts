import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getClaims = vi.hoisted(() => vi.fn(async () => ({ data: { claims: { sub: "u1" } } })));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims } }) }));
vi.mock("@/lib/auth-settings", () => ({ authSettings: () => ({ url: "http://auth.test", anonKey: "k" }) }));

import { middleware } from "./middleware";

const withSession = (path: string, extra = "") => new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: `sb-x-auth-token=abc; sb-x-auth-token.0=def${extra}` } });
const cleared = (res: Response) => res.headers.getSetCookie().filter((c) => /^sb-x-auth-token/.test(c) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)).length;

describe("the middleware and a real session", () => {
  afterEach(() => { delete process.env.ZIFFR_DEMO_ONLY; getClaims.mockClear(); });

  it("in a demo-only Ziffr sends a leftover session to the demo entry unchecked and clears its cookies", async () => {
    process.env.ZIFFR_DEMO_ONLY = "1";
    const res = await middleware(withSession("/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
    expect(cleared(res)).toBe(2);
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("in a demo-only Ziffr leaves the demo visit alone but still clears the session", async () => {
    process.env.ZIFFR_DEMO_ONLY = "1";
    const res = await middleware(withSession("/", `; ziffr-demo=${"a".repeat(32)}`));
    expect(res.headers.get("location")).toBeNull();
    expect(cleared(res)).toBe(2);
  });

  it("in a demo-only Ziffr does not send a leftover session to the confirm page", async () => {
    process.env.ZIFFR_DEMO_ONLY = "1";
    const res = await middleware(withSession("/demo"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    expect(res.headers.getSetCookie().some((c) => c.startsWith("ziffr-demo="))).toBe(true);
    expect(getClaims).not.toHaveBeenCalled();
  });

  it("elsewhere keeps a real session: it passes and nothing is cleared", async () => {
    const res = await middleware(withSession("/"));
    expect(res.headers.get("location")).toBeNull();
    expect(cleared(res)).toBe(0);
    expect(getClaims).toHaveBeenCalled();
  });

  it("elsewhere sends a request without a session to /login, remembering where it was going", async () => {
    getClaims.mockResolvedValueOnce({ data: { claims: null as never } });
    const res = await middleware(new NextRequest("http://localhost:3000/metrics?x=1"));
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("next")).toBe("/metrics?x=1");
  });

  it("elsewhere sends a stale session to the confirm page of the demo as before", async () => {
    const res = await middleware(withSession("/demo"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/demo/confirm");
  });
});
