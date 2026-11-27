import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";

const getClaims = vi.hoisted(() => vi.fn(async () => ({ data: { claims: { sub: "u1" } } })));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims } }) }));
vi.mock("@/lib/auth-settings", () => ({ authSettings: () => ({ url: "http://auth.test", anonKey: "k" }) }));

import { config, middleware } from "./middleware";

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

describe("the middleware and the Admin Address (spec 0066)", () => {
  afterEach(() => { delete process.env.ZIFFR_ADMIN_URL; delete process.env.ZIFFR_SITE_URL; });
  const at = (host: string, path: string, headers: Record<string, string> = {}) => middleware(new NextRequest(`http://${host}${path}`, { headers: { host, cookie: "sb-x-auth-token=abc", ...headers } }));
  const set = () => { process.env.ZIFFR_ADMIN_URL = "https://admin.example.com"; process.env.ZIFFR_SITE_URL = "https://app.example.com"; };

  it("unset, serves the panel wherever Ziffr answers", async () => {
    expect((await at("app.example.com", "/installation/users")).status).toBe(200);
  });

  it("set, serves the panel only there, and there nothing but signing in and the panel", async () => {
    set();
    expect((await at("app.example.com", "/installation")).status).toBe(404);
    expect((await at("app.example.com", "/installation/users")).status).toBe(404);
    expect((await at("app.example.com", "/metrics")).status).toBe(200);
    expect((await at("admin.example.com", "/installation/users")).status).toBe(200);
    expect((await at("admin.example.com", "/login")).status).toBe(200);
    for (const path of ["/metrics", "/api/v1/metrics", "/v/abc", "/demo", "/mcp"]) expect((await at("admin.example.com", path)).status).toBe(404);
    expect(new URL((await at("admin.example.com", "/")).headers.get("location")!).pathname).toBe("/installation");
  });

  it("set, does not take a forwarded header's word for it", async () => {
    set();
    expect((await at("app.example.com", "/installation", { "x-forwarded-host": "admin.example.com" })).status).toBe(404);
    expect((await at("app.example.com", "/", { "x-forwarded-host": "admin.example.com" })).status).toBe(404);
  });
});

describe("the headers only the middleware may set", () => {
  const OWN = ["x-ziffr-view-link", "x-ziffr-no-count", "x-ziffr-first-steps", "x-ziffr-use-pack"];
  const matches = (url: string, headers?: Record<string, string>) => unstable_doesMiddlewareMatch({ config, url, headers });
  // What reaches the app: Next lists the request's headers as the middleware left them.
  const passedOn = (res: Response) => (res.headers.get("x-middleware-override-headers") ?? "").split(",");

  it("are removed on paths that end like files too", async () => {
    for (const path of ["/first-steps.png", "/metrics/x.svg", "/flags/x", "/_next/static/x.js"]) {
      expect(matches(path)).toBe(false);
      for (const name of OWN) expect(matches(path, { [name]: "1" })).toBe(true);
      const res = await middleware(new NextRequest(`http://localhost:3000${path}`, { headers: { ...Object.fromEntries(OWN.map((n) => [n, "1"])), accept: "*/*" } }));
      expect(res.headers.get("location")).toBeNull();
      expect(passedOn(res)).toContain("accept");
      for (const name of OWN) expect(passedOn(res)).not.toContain(name);
    }
  });

  it("are removed from a page that does not set them", async () => {
    const res = await middleware(withSession("/metrics", "; other=1"));
    for (const name of OWN) expect(passedOn(res)).not.toContain(name);
  });
});
