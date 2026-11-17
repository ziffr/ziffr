// Access Keys and Feeds in a Trial Workspace, against the real database (spec 0021, ticket 7): at most two of each
// that work, also when made at once, and none working past the trial's last day. Outside a trial, nothing changes.
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "./access-keys";
import { db } from "./db";
import { createFeed, createFeedKey } from "./feeds";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** A Trial Workspace ending in `days`, with its Owner. */
async function trial(days = 7) {
  const w = await workspace("Trial");
  cleanups.push(async () => {
    await db().from("access_keys").delete().eq("workspace_id", w.id);
    await w.cleanup();
  });
  await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() + days * 86_400_000).toISOString() }).eq("id", w.id);
  const owner = await w.person("owner");
  return { ...w, owner, actor: w.actor(owner) };
}

describe("Access Keys in a trial", () => {
  it("are at most two that work, also when made at once, and end with the trial", async () => {
    const t = await trial(7);
    const made = await Promise.allSettled([0, 1, 2, 3].map((i) => createAccessKey(t.actor, { name: `k${i}`, scopes: ["metrics:read"], expiresOn: day(200) })));
    expect(made.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((made.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message).toMatch(/at most 2 Access Keys/);
    const { data } = await db().from("access_keys").select("expires_on").eq("workspace_id", t.id);
    expect(data!.every((k) => k.expires_on <= day(7))).toBe(true);
  });

  it("make room again when one is revoked", async () => {
    const t = await trial();
    const a = await createAccessKey(t.actor, { name: "a", scopes: ["metrics:read"], expiresOn: day(3) });
    await createAccessKey(t.actor, { name: "b", scopes: ["metrics:read"], expiresOn: day(3) });
    await db().from("access_keys").update({ revoked_at: new Date().toISOString() }).eq("id", a.id);
    await createAccessKey(t.actor, { name: "c", scopes: ["metrics:read"], expiresOn: day(3) });
  });

  it("are not limited outside a trial", async () => {
    const w = await workspace();
    cleanups.push(async () => { await db().from("access_keys").delete().eq("workspace_id", w.id); await w.cleanup(); });
    const sara = await w.person("owner");
    for (let i = 0; i < 3; i++) await createAccessKey(w.actor(sara), { name: `k${i}`, scopes: ["metrics:read"], expiresOn: day(200) });
    const { data } = await db().from("access_keys").select("expires_on").eq("workspace_id", w.id);
    expect(data!.map((k) => k.expires_on)).toEqual([day(200), day(200), day(200)]);
  });
});

describe("Feeds in a trial", () => {
  it("are at most two, also when made at once, with at most two keys each that end with the trial", async () => {
    const t = await trial(5);
    const names = ["A", "B", "C"].map((n) => `${n}-${t.id.slice(0, 8)}`);
    const feeds = await Promise.allSettled(names.map((n) => createFeed(t.actor, n)));
    expect(feeds.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((feeds.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message).toMatch(/at most 2 Feeds/);
    // A refused Feed leaves no person row behind.
    const { count: rows } = await db().from("profiles").select("id", { count: "exact", head: true }).eq("role", "Feed").in("name", names);
    const { count: feedRows } = await db().from("feeds").select("person_id", { count: "exact", head: true }).eq("workspace_id", t.id);
    expect(feedRows).toBe(2);
    expect(rows).toBe(2);
    const feed = (feeds.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>).value.id;
    const keys = await Promise.allSettled([0, 1, 2].map((i) => createFeedKey(t.actor, feed, { name: `fk${i}`, expiresOn: day(300) })));
    expect(keys.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    expect((keys.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message).toMatch(/at most 2 keys/);
    const { data } = await db().from("access_keys").select("expires_on").eq("feed_id", feed);
    expect(data!.every((k) => k.expires_on <= day(5))).toBe(true);
    // A Feed's keys and a person's keys are counted apart.
    await createAccessKey(t.actor, { name: "own", scopes: ["metrics:read"], expiresOn: day(3) });
  });
});
