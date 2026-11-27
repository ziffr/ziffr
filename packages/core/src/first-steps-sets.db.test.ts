// First Steps' ready-made sets against the real database (spec 0067; GLOSSARY: First Steps, Pack, Pack Audience): Owners
// and Admins get the offered list ordered by the Workspace's answers, a person alone gets none while there is none for private use, a Member, a
// Guest, an Access Key and the demo get none, a browser can open only an offered Pack by its id, and nothing is written.
import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { db } from "./db";
import { firstStepsSet, firstStepsSets } from "./first-steps-sets";
import { listInstalledPacks } from "./packs";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { setWorkspaceProfile } from "./workspace-settings";

const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => { for (const w of made.splice(0)) await w.cleanup(); });
async function fresh() {
  const w = await workspace("Sets Co");
  made.push(w);
  const owner = w.actor(await w.person("owner"), "owner");
  const admin = w.actor(await w.person("admin"), "admin");
  const member = w.actor(await w.person("member"), "member");
  const guest = w.actor(await w.person("guest"), "guest");
  return { w, owner, admin, member, guest };
}
const others = (owner: Actor) => [
  { ...owner, key: { id: 1, scopes: ["metrics:read"] } } as unknown as Actor,
  { ...owner, workspaceId: DEMO_WORKSPACE_ID },
];

describe("firstStepsSets", () => {
  it("gives an Owner and an Admin the offered sets, best fit first with the reason", async () => {
    const { owner, admin } = await fresh();
    await setWorkspaceProfile(owner, { industry: "ecommerce", segment: "b2c" });
    const r = await firstStepsSets(owner);
    expect(r.alone).toBe(false);
    expect(r.sets).toHaveLength(10);
    expect(r.sets[0]).toMatchObject({ id: "ziffr/online-shop", match: "Matches your business and customers" });
    expect(r.sets.map((s) => s.id)).not.toContain("ziffr/board-meeting");
    expect(await firstStepsSets(admin)).toEqual(r);
  });

  it("gives a Workspace for one person no set, whatever the topic says", async () => {
    const { owner } = await fresh();
    const { error } = await db().from("workspaces").update({ used_by: "me" }).eq("id", owner.workspaceId);
    expect(error).toBeNull();
    for (const topic of [undefined, "money", "club", "nonsense", { topic: "club" }]) {
      expect(await firstStepsSets(owner, topic)).toEqual({ alone: true, sets: [] });
    }
    for (const id of ["ziffr/sales", "ziffr/sports-club"]) await expect(firstStepsSet(owner, id, "club")).rejects.toThrow("not offered");
  });

  it("gives a Member, a Guest, an Access Key and the demo none", async () => {
    const { owner, member, guest } = await fresh();
    for (const actor of [member, guest, ...others(owner)]) {
      expect((await firstStepsSets(actor)).sets).toEqual([]);
      await expect(firstStepsSet(actor, "ziffr/sales")).rejects.toThrow("not offered");
    }
  });
});

describe("firstStepsSet", () => {
  it("opens an offered set's Preview for an Owner and an Admin, and installs nothing", async () => {
    const { owner, admin } = await fresh();
    for (const actor of [owner, admin]) {
      const preview = await firstStepsSet(actor, "ziffr/sales");
      expect(preview.manifest.id).toBe("ziffr/sales");
      expect(preview.items.some((i) => i.kind === "dashboard")).toBe(true);
    }
    expect(await listInstalledPacks(owner)).toEqual([]);
  });

  it("refuses a Pack that is not offered and anything that is not one of the ids", async () => {
    const { owner } = await fresh();
    for (const id of ["ziffr/board-meeting", "ziffr/workspace-usage", "ziffr/ziffr-operations", "ziffr/none", "../sales", "ziffr--sales", "", null, 3, ["ziffr/sales"], { id: "ziffr/sales" }]) {
      await expect(firstStepsSet(owner, id)).rejects.toThrow("not offered");
    }
  });
});
