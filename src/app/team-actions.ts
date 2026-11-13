"use server";
// Groups (GLOSSARY: Group): the workspace owner creates them and decides who is in them.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { assertWorkspaceOwner, forbidden } from "@/lib/guards";

const done = () => revalidatePath("/", "layout");
const clean = (name: string) => String(name ?? "").trim().slice(0, 40);

export async function createGroup(name: string) {
  await assertWorkspaceOwner(await viewerId());
  if (!clean(name)) forbidden();
  const { error } = await db.from("groups").insert({ name: clean(name) });
  if (error) throw new Error(error.code === "23505" ? "A group with that name exists." : error.message);
  done();
}

export async function renameGroup(id: number, name: string) {
  await assertWorkspaceOwner(await viewerId());
  if (!clean(name)) forbidden();
  const { error } = await db.from("groups").update({ name: clean(name) }).eq("id", id);
  if (error) throw new Error(error.code === "23505" ? "A group with that name exists." : error.message);
  done();
}

/** Things shared with the group stop being shared; threads limited to it become readable by everyone. */
export async function deleteGroup(id: number) {
  await assertWorkspaceOwner(await viewerId());
  await db.from("groups").delete().eq("id", id);
  done();
}

export async function setMember(groupId: number, userId: string, member: boolean) {
  await assertWorkspaceOwner(await viewerId());
  const [{ data: g }, { data: p }] = await Promise.all([db.from("groups").select("id").eq("id", groupId).maybeSingle(), db.from("profiles").select("id").eq("id", userId).maybeSingle()]);
  if (!g || !p) forbidden();
  if (member) await db.from("group_members").upsert({ group_id: groupId, user_id: userId });
  else await db.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  done();
}
