// The Number Style against the real database (spec 0022, ticket #108): it follows the Workspace Profile's country
// until an Owner or Admin picks one, nobody else picks it, never in the demo, only one of the four keys; audited.
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { numberStyleOf, setNumberStyle, setWorkspaceProfile, workspaceNumberStyle } from "./workspace-settings";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }

describe("the Number Style", () => {
  it("follows the country until an Owner or Admin picks one, and is audited", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("admin"); const gus = await w.person("guest");
    const owner = w.actor(sara);
    expect(await workspaceNumberStyle(owner)).toEqual({ style: "1,234.5", chosen: false, fromCountry: null });
    // A country set after the workspace was made still gives it its style.
    await setWorkspaceProfile(owner, { country: "DE" });
    expect(await workspaceNumberStyle(w.actor(gus, "guest"))).toEqual({ style: "1.234,5", chosen: false, fromCountry: "DE" });
    await setWorkspaceProfile(owner, { country: "CH" });
    expect(await numberStyleOf(w.id)).toBe("1'234.5");
    await setWorkspaceProfile(owner, { country: "US" });
    expect(await numberStyleOf(w.id)).toBe("1,234.5");

    // Picked, it is stored and the country no longer moves it.
    expect(await setNumberStyle(owner, "1 234,5")).toBe("1 234,5");
    await setWorkspaceProfile(owner, { country: "DE" });
    expect(await workspaceNumberStyle(owner)).toEqual({ style: "1 234,5", chosen: true, fromCountry: null });
    await setNumberStyle(w.actor(ann, "admin"), "1,234.5");
    expect(await numberStyleOf(w.id)).toBe("1,234.5");
    // The same style again changes nothing and records nothing.
    await setNumberStyle(owner, "1,234.5");
    const { data } = await db().from("audit_events").select("kind, details").eq("workspace_id", w.id).eq("kind", "workspace.number_style_changed").order("id");
    expect(data?.map((r) => r.details)).toEqual([{ from: null, followed: "country", to: "1 234,5" }, { from: "1 234,5", to: "1,234.5" }]);
  });

  it("refuses Members, Guests, Access Keys, the demo and anything that is not one of the four keys", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(setNumberStyle(w.actor(ben, "member"), "1.234,5")).rejects.toEqual(expect.any(Forbidden));
    await expect(setNumberStyle(w.actor(gus, "guest"), "1.234,5")).rejects.toEqual(expect.any(Forbidden));
    await expect(setNumberStyle({ ...w.actor(sara), key: { id: "k1", scopes: ["values:write"] } } as never, "1.234,5")).rejects.toEqual(expect.any(Forbidden));
    await expect(setNumberStyle({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "1.234,5")).rejects.toEqual(expect.any(Forbidden));
    for (const bad of ["1.234.5", "de", "", null, 1234.5, "1 234,5 ", "1 234,5"]) await expect(setNumberStyle(w.actor(sara), bad)).rejects.toThrow(/Number Style/);
    expect(await workspaceNumberStyle(w.actor(ben, "member"))).toEqual({ style: "1,234.5", chosen: false, fromCountry: null });
    // The column's check holds even for a write that skips the core.
    const { error } = await db().from("workspaces").update({ number_style: "1.234.5" }).eq("id", w.id);
    expect(error).not.toBeNull();
  });
});
