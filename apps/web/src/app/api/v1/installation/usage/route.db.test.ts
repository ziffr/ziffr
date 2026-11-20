// GET /api/v1/installation/usage over HTTP (spec 0031, ticket #365): a Usage Key opens it, everything else gets a bare
// 404, and a bad range is a 400. What the figures hold is proven in the core's installation-usage.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { makeUsageKey } from "@ziffr/core/installation-usage";
import { installationAdmin, workspace } from "@ziffr/core/test/db-fixtures";
import { GET } from "./route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); delete process.env.ZIFFR_JOB_SECRET; });
const call = (key: string | null, qs = "") => GET(new Request(`http://ziffr.test/api/v1/installation/usage${qs}`, { headers: key ? { authorization: `Bearer ${key}` } : {} }));

describe("GET /installation/usage", () => {
  it("answers a Usage Key with days, and nothing else gets anything but a bare 404", async () => {
    const a = await installationAdmin(); cleanups.push(a.cleanup);
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const access = await createAccessKey(w.actor(sara), { name: "p", scopes: ["metrics:read"], expiresOn: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10) });
    process.env.ZIFFR_JOB_SECRET = "j".repeat(40);
    const { secret } = await makeUsageKey(a.actor);
    for (const bad of [null, "wrong", access.secret, "j".repeat(40)]) {
      const res = await call(bad);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    }
    const ok = await call(secret);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(Array.isArray((await ok.json()).days)).toBe(true);
  });
  it("refuses a bad range with 400 and a Usage Key past its calls with 429", async () => {
    const a = await installationAdmin(); cleanups.push(a.cleanup);
    const { secret } = await makeUsageKey(a.actor);
    expect((await call(secret, "?from=yesterday")).status).toBe(400);
    expect((await call(secret, "?from=2020-01-01&to=2022-01-01")).status).toBe(400);
    expect((await call(secret, "?from=2026-11-01&to=2026-10-01")).status).toBe(400);
  });
});
