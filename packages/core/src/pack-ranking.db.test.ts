// recommendedPacks against the real database (spec 0052, ticket 5; GLOSSARY: Pack Audience, Business Function, Workspace
// Profile): Owners and Admins get Ziffr's own Packs ranked by the Workspace Profile and the functions of the people who
// manage it; a Member, a Guest, an Access Key and the demo get nothing; nothing about a Member's function or another
// Workspace reaches the answer; and an installed Pack is marked, never dropped.
import { afterEach, describe, expect, it } from "vitest";
import type { Actor } from "./actor";
import { setMyBusinessFunction } from "./business-function";
import { bundledPacks, installIncludedPack, recommendedPacks } from "./included-packs";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import { setWorkspaceProfile } from "./workspace-settings";

const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => { for (const w of made.splice(0)) await w.cleanup(); });
async function fresh() {
  const w = await workspace("Ranking Co");
  made.push(w);
  const owner = w.actor(await w.person("owner"), "owner");
  const admin = w.actor(await w.person("admin"), "admin");
  const member = w.actor(await w.person("member"), "member");
  const guest = w.actor(await w.person("guest"), "guest");
  return { w, owner, admin, member, guest };
}
const IDS = [...bundledPacks().keys()];
const top = (r: { id: string; suggested: boolean }[]) => r.filter((p) => p.suggested).map((p) => p.id);

describe("recommendedPacks", () => {
  it("lists all thirteen Packs in the fixed order for a Workspace that answered nothing, with none suggested", async () => {
    const { owner } = await fresh();
    const r = await recommendedPacks(owner);
    expect(r.map((p) => p.id)).toEqual(IDS);
    expect(r.every((p) => !p.suggested && p.because.length === 0 && !p.installed)).toBe(true);
    expect(r[0]).toMatchObject({ id: "ziffr/saas-metrics", name: "SaaS metrics" });
    expect(r[0].brings.find((b) => b.kind === "metric")?.count).toBeGreaterThan(0);
  });

  it("ranks by the Workspace Profile, with the reasons", async () => {
    const { owner } = await fresh();
    await setWorkspaceProfile(owner, { industry: "ecommerce", segment: "b2c", country: "DE", currency: "EUR", employeeBand: "11-50", revenueBand: "1m-10m" });
    const r = await recommendedPacks(owner);
    expect(r[0]).toMatchObject({ id: "ziffr/online-shop", suggested: true, because: ["industry", "segment"] });
    expect(r.map((p) => p.id).sort()).toEqual([...IDS].sort());
  });

  it("uses the viewer's own function and the functions of the Workspace's Owners and Admins", async () => {
    const { owner, admin } = await fresh();
    await setMyBusinessFunction(owner, "finance");
    expect(top(await recommendedPacks(owner))).toEqual(["ziffr/saas-metrics", "ziffr/board-meeting", "ziffr/finance"]);
    await setMyBusinessFunction(owner, null);
    await setMyBusinessFunction(admin, "customer_support");
    const r = await recommendedPacks(owner);
    expect(r[0]).toMatchObject({ id: "ziffr/customer-support", because: ["function"], suggested: true });
  });

  it("never lets a Member's function, or another Workspace's, change the answer", async () => {
    const { w, owner, member } = await fresh();
    await setMyBusinessFunction(member, "sales");
    const before = await recommendedPacks(owner);
    expect(before.every((p) => !p.suggested && p.because.length === 0)).toBe(true);
    const other = await fresh();
    await setMyBusinessFunction(other.owner, "people");
    await setWorkspaceProfile(other.owner, { industry: "saas" });
    expect(await recommendedPacks(owner)).toEqual(before);
    expect(w.id).not.toBe(other.w.id);
  });

  it("gives a Member, a Guest, an Access Key and the demo nothing", async () => {
    const { owner, member, guest } = await fresh();
    await setWorkspaceProfile(owner, { industry: "saas" });
    expect(await recommendedPacks(member)).toEqual([]);
    expect(await recommendedPacks(guest)).toEqual([]);
    expect(await recommendedPacks({ ...owner, key: { id: 1, scopes: ["metrics:read"] } } as unknown as Actor)).toEqual([]);
    expect(await recommendedPacks({ ...owner, workspaceId: DEMO_WORKSPACE_ID })).toEqual([]);
  });

  it("carries only the Pack file's words, what it brings and the reasons as keys", async () => {
    const { owner } = await fresh();
    await setWorkspaceProfile(owner, { industry: "saas", segment: "b2b" });
    const [first] = await recommendedPacks(owner);
    expect(Object.keys(first).sort()).toEqual(["because", "brings", "id", "installId", "installed", "logo", "name", "needsOwner", "suggested", "summary"]);
    const text = JSON.stringify(await recommendedPacks(owner));
    expect(text).not.toContain(owner.personId);
    expect(text).not.toContain(owner.workspaceId);
  });

  it("marks an installed Pack and keeps it in the list", async () => {
    const { owner } = await fresh();
    await installIncludedPack(owner, "ziffr/sales");
    const r = await recommendedPacks(owner);
    expect(r).toHaveLength(13);
    expect(r.find((p) => p.id === "ziffr/sales")?.installed).toBe(true);
    expect(r.filter((p) => p.installed)).toHaveLength(1);
  });

  it("changes with the answers and stores nothing", async () => {
    const { owner } = await fresh();
    await setWorkspaceProfile(owner, { industry: "saas" });
    expect((await recommendedPacks(owner))[0].id).toBe("ziffr/saas-metrics");
    await setWorkspaceProfile(owner, { industry: "agency" });
    expect((await recommendedPacks(owner))[0].id).toBe("ziffr/agency");
    await setWorkspaceProfile(owner, {});
    expect((await recommendedPacks(owner)).map((p) => p.id)).toEqual(IDS);
  });
});
