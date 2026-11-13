"use server";
// Groups and Contacts (GLOSSARY: Group, Contact). Thin calls into the core (@ziffr/core/team), which lets owners and
// admins manage both, inside their own Workspace.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import * as team from "@ziffr/core/team";

const done = () => revalidatePath("/", "layout");

/** Creates a Group. */
export async function createGroup(name: string) {
  await team.createGroup(await currentActor(), String(name ?? ""));
  done();
}

/** Renames a Group (not Everyone). */
export async function renameGroup(id: number, name: string) {
  await team.renameGroup(await currentActor(), Number(id), String(name ?? ""));
  done();
}

/** Deletes a Group: what was shared with it stops being shared; threads limited to it become readable by everyone. */
export async function deleteGroup(id: number) {
  await team.deleteGroup(await currentActor(), Number(id));
  done();
}

/** Puts a member into a Group or takes them out. */
export async function setMember(groupId: number, userId: string, member: boolean) {
  await team.setGroupMember(await currentActor(), Number(groupId), String(userId), Boolean(member));
  done();
}

/** Adds a Contact: someone without a login who submits values by Slack, email or the form. */
export async function addContact(input: { name: string; email?: string; slackHandle?: string; phone?: string }) {
  // Visitors share the demo: anything stored there is shown to every other visitor.
  if (await isDemo()) throw new Error("Contacts cannot be added in the demo.");
  await team.addContact(await currentActor(), {
    name: String(input?.name ?? ""), email: String(input?.email ?? ""), slackHandle: String(input?.slackHandle ?? ""), phone: String(input?.phone ?? ""),
  });
  done();
}

/** Removes a Contact. Their values and history stay; their Tokens stop working at once. */
export async function removeContact(personId: string) {
  await team.removeContact(await currentActor(), String(personId));
  done();
}
