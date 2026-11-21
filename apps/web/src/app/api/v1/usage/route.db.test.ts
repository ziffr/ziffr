// GET /api/v1/usage over HTTP (ticket #370; GLOSSARY: Usage, Access Key): the scope, the creator's role, the shape of the
// answer, 400 for a bad range, and that the remote MCP Server cannot reach it. The core's rules are proven in
// api-usage.db.test.ts.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { workspace } from "@ziffr/core/test/db-fixtures";
import { matchRoute } from "@/lib/api-in-process";
import { GET } from "./route";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); await w.person("admin"); await w.person("member");
  const get = async (scopes: Scope[], query = "") => {
    const { secret } = await createAccessKey(w.actor(sara), { name: "Program", scopes, expiresOn: inDays(30) });
    return GET(new Request(`http://ziffr.test/api/v1/usage${query}`, { headers: { authorization: `Bearer ${secret}` } }), undefined as never);
  };
  return { w, sara, get };
}

describe("GET /api/v1/usage", () => {
  it("answers the days, the state and what was left out, with no store", async () => {
    const { get } = await setup();
    const res = await get(["usage:read"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store|private/);
    const body = await res.json();
    expect(body.days).toHaveLength(30);
    expect(body.state).toHaveProperty("workspace_metrics", 0);
    expect(Array.isArray(body.withheld)).toBe(true);
  });

  it("takes from and to, and answers 400 for a range it cannot", async () => {
    const { get } = await setup();
    const yesterday = inDays(-1);
    expect((await (await get(["usage:read"], `?from=${yesterday}&to=${yesterday}`)).json()).days).toHaveLength(1);
    expect((await get(["usage:read"], "?from=not-a-day")).status).toBe(400);
    expect((await get(["usage:read"], `?from=2020-01-01&to=${yesterday}`)).status).toBe(400);
  });

  it("is 403 for a key without the scope, and 401 without a key", async () => {
    const { get } = await setup();
    const res = await get(["metrics:read"]);
    expect(res.status).toBe(403);
    expect((await res.json()).error.message).toContain("usage:read");
    expect((await GET(new Request("http://ziffr.test/api/v1/usage"), undefined as never)).status).toBe(401);
  });

  it("is not reachable from the MCP Server's in-process calls", () => {
    expect(matchRoute("usage")).toBeNull();
  });
});
