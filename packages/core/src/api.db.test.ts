// The API's core functions with an Access Key, against the real database (spec 0002, ticket #46).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { actorForKey, createAccessKey } from "./access-keys";
import { listMetrics } from "./api";
import { db } from "./db";
import { share } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("listMetrics", () => {
  it("lists only what the key's creator sees, a page at a time, and nothing of another workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const a = await w.metric(ben, { name: "A" }); const b = await w.metric(ben, { name: "B" }); const c = await w.metric(sara, { name: "C" });
    const hidden = await w.metric(sara, { name: "Hidden" });
    await share(w.actor(sara), "metric", c.id, ben, "viewer");
    const other = await ws("Other"); const zoe = await other.person("owner"); await other.metric(zoe, { name: "Elsewhere" });
    const key = (await actorForKey((await createAccessKey(w.actor(ben, "member"), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(30) })).secret))!;
    const first = await listMetrics(key, { limit: 2 });
    expect(first.items.map((m) => m.slug)).toEqual([a.slug, b.slug]);
    expect(first.next).toBe(b.id);
    const second = await listMetrics(key, { after: first.next, limit: 2 });
    expect(second).toEqual({ items: [expect.objectContaining({ slug: c.slug, name: "C", derived: false })], next: null });
    expect(JSON.stringify([first, second])).not.toContain(hidden.slug);
    expect(Object.keys(second.items[0])).not.toContain("owner_id");
  });
  it("refuses a key without metrics:read", async () => {
    const w = await ws(); const ben = await w.person("member");
    const key = (await actorForKey((await createAccessKey(w.actor(ben, "member"), { name: "Feed", scopes: ["values:submit"], expiresOn: inDays(30) })).secret))!;
    await expect(listMetrics(key, { limit: 10 })).rejects.toEqual(expect.any(Forbidden));
  });
  it("ignore a key that ended up in the demo workspace", async () => {
    const w = await ws(); const ben = await w.person("member");
    const { id, secret } = await createAccessKey(w.actor(ben, "member"), { name: "Moved", scopes: ["metrics:read"], expiresOn: inDays(30) });
    expect(await actorForKey(secret)).not.toBeNull();
    const { error } = await db().from("access_keys").update({ workspace_id: DEMO_WORKSPACE_ID }).eq("id", id);
    expect(error).toBeNull();
    expect(await actorForKey(secret)).toBeNull();
  });
});
