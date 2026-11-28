// Transfer ownership (GLOSSARY: Workspace Role; spec 0071, ticket #1418) through the core, against the real database and
// the local Mailpit: who may do it, to whom, that both are told and the Audit Log has it, and that no Workspace is ever
// left without an Owner.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { acceptInvitation, inviteByEmail, openInvitations, setRole, transferOwnership } from "./invitations";
import { PracticeRefused } from "./practice";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:55424";
const SETTINGS = { ZIFFR_SMTP_URL: process.env.TEST_SMTP_URL ?? "smtp://127.0.0.1:55425", ZIFFR_MAIL_FROM: "Ziffr <ziffr@example.test>", ZIFFR_SITE_URL: "https://ziffr.example.test" };
const saved: Record<string, string | undefined> = {};
beforeAll(() => { for (const [k, v] of Object.entries(SETTINGS)) { saved[k] = process.env[k]; process.env[k] = v; } });
afterAll(() => { for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]; else process.env[k] = v; });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws(name?: string) { const w = await workspace(name); cleanups.push(w.cleanup); return w; }
const forbidden = expect.any(Forbidden);
const address = (who: string) => `${who}-${randomUUID().slice(0, 8)}@example.test`;
async function inbox(to: string) {
  const { messages } = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json() as { messages: { ID: string }[] };
  return Promise.all(messages.map(async (m) => (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json() as Promise<{ Subject: string; Text: string }>));
}
const roles = async (wsId: string) => Object.fromEntries(((await db().from("memberships").select("user_id, role").eq("workspace_id", wsId)).data ?? []).map((m) => [m.user_id as string, m.role as string]));
const logged = async (wsId: string) => (await db().from("audit_events").select("*").eq("workspace_id", wsId).eq("kind", "member.ownership_transferred")).data ?? [];

describe("Transfer ownership", () => {
  it("makes an Admin or a Member the Owner and the former Owner an Admin; nothing else changes; both are told", async () => {
    const w = await ws("Acme Shop");
    const [toSara, toBen] = [address("sara"), address("ben")];
    const sara = await w.person("owner", { email: toSara }); const ola = await w.person("owner");
    const ben = await w.person("member", { email: toBen }); const ad = await w.person("admin");
    const m = await w.metric(sara);

    await transferOwnership(w.actor(sara), ben);
    expect(await roles(w.id)).toEqual({ [sara]: "admin", [ola]: "owner", [ben]: "owner", [ad]: "admin" });
    expect((await db().from("metrics").select("owner_id").eq("id", m.id).single()).data!.owner_id).toBe(sara);
    expect(await logged(w.id)).toHaveLength(1);

    const [theirs] = await inbox(toBen); const [mine] = await inbox(toSara);
    expect(theirs.Subject).toBe("Ownership of a workspace on Ziffr was transferred");
    expect(theirs.Text).toMatch(/“owner \w+” transferred ownership of the workspace “Acme Shop” on Ziffr to you\./);
    expect(mine.Text).toMatch(/You transferred ownership of the workspace “Acme Shop” on Ziffr to “member \w+”/);
    expect(mine.Text).toContain("https://ziffr.example.test/team");
    expect(await inbox(toBen)).toHaveLength(1);
    expect(await inbox(toSara)).toHaveLength(1);

    // An Admin is picked just as well.
    await transferOwnership(w.actor(ola), ad);
    expect(await roles(w.id)).toEqual({ [sara]: "admin", [ola]: "admin", [ben]: "owner", [ad]: "owner" });
  });

  it("is refused to everyone but an Owner, for their own role", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ad = await w.person("admin");
    const ben = await w.person("member"); const gil = await w.person("guest");
    const other = await ws("Other"); const zoe = await other.person("owner");
    const before = await roles(w.id);

    for (const [who, role] of [[ad, "admin"], [ben, "member"], [gil, "guest"]] as const)
      await expect(transferOwnership(w.actor(who, role), ben)).rejects.toEqual(forbidden);
    // A key never does it, even one that carries an Owner.
    await expect(transferOwnership({ ...w.actor(sara), key: { id: 1, kind: "read-write" } } as never, ben)).rejects.toEqual(forbidden);
    // What the session says is not enough: the database checks the role again.
    await expect(transferOwnership(w.actor(ad, "owner"), ben)).rejects.toEqual(forbidden);
    // An Owner of another Workspace is nobody here.
    await expect(transferOwnership(w.actor(zoe), ben)).rejects.toEqual(forbidden);
    expect(await roles(w.id)).toEqual(before);
    expect(await logged(w.id)).toEqual([]);
  });

  it("is refused to a Guest, a Contact, an Owner, oneself or somebody outside as the new Owner", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ola = await w.person("owner");
    const gil = await w.person("guest"); const cleo = await w.contact({ email: address("cleo") });
    const other = await ws("Other"); const zoe = await other.person("member");
    const before = await roles(w.id);

    for (const to of [gil, cleo, ola, sara, zoe, "", "nobody", `${gil}' or true --`])
      await expect(transferOwnership(w.actor(sara), to), to).rejects.toThrow(/Pick an Admin or a Member/);
    expect(await roles(w.id)).toEqual(before);
    expect((await roles(other.id))[zoe]).toBe("member");
    expect(await logged(w.id)).toEqual([]);
  });

  it("is refused in the demo", async () => {
    await expect(transferOwnership({ personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" }, "ben")).rejects.toEqual(forbidden);
  });

  it("is refused in a Practice Workspace", async () => {
    const w = await workspace("Practice", { practice: true }); cleanups.push(w.cleanup);
    const me = await w.person("owner", { id: w.practiceFor! }); const ad = await w.madeUp("admin");
    await expect(transferOwnership(w.actor(me), ad)).rejects.toBeInstanceOf(PracticeRefused);
    expect(await roles(w.id)).toEqual({ [me]: "owner", [ad]: "admin" });
    expect(await logged(w.id)).toEqual([]);
  });

  it("revokes the former Owner's open invitations for the Owner role, and no other", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ola = await w.person("owner"); const ben = await w.person("member");
    const other = await ws("Other"); await other.person("owner", { id: `${sara}-x` });
    const invite = (by: string, role: "owner" | "admin", email = address(role)) => inviteByEmail(w.actor(by), { email, role }, undefined, false).then((r) => ({ ...r, email }));
    const mine = await invite(sara, "owner");
    const kept = [await invite(sara, "admin"), await invite(ola, "owner")];
    // The same person's Owner invitation in another Workspace is none of this transfer's.
    await db().from("memberships").insert({ workspace_id: other.id, user_id: sara, role: "owner" });
    const elsewhere = await inviteByEmail(other.actor(sara, "owner"), { email: address("elsewhere"), role: "owner" }, undefined, false);

    await transferOwnership(w.actor(sara), ben);
    expect((await openInvitations(w.actor(ben, "owner"))).map((i) => i.email).sort()).toEqual(kept.map((k) => k.email).sort());
    await expect(acceptInvitation({ personId: `t-${randomUUID()}`, verifiedEmail: mine.email }, mine.token)).rejects.toThrow(/does not work any more/);
    expect((await db().from("invitations").select("revoked_at").eq("token", elsewhere.token).single()).data!.revoked_at).toBeNull();
    const { data: events } = await db().from("audit_events").select("*").eq("workspace_id", w.id).eq("kind", "invitation.revoked");
    expect(events).toHaveLength(1);
  });

  it("is not undone by a role change that read the role before the transfer", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ad = await w.person("admin"); const ben = await w.person("member");
    // The transfer lands between setRole's read of Ben's role and its write: held at the Metric count a change to Guest makes.
    const client = db();
    const from = client.from.bind(client);
    let raced = false;
    const spy = vi.spyOn(client, "from").mockImplementation(((table: string) => {
      const query = from(table);
      if (table !== "metrics" || raced) return query;
      raced = true;
      const select = query.select.bind(query);
      query.select = ((...args: Parameters<typeof select>) => {
        const filter = select(...args);
        const then = filter.then.bind(filter);
        filter.then = ((done, failed) => transferOwnership(w.actor(sara), ben).then(() => then(done, failed), failed)) as typeof filter.then;
        return filter;
      }) as typeof query.select;
      return query;
    }) as typeof client.from);
    try {
      await expect(setRole(w.actor(ad, "admin"), ben, "guest")).rejects.toThrow("The role changed meanwhile; try again.");
    } finally {
      spy.mockRestore();
    }
    expect(raced).toBe(true);
    expect(await roles(w.id)).toEqual({ [sara]: "admin", [ad]: "admin", [ben]: "owner" });
    expect((await db().from("audit_events").select("*").eq("workspace_id", w.id).eq("kind", "member.role_changed")).data).toEqual([]);
  });

  it("never leaves a Workspace without an Owner when two changes arrive at once", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member");
    const cat = await w.person("member"); const ad = await w.person("admin");

    // Two transfers of the same ownership: one wins, the other finds the actor no longer an Owner.
    const two = await Promise.allSettled([transferOwnership(w.actor(sara), ben), transferOwnership(w.actor(sara), cat)]);
    expect(two.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const now = await roles(w.id);
    const owners = Object.keys(now).filter((p) => now[p] === "owner");
    expect(owners).toHaveLength(1);
    expect(now[sara]).toBe("admin");

    // A transfer while the person picked is being made a Guest by an Admin: whichever lands first, an Owner stays.
    const next = owners[0]!;
    await Promise.allSettled([transferOwnership(w.actor(next), ad), setRole(w.actor(sara, "admin"), ad, "guest")]);
    expect(Object.values(await roles(w.id)).filter((r) => r === "owner").length).toBeGreaterThan(0);
  });
});
