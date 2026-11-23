// A person's Business Function against the real database (spec 0052, ticket 2; GLOSSARY: Business Function): the person
// reads and sets their own; Owners and Admins read every member's; a Member reads only their own; a Guest, a key and the
// demo have none; a value outside the list is refused; another Workspace's rows never appear; leaving removes it; the
// Audit Log holds keys only and is read by Owners and Admins; the table is the core's alone.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { Forbidden, type Actor } from "./actor";
import { auditLog } from "./audit-log";
import { BUSINESS_FUNCTIONS, businessFunctions, myBusinessFunction, setMyBusinessFunction } from "./business-function";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { auditRowsOf, workspace } from "./test/db-fixtures";

const made: Awaited<ReturnType<typeof workspace>>[] = [];
afterEach(async () => { for (const w of made.splice(0)) await w.cleanup(); });
async function fresh() {
  const w = await workspace("Function Co");
  made.push(w);
  const owner = w.actor(await w.person("owner"), "owner");
  const admin = w.actor(await w.person("admin"), "admin");
  const member = w.actor(await w.person("member"), "member");
  const other = w.actor(await w.person("member"), "member");
  const guest = w.actor(await w.person("guest"), "guest");
  return { w, owner, admin, member, other, guest };
}

describe("the person's own function", () => {
  it("is set, read, changed and cleared by the person, for each key of the list", async () => {
    const { member } = await fresh();
    expect(await myBusinessFunction(member)).toBeNull();
    for (const k of BUSINESS_FUNCTIONS) {
      expect(await setMyBusinessFunction(member, k)).toBe(k);
      expect(await myBusinessFunction(member)).toBe(k);
    }
    expect(await setMyBusinessFunction(member, null)).toBeNull();
    expect(await myBusinessFunction(member)).toBeNull();
    expect((await db().from("business_functions").select("person_id").eq("person_id", member.personId)).data).toEqual([]);
  });

  it("refuses anything outside the list, and never writes it", async () => {
    const { member } = await fresh();
    for (const bad of ["wizard", "Sales", "", " sales", "__proto__", "constructor", 1, true, ["sales"], { function: "sales" }, undefined]) {
      await expect(setMyBusinessFunction(member, bad)).rejects.toThrow("Pick one of the choices.");
    }
    expect(await myBusinessFunction(member)).toBeNull();
  });

  it("is only ever the actor's own: there is no person to pass", async () => {
    const { member, other, owner } = await fresh();
    await setMyBusinessFunction(member, "sales");
    await setMyBusinessFunction(other, "finance");
    await setMyBusinessFunction(owner, "management");
    expect(await myBusinessFunction(member)).toBe("sales");
    expect(await myBusinessFunction(other)).toBe("finance");
    expect(await myBusinessFunction(owner)).toBe("management");
  });
});

describe("who reads the Workspace's functions", () => {
  it("Owners and Admins read every member's; Members and Guests are refused", async () => {
    const { owner, admin, member, other, guest } = await fresh();
    await setMyBusinessFunction(member, "sales");
    await setMyBusinessFunction(other, "finance");
    await setMyBusinessFunction(admin, "management");
    const expected = [{ personId: member.personId, function: "sales" }, { personId: other.personId, function: "finance" }, { personId: admin.personId, function: "management" }];
    const sorted = (l: { personId: string }[]) => [...l].sort((a, b) => a.personId.localeCompare(b.personId));
    expect(sorted(await businessFunctions(owner))).toEqual(sorted(expected));
    expect(sorted(await businessFunctions(admin))).toEqual(sorted(expected));
    await expect(businessFunctions(member)).rejects.toBeInstanceOf(Forbidden);
    await expect(businessFunctions(guest)).rejects.toBeInstanceOf(Forbidden);
  });

  it("a Member cannot read another's function through any core function of this module", async () => {
    const { member, other } = await fresh();
    await setMyBusinessFunction(other, "finance");
    expect(await myBusinessFunction(member)).toBeNull();
    await expect(businessFunctions(member)).rejects.toBeInstanceOf(Forbidden);
  });

  it("a Guest has none to give, read or set", async () => {
    const { guest } = await fresh();
    await expect(myBusinessFunction(guest)).rejects.toBeInstanceOf(Forbidden);
    await expect(setMyBusinessFunction(guest, "sales")).rejects.toBeInstanceOf(Forbidden);
    expect((await db().from("business_functions").select("person_id").eq("person_id", guest.personId)).data).toEqual([]);
  });

  it("a role claimed on the Actor but not held in the database gets nothing", async () => {
    const { w, member } = await fresh();
    const stranger = w.actor(await w.person("member"), "owner");
    await w.setRole(stranger.personId, "member");
    await expect(businessFunctions(stranger)).rejects.toBeInstanceOf(Forbidden);
    const left: Actor = { ...member, personId: `t-${randomUUID()}` };
    await expect(setMyBusinessFunction(left, "sales")).rejects.toBeInstanceOf(Forbidden);
    // A Member demoted to Guest after setting one can no longer read it, and does not appear to Owners.
    await setMyBusinessFunction(member, "sales");
    await w.setRole(member.personId, "guest");
    await expect(myBusinessFunction(member)).rejects.toBeInstanceOf(Forbidden);
  });

  it("an Access Key, as any key-shaped actor, is refused", async () => {
    const { owner } = await fresh();
    const key = { ...owner, key: { id: 1, scopes: ["metrics:read"] } } as unknown as Actor;
    await expect(myBusinessFunction(key)).rejects.toBeInstanceOf(Forbidden);
    await expect(setMyBusinessFunction(key, "sales")).rejects.toBeInstanceOf(Forbidden);
    await expect(businessFunctions(key)).rejects.toBeInstanceOf(Forbidden);
  });

  it("another Workspace's rows never appear, and a person's function in one is not their function in another", async () => {
    const a = await fresh();
    const b = await fresh();
    const shared = await a.w.person("member");
    await db().from("memberships").insert({ workspace_id: b.w.id, user_id: shared, role: "member" });
    const inA = a.w.actor(shared, "member");
    const inB = b.w.actor(shared, "member");
    await setMyBusinessFunction(inA, "sales");
    await setMyBusinessFunction(b.member, "finance");
    expect(await myBusinessFunction(inB)).toBeNull();
    expect((await businessFunctions(a.owner)).map((r) => r.function).sort()).toEqual(["sales"]);
    expect((await businessFunctions(b.owner)).map((r) => r.function).sort()).toEqual(["finance"]);
    await db().from("memberships").delete().eq("workspace_id", b.w.id).eq("user_id", shared);
  });

  it("leaving the Workspace removes the function, and a stale row is never listed", async () => {
    const { w, owner, member } = await fresh();
    await setMyBusinessFunction(member, "sales");
    await w.dropMember(member.personId);
    expect((await db().from("business_functions").select("person_id").eq("person_id", member.personId)).data).toEqual([]);
    expect(await businessFunctions(owner)).toEqual([]);
  });
});

describe("the demo, the table and the Audit Log", () => {
  it("the demo has none: reading gives nothing, setting is refused, the list is empty", async () => {
    const { owner } = await fresh();
    const demo: Actor = { personId: owner.personId, workspaceId: DEMO_WORKSPACE_ID, role: "owner" };
    expect(await myBusinessFunction(demo)).toBeNull();
    await expect(setMyBusinessFunction(demo, "sales")).rejects.toBeInstanceOf(Forbidden);
    expect(await businessFunctions(demo)).toEqual([]);
  });

  it("writes one Audit Log line per change, with keys only, read by Owners and Admins and not by Members", async () => {
    const { w, owner, admin, member } = await fresh();
    await setMyBusinessFunction(member, "sales");
    await setMyBusinessFunction(member, "sales"); // no change, no line
    await setMyBusinessFunction(member, "finance");
    await setMyBusinessFunction(member, null);
    const rows = await auditRowsOf(w.id, "person.business_function_changed");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.details)).toEqual([{ from: null, to: "sales" }, { from: "sales", to: "finance" }, { from: "finance", to: null }]);
    const { data: plain } = await db().from("audit_events").select("actor_id, object_type, object_id").eq("workspace_id", w.id).eq("kind", "person.business_function_changed");
    expect(plain!.every((r) => r.actor_id === member.personId && r.object_type === "person" && r.object_id === member.personId)).toBe(true);
    for (const reader of [owner, admin]) {
      const { events } = await auditLog(reader, { kind: "person.business_function_changed" });
      expect(events).toHaveLength(3);
    }
    await expect(auditLog(member, {})).rejects.toBeInstanceOf(Forbidden);
  });

  it("the table's CHECK accepts exactly the list", async () => {
    const { w, member } = await fresh();
    for (const k of BUSINESS_FUNCTIONS) {
      const { error } = await db().from("business_functions").upsert({ workspace_id: w.id, person_id: member.personId, function: k });
      expect(error, k).toBeNull();
    }
    expect((await db().from("business_functions").upsert({ workspace_id: w.id, person_id: member.personId, function: "wizard" })).error).not.toBeNull();
  });
});
