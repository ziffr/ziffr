// Sharing, Groups and people over HTTP (ticket #434; GLOSSARY: Share, Group, Contact, Access Key): shapes and status
// codes, that each area has its own scope that only a person's own key may hold, that an assistant's call is refused,
// that a key has exactly its creator's rights (Owners and Admins, the owner of a thing), and that things the creator
// cannot see or another workspace's ids answer like ones that do not exist.
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkKeyRequest, createAccessKey } from "@ziffr/core/access-keys";
import type { Scope } from "@ziffr/core/actor";
import { canSee } from "@ziffr/core/sharing";
import { accessLogOf, auditRowsOf, changeRows, insertRow, rowsOf, workspace } from "@ziffr/core/test/db-fixtures";
import { runFromMcp } from "@/lib/mcp-context";
import { GET as who, POST as setShare } from "./route";
import { POST as decide } from "./requests/[id]/route";
import { GET as listGroups, POST as makeGroup } from "../groups/route";
import { DELETE as removeGroup, PATCH as renameGroup } from "../groups/[id]/route";
import { POST as addMember } from "../groups/[id]/members/route";
import { DELETE as removeMember } from "../groups/[id]/members/[personId]/route";
import { POST as addContact } from "../people/route";
import { DELETE as removePerson, PATCH as changeRole } from "../people/[id]/route";
import { GET as listInvitations, POST as invite } from "../invitations/route";
import { POST as makeLink } from "../invitations/links/route";
import { DELETE as revoke } from "../invitations/[id]/route";
import { POST as resend } from "../invitations/[id]/resend/route";
import { GET as listJoins } from "../join-requests/route";
import { POST as decideJoin } from "../join-requests/[id]/route";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

type W = Awaited<ReturnType<typeof workspace>>;
type Role = "owner" | "admin" | "member" | "guest";

async function setup() {
  const w = await workspace(); cleanups.push(w.cleanup);
  const sara = await w.person("owner"); const ada = await w.person("admin"); const ben = await w.person("member"); const gia = await w.person("guest");
  const cash = await w.metric(sara, { name: "Cash" });
  const payroll = await w.metric(sara, { name: "Payroll" });
  await w.share(cash.id, ben);
  const dash = await insertRow("dashboards", { name: "Board", owner_id: sara, workspace_id: w.id });
  const other = await workspace("Other"); cleanups.push(other.cleanup);
  const zoe = await other.person("owner");
  const foreignGroup = await insertRow("groups", { name: "Elsewhere", workspace_id: other.id });
  return { w, sara, ada, ben, gia, cash, payroll, dashboard: dash.id as number, zoe, foreignGroup: foreignGroup.id as number, other };
}

async function keyFor(w: W, person: string, role: Role, scopes: Scope[]) {
  const { id, secret } = await createAccessKey(w.actor(person, role), { name: "Program", scopes, expiresOn: inDays(30) });
  const req = (method: string, path: string, body?: unknown) => new Request(`http://ziffr.test/api/v1${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
  });
  const params = <K extends string>(p: Record<K, string | number>) => ({ params: Promise.resolve(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)])) as Record<K, string>) });
  return { id, secret, req, params };
}
const messageOf = async (res: Response) => (await res.json()).error.message as string;

describe("which keys may hold the scopes", () => {
  it("gives each scope only to a creator whose role has the right, and never to an assistant", async () => {
    const { w, sara, ada, ben, gia } = await setup();
    const date = inDays(30);
    expect(() => checkKeyRequest(w.actor(sara), ["shares:write", "groups:write", "people:write"], date)).not.toThrow();
    expect(() => checkKeyRequest(w.actor(ada, "admin"), ["groups:write", "people:write"], date)).not.toThrow();
    expect(() => checkKeyRequest(w.actor(ben, "member"), ["shares:write"], date)).not.toThrow();
    expect(() => checkKeyRequest(w.actor(ben, "member"), ["groups:write"], date)).toThrow(/cannot manage groups/);
    expect(() => checkKeyRequest(w.actor(ben, "member"), ["people:write"], date)).toThrow(/cannot invite or remove people/);
    expect(() => checkKeyRequest(w.actor(gia, "guest"), ["shares:write"], date)).toThrow(/cannot share/);
    // An assistant's connection (OAuth) is checked with forAssistant: even an Owner's choice cannot include them.
    for (const s of ["shares:write", "groups:write", "people:write"] as Scope[]) {
      expect(() => checkKeyRequest(w.actor(sara), ["metrics:read", s], date, { assistant: true })).toThrow(/cannot be allowed/);
    }
    expect(() => checkKeyRequest(w.actor(sara), ["metrics:read", "alerts:write"], date, { assistant: true })).not.toThrow();
  });
});

describe("Shares over HTTP", () => {
  it("shares a Metric and a dashboard the creator owns with a member or a Group, and takes the Share away", async () => {
    const { w, sara, ben, payroll, dashboard } = await setup();
    const k = await keyFor(w, sara, "owner", ["shares:write", "groups:write"]);
    expect(await canSee(w.actor(ben, "member"), "metric", payroll.id)).toBe(false);
    const res = await setShare(k.req("POST", "/shares", { type: "metric", id: payroll.slug, person: ben, role: "viewer" }), undefined);
    expect(await res.json()).toEqual({ type: "metric", id: payroll.slug, person: ben, group: null, role: "viewer" });
    expect(await canSee(w.actor(ben, "member"), "metric", payroll.id)).toBe(true);
    const seen = await (await who(k.req("GET", `/shares?type=metric&id=${payroll.slug}`), undefined)).json();
    expect(seen).toMatchObject({ owner: sara, is_owner: true, requests: [] });
    expect(seen.people.find((p: { id: string }) => p.id === ben).how).toEqual(["shared as Viewer"]);
    // A Group, then a dashboard as Editor, then the Share is taken away again.
    const g = await (await makeGroup(k.req("POST", "/groups", { name: "Finance" }), undefined)).json();
    expect((await setShare(k.req("POST", "/shares", { type: "dashboard", id: dashboard, group: g.id, role: "editor" }), undefined)).status).toBe(200);
    expect((await (await who(k.req("GET", `/shares?type=dashboard&id=${dashboard}`), undefined)).json()).owner).toBe(sara);
    expect((await setShare(k.req("POST", "/shares", { type: "dashboard", id: dashboard, group: g.id, role: null }), undefined)).status).toBe(200);
    await setShare(k.req("POST", "/shares", { type: "metric", id: payroll.slug, person: ben, role: null }), undefined);
    expect(await canSee(w.actor(ben, "member"), "metric", payroll.id)).toBe(false);
    expect((await accessLogOf(k.id)).every((c) => c.status === 200 || c.status === 201)).toBe(true);
    // The Audit Log names the key behind each change, so a person's own change differs from their key's.
    const events = [...(await auditRowsOf(w.id, "share.")), ...(await auditRowsOf(w.id, "group.created"))];
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.every((e) => e.access_key_id === k.id)).toBe(true);
    // A deck or dashboard may be named by its number as a string, and only by digits.
    expect((await setShare(k.req("POST", "/shares", { type: "dashboard", id: String(dashboard), person: ben, role: "viewer" }), undefined)).status).toBe(200);
    expect((await who(k.req("GET", `/shares?type=dashboard&id=${dashboard}`), undefined)).status).toBe(200);
    expect((await who(k.req("GET", "/shares?type=dashboard&id=1e3"), undefined)).status).toBe(404);
  });

  it("refuses a key without the scope, an assistant, and anyone but the owner", async () => {
    const { w, sara, ben, cash, payroll } = await setup();
    const body = { type: "metric", id: payroll.slug, person: ben, role: "viewer" };
    const reader = await keyFor(w, sara, "owner", ["metrics:read", "groups:write"]);
    const refused = await setShare(reader.req("POST", "/shares", body), undefined);
    expect(refused.status).toBe(403);
    expect(await messageOf(refused)).toContain("shares:write");
    expect((await who(reader.req("GET", `/shares?type=metric&id=${payroll.slug}`), undefined)).status).toBe(403);
    // Called by the remote MCP Server for an assistant: refused whatever the key holds.
    const k = await keyFor(w, sara, "owner", ["shares:write"]);
    const viaMcp = await runFromMcp(() => setShare(k.req("POST", "/shares", body), undefined));
    expect(viaMcp.status).toBe(403);
    expect(await messageOf(viaMcp)).toContain("not for an assistant");
    expect(await canSee(w.actor(ben, "member"), "metric", payroll.id)).toBe(false);
    // Ben sees Cash but does not own it: he may not share it on.
    const bens = await keyFor(w, ben, "member", ["shares:write"]);
    const notOwner = await setShare(bens.req("POST", "/shares", { type: "metric", id: cash.slug, person: sara, role: "viewer" }), undefined);
    expect(notOwner.status).toBe(403);
    expect(await messageOf(notOwner)).toContain("Only the owner");
  });

  it("answers things the creator cannot see, or from another workspace, like things that do not exist", async () => {
    const { w, sara, ben, gia, payroll, dashboard, zoe, foreignGroup, other } = await setup();
    const bens = await keyFor(w, ben, "member", ["shares:write"]);
    // Payroll is not shared with Ben: not found, whether it exists or not.
    for (const id of [payroll.slug, "no-such-metric"]) {
      expect((await who(bens.req("GET", `/shares?type=metric&id=${id}`), undefined)).status).toBe(404);
      expect((await setShare(bens.req("POST", "/shares", { type: "metric", id, person: gia, role: "viewer" }), undefined)).status).toBe(404);
    }
    expect((await who(bens.req("GET", `/shares?type=dashboard&id=${dashboard}`), undefined)).status).toBe(404);
    const k = await keyFor(w, sara, "owner", ["shares:write"]);
    const share = (b: Record<string, unknown>) => setShare(k.req("POST", "/shares", { type: "metric", id: payroll.slug, role: "viewer", ...b }), undefined);
    expect((await share({ person: zoe })).status).toBe(404);
    expect((await share({ group: foreignGroup })).status).toBe(404);
    await insertRow("metrics", { slug: "theirs", name: "Theirs", owner_id: zoe, workspace_id: other.id, unit: "", format: "number", decimals: 0, period: "month", submission_rule: "overwrite", polarity: "higher", sources: ["api"] });
        expect((await setShare(k.req("POST", "/shares", { type: "metric", id: "theirs", person: ben, role: "viewer" }), undefined)).status).toBe(404);
    const foreignDash = await insertRow("dashboards", { name: "Theirs", owner_id: zoe, workspace_id: other.id });
    expect((await setShare(k.req("POST", "/shares", { type: "dashboard", id: foreignDash.id, person: ben, role: "viewer" }), undefined)).status).toBe(404);
    // A Contact is not a member: nothing is shared with them. Shapes: one target, known fields only.
    const cleo = await w.contact({ email: "cleo@contacts.test" });
    expect((await share({ person: cleo })).status).toBe(404);
    expect((await share({})).status).toBe(422);
    expect((await share({ person: ben, group: 1 })).status).toBe(422);
    expect((await share({ person: ben, extra: true })).status).toBe(400);
    expect((await share({ person: ben, role: "owner" })).status).toBe(400);
    expect((await who(k.req("GET", "/shares?type=folder&id=1"), undefined)).status).toBe(400);
  });

  it("lets the owner answer a request for access, and nobody else", async () => {
    const { w, sara, ben, payroll } = await setup();
    const r = await insertRow("access_requests", { requester_id: ben, object_type: "metric", object_id: payroll.id, workspace_id: w.id });
    const k = await keyFor(w, sara, "owner", ["shares:write"]);
    const seen = await (await who(k.req("GET", `/shares?type=metric&id=${payroll.slug}`), undefined)).json();
    expect(seen.requests).toEqual([{ id: r.id, person: ben, name: expect.any(String), requested_at: expect.any(String) }]);
    const bens = await keyFor(w, ben, "member", ["shares:write"]);
    expect((await decide(bens.req("POST", `/shares/requests/${r.id}`, { grant: true }), bens.params({ id: r.id }))).status).toBe(404);
    expect(await canSee(w.actor(ben, "member"), "metric", payroll.id)).toBe(false);
    expect(await (await decide(k.req("POST", `/shares/requests/${r.id}`, { grant: true }), k.params({ id: r.id }))).json()).toEqual({ id: r.id, granted: true });
    expect(await canSee(w.actor(ben, "member"), "metric", payroll.id)).toBe(true);
    expect((await decide(k.req("POST", `/shares/requests/${r.id}`, { grant: true }), k.params({ id: r.id }))).status).toBe(404);
  });
});

describe("Groups over HTTP", () => {
  it("are made, renamed, filled and deleted by an Admin, and listed as before", async () => {
    const { w, ada, ben, gia } = await setup();
    const k = await keyFor(w, ada, "admin", ["groups:write", "metrics:read"]);
    const res = await makeGroup(k.req("POST", "/groups", { name: "  Sales " }), undefined);
    expect(res.status).toBe(201);
    const g = await res.json();
    expect(g).toEqual({ id: expect.any(Number), name: "Sales", everyone: false });
    expect((await makeGroup(k.req("POST", "/groups", { name: "Sales" }), undefined)).status).toBe(422);
    expect((await makeGroup(k.req("POST", "/groups", { name: "" }), undefined)).status).toBe(400);
    expect(await (await renameGroup(k.req("PATCH", `/groups/${g.id}`, { name: "Revenue" }), k.params({ id: g.id }))).json()).toMatchObject({ id: g.id, name: "Revenue" });
    expect(await (await addMember(k.req("POST", `/groups/${g.id}/members`, { person: ben }), k.params({ id: g.id }))).json()).toEqual({ group: g.id, person: ben, member: true });
    const members = await rowsOf("group_members", { group_id: g.id });
    expect(members.map((x) => x.user_id)).toEqual([ben]);
    expect((await listGroups(k.req("GET", "/groups"), undefined).then((r) => r.json())).items.map((x: { name: string }) => x.name)).toContain("Revenue");
    expect(await (await removeMember(k.req("DELETE", `/groups/${g.id}/members/${ben}`), k.params({ id: g.id, personId: ben }))).json()).toEqual({ group: g.id, person: ben, member: false });
    // Contacts and strangers are not members to add.
    const cleo = await w.contact({ email: "c2@contacts.test" });
    expect((await addMember(k.req("POST", `/groups/${g.id}/members`, { person: cleo }), k.params({ id: g.id }))).status).toBe(404);
    expect((await addMember(k.req("POST", `/groups/${g.id}/members`, { person: "not a person id!" }), k.params({ id: g.id }))).status).toBe(400);
    for (const bad of ["1e1", "0x10", " 12", "-1", "0"]) expect((await removeGroup(k.req("DELETE", `/groups/${bad}`), k.params({ id: bad }))).status).toBe(400);
    expect(await (await removeGroup(k.req("DELETE", `/groups/${g.id}`), k.params({ id: g.id }))).json()).toEqual({ removed: g.id });
    expect((await removeGroup(k.req("DELETE", `/groups/${g.id}`), k.params({ id: g.id }))).status).toBe(404);
    expect(gia).toBeTruthy();
  });

  it("refuse a missing scope, an assistant, Everyone, another workspace's Group and a creator whose role changed", async () => {
    const { w, sara, ada, ben, foreignGroup } = await setup();
    const reader = await keyFor(w, ada, "admin", ["metrics:read", "shares:write"]);
    expect((await makeGroup(reader.req("POST", "/groups", { name: "X" }), undefined)).status).toBe(403);
    const k = await keyFor(w, ada, "admin", ["groups:write"]);
    expect((await runFromMcp(() => makeGroup(k.req("POST", "/groups", { name: "X" }), undefined))).status).toBe(403);
    expect((await renameGroup(k.req("PATCH", `/groups/${foreignGroup}`, { name: "Mine" }), k.params({ id: foreignGroup }))).status).toBe(404);
    expect((await removeGroup(k.req("DELETE", `/groups/${foreignGroup}`), k.params({ id: foreignGroup }))).status).toBe(404);
    expect((await addMember(k.req("POST", `/groups/${foreignGroup}/members`, { person: ben }), k.params({ id: foreignGroup }))).status).toBe(404);
    const everyone = (await rowsOf("groups", { workspace_id: w.id, everyone: true }))[0] as { id: number } | undefined;
    if (everyone) {
      expect((await renameGroup(k.req("PATCH", `/groups/${everyone.id}`, { name: "Nobody" }), k.params({ id: everyone.id }))).status).toBe(404);
      expect((await removeGroup(k.req("DELETE", `/groups/${everyone.id}`), k.params({ id: everyone.id }))).status).toBe(404);
    }
    // The key has its creator's rights as they are now: demoted to Member, Ada's key can do nothing here.
    await w.setRole(ada, "member");
    const demoted = await makeGroup(k.req("POST", "/groups", { name: "Late" }), undefined);
    expect(demoted.status).toBe(403);
    expect(await messageOf(demoted)).toContain("manage groups");
    expect(sara).toBeTruthy();
  });
});

describe("people over HTTP", () => {
  it("adds and removes Contacts, changes roles and removes members with a handover", async () => {
    const { w, sara, ada, ben, gia, cash } = await setup();
    const k = await keyFor(w, ada, "admin", ["people:write"]);
    const res = await addContact(k.req("POST", "/people", { name: "Cleo", email: "cleo@contacts.test", phone: "+49 170 0000000" }), undefined);
    expect(res.status).toBe(201);
    const cleo = await res.json();
    expect(cleo).toEqual({ id: expect.any(String), name: "Cleo", contact: true });
    expect((await addContact(k.req("POST", "/people", { name: "Cleo 2", email: "cleo@contacts.test" }), undefined)).status).toBe(422);
    expect((await addContact(k.req("POST", "/people", { name: "Bad", email: "not an address" }), undefined)).status).toBe(422);
    expect((await addContact(k.req("POST", "/people", { name: "" }), undefined)).status).toBe(400);
    expect(await (await removePerson(k.req("DELETE", `/people/${cleo.id}`), k.params({ id: cleo.id }))).json()).toEqual({ removed: cleo.id });
    // Roles: an Admin makes a Member an Admin, but not an Owner, and cannot touch the Owner.
    expect(await (await changeRole(k.req("PATCH", `/people/${ben}`, { role: "admin" }), k.params({ id: ben }))).json()).toEqual({ id: ben, role: "admin" });
    const asOwner = await changeRole(k.req("PATCH", `/people/${ben}`, { role: "owner" }), k.params({ id: ben }));
    expect(asOwner.status).toBe(403);
    expect(await messageOf(asOwner)).toContain("Only Owners");
    expect((await changeRole(k.req("PATCH", `/people/${sara}`, { role: "member" }), k.params({ id: sara }))).status).toBe(403);
    expect((await changeRole(k.req("PATCH", `/people/${ben}`, { role: "emperor" }), k.params({ id: ben }))).status).toBe(400);
    // Removing a member needs a successor who is another member, not a Guest; Owners are removed by Owners.
    expect((await removePerson(k.req("DELETE", `/people/${gia}`), k.params({ id: gia }))).status).toBe(422);
    expect((await removePerson(k.req("DELETE", `/people/${gia}?successor=${gia}`), k.params({ id: gia }))).status).toBe(422);
    expect((await removePerson(k.req("DELETE", `/people/${sara}?successor=${ada}`), k.params({ id: sara }))).status).toBe(403);
    expect((await removePerson(k.req("DELETE", `/people/${ada}?successor=${ben}`), k.params({ id: ada }))).status).toBe(403);
    await w.setRole(ben, "member");
    // A Guest owns nothing: the one who is removed here is a Member who owns a Metric.
    await w.setRole(gia, "member");
    await changeRows("metrics", { id: cash.id }, { owner_id: gia });
    expect(await (await removePerson(k.req("DELETE", `/people/${gia}?successor=${sara}`), k.params({ id: gia }))).json()).toEqual({ removed: gia });
    const moved = (await rowsOf("metrics", { id: cash.id }))[0];
    expect(moved.owner_id).toBe(sara);
    const still = await rowsOf("memberships", { workspace_id: w.id, user_id: gia });
    expect(still).toEqual([]);
  });

  it("refuse a missing scope, an assistant, a creator who is not Owner or Admin any more and people of another workspace", async () => {
    const { w, ada, ben, zoe } = await setup();
    const reader = await keyFor(w, ada, "admin", ["groups:write"]);
    expect((await addContact(reader.req("POST", "/people", { name: "X" }), undefined)).status).toBe(403);
    expect((await listInvitations(reader.req("GET", "/invitations"), undefined)).status).toBe(403);
    expect((await changeRole(reader.req("PATCH", `/people/${ben}`, { role: "guest" }), reader.params({ id: ben }))).status).toBe(403);
    const k = await keyFor(w, ada, "admin", ["people:write"]);
    expect((await runFromMcp(() => addContact(k.req("POST", "/people", { name: "X" }), undefined))).status).toBe(403);
    expect((await runFromMcp(() => listInvitations(k.req("GET", "/invitations"), undefined))).status).toBe(403);
    expect((await changeRole(k.req("PATCH", `/people/${zoe}`, { role: "member" }), k.params({ id: zoe }))).status).toBe(404);
    expect((await removePerson(k.req("DELETE", `/people/${zoe}?successor=${ben}`), k.params({ id: zoe }))).status).toBe(404);
    expect((await removePerson(k.req("DELETE", `/people/${ben}?successor=${zoe}`), k.params({ id: ben }))).status).toBe(422);
    await w.setRole(ada, "member");
    const demoted = await addContact(k.req("POST", "/people", { name: "Late" }), undefined);
    expect(demoted.status).toBe(403);
    expect((await changeRole(k.req("PATCH", `/people/${ben}`, { role: "guest" }), k.params({ id: ben }))).status).toBe(403);
  });
});

describe("invitations and join requests over HTTP", () => {
  it("invite an address, make and revoke a link, list without any token", async () => {
    const { w, ada } = await setup();
    const k = await keyFor(w, ada, "admin", ["people:write"]);
    const res = await invite(k.req("POST", "/invitations", { email: "New.Person@invite.test", role: "member" }), undefined);
    expect(res.status).toBe(201);
    const inv = await res.json();
    expect(inv).toEqual({ id: expect.any(Number), email: "new.person@invite.test", role: "member", expires_at: expect.any(String), created_at: expect.any(String), emailed: expect.any(Boolean), email_error: null });
    expect(JSON.stringify(inv)).not.toContain("token");
    const asOwner = await invite(k.req("POST", "/invitations", { email: "boss@invite.test", role: "owner" }), undefined);
    expect(asOwner.status).toBe(403);
    expect((await invite(k.req("POST", "/invitations", { email: "nope", role: "member" }), undefined)).status).toBe(422);
    expect((await invite(k.req("POST", "/invitations", { email: "a@invite.test", role: "member", contact: "someone-else" }), undefined)).status).toBe(404);
    const link = await makeLink(k.req("POST", "/invitations/links", { role: "guest" }), undefined);
    expect(link.status).toBe(201);
    expect(await link.json()).toEqual({ url: expect.stringMatching(/\/invite\/[A-Za-z0-9_-]{20,}$/), role: "guest" });
    expect((await makeLink(k.req("POST", "/invitations/links", { role: "admin" }), undefined)).status).toBe(400);
    const list = await (await listInvitations(k.req("GET", "/invitations"), undefined)).json();
    expect(list.items).toHaveLength(2);
    expect(JSON.stringify(list)).not.toMatch(/token|\/invite\//);
    const again = await resend(k.req("POST", `/invitations/${inv.id}/resend`), k.params({ id: inv.id }));
    expect([200, 422]).toContain(again.status);
    expect(await (await revoke(k.req("DELETE", `/invitations/${inv.id}`), k.params({ id: inv.id }))).json()).toEqual({ removed: inv.id });
    expect([404, 422]).toContain((await resend(k.req("POST", `/invitations/${inv.id}/resend`), k.params({ id: inv.id }))).status);
  });

  it("keep other workspaces' invitations out of reach and need the scope", async () => {
    const { w, sara, other, zoe, ada } = await setup();
    const theirs = await insertRow("invitations", { workspace_id: other.id, token: "theirs-token-theirs-token", email: "t@invite.test", role: "member", created_by: zoe, expires_at: new Date(Date.now() + 86400000).toISOString() });
    const k = await keyFor(w, sara, "owner", ["people:write"]);
    expect((await revoke(k.req("DELETE", `/invitations/${theirs.id}`), k.params({ id: theirs.id }))).status).toBe(404);
    expect((await resend(k.req("POST", `/invitations/${theirs.id}/resend`), k.params({ id: theirs.id }))).status).toBeGreaterThanOrEqual(404);
    expect((await listInvitations(k.req("GET", "/invitations"), undefined).then((r) => r.json())).items).toEqual([]);
    const noScope = await keyFor(w, ada, "admin", ["metrics:read"]);
    expect((await invite(noScope.req("POST", "/invitations", { email: "a@invite.test", role: "member" }), undefined)).status).toBe(403);
    expect((await makeLink(noScope.req("POST", "/invitations/links", { role: "member" }), undefined)).status).toBe(403);
    const still = (await rowsOf("invitations", { id: theirs.id }))[0];
    expect(still.revoked_at).toBeNull();
  });

  it("list requests to join with the address proved, and approve or decline them", async () => {
    const { w, sara } = await setup();
    const asker = await w.person("member", { email: "asker@company.test" });
    await w.dropMember(asker);
    const r = await insertRow("join_requests", { workspace_id: w.id, person_id: asker, status: "open" });
    const k = await keyFor(w, sara, "owner", ["people:write"]);
    expect(await (await listJoins(k.req("GET", "/join-requests"), undefined)).json()).toEqual({ items: [{ id: r.id, requested_at: expect.any(String), person: { id: asker, name: expect.any(String), email: "asker@company.test" } }] });
    expect((await runFromMcp(() => decideJoin(k.req("POST", `/join-requests/${r.id}`, { approve: true }), k.params({ id: r.id })))).status).toBe(403);
    expect(await (await decideJoin(k.req("POST", `/join-requests/${r.id}`, { approve: true }), k.params({ id: r.id }))).json()).toEqual({ id: r.id, approved: true });
    const m = (await rowsOf("memberships", { workspace_id: w.id, user_id: asker }))[0];
    expect(m.role).toBe("member");
    expect((await decideJoin(k.req("POST", `/join-requests/${r.id}`, { approve: false }), k.params({ id: r.id }))).status).toBe(404);
  });
});
