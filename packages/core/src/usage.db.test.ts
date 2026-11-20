// View Counts against the real database (spec 0031, #362): counted once per call, never by whom, never in the demo.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { pruneViewCounts, recordView } from "./usage";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
async function dashboard(w: Awaited<ReturnType<typeof ws>>, owner: string) {
  const { data } = await db().from("dashboards").insert({ name: "D", owner_id: owner, workspace_id: w.id }).select("id").single();
  return Number(data!.id);
}
const rows = async (workspaceId: string) => (await db().from("view_counts").select("*").eq("workspace_id", workspaceId)).data ?? [];

describe("recordView", () => {
  it("counts once per call and per way, and sets usage_since with the first count", async () => {
    const w = await ws(); const sara = await w.person("owner"); const m = await w.metric(sara); const d = await dashboard(w, sara);
    await db().from("workspaces").update({ usage_since: null }).eq("id", w.id);
    await recordView(w.actor(sara), { kind: "dashboard", id: d });
    await recordView(w.actor(sara), { kind: "dashboard", id: d });
    await recordView(w.actor(sara), { kind: "metric", id: m.id }, "api");
    const r = await rows(w.id);
    expect(r.find((x) => x.subject_kind === "dashboard")).toMatchObject({ n_app: 2, n_link: 0, n_api: 0 });
    expect(r.find((x) => x.subject_kind === "metric")).toMatchObject({ n_app: 0, n_api: 1 });
    expect((await db().from("workspaces").select("usage_since").eq("id", w.id).single()).data!.usage_since).toBe(new Date().toISOString().slice(0, 10));
  });
  it("counts nothing for a subject of another Workspace, a bad id, or the demo", async () => {
    const a = await ws(); const b = await ws(); const sara = await a.person("owner"); const ben = await b.person("owner");
    const bm = await b.metric(ben); const bd = await dashboard(b, ben);
    await recordView(a.actor(sara), { kind: "metric", id: bm.id });
    await recordView(a.actor(sara), { kind: "dashboard", id: bd }, "api");
    await recordView(a.actor(sara), { kind: "deck", id: -1 });
    await recordView(a.actor(sara), { kind: "metric", id: 1.5 });
    await recordView({ workspaceId: DEMO_WORKSPACE_ID }, { kind: "metric", id: bm.id });
    expect(await rows(a.id)).toEqual([]);
    expect(await rows(b.id)).toEqual([]);
    expect(await rows(DEMO_WORKSPACE_ID)).toEqual([]);
  });
  it("never throws, even for a Workspace that does not exist", async () => {
    await expect(recordView({ workspaceId: "00000000-0000-4000-8000-0000000000ff" }, { kind: "metric", id: 1 })).resolves.toBeUndefined();
  });
  it("is forgotten with its subject", async () => {
    const w = await ws(); const sara = await w.person("owner"); const d = await dashboard(w, sara);
    await recordView(w.actor(sara), { kind: "dashboard", id: d });
    await db().from("dashboards").delete().eq("id", d);
    expect(await rows(w.id)).toEqual([]);
  });
});

describe("storing no person", () => {
  it("keeps exactly these columns: a new one, a person above all, fails here", async () => {
    const w = await ws(); const sara = await w.person("owner"); const d = await dashboard(w, sara);
    await recordView(w.actor(sara), { kind: "dashboard", id: d });
    expect(Object.keys((await rows(w.id))[0]).sort()).toEqual(["day", "n_api", "n_app", "n_link", "subject_id", "subject_kind", "workspace_id"]);
    await db().from("usage_counts").insert({ day: "2026-01-01", kind: "api_calls", workspace_id: w.id, n: 3 });
    const { data } = await db().from("usage_counts").select("*").eq("workspace_id", w.id);
    expect(Object.keys(data![0]).sort()).toEqual(["day", "kind", "n", "workspace_id"]);
  });
});

describe("retention", () => {
  it("deletes counts older than 400 days and nothing newer", async () => {
    const w = await ws(); const sara = await w.person("owner"); const d = await dashboard(w, sara);
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    await db().from("view_counts").insert([401, 400, 399, 1].map((n) => ({ workspace_id: w.id, day: day(n), subject_kind: "dashboard", subject_id: d, n_app: 1 })));
    expect(await pruneViewCounts()).toBeGreaterThanOrEqual(1);
    expect((await rows(w.id)).map((r) => r.day).sort()).toEqual([day(400), day(399), day(1)].sort());
  });
});
