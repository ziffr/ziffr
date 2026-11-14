// GET /api/v1/metrics over HTTP (spec 0002, ticket #46): key sign-in, scope, error shape, paging and headers. What a
// key may see is proven in the core's api.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "@ziffr/core/access-keys";
import { accessLogOf, logCalls, workspace } from "@ziffr/core/test/db-fixtures";
import { GET } from "./route";
import { GET as unknownEndpoint } from "../[...rest]/route";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const call = (path: string, key?: string) => GET(new Request(`http://ziffr.test${path}`, { headers: key ? { authorization: `Bearer ${key}` } : {} }), undefined);

async function setup(scopes: ("metrics:read" | "values:submit")[] = ["metrics:read"]) {
  const w = await workspace(); cleanups.push(w.cleanup);
  const ben = await w.person("member");
  for (const name of ["A", "B", "C"]) await w.metric(ben, { name });
  const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Script", scopes, expiresOn: inDays(30) });
  return Object.assign(secret, { id }) as string & { id: number };
}

describe("GET /api/v1/metrics", () => {
  it("answers 401 without a valid key and 403 without the scope, in the error shape", async () => {
    const none = await call("/api/v1/metrics");
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toBe("Bearer");
    expect(await none.json()).toEqual({ error: { code: "unauthorized", message: expect.any(String) } });
    expect((await call("/api/v1/metrics", "zk_000000000000_" + "a".repeat(43))).status).toBe(401);
    const noScope = await call("/api/v1/metrics", await setup(["values:submit"]));
    expect(noScope.status).toBe(403);
    expect((await noScope.json()).error.code).toBe("forbidden");
  });
  it("pages with an opaque cursor and is never cached", async () => {
    const key = await setup();
    const first = await call("/api/v1/metrics?limit=2", key);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(first.headers.get("access-control-allow-origin")).toBeNull();
    const body = await first.json();
    expect(body.items.map((m: { name: string }) => m.name)).toEqual(["A", "B"]);
    const rest = await (await call(`/api/v1/metrics?limit=2&cursor=${body.next}`, key)).json();
    expect(rest).toEqual({ items: [expect.objectContaining({ name: "C" })], next: null });
  });
  it("answers 400 for a bad limit or cursor", async () => {
    const key = await setup();
    for (const q of ["limit=0", "limit=101", "limit=x", "cursor=nonsense"]) {
      const res = await call(`/api/v1/metrics?${q}`, key);
      expect(res.status, q).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_request");
    }
  });
  it("answers 404 in the API's shape for unknown endpoints", async () => {
    const res = await unknownEndpoint(new Request("http://ziffr.test/api/v1/nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "No such endpoint." } });
    const key = await setup();
    expect((await unknownEndpoint(new Request("http://ziffr.test/api/v1/nope?x=1", { headers: { authorization: `Bearer ${key}` } }))).status).toBe(404);
    expect(await accessLogOf(key.id)).toEqual([expect.objectContaining({ route: "/api/v1/nope", status: 404 })]);
  });
  it("records each call in the Access Log and answers 429 with Retry-After over the limit", async () => {
    const key = await setup();
    expect((await call("/api/v1/metrics?limit=1", key)).status).toBe(200);
    expect(await accessLogOf(key.id)).toEqual([{ method: "GET", route: "/api/v1/metrics", status: 200, submitted: 0 }]);
    await logCalls(key.id, 59);
    const res = await call("/api/v1/metrics", key);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await res.json()).error.code).toBe("rate_limited");
  });
});
