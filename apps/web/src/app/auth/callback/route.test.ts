import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const exchange = vi.hoisted(() => vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })));
const personFor = vi.hoisted(() => vi.fn(async () => "p1"));
const recordSignIn = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/auth", () => ({
  authClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
  DEMO_COOKIE: "ziffr-demo",
  demoOnly: () => process.env.ZIFFR_DEMO_ONLY === "1",
  personFor,
}));
vi.mock("@ziffr/core/audit-log", () => ({ recordSignIn }));
vi.mock("@/lib/sign-in", () => ({ safeNext: (n: string | null) => n ?? "/", SITE_URL: "http://site.test" }));

import { GET } from "./route";

const call = () => GET(new NextRequest("http://localhost:3000/auth/callback?code=abc&next=/metrics"));

describe("the sign-in callback", () => {
  afterEach(() => { delete process.env.ZIFFR_DEMO_ONLY; vi.clearAllMocks(); });

  it("in a demo-only Ziffr goes to /login with no query and makes no person and no Audit Log entry", async () => {
    process.env.ZIFFR_DEMO_ONLY = "1";
    const res = await call();
    expect(res.headers.get("location")).toBe("http://site.test/login");
    expect(exchange).not.toHaveBeenCalled();
    expect(personFor).not.toHaveBeenCalled();
    expect(recordSignIn).not.toHaveBeenCalled();
  });

  it("elsewhere signs in and goes on as before", async () => {
    const res = await call();
    expect(res.headers.get("location")).toBe("http://site.test/metrics");
    expect(personFor).toHaveBeenCalled();
    expect(recordSignIn).toHaveBeenCalled();
  });
});
