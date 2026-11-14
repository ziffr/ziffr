// Access Keys through the core, against the real database (ticket #18).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type KeyActor } from "./actor";
import { db } from "./db";
import { actorForKey, createAccessKey, listAccessKeys, readMetrics, revokeAccessKey, submitWithKey } from "./access-keys";
import { createMetric } from "./metrics";
import { share } from "./sharing";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("Access Keys", () => {
  it("are shown once, stored only as a hash, and act as their creator within their scopes", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const mine = await w.metric(ben, { name: "Mine" }); const hidden = await w.metric(sara, { name: "Hidden" });
    const { secret, id } = await createAccessKey(w.actor(ben, "member"), { name: "Script", scopes: ["metrics:read"], expiresOn: inDays(30) });
    const { data: row } = await db().from("access_keys").select("*").eq("id", id).single();
    // The random part after "zk_<prefix>_" (it may itself contain "_"): never stored.
    expect(JSON.stringify(row)).not.toContain(secret.slice("zk_".length + 12 + 1));
    expect(JSON.stringify(await listAccessKeys(w.actor(ben, "member")))).not.toContain(secret);
    const key = (await actorForKey(secret))!;
    expect(key).toMatchObject({ personId: ben, workspaceId: w.id, role: "member" });
    expect((await readMetrics(key)).map((m) => m.id)).toEqual([mine.id]);
    await share(w.actor(sara), "metric", hidden.id, ben, "viewer");
    expect((await readMetrics(key)).map((m) => m.id).sort()).toEqual([mine.id, hidden.id].sort());
    await expect(submitWithKey(key, mine.id, 5)).rejects.toEqual(forbidden);
  });
  it("submit values only with the scope, and only where the creator has a Token", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const m = await w.metric(sara); const other = await w.metric(sara); await w.token(m.id, ben);
    const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Feed", scopes: ["values:submit"], expiresOn: inDays(30) });
    const key = (await actorForKey(secret))!;
    expect((await submitWithKey(key, m.id, 42)).ok).toBe(true);
    await expect(submitWithKey(key, other.id, 1)).rejects.toEqual(forbidden);
    await expect(readMetrics(key)).rejects.toEqual(forbidden);
  });
  it("stop when revoked, when they end, or when their creator leaves; a wrong secret is nothing", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const make = async () => (await createAccessKey(w.actor(ben, "member"), { name: "K", scopes: ["metrics:read"], expiresOn: inDays(10) }));
    const a = await make(); const b = await make(); const c = await make();
    await revokeAccessKey(w.actor(sara), a.id);
    expect(await actorForKey(a.secret)).toBeNull();
    await db().from("access_keys").update({ expires_on: inDays(-1) }).eq("id", b.id);
    expect(await actorForKey(b.secret)).toBeNull();
    expect(await actorForKey(c.secret.slice(0, -1) + (c.secret.endsWith("A") ? "B" : "A"))).toBeNull();
    expect(await actorForKey("zk_nonsense")).toBeNull();
    await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", ben);
    expect(await actorForKey(c.secret)).toBeNull();
  });
  it("are seen by their creator and the workspace's Owners and Admins, and revoked by their creator and Owners", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member"); const ada = await w.person("admin");
    const { id } = await createAccessKey(w.actor(ben, "member"), { name: "Ben's", scopes: ["metrics:read"], expiresOn: inDays(10) });
    expect(await listAccessKeys(w.actor(ann, "member"))).toEqual([]);
    expect((await listAccessKeys(w.actor(sara))).map((k) => k.id)).toEqual([id]);
    expect((await listAccessKeys(w.actor(ada, "admin"))).map((k) => k.id)).toEqual([id]);
    await expect(revokeAccessKey(w.actor(ann, "member"), id)).rejects.toEqual(forbidden);
    await expect(revokeAccessKey(w.actor(ada, "admin"), id)).rejects.toEqual(forbidden);
    expect((await listAccessKeys(w.actor(sara)))[0].revoked).toBe(false);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(revokeAccessKey(other.actor(zoe), id)).rejects.toEqual(forbidden);
    await revokeAccessKey(w.actor(ben, "member"), id);
  });
  it("end within a year, need a scope, and cannot do what only people do", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await expect(createAccessKey(w.actor(sara), { name: "K", scopes: ["metrics:read"], expiresOn: inDays(400) })).rejects.toThrow(/within a year/);
    await expect(createAccessKey(w.actor(sara), { name: "K", scopes: [], expiresOn: inDays(10) })).rejects.toThrow(/may do/);
    const { secret } = await createAccessKey(w.actor(sara), { name: "K", scopes: ["metrics:read", "values:submit"], expiresOn: inDays(10) });
    const key = (await actorForKey(secret)) as KeyActor;
    // @ts-expect-error A key is not a person's Actor: core functions refuse it at compile time...
    await expect(createMetric(key, { name: "From a key" })).rejects.toEqual(forbidden); // ...and at run time.
  });
});
