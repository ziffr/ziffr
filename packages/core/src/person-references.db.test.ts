// Erasing one person (spec 0071; GLOSSARY: Deleted person), against the real database: the inventory of what holds a
// person, and that nothing but the Audit Log holds their name or address afterwards.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createAccessKey } from "./access-keys";
import { Forbidden, Refused } from "./actor";
import { createDashboard } from "./dashboards";
import { db } from "./db";
import { erasePerson, linkedPerson } from "./erase-person";
import { removeMember } from "./handover";
import { inviteByEmail } from "./invitations";
import { handOverMetric } from "./metric-owner";
import { insertSealed, openRows, sealRow } from "./sealed-columns";
import { isSealed } from "./workspace-keys";
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

const rename = async (personId: string, name: string) => { await db().from("profiles").update({ name }).eq("id", personId).throwOnError(); };
/** Seals what is written from here on, as an Installation with a secrets key does. */
function sealing() {
  const saved = process.env.ZIFFR_SECRETS_KEY;
  process.env.ZIFFR_SECRETS_KEY = Buffer.alloc(32, 61).toString("base64");
  cleanups.push(async () => { if (saved === undefined) delete process.env.ZIFFR_SECRETS_KEY; else process.env.ZIFFR_SECRETS_KEY = saved; });
}
const someName = () => `Zora Quill ${randomUUID().slice(0, 8)}`;
/** The messages of a Workspace's hand-over versions, as stored. */
const handovers = async (workspaceId: string) => ((await db().from("versions").select("message").eq("workspace_id", workspaceId).like("message", "Handed over from %").order("id").throwOnError()).data ?? []).map((v) => v.message as string);
/** Makes a Workspace's hand-over versions like those written before they held the two ids. */
const asOlder = async (workspaceId: string) => { await db().from("versions").update({ handover_from_person_id: null, handover_to_person_id: null }).eq("workspace_id", workspaceId).throwOnError(); };
/** A Workspace where a member of that name, who only owned a dashboard, was removed in favour of another. */
async function leftADashboard(name: string) {
  const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
  await rename(ben, name); await rename(ann, "Ann Field");
  await createDashboard(w.actor(ben, "member"), "A board");
  await removeMember(w.actor(sara), ben, ann);
  return { w, sara, ben, ann };
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

describe("hand-over versions of an erased person", () => {
  it("hold the two people's ids, which decide whatever the names say", async () => {
    const w = await ws(); const sara = await w.person("owner"); const ben = await w.person("member"); const ann = await w.person("member");
    const name = someName(); await rename(ben, name); await rename(ann, name);
    const m = await w.metric(ben);
    await handOverMetric(w.actor(sara), m.id, ann);
    expect((await db().from("versions").select("handover_from_person_id, handover_to_person_id").eq("workspace_id", w.id).like("message", "Handed over %").throwOnError()).data)
      .toEqual([{ handover_from_person_id: ben, handover_to_person_id: ann }]);
    // The name it was written with is gone from the profile and the message keeps it.
    await rename(ben, someName());
    await w.dropMember(ben);
    await erasePerson({ personId: ben });
    expect(await handovers(w.id)).toEqual([`Handed over from Deleted person to ${name}`]);
  });

  it("without ids are rewritten for a member who only owned dashboards, and never in an unrelated Workspace", async () => {
    const name = someName();
    const mine = await leftADashboard(name); await asOlder(mine.w.id);
    const other = await leftADashboard(name); await asOlder(other.w.id);
    await erasePerson({ personId: mine.ben });
    expect(await handovers(mine.w.id)).toEqual(["Handed over from Deleted person to Ann Field"]);
    expect(await handovers(other.w.id)).toEqual([`Handed over from ${name} to Ann Field`]);
  });

  it("without ids stay where a Contact carries the name too, while those with ids are rewritten", async () => {
    sealing();
    const name = someName();
    const older = await leftADashboard(name); await asOlder(older.w.id);
    const newer = await leftADashboard(name);
    // One person in both Workspaces would need one id: the second Workspace's hand-over is made this person's.
    await db().from("versions").update({ handover_from_person_id: older.ben }).eq("workspace_id", newer.w.id).eq("handover_from_person_id", newer.ben).throwOnError();
    for (const { w } of [older, newer]) {
      const contact = await w.contact({ email: someAddress() });
      // Sealed, as a Contact's name is stored.
      const sealed = await sealRow("profiles", w.id, { id: contact, name: name.toUpperCase() });
      expect(isSealed(sealed.name as string)).toBe(true);
      await db().from("profiles").update({ name: sealed.name as string, contact_workspace: w.id }).eq("id", contact).throwOnError();
    }
    await erasePerson({ personId: older.ben });
    expect(await handovers(older.w.id)).toEqual([`Handed over from ${name} to Ann Field`]);
    expect(await handovers(newer.w.id)).toEqual(["Handed over from Deleted person to Ann Field"]);
  });

  it("never match a word Ziffr writes when it has no name", async () => {
    for (const word of ["Someone", "A former member"]) {
      const mine = await leftADashboard(word); await asOlder(mine.w.id);
      await erasePerson({ personId: mine.ben });
      expect(await handovers(mine.w.id)).toEqual([`Handed over from ${word} to Ann Field`]);
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
    expect(await linkedPerson(signIn)).toEqual({ personId: ben, erased: false });
    await db().rpc("erase_person",{ p_person: ben, p_address: address, p_mailbox: address, p_sign_in_key: "none", p_server_admins: [] }).throwOnError();
    expect((await db().rpc("finish_erasing_person", { p_person: ben })).data).toBe("signed_in");
    // The sign-in is still there, and is marked as nobody's.
    expect(await linkedPerson(signIn)).toEqual({ personId: ben, erased: true });
    expect(await erasePerson({ personId: ben })).toBe("deleted");
    expect(await signInExists(signIn)).toBe(false);
    expect(await linkedPerson(signIn)).toBeNull();
  });

  it("refuses an id longer than any person's, and erases nobody", async () => {
    const w = await ws(); await w.person("owner");
    const id = `p-${randomUUID()}`.padEnd(64, "x");
    await w.person("member", { id }); await w.dropMember(id);
    const before = await profile(id);
    await expect(erasePerson({ personId: `${id}y` })).rejects.toBeInstanceOf(Forbidden);
    expect(await profile(id)).toEqual(before);
    expect(await erasePerson({ personId: id })).toBe("deleted");
  });

  it("takes an Invitation to another spelling of the mailbox, and the sender of what matched nobody", async () => {
    sealing();
    const w = await ws(); const sara = await w.person("owner");
    const local = `zora${randomUUID().slice(0, 8)}`; const address = `${local}@erase.test`;
    const ben = await w.person("member", { email: address });
    await w.dropMember(ben);
    await inviteByEmail(w.actor(sara), { email: `${local}+work@erase.test`, role: "member" }, undefined, false);
    const mail = (sender: string) => ({ source: "mail", sender, sender_id: null, raw: "4", outcome: "rejected", detail: "Unknown sender." });
    const [mine, theirs] = await insertSealed("intake_log", w.id, [mail(`${local.toUpperCase()}+form@erase.test`), mail(`other.${local}@erase.test`)]);

    await erasePerson({ personId: ben });

    expect((await db().from("invitations").select("id").eq("workspace_id", w.id)).data).toEqual([]);
    const { data } = await db().from("intake_log").select("id, sender").eq("workspace_id", w.id).order("id").throwOnError();
    expect(data!.every((r) => isSealed(r.sender as string))).toBe(true);
    expect((await openRows("intake_log", w.id, data)).map((r) => r.sender)).toEqual(["Deleted person", `other.${local}@erase.test`]);
    expect([mine.id, theirs.id]).toEqual(data!.map((r) => r.id));
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
