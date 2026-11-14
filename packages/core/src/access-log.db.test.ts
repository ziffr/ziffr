// The Access Log and the API's limits, against the real database (spec 0002, ticket #47).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { actorForKey, createAccessKey } from "./access-keys";
import { accessLog, admitCall, recordCall, REQUESTS_PER_MINUTE } from "./access-log";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const forbidden = expect.any(Forbidden);

async function keyFor(w: Awaited<ReturnType<typeof ws>>, person: string, role: "owner" | "member" = "member") {
  const { id, secret } = await createAccessKey(w.actor(person, role), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(30) });
  return { id, key: (await actorForKey(secret))! };
}
const calls = (keyId: number, n: number, status = 200, at = new Date().toISOString()) =>
  db().from("access_log").insert(Array.from({ length: n }, () => ({ key_id: keyId, method: "GET", route: "/api/v1/metrics", status, at })));

describe("Access Log and limits", () => {
  it(`refuse the call after ${REQUESTS_PER_MINUTE} in a minute, not counting refused ones, and say when to retry`, async () => {
    const w = await ws(); const ben = await w.person("member"); const { id, key } = await keyFor(w, ben);
    await calls(id, REQUESTS_PER_MINUTE - 1);
    await calls(id, 10, 429);
    await calls(id, 30, 200, new Date(Date.now() - 120_000).toISOString());
    expect(await admitCall(key)).toEqual({ ok: true });
    await calls(id, 1);
    const refused = await admitCall(key);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.retryAfter).toBeGreaterThan(0);
    expect(!refused.ok && refused.retryAfter).toBeLessThanOrEqual(60);
  });
  it("record the route without query or slug, and forget calls after 90 days", async () => {
    const w = await ws(); const ben = await w.person("member"); const { id, key } = await keyFor(w, ben);
    await calls(id, 1, 200, new Date(Date.now() - 91 * 86_400_000).toISOString());
    await recordCall(key, { method: "get", path: "/api/v1/metrics?cursor=abc", status: 200 });
    expect(await accessLog(w.actor(ben, "member"), id)).toEqual([{ at: expect.any(String), method: "GET", route: "/api/v1/metrics", status: 200 }]);
    await recordCall(key, { method: "POST", path: "/api/v1/metrics/payroll/observations?from=2026-01-01", status: 404 });
    expect((await accessLog(w.actor(ben, "member"), id))[0].route).toBe("/api/v1/metrics/{slug}/observations");
  });
  it("show a key's log to its creator and the workspace's Owners and Admins only", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("admin"); const max = await w.person("member");
    const { id, key } = await keyFor(w, ben);
    await recordCall(key, { method: "GET", path: "/api/v1/metrics", status: 200 });
    expect(await accessLog(w.actor(ben, "member"), id)).toHaveLength(1);
    expect(await accessLog(w.actor(sara), id)).toHaveLength(1);
    expect(await accessLog(w.actor(ann, "admin"), id)).toHaveLength(1);
    await expect(accessLog(w.actor(max, "member"), id)).rejects.toEqual(forbidden);
    await expect(accessLog(key as never, id)).rejects.toEqual(forbidden);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(accessLog(other.actor(zoe), id)).rejects.toEqual(forbidden);
  });
});
