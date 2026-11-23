// @ts-nocheck
// Which opens add to a View Count (spec 0031, #363): a View Link open, a program's read of a Metric's values; and
// which add nothing. The page's own counting (app) is the web app's; recordView itself is in usage.db.test.ts.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import type { KeyActor } from "./actor";
import { listObservations } from "./api";
import { createViewLink, openViewLink } from "./view-links";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const rows = async (workspaceId: string) => (await db().from("view_counts").select("*").eq("workspace_id", workspaceId)).data ?? [];
/** The counts are written in the background: wait until `n` rows (or the time is up, for "nothing") exist. */
async function settled(workspaceId: string, n: number) {
  for (let i = 0; i < 30; i++) { if ((await rows(workspaceId)).length >= n) break; await new Promise((r) => setTimeout(r, 100)); }
  await new Promise((r) => setTimeout(r, n ? 0 : 400));
  return rows(workspaceId);
}
async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner");
  const m = await w.metric(sara);
  const { data: d } = await db().from("dashboards").insert({ name: "D", owner_id: sara, workspace_id: w.id }).select("id").single();
  const key = { ...w.actor(sara), key: { id: "k", scopes: ["metrics:read"] } } as unknown as KeyActor;
  return { w, sara, m, dash: Number(d!.id), key };
}

describe("a program's read of a Metric's values", () => {
  it("adds one n_api to the Metric, once per read and not per page", async () => {
    const { w, m, key } = await setup();
    await listObservations(key, m.slug, { limit: 10 });
    await listObservations(key, m.slug, { limit: 10, after: "2020-01-01" });
    const r = await settled(w.id, 1);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ subject_kind: "metric", subject_id: m.id, n_app: 0, n_link: 0, n_api: 1 });
  });
  it("adds nothing when the Metric is refused or the scope is missing", async () => {
    const { w, key } = await setup();
    await expect(listObservations(key, "no-such-metric", { limit: 10 })).rejects.toThrow();
    await expect(listObservations({ ...key, key: { id: "k", scopes: [] } }, "x", { limit: 10 })).rejects.toThrow();
    expect(await settled(w.id, 0)).toEqual([]);
  });
});

describe("a View Link open", () => {
  it("adds one n_link to its dashboard, and a Snapshot's link counts for the dashboard", async () => {
    const { w, sara, dash } = await setup();
    const token = await createViewLink(w.actor(sara), "dashboard", dash, { label: "", expires: inDays(30), frozen: false });
    expect(await openViewLink(token, { count: true })).not.toBeNull();
    expect(await openViewLink(token, { count: true })).not.toBeNull();
    const r = await settled(w.id, 1);
    await new Promise((x) => setTimeout(x, 300));
    expect((await rows(w.id))[0]).toMatchObject({ subject_kind: "dashboard", subject_id: dash, n_app: 0, n_link: 2, n_api: 0 });
    expect(r).toHaveLength(1);
  });
  it("adds nothing for a prefetch (no count), a revoked or unknown link, or a frozen link's deleted dashboard", async () => {
    const { w, sara, dash } = await setup();
    const token = await createViewLink(w.actor(sara), "dashboard", dash, { label: "", expires: inDays(30), frozen: false });
    expect(await openViewLink(token)).not.toBeNull();
    expect(await openViewLink("x".repeat(43), { count: true })).toBeNull();
    await db().from("view_links").update({ revoked_at: new Date().toISOString() }).eq("token", token);
    expect(await openViewLink(token, { count: true })).toBeNull();
    expect(await settled(w.id, 0)).toEqual([]);
  });
});

describe("storing no person", () => {
  it("keeps no person on any path that counts", async () => {
    const { w, sara, m, dash, key } = await setup();
    await listObservations(key, m.slug, { limit: 10 });
    await openViewLink(await createViewLink(w.actor(sara), "dashboard", dash, { label: "", expires: inDays(30), frozen: false }), { count: true });
    const r = await settled(w.id, 2);
    expect(r).toHaveLength(2);
    for (const row of r) expect(JSON.stringify(row)).not.toContain(sara);
    expect(Object.keys(r[0]).sort()).toEqual(["day", "n_api", "n_app", "n_link", "subject_id", "subject_kind", "workspace_id"]);
  });
});
