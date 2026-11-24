// The Team step against the real database (spec 0052, ticket 10; GLOSSARY: Setup Guide, Invitation, Business Function,
// Submitter, Contact, Trial Workspace): what the step shows an Owner or Admin, that nobody else is given it (it carries
// Business Functions), the trial's invitation gate in words, which Metrics it lists, who is suggested and that a
// suggestion changes nothing, and each way the step ticks, with the real operations and mail that goes nowhere.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden } from "./actor";
import { db } from "./db";
import { businessFunctions, setMyBusinessFunction } from "./business-function";
import { createInviteLink, inviteByEmail, setJoinDomain } from "./invitations";
import { createGroup, setGroupMember } from "./team";
import { addSubmitters, type MetricEffects } from "./metrics";
import { setupGuide } from "./setup-guide";
import { teamSetup } from "./team-setup";
import { DEMO_WORKSPACE_ID } from "./team";
import { workspace } from "./test/db-fixtures";
import type { MailTransport } from "./mail";

const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => { for (const w of made.splice(0)) { await db().from("invitations").delete().eq("workspace_id", w.id); await w.cleanup(); } });
// Mail that goes nowhere: nothing is sent to anyone, and no first request is sent when someone is asked for a Metric.
const transport: MailTransport = async () => ({ messageId: "test" });
const asked: string[] = [];
const effects: MetricEffects = { recordCreated: async () => {}, promptSubmitter: async (_m, who) => { asked.push(who); } };
const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function fresh() {
  const w = await workspace("Team Co");
  made.push(w);
  const owner = await w.person("owner", { email: `o-${randomUUID().slice(0, 8)}@example.test` });
  return { w, owner, o: w.actor(owner, "owner") };
}
const ticked = async (a: Parameters<typeof setupGuide>[0]) => (await setupGuide(a))!.steps.filter((s) => s.ticked).map((s) => s.id);

describe("who may read the step", () => {
  it("is for Owners and Admins only: a Member, a Guest, a key and the demo are refused", async () => {
    const { w, o } = await fresh();
    const admin = w.actor(await w.person("admin"), "admin");
    const member = w.actor(await w.person("member"), "member");
    const guest = w.actor(await w.person("guest"), "guest");
    await expect(teamSetup(o)).resolves.toMatchObject({ isOwner: true });
    await expect(teamSetup(admin)).resolves.toMatchObject({ isOwner: false });
    await expect(teamSetup(member)).rejects.toBeInstanceOf(Forbidden);
    await expect(teamSetup(guest)).rejects.toBeInstanceOf(Forbidden);
    await expect(teamSetup({ ...o, key: { id: 1, scopes: [] } } as never)).rejects.toBeInstanceOf(Forbidden);
    await expect(teamSetup({ ...o, workspaceId: DEMO_WORKSPACE_ID })).rejects.toBeInstanceOf(Forbidden);
  });

  it("never gives a Member another person's function, through the step or the function list", async () => {
    const { w, o } = await fresh();
    const ben = await w.person("member");
    const member = w.actor(await w.person("member"), "member");
    await setMyBusinessFunction(w.actor(ben, "member"), "finance");
    await expect(teamSetup(member)).rejects.toBeInstanceOf(Forbidden);
    await expect(businessFunctions(member)).rejects.toBeInstanceOf(Forbidden);
    // The Owner does read it, as a word.
    expect((await teamSetup(o)).people.find((p) => p.id === ben)?.function).toBe("Finance");
  });
});

describe("who is listed", () => {
  it("lists members and Contacts with their roles and functions, leaves Guests out, and shows invitations without a token", async () => {
    const { w, o, owner } = await fresh();
    const ben = await w.person("member");
    const guest = await w.person("guest");
    const contact = await w.contact({ email: "field@contact.test" });
    await setMyBusinessFunction(w.actor(ben, "member"), "finance");
    await setMyBusinessFunction(o, "sales");
    // A person demoted to Guest keeps a function row: it is not shown.
    await db().from("business_functions").insert({ workspace_id: w.id, person_id: guest, function: "sales" });
    await inviteByEmail(o, { email: `new-${randomUUID().slice(0, 8)}@example.test`, role: "member" }, transport);
    const t = await teamSetup(o);
    expect(t.people.map((p) => p.id).sort()).toEqual([owner, ben, contact].sort());
    expect(t.people.find((p) => p.id === ben)).toMatchObject({ kind: "member", role: "member", function: "Finance" });
    expect(t.people.find((p) => p.id === owner)).toMatchObject({ role: "owner", function: "Sales" });
    expect(t.people.find((p) => p.id === contact)).toMatchObject({ kind: "contact", role: null, function: null });
    expect(t.invitations).toHaveLength(1);
    expect(Object.keys(t.invitations[0]).sort()).toEqual(["email", "expiresAt", "id", "role"]);
    // A held invitation (a person of an imported file, not yet invited) is not shown as waiting.
    await db().from("invitations").insert({ workspace_id: w.id, token: randomUUID(), role: "member", created_by: owner, expires_at: new Date(Date.now() + 86_400_000).toISOString(), held_at: new Date().toISOString(), email: "held@example.test" });
    expect((await teamSetup(o)).invitations).toHaveLength(1);
    expect(JSON.stringify(t)).not.toMatch(/field@contact\.test/);
  });

  it("lists Groups except Everyone, with their members, and Domain Joining when it is on", async () => {
    const { w, o, owner } = await fresh();
    const ben = await w.person("member");
    const id = await createGroup(o, "Finance");
    await setGroupMember(o, id, ben, true);
    await db().from("workspaces").update({ join_domain: "team-co.test" }).eq("id", w.id);
    const t = await teamSetup(o);
    expect(t.groups).toEqual([{ id, name: "Finance", members: [ben] }]);
    expect(t.domain.on).toBe("team-co.test");
    expect(owner).toBeTruthy();
  });
});

describe("the trial's invitation gate", () => {
  it("is closed until the Owner has a value of their own, open after, and a value that was imported does not open it", async () => {
    const { w, o, owner } = await fresh();
    await w.trial(day(7));
    expect((await teamSetup(o)).trial).toEqual({ onTrial: true, ended: false, invitationsOpen: false });
    await expect(inviteByEmail(o, { email: `a-${randomUUID().slice(0, 8)}@example.test`, role: "member" }, transport)).rejects.toThrow(/first value/);
    const m = await w.metric(owner);
    await db().from("observations").insert({ workspace_id: w.id, metric_id: m.id, period_start: "2026-10-01", value: 1, submitter_id: owner, imported: true, source: "api" });
    expect((await teamSetup(o)).trial.invitationsOpen).toBe(false);
    await w.value(m.id, "2026-11-01", 3, owner);
    expect((await teamSetup(o)).trial).toEqual({ onTrial: true, ended: false, invitationsOpen: true });
    await expect(inviteByEmail(o, { email: `b-${randomUUID().slice(0, 8)}@example.test`, role: "member" }, transport)).resolves.toMatchObject({ emailed: false });
    // A trial has no links and no Domain Joining: the core refuses both, and the step does not offer them.
    await expect(createInviteLink(o, "member")).rejects.toThrow(/trial/);
    await expect(setJoinDomain(o, "owner@team-co.test", true)).rejects.toThrow(/trial/);
  });

  it("says the trial has ended and offers nothing once it has, and an ordinary Workspace is always open", async () => {
    const a = await fresh();
    expect((await teamSetup(a.o)).trial).toEqual({ onTrial: false, ended: false, invitationsOpen: true });
    const b = await fresh();
    await b.w.trial(day(-1));
    await b.w.value((await b.w.metric(b.owner)).id, "2026-11-01", 3, b.owner);
    expect((await teamSetup(b.o)).trial).toEqual({ onTrial: true, ended: true, invitationsOpen: false });
  });
});

describe("Who is asked for what", () => {
  it("lists the Metrics the person may change, not derived ones, someone else's, or archived ones, with who is asked", async () => {
    const { w, o, owner } = await fresh();
    const admin = await w.person("admin");
    const mine = await w.metric(owner, { name: "Revenue" });
    await w.metric(owner, { name: "Derived", formula: "1" });
    await w.metric(owner, { name: "Old", archived_at: new Date().toISOString() });
    const theirs = await w.metric(admin, { name: "Admin's own" });
    const ben = await w.person("member");
    await w.token(mine.id, ben);
    const t = await teamSetup(o);
    expect(t.asks.map((a) => a.name)).toEqual(["Revenue"]);
    expect(t.asks[0].submitters).toEqual([{ id: ben, name: expect.any(String) }]);
    // The Admin sees their own Metric and not the Owner's, until it is shared with them as an Editor.
    expect((await teamSetup(w.actor(admin, "admin"))).asks.map((a) => a.metricId)).toEqual([theirs.id]);
    await db().from("shares").insert({ workspace_id: w.id, object_type: "metric", object_id: mine.id, user_id: admin, role: "editor" });
    expect((await teamSetup(w.actor(admin, "admin"))).asks.map((a) => a.metricId).sort()).toEqual([mine.id, theirs.id].sort());
  });

  it("suggests the people whose function matches the Pack the Metric came from, and assigns nothing until someone is asked", async () => {
    const { w, o, owner } = await fresh();
    const ben = await w.person("member");
    const cara = await w.person("member");
    await setMyBusinessFunction(w.actor(ben, "member"), "finance");
    await setMyBusinessFunction(w.actor(cara, "member"), "sales");
    const { data: install } = await db().from("pack_installs").insert({ workspace_id: w.id, pack_id: "test/finance", version: "1.0.0", license: "MIT", source: "upload", manifest: { name: "Finance", audience: { functions: ["finance"] } } }).select("id").single();
    await db().from("catalog_metrics").insert({ category: "Finance", name: "Cash at hand", description: "", format: "number", period: "month", submission_rule: "overwrite", polarity: "higher", workspace_id: w.id, pack_install_id: install!.id, pack_key: "cash" });
    const metric = await w.metric(owner, { name: "Cash at hand" });
    const before = await teamSetup(o);
    expect(before.asks[0].suggested).toEqual([{ id: ben, name: expect.any(String), function: "Finance" }]);
    expect(before.asks[0].submitters).toEqual([]);
    expect((await db().from("tokens").select("code").eq("metric_id", metric.id)).data).toEqual([]);
    expect(asked).not.toContain(ben);
    // A click is the Submitter operation: the person is then asked, and is no longer suggested.
    expect(await addSubmitters(o, metric.id, [ben], effects)).toEqual([ben]);
    const after = await teamSetup(o);
    expect(after.asks[0].suggested).toEqual([]);
    expect(after.asks[0].submitters.map((s) => s.id)).toEqual([ben]);
  });

  it("suggests nobody for a Metric from no Pack, or a Pack with no function in its audience", async () => {
    const { w, o, owner } = await fresh();
    const ben = await w.person("member");
    await setMyBusinessFunction(w.actor(ben, "member"), "finance");
    await w.metric(owner, { name: "Plain" });
    expect((await teamSetup(o)).asks[0].suggested).toEqual([]);
  });
});

describe("the step ticks", () => {
  it("when someone is invited by email, by link, or a Contact is asked for a Metric; a Contact that only exists does not", async () => {
    const a = await fresh();
    expect(await ticked(a.o)).toEqual([]);
    await inviteByEmail(a.o, { email: `a-${randomUUID().slice(0, 8)}@example.test`, role: "member" }, transport);
    expect(await ticked(a.o)).toContain("team");
    const b = await fresh();
    await createInviteLink(b.o, "member");
    expect(await ticked(b.o)).toContain("team");
    const c = await fresh();
    const contact = await c.w.contact({ email: "c@contact.test" });
    expect(await ticked(c.o)).not.toContain("team");
    const m = await c.w.metric(c.owner);
    await addSubmitters(c.o, m.id, [contact], effects);
    expect(await ticked(c.o)).toContain("team");
  });

  it("when Domain Joining is switched on, and no longer when it is switched off again", async () => {
    const { w, o } = await fresh();
    await setJoinDomain(o, "owner@team-co.test", true);
    expect(await ticked(o)).toContain("team");
    await setJoinDomain(o, null, false);
    expect(await ticked(o)).not.toContain("team");
    expect(w.id).toBeTruthy();
  });
});
