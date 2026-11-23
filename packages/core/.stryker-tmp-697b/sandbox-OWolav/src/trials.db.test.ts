// @ts-nocheck
// Trial Workspaces through the core, against the real database (spec 0021, ticket 1): made only with the setting,
// one per person, never past the cap, and closed to everyone but their Owner.
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { acceptInvitation, createInviteLink, decideJoinRequest, inviteByEmail, joinableWorkspaces, setJoinDomain } from "./invitations";
import { createWorkspace } from "./page-data";
import { createTrialWorkspace, TrialRefused, trialEndsAt } from "./trials";

const made: { workspaces: string[]; people: string[] } = { workspaces: [], people: [] };
const ENV = ["ZIFFR_TRIAL_DAYS", "ZIFFR_TRIAL_MAX", "ZIFFR_CLOUD_KEY"] as const;
// Trials exist only on hosted Ziffr (spec 0040): every test but the ones about its absence runs with a Ziffr Cloud key.
beforeEach(() => { process.env.ZIFFR_CLOUD_KEY = "k".repeat(32); });
afterEach(async () => {
  for (const k of ENV) delete process.env[k];
  if (made.workspaces.length) await db().from("workspaces").delete().in("id", made.workspaces.splice(0));
  if (made.people.length) await db().from("profiles").delete().in("id", made.people.splice(0));
});

/** A person who just signed in for the first time: in no workspace. */
async function newcomer(email: string | null = null) {
  const id = `t-${randomUUID()}`;
  made.people.push(id);
  const { error } = await db().from("profiles").insert({ id, name: "Trial person", role: "", color: "#000", email });
  if (error) throw error;
  return id;
}
async function trial(personId: string, settings = { days: 7, max: 100_000 }) {
  const id = await createTrialWorkspace(personId, "My trial", settings);
  made.workspaces.push(id);
  return id;
}
const liveTrials = async () => (await db().from("workspaces").select("id", { count: "exact", head: true }).gt("trial_ends_at", new Date().toISOString())).count ?? 0;

describe("making a Trial Workspace", () => {
  it("is what createWorkspace makes when the Installation offers trials, ending after the set days", async () => {
    process.env.ZIFFR_TRIAL_DAYS = "7";
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    const sara = await newcomer();
    const id = await createWorkspace(sara, "Sara's trial");
    made.workspaces.push(id);
    const ends = await trialEndsAt(id);
    expect(ends).not.toBeNull();
    expect(Math.abs(ends!.getTime() - (Date.now() + 7 * 86_400_000))).toBeLessThan(60_000);
    const { data: m } = await db().from("memberships").select("role").eq("workspace_id", id).eq("user_id", sara).single();
    expect(m?.role).toBe("owner");
    // What every new workspace gets comes with it too.
    const { count } = await db().from("themes").select("id", { count: "exact", head: true }).eq("workspace_id", id);
    expect(count).toBe(1);
  });

  it("is not made when the days are 0 (Ziffr Cloud's explicit off): createWorkspace makes an ordinary workspace", async () => {
    process.env.ZIFFR_TRIAL_DAYS = "0";
    const sara = await newcomer();
    const id = await createWorkspace(sara, "Ordinary");
    made.workspaces.push(id);
    expect(await trialEndsAt(id)).toBeNull();
  });

  it("is one per person, also when two sign-ups race", async () => {
    const sara = await newcomer();
    const both = await Promise.allSettled([trial(sara), trial(sara)]);
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = both.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(TrialRefused);
    expect(refused.reason.reason).toBe("taken");
  });

  it("is refused to someone who already belongs to a workspace", async () => {
    const sara = await newcomer();
    const other = randomUUID();
    await db().from("workspaces").insert({ id: other, name: "Elsewhere" });
    made.workspaces.push(other);
    await db().from("memberships").insert({ workspace_id: other, user_id: sara, role: "member" });
    await expect(trial(sara)).rejects.toMatchObject({ reason: "taken" });
  });

  it("stops at the Installation's cap of live trials, and counts no ended one", async () => {
    const live = await liveTrials();
    const a = await newcomer();
    await trial(a, { days: 7, max: live + 1 });
    await expect(trial(await newcomer(), { days: 7, max: live + 1 })).rejects.toMatchObject({ reason: "full" });
    // An ended trial waiting for its cleanup leaves room for a new one.
    await db().from("workspaces").update({ trial_ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", made.workspaces[0]);
    await trial(await newcomer(), { days: 7, max: live + 1 });
  });

  it("refuses settings out of range in the database too", async () => {
    const { error } = await db().rpc("create_trial_workspace", { p_person: await newcomer(), p_name: "x", p_days: 365, p_max: 10 });
    expect(error).not.toBeNull();
  });
});

describe("what a Trial Workspace takes in", () => {
  it("takes no invitation before the Owner's first value, and no invite links or domain joining", async () => {
    const sara = await newcomer("sara@company.test");
    const id = await trial(sara);
    const actor = { personId: sara, workspaceId: id, role: "owner" as const };
    await expect(inviteByEmail(actor, { email: "nia@example.test", role: "member" })).rejects.toThrow(/Invitations open once the Owner has recorded a first value/);
    await expect(createInviteLink(actor, "member")).rejects.toBeInstanceOf(Forbidden);
    await expect(setJoinDomain(actor, "sara@company.test", true)).rejects.toBeInstanceOf(Forbidden);
    const { count } = await db().from("invitations").select("id", { count: "exact", head: true }).eq("workspace_id", id);
    expect(count).toBe(0);
  });

  it("lets nobody in by an invite link or a domain that got there anyway", async () => {
    const sara = await newcomer();
    const id = await trial(sara);
    const t = randomUUID().replace(/-/g, "");
    // A link made before the Workspace was a trial (the database refuses one in a trial before the Owner's first value).
    const { data: ends } = await db().from("workspaces").select("trial_ends_at").eq("id", id).single();
    await db().from("workspaces").update({ trial_ends_at: null }).eq("id", id);
    await db().from("invitations").insert({ workspace_id: id, token: t, role: "member", created_by: sara, expires_at: new Date(Date.now() + 86_400_000).toISOString() });
    await db().from("workspaces").update({ trial_ends_at: ends!.trial_ends_at }).eq("id", id);
    await db().from("workspaces").update({ join_domain: "company.test" }).eq("id", id);
    const nia = await newcomer("nia@company.test");
    await expect(acceptInvitation({ personId: nia, verifiedEmail: "nia@company.test" }, t)).rejects.toBeInstanceOf(Forbidden);
    const { data } = await db().from("memberships").select("user_id").eq("workspace_id", id);
    expect(data?.map((m) => m.user_id)).toEqual([sara]);
    expect((await joinableWorkspaces({ personId: nia, verifiedEmail: "nia@company.test" })).some((w) => w.id === id)).toBe(false);
    const { data: req } = await db().from("join_requests").insert({ workspace_id: id, person_id: nia }).select("id").single();
    await expect(decideJoinRequest({ personId: sara, workspaceId: id, role: "owner" }, req!.id, true)).rejects.toBeInstanceOf(Forbidden);
    const { data: after } = await db().from("memberships").select("user_id").eq("workspace_id", id);
    expect(after?.map((m) => m.user_id)).toEqual([sara]);
  });

  it("is never made from wrong settings: createWorkspace refuses instead of making an ordinary workspace", async () => {
    process.env.ZIFFR_TRIAL_DAYS = "7";
    process.env.ZIFFR_CLOUD_KEY = "k".repeat(32);
    process.env.ZIFFR_TRIAL_DAYS = "7.5";
    const sara = await newcomer();
    await expect(createWorkspace(sara, "Typo")).rejects.toThrow(/ZIFFR_TRIAL_DAYS/);
    const { count } = await db().from("memberships").select("user_id", { count: "exact", head: true }).eq("user_id", sara);
    expect(count).toBe(0);
  });

  it("refuses missing arguments in the database, which would make an ordinary workspace", async () => {
    const sara = await newcomer();
    for (const args of [{ p_days: null, p_max: 10 }, { p_days: 7, p_max: null }]) {
      const { error } = await db().rpc("create_trial_workspace", { p_person: sara, p_name: "x", ...args });
      expect(error).not.toBeNull();
    }
    const { count } = await db().from("memberships").select("user_id", { count: "exact", head: true }).eq("user_id", sara);
    expect(count).toBe(0);
  });
});

describe("trials belong to Ziffr Cloud (spec 0040)", () => {
  it("cannot be made without a Ziffr Cloud key, by createWorkspace or by calling the core directly", async () => {
    delete process.env.ZIFFR_CLOUD_KEY;
    process.env.ZIFFR_TRIAL_DAYS = "7";
    const sara = await newcomer();
    // Days set without the key: no Workspace at all, never an ordinary one with invitations.
    await expect(createWorkspace(sara, "Sara's own")).rejects.toThrow(/cannot be made here/);
    expect((await db().from("memberships").select("user_id", { count: "exact", head: true }).eq("user_id", sara)).count).toBe(0);
    // Without the days it is an ordinary Workspace, which a person may invite colleagues to.
    delete process.env.ZIFFR_TRIAL_DAYS;
    const id = await createWorkspace(sara, "Sara's own");
    made.workspaces.push(id);
    expect(await trialEndsAt(id)).toBeNull();
    // The core's own operation refuses, whatever settings the caller hands it, and makes nothing.
    const bob = await newcomer();
    await expect(createTrialWorkspace(bob, "Direct", { days: 7, max: 100_000 })).rejects.toThrow(/only on hosted Ziffr/);
    process.env.ZIFFR_CLOUD_KEY = "short";
    await expect(createTrialWorkspace(bob, "Direct", { days: 7, max: 100_000 })).rejects.toThrow(/only on hosted Ziffr/);
    const { count } = await db().from("memberships").select("user_id", { count: "exact", head: true }).eq("user_id", bob);
    expect(count).toBe(0);
  });
});
