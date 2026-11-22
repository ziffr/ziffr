// Pinned dashboards (ticket #509; GLOSSARY: Pinned Dashboard) against the real database: pinning only what the person
// may open, the limit of eight, the order, sight lost and regained, Guests, other people and Workspaces, the demo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { createDashboard } from "./dashboards";
import { db } from "./db";
import { DemoReadOnly } from "./demo";
import { MAX_PINNED, pinDashboard, pinnedDashboards, setPinnedOrder, unpinDashboard } from "./pinned-dashboards";
import { share } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const names = async (a: Parameters<typeof pinnedDashboards>[0]) => (await pinnedDashboards(a)).map((d) => d.name);

describe("pinning", () => {
  it("lists pins in the order they were made, pins one once, and unpins", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const x = await createDashboard(a, "X"); const y = await createDashboard(a, "Y"); const z = await createDashboard(a, "Z");
    await pinDashboard(a, y); await pinDashboard(a, x); await pinDashboard(a, y);
    expect(await pinnedDashboards(a)).toEqual([{ id: y, name: "Y" }, { id: x, name: "X" }]);
    await pinDashboard(a, z);
    await unpinDashboard(a, y);
    await unpinDashboard(a, y);
    expect(await names(a)).toEqual(["X", "Z"]);
    // Positions stay 0, 1 without gaps.
    const { data } = await db().from("pinned_dashboards").select("position").eq("workspace_id", w.id).order("position");
    expect(data?.map((r) => r.position)).toEqual([0, 1]);
  });

  it("is each person's own list", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const d = await createDashboard(w.actor(sara), "Sales"); await share(w.actor(sara), "dashboard", d, ben, "viewer");
    await pinDashboard(w.actor(sara), d);
    expect(await pinnedDashboards(w.actor(ben, "member"))).toEqual([]);
    await unpinDashboard(w.actor(ben, "member"), d);
    expect(await names(w.actor(sara))).toEqual(["Sales"]);
  });

  it("pins only a dashboard the person may open, and never a key's", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const hers = await createDashboard(w.actor(sara), "Payroll");
    await expect(pinDashboard(w.actor(ben, "member"), hers)).rejects.toEqual(expect.any(Forbidden));
    await expect(pinDashboard(w.actor(ben, "member"), 1.5)).rejects.toEqual(expect.any(Forbidden));
    await expect(pinDashboard({ ...w.actor(sara), key: { id: "k", scopes: ["dashboards:read"] } } as never, hers)).rejects.toEqual(expect.any(Forbidden));
    const other = await ws("Other"); const zoe = await other.person("owner");
    const zoes = await createDashboard(other.actor(zoe), "Elsewhere");
    await expect(pinDashboard(w.actor(sara), zoes)).rejects.toEqual(expect.any(Forbidden));
    expect(await pinnedDashboards(w.actor(ben, "member"))).toEqual([]);
  });

  it("lets a Guest pin the dashboards shared with them, and no others", async () => {
    const w = await ws(); const sara = await w.person("owner"); const gus = await w.person("guest"); const g = w.actor(gus, "guest");
    const open = await createDashboard(w.actor(sara), "Open"); const closed = await createDashboard(w.actor(sara), "Closed");
    await share(w.actor(sara), "dashboard", open, gus, "viewer");
    await pinDashboard(g, open);
    await expect(pinDashboard(g, closed)).rejects.toEqual(expect.any(Forbidden));
    expect(await names(g)).toEqual(["Open"]);
  });
});

describe("the limit", () => {
  it("allows eight and says why the ninth is refused, then lets one go in its place", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const ids: number[] = [];
    for (let i = 0; i < MAX_PINNED + 1; i++) ids.push(await createDashboard(a, `D${i}`));
    for (const id of ids.slice(0, MAX_PINNED)) await pinDashboard(a, id);
    await expect(pinDashboard(a, ids[MAX_PINNED])).rejects.toThrow(/up to 8 dashboards/);
    await pinDashboard(a, ids[0]);
    await unpinDashboard(a, ids[0]);
    await pinDashboard(a, ids[MAX_PINNED]);
    expect((await pinnedDashboards(a)).length).toBe(MAX_PINNED);
  });

  it("holds when many are pinned at once", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const ids: number[] = [];
    for (let i = 0; i < MAX_PINNED + 3; i++) ids.push(await createDashboard(a, `D${i}`));
    await Promise.allSettled(ids.map((id) => pinDashboard(a, id)));
    expect((await pinnedDashboards(a)).length).toBe(MAX_PINNED);
  });
});

describe("the order", () => {
  it("puts pins in the order given and refuses a list that is not exactly the pins", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const [x, y, z] = [await createDashboard(a, "X"), await createDashboard(a, "Y"), await createDashboard(a, "Z")];
    for (const id of [x, y, z]) await pinDashboard(a, id);
    await setPinnedOrder(a, [z, x, y]);
    expect(await names(a)).toEqual(["Z", "X", "Y"]);
    await expect(setPinnedOrder(a, [z, x])).rejects.toThrow(/changed/);
    await expect(setPinnedOrder(a, [z, x, y, 999999])).rejects.toThrow(/changed/);
    await expect(setPinnedOrder(a, [z, z, x])).rejects.toEqual(expect.any(Forbidden));
    await expect(setPinnedOrder(a, "nope" as never)).rejects.toEqual(expect.any(Forbidden));
    await expect(setPinnedOrder(a, [1.5, 2, 3])).rejects.toEqual(expect.any(Forbidden));
    expect(await names(a)).toEqual(["Z", "X", "Y"]);
  });

  it("cannot reorder what the person has not pinned", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const d = await createDashboard(w.actor(sara), "Sales"); await share(w.actor(sara), "dashboard", d, ben, "viewer");
    await pinDashboard(w.actor(sara), d);
    await expect(setPinnedOrder(w.actor(ben, "member"), [d])).rejects.toThrow(/changed/);
  });
});

describe("sight", () => {
  it("drops a dashboard that is no longer shared, quietly, and shows it again when it is shared again", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const b = w.actor(ben, "member");
    const sales = await createDashboard(w.actor(sara), "Sales"); const mine = await createDashboard(b, "Mine");
    await share(w.actor(sara), "dashboard", sales, ben, "viewer");
    await pinDashboard(b, sales); await pinDashboard(b, mine);
    expect(await names(b)).toEqual(["Sales", "Mine"]);
    await db().from("shares").delete().eq("object_type", "dashboard").eq("object_id", sales);
    expect(await names(b)).toEqual(["Mine"]);
    await share(w.actor(sara), "dashboard", sales, ben, "viewer");
    expect(await names(b)).toEqual(["Sales", "Mine"]);
  });

  it("does not let hidden pins use up the places, and keeps the order of the rest", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const b = w.actor(ben, "member");
    const theirs: number[] = [];
    for (let i = 0; i < 4; i++) { const d = await createDashboard(w.actor(sara), `S${i}`); await share(w.actor(sara), "dashboard", d, ben, "viewer"); theirs.push(d); await pinDashboard(b, d); }
    await db().from("shares").delete().eq("object_type", "dashboard").in("object_id", theirs);
    const mine: number[] = [];
    for (let i = 0; i < MAX_PINNED; i++) { const d = await createDashboard(b, `M${i}`); mine.push(d); await pinDashboard(b, d); }
    expect(await names(b)).toEqual(mine.map((_, i) => `M${i}`));
  });

  it("goes away with the dashboard", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = w.actor(sara);
    const d = await createDashboard(a, "Gone"); await pinDashboard(a, d);
    await db().from("dashboards").delete().eq("id", d);
    expect(await pinnedDashboards(a)).toEqual([]);
  });
});

describe("the demo", () => {
  it("refuses with the demo's sentence, whatever is asked", async () => {
    const demo = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
    const { data } = await db().from("dashboards").select("id").eq("workspace_id", DEMO_WORKSPACE_ID).limit(1).single();
    await expect(pinDashboard(demo, data!.id)).rejects.toEqual(expect.any(DemoReadOnly));
    await expect(unpinDashboard(demo, data!.id)).rejects.toEqual(expect.any(DemoReadOnly));
    await expect(setPinnedOrder(demo, [])).rejects.toEqual(expect.any(DemoReadOnly));
    // The seed's pins stay as they were.
    expect((await pinnedDashboards(demo)).length).toBeGreaterThan(0);
  });

  it("is seeded with pinned dashboards for Sara and Ben, in order", async () => {
    const sara = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
    const ben = { personId: "ben", workspaceId: DEMO_WORKSPACE_ID, role: "admin" as const };
    expect(await names(sara)).toEqual(["Monthly overview", "Weekly numbers", "Board stories"]);
    expect(await names(ben)).toEqual(["Operations", "Monthly overview"]);
  });
});
