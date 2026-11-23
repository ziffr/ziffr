// @ts-nocheck
// Invitations, domain joining and roles through the core, against the real database (ticket #16).
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { acceptInvitation, createInviteLink, decideJoinRequest, invitationFor, inviteByEmail, joinableWorkspaces, openJoinRequests, requestToJoin, revokeInvitation, setJoinDomain, setRole } from "./invitations";
import { createMetric } from "./metrics";
import { createDashboard } from "./dashboards";
import { createDeck } from "./decks";
import { submitValue } from "./submissions";
import { workspace } from "./test/db-fixtures";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const roleOf = async (wsId: string, person: string) => (await db().from("memberships").select("role").eq("workspace_id", wsId).eq("user_id", person).maybeSingle()).data?.role ?? null;
/** A person who is in no workspace yet (as after a first sign-in). */
async function newcomer(w: Awaited<ReturnType<typeof ws>>) {
  const id = await w.person("guest");
  await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", id);
  return id;
}

describe("invitations", () => {
  it("bring the invited address in with its role, once", async () => {
    const w = await ws(); const sara = await w.person("owner"); const nia = await newcomer(w);
    const t = (await inviteByEmail(w.actor(sara), { email: "Nia@Example.test", role: "admin" })).token;
    expect(await invitationFor(t)).toMatchObject({ role: "admin", forEmail: "nia@example.test", usable: true });
    await expect(acceptInvitation({ personId: nia, verifiedEmail: "someone@else.test" }, t)).rejects.toThrow(/for nia@example.test/);
    await expect(acceptInvitation({ personId: nia, verifiedEmail: null }, t)).rejects.toThrow();
    await acceptInvitation({ personId: nia, verifiedEmail: "nia@example.test" }, t);
    expect(await roleOf(w.id, nia)).toBe("admin");
    await expect(acceptInvitation({ personId: nia, verifiedEmail: "nia@example.test" }, t)).rejects.toThrow(/does not work any more/);
  });
  it("are made by Owners and Admins only, Owners only by Owners, and never in the demo", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member");
    await expect(inviteByEmail(w.actor(ben, "member"), { email: "x@y.test", role: "member" })).rejects.toEqual(forbidden);
    await expect(inviteByEmail(w.actor(ad, "admin"), { email: "x@y.test", role: "owner" })).rejects.toEqual(forbidden);
    await inviteByEmail(w.actor(ad, "admin"), { email: "x@y.test", role: "member" });
    await expect(createInviteLink(w.actor(sara), "admin" as never)).rejects.toEqual(forbidden);
    await expect(inviteByEmail({ personId: "sara", workspaceId: "d3e00000-0000-4000-8000-000000000001", role: "owner" }, { email: "x@y.test", role: "member" })).rejects.toEqual(forbidden);
  });
  it("by link work for several people until revoked", async () => {
    const w = await ws(); const sara = await w.person("owner"); const a = await newcomer(w); const b = await newcomer(w); const c = await newcomer(w);
    const t = await createInviteLink(w.actor(sara), "guest");
    await acceptInvitation({ personId: a, verifiedEmail: null }, t);
    await acceptInvitation({ personId: b, verifiedEmail: null }, t);
    expect([await roleOf(w.id, a), await roleOf(w.id, b)]).toEqual(["guest", "guest"]);
    const { data: inv } = await db().from("invitations").select("id").eq("token", t).single();
    const other = await ws("Other"); const zoe = await other.person("owner");
    await expect(revokeInvitation(other.actor(zoe), inv!.id)).rejects.toEqual(forbidden);
    await revokeInvitation(w.actor(sara), inv!.id);
    await expect(acceptInvitation({ personId: c, verifiedEmail: null }, t)).rejects.toThrow(/does not work any more/);
  });
  it("turn a Contact into a member who keeps their values", async () => {
    const w = await ws(); const sara = await w.person("owner"); const cleo = await w.contact({ email: "cleo@field.test" });
    const m = await w.metric(sara); const code = await w.token(m.id, cleo);
    await submitValue({ source: "web_form", sender: code, text: "5" });
    const account = await newcomer(w);
    const t = (await inviteByEmail(w.actor(sara), { email: "cleo@field.test", role: "member", contactPersonId: cleo })).token;
    await acceptInvitation({ personId: account, verifiedEmail: "cleo@field.test" }, t);
    const { data: values } = await db().from("observations").select("submitter_id").eq("metric_id", m.id);
    expect(values!.map((v) => v.submitter_id)).toEqual([account]);
    expect((await db().from("contacts").select("person_id").eq("person_id", cleo)).data).toEqual([]);
    expect((await db().from("tokens").select("submitter_id").eq("code", code).single()).data!.submitter_id).toBe(account);
  });
});

describe("roles", () => {
  it("are changed by Owners and Admins; only Owners touch Owners; the last Owner stays", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member");
    await expect(setRole(w.actor(ben, "member"), ad, "guest")).rejects.toEqual(forbidden);
    await setRole(w.actor(ad, "admin"), ben, "guest");
    expect(await roleOf(w.id, ben)).toBe("guest");
    await expect(setRole(w.actor(ad, "admin"), sara, "member")).rejects.toEqual(forbidden);
    await expect(setRole(w.actor(sara), sara, "member")).rejects.toThrow(/at least one Owner/);
    await setRole(w.actor(sara), ad, "owner");
    await setRole(w.actor(sara), sara, "member");
    expect(await roleOf(w.id, sara)).toBe("member");
  });
  it("make a Guest unable to create anything", async () => {
    const w = await ws(); const gus = await w.person("guest");
    await expect(createMetric(w.actor(gus, "guest"), { name: "X" })).rejects.toEqual(forbidden);
    await expect(createDashboard(w.actor(gus, "guest"), "X")).rejects.toEqual(forbidden);
    await expect(createDeck(w.actor(gus, "guest"), "X")).rejects.toEqual(forbidden);
  });
});

describe("domain joining", () => {
  it("is off until an Owner sets their own company domain, and each request needs approval", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ad = await w.person("admin");
    const nia = await newcomer(w); const who = { personId: nia, verifiedEmail: "nia@acme-bikes.test" };
    expect(await joinableWorkspaces(who)).toEqual([]);
    await expect(setJoinDomain(w.actor(ad, "admin"), "ad@acme-bikes.test", true)).rejects.toEqual(forbidden);
    await expect(setJoinDomain(w.actor(sara), "sara@gmail.com", true)).rejects.toThrow(/public mail provider/);
    await setJoinDomain(w.actor(sara), "sara@acme-bikes.test", true);
    expect((await joinableWorkspaces(who)).map((x) => x.id)).toEqual([w.id]);
    expect(await joinableWorkspaces({ personId: nia, verifiedEmail: null })).toEqual([]);
    await requestToJoin(who, w.id);
    await requestToJoin(who, w.id);
    expect(await roleOf(w.id, nia)).toBeNull();
    const [req] = await openJoinRequests(w.actor(ad, "admin"));
    await decideJoinRequest(w.actor(ad, "admin"), req.id, true);
    expect(await roleOf(w.id, nia)).toBe("member");
    await setJoinDomain(w.actor(sara), null, false);
  });
  it("refuses asking to join a workspace of another domain", async () => {
    const w = await ws(); const sara = await w.person("owner"); await setJoinDomain(w.actor(sara), "sara@acme-bikes.test", true);
    const nia = await newcomer(w);
    await expect(requestToJoin({ personId: nia, verifiedEmail: "nia@other.test" }, w.id)).rejects.toEqual(forbidden);
    await setJoinDomain(w.actor(sara), null, false);
  });
});

describe("after the review of #16", () => {
  it("never leaves a workspace without an Owner, even when two Owners demote each other at once", async () => {
    const w = await ws(); const a = await w.person("owner"); const b = await w.person("owner");
    const results = await Promise.allSettled([setRole(w.actor(a), b, "member"), setRole(w.actor(b), a, "member")]);
    expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(1);
    const { count } = await db().from("memberships").select("user_id", { count: "exact", head: true }).eq("workspace_id", w.id).eq("role", "owner");
    expect(count).toBeGreaterThanOrEqual(1);
  });
  it("refuses removing the last Owner in the database itself", async () => {
    const w = await ws(); const a = await w.person("owner");
    const { error } = await db().from("memberships").delete().eq("workspace_id", w.id).eq("user_id", a);
    expect(error?.message).toMatch(/at least one Owner/);
  });
  it("does not hand out invitation tokens in the list", async () => {
    const w = await ws(); const sara = await w.person("owner");
    await createInviteLink(w.actor(sara), "member");
    const [first] = await import("./invitations").then((m) => m.openInvitations(w.actor(sara)));
    expect(first).not.toHaveProperty("token");
  });
});
