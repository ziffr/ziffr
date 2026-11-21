// The team of a Workspace (GLOSSARY: Group, Contact): Groups and who is in them, and Contacts who submit values
// without a login. Owners and admins manage both; every function takes the Actor first.
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { openNames, sealRow, UNREADABLE_NAME } from "./sealed-columns";
import { workspaceCipher } from "./workspace-keys";
import { assertCan, Forbidden, type Actor } from "./actor";
import { cleanContact } from "./people";
import { peopleIn } from "./submissions";
import { assertMembersIn } from "./sharing";
import { audit } from "./audit-log";
import { refuseInDemo } from "./demo";

/** The demo workspace (ADR 0005): shared by every visitor, so it keeps no Contacts. */
export const DEMO_WORKSPACE_ID = "d3e00000-0000-4000-8000-000000000001";

/** How many Contacts a workspace keeps at most. */
export const MAX_CONTACTS = 1000;

const groupName = (name: string) => String(name ?? "").trim().slice(0, 40);

/** A Group of the actor's workspace that people may change by hand (not the built-in Everyone). */
async function ordinaryGroup(actor: Actor, id: number): Promise<{ id: number; name: string }> {
  const { data } = await db().from("groups").select("id, name, everyone").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.everyone) throw new Forbidden();
  return { id: data.id as number, name: data.name as string };
}

const nameError = (e: { code?: string; message: string } | null) => {
  if (e) throw new Error(e.code === "23505" ? "A group with that name exists." : "The group could not be saved.");
};

/** Creates a Group in the actor's workspace and returns its id. */
export async function createGroup(actor: Actor, name: string): Promise<number> {
  assertCan(actor, "manage-groups");
  if (!groupName(name)) throw new Error("Give the group a name.");
  const { data, error } = await db().from("groups").insert({ name: groupName(name), workspace_id: actor.workspaceId }).select("id").single();
  nameError(error);
  if (!data) throw new Error("The group could not be saved.");
  await audit(actor, { kind: "group.created", object: { type: "group", id: data.id, name: groupName(name) } });
  return data.id as number;
}

/** Renames a Group. */
export async function renameGroup(actor: Actor, id: number, name: string) {
  assertCan(actor, "manage-groups");
  if (!groupName(name)) throw new Error("Give the group a name.");
  const before = await ordinaryGroup(actor, id);
  const { error } = await db().from("groups").update({ name: groupName(name) }).eq("id", id).eq("workspace_id", actor.workspaceId);
  nameError(error);
  if (before.name !== groupName(name)) await audit(actor, { kind: "group.renamed", object: { type: "group", id, name: groupName(name) }, details: { from: before.name, to: groupName(name) } });
}

/** Deletes a Group: what was shared with it stops being shared; threads limited to it become readable by everyone. */
export async function deleteGroup(actor: Actor, id: number) {
  assertCan(actor, "manage-groups");
  const group = await ordinaryGroup(actor, id);
  await db().from("groups").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
  await audit(actor, { kind: "group.deleted", object: { type: "group", id, name: group.name } });
}

/** Puts a member into a Group or takes them out. */
export async function setGroupMember(actor: Actor, groupId: number, personId: string, member: boolean) {
  assertCan(actor, "manage-groups");
  const group = await ordinaryGroup(actor, groupId);
  await assertMembersIn(actor, [personId]);
  const { data: was } = await db().from("group_members").select("user_id").eq("group_id", groupId).eq("user_id", personId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (member) await db().from("group_members").upsert({ group_id: groupId, user_id: personId, workspace_id: actor.workspaceId });
  else await db().from("group_members").delete().eq("group_id", groupId).eq("user_id", personId).eq("workspace_id", actor.workspaceId);
  // Only a real change is an event: ticking a box that was ticked records nothing.
  if (Boolean(was) !== member) {
    const { data: p } = await db().from("profiles").select("name").eq("id", personId).maybeSingle();
    await audit(actor, { kind: member ? "group.member_added" : "group.member_removed", object: { type: "group", id: groupId, name: group.name }, details: { person_id: personId, person_name: (p?.name as string | undefined) ?? null } });
  }
}

/** Adds a Contact: a person of their own, recognised in this workspace by the details given here. The person
 * carries no address or handle, so nothing on it lets anyone sign in as a Contact. */
export async function addContact(actor: Actor, input: { name: string; email?: string; slackHandle?: string; phone?: string }) {
  assertCan(actor, "manage-members");
  // A Contact's person is made before the Contact, outside the demo's rows: refused before it.
  refuseInDemo(actor);
  const c = cleanContact(input);
  if (!c.ok) throw new Error(c.reason);
  const { count } = await db().from("contacts").select("person_id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId);
  if ((count ?? 0) >= MAX_CONTACTS) throw new Error(`A workspace keeps at most ${MAX_CONTACTS} contacts.`);
  // The handle or address must not already point to someone else here, or intake could not tell them apart.
  const taken = (await peopleIn(actor.workspaceId, { contactDetails: true })).find((p) => (c.email && p.email?.toLowerCase() === c.email) || (c.slack_handle && p.slack_handle?.toLowerCase() === c.slack_handle));
  if (taken) throw new Error(`${taken.name} already uses that ${c.email && taken.email?.toLowerCase() === c.email ? "email address" : "Slack handle"} here.`);
  const id = randomUUID();
  // Name, address, handle and phone sealed with the Workspace Key (spec 0028); the blind indexes keep an address or
  // handle unique here without the database reading it. In clear only in the demo or without ZIFFR_SECRETS_KEY.
  const cipher = await workspaceCipher(actor.workspaceId);
  const person = await sealRow("profiles", actor.workspaceId, { id, name: c.name });
  const { error: pe } = await db().from("profiles").insert({ ...person, role: "Contact", color: "#6B7280", contact_workspace: actor.workspaceId });
  if (pe) throw new Error("The contact could not be added.");
  const details = await sealRow("contacts", actor.workspaceId, { person_id: id, email: c.email, slack_handle: c.slack_handle, phone: c.phone });
  const { error } = await db().from("contacts").insert({
    ...details, workspace_id: actor.workspaceId, created_by: actor.personId,
    email_index: c.email ? cipher.blindIndex("contacts.email", c.email) : null, slack_index: c.slack_handle ? cipher.blindIndex("contacts.slack_handle", c.slack_handle) : null,
  });
  if (error) {
    await db().from("profiles").delete().eq("id", id);
    throw new Error(error.code === "23505" ? "Someone here already uses that email address or Slack handle." : "The contact could not be added.");
  }
  // The Contact's name only: their address and handles are contact details, not part of the record.
  await audit(actor, { kind: "contact.added", object: { type: "person", id, name: c.name } });
  return id;
}

/** Removes a Contact from the actor's workspace. Their values and history stay; their Tokens stop working at once. */
export async function removeContact(actor: Actor, personId: string) {
  assertCan(actor, "manage-members");
  const ws = actor.workspaceId;
  const { data } = await db().from("contacts").delete().eq("workspace_id", ws).eq("person_id", String(personId)).select("person_id");
  if (!data?.length) throw new Forbidden();
  // Their form links and Slack or mail submissions stop: their Tokens go, and they stand in for nobody any more. First,
  // so that nothing after it (such as a Workspace Key that cannot be opened) can leave them working.
  await db().from("tokens").delete().eq("workspace_id", ws).eq("submitter_id", String(personId));
  await db().from("tokens").update({ stand_in_id: null }).eq("workspace_id", ws).eq("stand_in_id", String(personId));
  const { data: found } = await db().from("profiles").select("id, name").eq("id", String(personId)).maybeSingle();
  const name = await openNames(ws, found ? [found] : []).then(([p]) => (p?.name as string | undefined) ?? null, () => UNREADABLE_NAME);
  await audit(actor, { kind: "contact.removed", object: { type: "person", id: String(personId), name } });
}
