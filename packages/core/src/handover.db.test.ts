// Handover when someone leaves, through the core, against the real database (ticket #17).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { removeMember } from "./handover";
import { createDashboard } from "./dashboards";
import { createDeck } from "./decks";
import { share } from "./sharing";
import { createGroup, setGroupMember } from "./team";
import { saveWorkflow } from "./workflows";
import { ask } from "./questions";
import { actorForKey, createAccessKey } from "./access-keys";
import { listVersions } from "./version-history";
import { periodStart } from "./format";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ownerOf = async (table: string, id: number) => (await db().from(table).select("owner_id").eq("id", id).single()).data!.owner_id;

describe("handover when someone leaves", () => {
  it("passes everything they own to the successor, ends what let them act, and shows in the history", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const m = await w.metric(ben); await w.token(m.id, ben); const other = await w.metric(sara); await w.token(other.id, ben);
    const d = await createDashboard(w.actor(ben, "member"), "Ben's board");
    const deck = await createDeck(w.actor(ben, "member"), "Ben's deck");
    const wf = await saveWorkflow(w.actor(sara), null, "Close", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [ben] }] });
    await share(w.actor(sara), "metric", other.id, ben, "viewer");
    await createGroup(w.actor(sara), "Ops");
    const { data: g } = await db().from("groups").select("id").eq("workspace_id", w.id).eq("name", "Ops").single();
    await setGroupMember(w.actor(sara), g!.id, ben, true);
    const task = await ask(w.actor(sara), { metricId: other.id, period: periodStart(new Date(), "month"), assigneeId: ben, text: "Please check", kind: "task" });
    const { secret } = await createAccessKey(w.actor(ben, "member"), { name: "Ben's script", scopes: ["metrics:read"], expiresOn: inDays(30) });

    await removeMember(w.actor(sara), ben, ann);

    expect([await ownerOf("metrics", m.id), await ownerOf("dashboards", d), await ownerOf("decks", deck)]).toEqual([ann, ann, ann]);
    const { data: flow } = await db().from("workflows").select("config").eq("id", wf).single();
    expect(JSON.stringify(flow!.config)).toContain(ann);
    expect(JSON.stringify(flow!.config)).not.toContain(ben);
    expect((await db().from("actions").select("assignee_id").eq("id", task).single()).data!.assignee_id).toBe(ann);
    expect((await db().from("tokens").select("id").eq("workspace_id", w.id).eq("submitter_id", ben)).data).toEqual([]);
    expect((await db().from("shares").select("id").eq("workspace_id", w.id).eq("user_id", ben)).data).toEqual([]);
    expect((await db().from("group_members").select("user_id").eq("group_id", g!.id)).data).toEqual([]);
    expect((await db().from("memberships").select("user_id").eq("workspace_id", w.id).eq("user_id", ben)).data).toEqual([]);
    expect(await actorForKey(secret)).toBeNull();
    const { versions } = await listVersions(w.actor(ann, "member"), "dashboard", d);
    expect(versions[0].message).toMatch(/^Handed over from .+ to .+/);
  });
  it("is done by Owners and Admins only; only Owners remove Owners; the last Owner stays", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member"); const ann = await w.person("member");
    await expect(removeMember(w.actor(ben, "member"), ann, sara)).rejects.toEqual(forbidden);
    await expect(removeMember(w.actor(ad, "admin"), sara, ann)).rejects.toEqual(forbidden);
    await expect(removeMember(w.actor(sara), sara, ann)).rejects.toEqual(forbidden);
    await removeMember(w.actor(ad, "admin"), ben, ann);
  });
  it("needs a successor who is another member and not a Guest, from the same workspace", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const gus = await w.person("guest");
    await expect(removeMember(w.actor(sara), ben, gus)).rejects.toThrow(/not a Guest/);
    await expect(removeMember(w.actor(sara), ben, ben)).rejects.toThrow(/not a Guest/);
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(removeMember(w.actor(sara), ben, zoe)).rejects.toThrow(/not a Guest/);
    expect((await db().from("memberships").select("user_id").eq("workspace_id", w.id).eq("user_id", ben)).data).toHaveLength(1);
  });
});

describe("after the review of #17", () => {
  it("keeps approvers in order, touches only Workflows naming the person, and ends their View Links, threads and invite links", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member"); const cy = await w.person("member");
    const ordered = await saveWorkflow(w.actor(sara), null, "Ordered", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [cy, ben, sara] }] });
    const untouched = await saveWorkflow(w.actor(sara), null, "Other", { dueWorkingDays: 2, steps: [{ type: "approve", approvers: [sara, cy] }] });
    const before = (await db().from("workflows").select("config").eq("id", untouched).single()).data!.config;
    const m = await w.metric(ben); const d = await createDashboard(w.actor(ben, "member"), "Ben's");
    const { createViewLink, openViewLink } = await import("./view-links");
    const token = await createViewLink(w.actor(ben, "member"), "dashboard", d, { label: "", expires: inDays(5), frozen: false });
    const asked = await ask(w.actor(ben, "member"), { metricId: m.id, period: periodStart(new Date(), "month"), assigneeId: cy, text: "Why?" });
    const { createInviteLink } = await import("./invitations");
    const link = await createInviteLink(w.actor(sara), "member");

    await removeMember(w.actor(sara), ben, ann);

    const steps = (await db().from("workflows").select("config").eq("id", ordered).single()).data!.config.steps as { approvers: string[] }[];
    expect(steps[0].approvers).toEqual([cy, ann, sara]);
    expect((await db().from("workflows").select("config").eq("id", untouched).single()).data!.config).toEqual(before);
    expect(await openViewLink(token)).toBeNull();
    expect((await db().from("actions").select("asker_id").eq("id", asked).single()).data!.asker_id).toBe(ann);
    expect((await db().from("invitations").select("revoked_at").eq("token", link).single()).data!.revoked_at).not.toBeNull();
  });
  it("checks in the database that only Owners remove Owners", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    // An Admin's check passed for a Member who is made Owner just before the handover runs.
    await db().from("memberships").update({ role: "owner" }).eq("workspace_id", w.id).eq("user_id", ben);
    const { error } = await db().rpc("hand_over", { ws: w.id, leaving: ben, successor: sara, actor_role: "admin" });
    expect(error?.message).toMatch(/only Owners remove an Owner/);
  });
});
