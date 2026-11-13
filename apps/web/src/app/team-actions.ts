"use server";
// Groups and Contacts (GLOSSARY: Group, Contact): the workspace's owners and admins manage both.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { actingWorkspace, assertMembers, assertWorkspaceOwner, forbidden } from "@/lib/guards";
import { getPeopleIn } from "@/lib/data";
import { cleanContact } from "@ziffr/core/people";
import { randomUUID } from "node:crypto";
import { isDemo } from "@/lib/auth";

const MAX_CONTACTS = 1000;

const done = () => revalidatePath("/", "layout");
const clean = (name: string) => String(name ?? "").trim().slice(0, 40);

/** The built-in Everyone group is not changed by hand: its members are the workspace's members. */
async function assertOrdinaryGroup(id: number) {
  const { data } = await db.from("groups").select("everyone").eq("id", id).eq("workspace_id", await actingWorkspace()).maybeSingle();
  if (!data || data.everyone) forbidden();
}

export async function createGroup(name: string) {
  await assertWorkspaceOwner(await viewerId());
  if (!clean(name)) forbidden();
  const { error } = await db.from("groups").insert({ name: clean(name), workspace_id: await actingWorkspace() });
  if (error) throw new Error(error.code === "23505" ? "A group with that name exists." : error.message);
  done();
}

export async function renameGroup(id: number, name: string) {
  await assertWorkspaceOwner(await viewerId());
  if (!clean(name)) forbidden();
  await assertOrdinaryGroup(id);
  const { error } = await db.from("groups").update({ name: clean(name) }).eq("id", id).eq("workspace_id", await actingWorkspace());
  if (error) throw new Error(error.code === "23505" ? "A group with that name exists." : error.message);
  done();
}

/** Things shared with the group stop being shared; threads limited to it become readable by everyone. */
export async function deleteGroup(id: number) {
  await assertWorkspaceOwner(await viewerId());
  await assertOrdinaryGroup(id);
  await db.from("groups").delete().eq("id", id).eq("workspace_id", await actingWorkspace());
  done();
}

export async function setMember(groupId: number, userId: string, member: boolean) {
  await assertWorkspaceOwner(await viewerId());
  const { data: g } = await db.from("groups").select("id").eq("id", groupId).eq("workspace_id", await actingWorkspace()).maybeSingle();
  if (!g) forbidden();
  await assertOrdinaryGroup(groupId);
  await assertMembers([userId]);
  if (member) await db.from("group_members").upsert({ group_id: groupId, user_id: userId });
  else await db.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  done();
}

/** Adds a Contact (GLOSSARY: Contact): someone without a login who submits values by Slack, email or the form.
 * They become a person of their own, recognised in this workspace by the details given here. */
export async function addContact(input: { name: string; email?: string; slackHandle?: string; phone?: string }) {
  // Visitors share the demo: anything stored there is shown to every other visitor.
  if (await isDemo()) throw new Error("Contacts cannot be added in the demo.");
  const viewer = await viewerId();
  await assertWorkspaceOwner(viewer);
  const c = cleanContact(input);
  if (!c.ok) throw new Error(c.reason);
  const ws = await actingWorkspace();
  const { count } = await db.from("contacts").select("person_id", { count: "exact", head: true }).eq("workspace_id", ws);
  if ((count ?? 0) >= MAX_CONTACTS) throw new Error(`A workspace keeps at most ${MAX_CONTACTS} contacts.`);
  // The handle or address must not already point to someone else here, or intake could not tell them apart.
  const taken = (await getPeopleIn(ws, { contactDetails: true })).find((p) => (c.email && p.email?.toLowerCase() === c.email) || (c.slack_handle && p.slack_handle?.toLowerCase() === c.slack_handle));
  if (taken) throw new Error(`${taken.name} already uses that ${c.email && taken.email?.toLowerCase() === c.email ? "email address" : "Slack handle"} here.`);
  const id = randomUUID();
  // The person carries no address or handle: nothing on it lets anyone sign in as a Contact.
  const { error: pe } = await db.from("profiles").insert({ id, name: c.name, role: "Contact", color: "#6B7280" });
  if (pe) throw new Error("The contact could not be added.");
  const { error } = await db.from("contacts").insert({ workspace_id: ws, person_id: id, email: c.email, slack_handle: c.slack_handle, phone: c.phone, created_by: viewer });
  if (error) throw new Error("The contact could not be added.");
  done();
}

/** Removes a Contact from this workspace. Their values and history stay; their Tokens stop working at once. */
export async function removeContact(personId: string) {
  await assertWorkspaceOwner(await viewerId());
  const ws = await actingWorkspace();
  const { data } = await db.from("contacts").delete().eq("workspace_id", ws).eq("person_id", String(personId)).select("person_id");
  if (!data?.length) forbidden();
  // Their form links and Slack or mail submissions stop: their Tokens go, and they stand in for nobody any more.
  await db.from("tokens").delete().eq("workspace_id", ws).eq("submitter_id", String(personId));
  await db.from("tokens").update({ stand_in_id: null }).eq("workspace_id", ws).eq("stand_in_id", String(personId));
  done();
}
