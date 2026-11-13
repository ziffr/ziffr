// The team of a Workspace (GLOSSARY: Group, Contact): Groups and who is in them, and Contacts who submit values
// without a login. Owners and admins manage both; every function takes the Actor first.
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { cleanContact } from "./people";
import { peopleIn } from "./submissions";
import { assertMembersIn } from "./sharing";

/** The demo workspace (ADR 0005): shared by every visitor, so it keeps no Contacts. */
export const DEMO_WORKSPACE_ID = "d3e00000-0000-4000-8000-000000000001";

/** How many Contacts a workspace keeps at most. */
export const MAX_CONTACTS = 1000;

const groupName = (name: string) => String(name ?? "").trim().slice(0, 40);

/** A Group of the actor's workspace that people may change by hand (not the built-in Everyone). */
async function ordinaryGroup(actor: Actor, id: number) {
  const { data } = await db().from("groups").select("id, everyone").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.everyone) throw new Forbidden();
}

const nameError = (e: { code?: string; message: string } | null) => {
  if (e) throw new Error(e.code === "23505" ? "A group with that name exists." : "The group could not be saved.");
};

/** Creates a Group in the actor's workspace. */
export async function createGroup(actor: Actor, name: string) {
  assertCan(actor, "manage-groups");
  if (!groupName(name)) throw new Error("Give the group a name.");
  const { error } = await db().from("groups").insert({ name: groupName(name), workspace_id: actor.workspaceId });
  nameError(error);
}

/** Renames a Group. */
export async function renameGroup(actor: Actor, id: number, name: string) {
  assertCan(actor, "manage-groups");
  if (!groupName(name)) throw new Error("Give the group a name.");
  await ordinaryGroup(actor, id);
  const { error } = await db().from("groups").update({ name: groupName(name) }).eq("id", id).eq("workspace_id", actor.workspaceId);
  nameError(error);
}

/** Deletes a Group: what was shared with it stops being shared; threads limited to it become readable by everyone. */
export async function deleteGroup(actor: Actor, id: number) {
  assertCan(actor, "manage-groups");
  await ordinaryGroup(actor, id);
  await db().from("groups").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
}

/** Puts a member into a Group or takes them out. */
export async function setGroupMember(actor: Actor, groupId: number, personId: string, member: boolean) {
  assertCan(actor, "manage-groups");
  await ordinaryGroup(actor, groupId);
  await assertMembersIn(actor, [personId]);
  if (member) await db().from("group_members").upsert({ group_id: groupId, user_id: personId, workspace_id: actor.workspaceId });
  else await db().from("group_members").delete().eq("group_id", groupId).eq("user_id", personId).eq("workspace_id", actor.workspaceId);
}

/** Adds a Contact: a person of their own, recognised in this workspace by the details given here. The person
 * carries no address or handle, so nothing on it lets anyone sign in as a Contact. */
export async function addContact(actor: Actor, input: { name: string; email?: string; slackHandle?: string; phone?: string }) {
  assertCan(actor, "manage-members");
  // Anything stored in the demo is shown to every other visitor.
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("Contacts cannot be added in the demo.");
  const c = cleanContact(input);
  if (!c.ok) throw new Error(c.reason);
  const { count } = await db().from("contacts").select("person_id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId);
  if ((count ?? 0) >= MAX_CONTACTS) throw new Error(`A workspace keeps at most ${MAX_CONTACTS} contacts.`);
  // The handle or address must not already point to someone else here, or intake could not tell them apart.
  const taken = (await peopleIn(actor.workspaceId, { contactDetails: true })).find((p) => (c.email && p.email?.toLowerCase() === c.email) || (c.slack_handle && p.slack_handle?.toLowerCase() === c.slack_handle));
  if (taken) throw new Error(`${taken.name} already uses that ${c.email && taken.email?.toLowerCase() === c.email ? "email address" : "Slack handle"} here.`);
  const id = randomUUID();
  const { error: pe } = await db().from("profiles").insert({ id, name: c.name, role: "Contact", color: "#6B7280" });
  if (pe) throw new Error("The contact could not be added.");
  const { error } = await db().from("contacts").insert({ workspace_id: actor.workspaceId, person_id: id, email: c.email, slack_handle: c.slack_handle, phone: c.phone, created_by: actor.personId });
  if (error) throw new Error("The contact could not be added.");
  return id;
}

/** Removes a Contact from the actor's workspace. Their values and history stay; their Tokens stop working at once. */
export async function removeContact(actor: Actor, personId: string) {
  assertCan(actor, "manage-members");
  const ws = actor.workspaceId;
  const { data } = await db().from("contacts").delete().eq("workspace_id", ws).eq("person_id", String(personId)).select("person_id");
  if (!data?.length) throw new Forbidden();
  // Their form links and Slack or mail submissions stop: their Tokens go, and they stand in for nobody any more.
  await db().from("tokens").delete().eq("workspace_id", ws).eq("submitter_id", String(personId));
  await db().from("tokens").update({ stand_in_id: null }).eq("workspace_id", ws).eq("stand_in_id", String(personId));
}
