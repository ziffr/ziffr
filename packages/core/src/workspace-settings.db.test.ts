// Workspace settings against the real database (spec 0006, tickets #96 and #97): Owners and Admins rename the
// workspace and set its Workspace Profile, nobody else, never in the demo, never outside the lists or another workspace.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { renameWorkspace, setWorkspaceProfile, workspaceName, workspaceProfile } from "./workspace-settings";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace("Before"); cleanups.push(w.cleanup); return w; }
const EMPTY = { industry: null, segment: null, country: null, currency: null, employeeBand: null, revenueBand: null };
const FULL = { industry: "saas", segment: "b2b", country: "DE", currency: "EUR", employeeBand: "11-50", revenueBand: "1m-10m" };

describe("the workspace's name", () => {
  it("is changed by Owners and Admins, in their own workspace only", async () => {
    const w = await ws(); const other = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const zoe = await other.person("owner");
    await renameWorkspace(w.actor(sara), "  Acme   Analytics ");
    expect(await workspaceName(w.actor(sara))).toBe("Acme Analytics");
    await renameWorkspace(w.actor(ann, "admin"), "Acme");
    expect(await workspaceName(w.actor(sara))).toBe("Acme");
    expect(await workspaceName(other.actor(zoe))).toBe("Before");
  });
  it("refuses Members, Guests, the demo and bad names", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(renameWorkspace(w.actor(ben, "member"), "Mine")).rejects.toEqual(expect.any(Forbidden));
    await expect(renameWorkspace(w.actor(gus, "guest"), "Mine")).rejects.toEqual(expect.any(Forbidden));
    await expect(renameWorkspace({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "Mine")).rejects.toEqual(expect.any(Forbidden));
    for (const name of ["", "  ", "x".repeat(81), "Acme\u202Eevil", "Ac\u200Bme", "A\u0000B", 7, null]) await expect(renameWorkspace(w.actor(sara), name)).rejects.toThrow(/name/);
    expect(await workspaceName(w.actor(sara))).toBe("Before");
  });
});

describe("the Workspace Profile", () => {
  it("is empty at first, set and cleared by Owners and Admins, and read by every member", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const gus = await w.person("guest");
    expect(await workspaceProfile(w.actor(gus, "guest"))).toEqual(EMPTY);
    expect(await setWorkspaceProfile(w.actor(sara), FULL)).toEqual(FULL);
    expect(await workspaceProfile(w.actor(gus, "guest"))).toEqual(FULL);
    await setWorkspaceProfile(w.actor(ann, "admin"), { ...FULL, revenueBand: null, segment: "" });
    expect(await workspaceProfile(w.actor(sara))).toEqual({ ...FULL, revenueBand: null, segment: null });
  });
  it("refuses Members, Guests, the demo, values outside the lists, and never touches another workspace", async () => {
    const w = await ws(); const other = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest"); const zoe = await other.person("owner");
    await setWorkspaceProfile(other.actor(zoe), FULL);
    await expect(setWorkspaceProfile(w.actor(ben, "member"), FULL)).rejects.toEqual(expect.any(Forbidden));
    await expect(setWorkspaceProfile(w.actor(gus, "guest"), FULL)).rejects.toEqual(expect.any(Forbidden));
    await expect(setWorkspaceProfile({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, FULL)).rejects.toEqual(expect.any(Forbidden));
    for (const bad of [{ industry: "crypto" }, { segment: "B2B" }, { country: "XX" }, { country: "de" }, { currency: "BTC" }, { employeeBand: "10" }, { revenueBand: { gt: 1 } }])
      await expect(setWorkspaceProfile(w.actor(sara), { ...FULL, ...bad })).rejects.toThrow(/from the list/);
    expect(await workspaceProfile(w.actor(sara))).toEqual(EMPTY);
    await setWorkspaceProfile(w.actor(sara), { industry: "retail" });
    expect(await workspaceProfile(other.actor(zoe))).toEqual(FULL);
  });
  it("is held to the lists by the database too", async () => {
    const w = await ws();
    const { error } = await db().from("workspaces").update({ currency: "XYZ" }).eq("id", w.id);
    expect(error?.code).toBe("23514");
  });
});
