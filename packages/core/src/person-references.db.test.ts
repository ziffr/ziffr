// Erasing one person (spec 0071; GLOSSARY: Deleted person), against the real database: the inventory of what holds a
// person, and that nothing but the Audit Log holds their name or address afterwards.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "./access-keys";
import { Forbidden, Refused } from "./actor";
import { createDashboard } from "./dashboards";
import { db } from "./db";
import { erasePerson } from "./erase-person";
import { removeMember } from "./handover";
import { inviteByEmail } from "./invitations";
import { installationAdmin, workspace } from "./test/db-fixtures";
import { listVersions } from "./version-history";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
async function ws() { const w = await workspace(); cleanups.push(w.cleanup); return w; }
const someAddress = () => `zora.${randomUUID().slice(0, 8)}@erase.test`;
async function signsIn(personId: string, email: string) {
  const { data, error } = await db().auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  cleanups.push(async () => { await db().auth.admin.deleteUser(data.user.id); });
  await db().from("profiles").update({ auth_user_id: data.user.id }).eq("id", personId).throwOnError();
  return data.user.id;
}
const signInExists = async (id: string) => !!(await db().auth.admin.getUserById(id)).data.user;
const profile = async (id: string) => (await db().from("profiles").select("name, email, phone, slack_handle, auth_user_id").eq("id", id).maybeSingle()).data;
const gaps = async () => (await db().rpc("person_reference_gaps").throwOnError()).data;
/** The columns that hold the text, the Audit Log's own left aside. */
async function holding(needle: string) {
  const { data } = await db().rpc("person_text_found", { p_needle: needle }).throwOnError();
  return (data as string[]).filter((c) => !/^(installation_)?audit_events\./.test(c));
}

describe("the inventory of what holds a person", () => {
  // A new table fails here until a migration says in `person_references` what erasing a person does with it.
  it("marks every column that refers to a person", async () => {
    expect(await gaps()).toEqual([]);
  });
  it("names a column nobody marked", async () => {
    const { data: row } = await db().from("person_references").select("*").eq("table_name", "shares").eq("column_name", "user_id").single().throwOnError();
    await db().from("person_references").delete().eq("table_name", "shares").eq("column_name", "user_id").throwOnError();
    try {
      expect(await gaps()).toEqual(["shares.user_id"]);
    } finally {
      await db().from("person_references").insert(row!).throwOnError();
    }
  });
});

describe("erasing a person", () => {
  it("keeps a Deleted person where something refers to them, and only the Audit Log still names them", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ann = await w.person("member");
    const address = someAddress(); const handle = `zora-${randomUUID().slice(0, 8)}`; const name = `Zora Quill ${randomUUID().slice(0, 8)}`;
    const ben = await w.person("member", { email: address, slack_handle: handle });
    await db().from("profiles").update({ name, phone: "+491700000001" }).eq("id", ben).throwOnError();
    const signIn = await signsIn(ben, address);
    const m = await w.metric(ben); await w.value(m.id, "2026-01-01", 4, ben);
    const board = await createDashboard(w.actor(ben, "member"), "A board");
    await createAccessKey(w.actor(ben, "member"), { name: "A script", scopes: ["metrics:read"], expiresOn: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10) });
    await removeMember(w.actor(sara), ben, ann);
    await inviteByEmail(w.actor(sara), { email: address, role: "member" }, undefined, false);
    expect(await holding(name)).toContain("versions.message");
    expect(await holding(address)).toContain("invitations.email");

    expect(await erasePerson({ personId: ben })).toBe("kept");

    expect(await profile(ben)).toEqual({ name: "Deleted person", email: null, phone: null, slack_handle: null, auth_user_id: null });
    expect(await signInExists(signIn)).toBe(false);
    expect(await holding(name)).toEqual([]);
    expect(await holding(address)).toEqual([]);
    expect(await holding(handle)).toEqual([]);
    const { versions } = await listVersions(w.actor(ann, "member"), "dashboard", board);
    expect(versions[0].message).toMatch(/^Handed over from Deleted person to member /);
    expect((await db().from("observations").select("submitter_id").eq("metric_id", m.id)).data).toEqual([{ submitter_id: ben }]);
    // Running it again changes nothing, and nothing brings them back.
    expect(await erasePerson({ personId: ben })).toBe("kept");
    expect((await db().from("profiles").update({ name }).eq("id", ben)).error).toBeTruthy();
    expect((await db().from("memberships").insert({ workspace_id: w.id, user_id: ben, role: "member" })).error).toBeTruthy();
    // The address is free for a new person.
    await w.person("member", { email: address });
  });

  it("deletes a person entirely when nothing refers to them", async () => {
    const w = await ws(); await w.person("owner");
    const address = someAddress(); const ben = await w.person("member", { email: address });
    const signIn = await signsIn(ben, address);
    await w.dropMember(ben);
    expect(await erasePerson({ personId: ben })).toBe("deleted");
    expect(await profile(ben)).toBeNull();
    expect(await signInExists(signIn)).toBe(false);
    expect(await erasePerson({ personId: ben })).toBe("deleted");
  });

  it("finishes a run that stopped before the sign-in was removed", async () => {
    const w = await ws(); await w.person("owner");
    const address = someAddress(); const ben = await w.person("member", { email: address });
    const signIn = await signsIn(ben, address);
    await w.dropMember(ben);
    // Signed in on a row a Workspace made as a Contact: a person of their own all the same.
    await db().from("profiles").update({ role: "Contact", contact_workspace: w.id }).eq("id", ben).throwOnError();
    await db().rpc("erase_person",{ p_person: ben, p_address: address, p_mailbox: address, p_sign_in_key: "none", p_server_admins: [] }).throwOnError();
    expect((await db().rpc("finish_erasing_person", { p_person: ben })).data).toBe("signed_in");
    expect(await erasePerson({ personId: ben })).toBe("deleted");
    expect(await signInExists(signIn)).toBe(false);
  });

  it("refuses a member of a Workspace, and a Contact, and leaves them as they were", async () => {
    const w = await ws(); await w.person("owner");
    const ben = await w.person("member", { email: someAddress() });
    const contact = await w.contact({ email: someAddress() });
    const before = [await profile(ben), await profile(contact)];
    await expect(erasePerson({ personId: ben })).rejects.toBeInstanceOf(Refused);
    await expect(erasePerson({ personId: contact })).rejects.toBeInstanceOf(Forbidden);
    expect([await profile(ben), await profile(contact)]).toEqual(before);
  });

  it("refuses the only Installation Admin while other people use the Installation", async () => {
    expect((await db().from("installation_admins").select("person_id")).data).toEqual([]);
    const first = await installationAdmin(); cleanups.push(first.cleanup);
    const w = await ws(); const other = await w.person("owner");
    await signsIn(other, someAddress());
    await expect(erasePerson(first.actor)).rejects.toThrow("only Installation Admin");
    const second = await installationAdmin(); cleanups.push(second.cleanup);
    await erasePerson(first.actor);
    expect((await db().from("installation_admins").select("person_id").eq("person_id", first.actor.personId)).data).toEqual([]);
  });
});
