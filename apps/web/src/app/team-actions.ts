"use server";
// Groups and Contacts (GLOSSARY: Group, Contact). Thin calls into the core (@ziffr/core/team), which lets owners and
// admins manage both, inside their own Workspace.
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import * as team from "@ziffr/core/team";
import * as inv from "@ziffr/core/invitations";
import { removeMember } from "@ziffr/core/handover";
import { signedIn } from "@/lib/auth";
import { SITE_URL } from "@/lib/sign-in";
import type { WorkspaceRoleName } from "@ziffr/core/actor";

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

/** Invites someone by email with a role (a Contact keeps their history). Returns the link to send them.
 * PROTOTYPE: Ziffr does not send the email itself yet; the inviter sends the link. */
export async function inviteMember(input: { email: string; role: WorkspaceRoleName; contactPersonId?: string | null }) {
  const token = await inv.inviteByEmail(await currentActor(), { email: String(input?.email ?? ""), role: input?.role, contactPersonId: input?.contactPersonId ?? null });
  done();
  return `${SITE_URL}/invite/${token}`;
}

/** A link anyone with it can join by, as Member or Guest, for 7 days. */
export async function createInviteLink(role: "member" | "guest") {
  const token = await inv.createInviteLink(await currentActor(), role);
  done();
  return `${SITE_URL}/invite/${token}`;
}

/** Revokes an invitation. */
export async function revokeInvitation(id: number) {
  await inv.revokeInvitation(await currentActor(), Number(id));
  done();
}

/** Changes a member's role. */
export async function changeRole(personId: string, role: WorkspaceRoleName) {
  await inv.setRole(await currentActor(), String(personId), role);
  done();
}

/** Switches domain joining on (for the Owner's own verified domain) or off. */
export async function setDomainJoining(on: boolean) {
  const who = await signedIn();
  await inv.setJoinDomain(await currentActor(), who?.verifiedEmail ?? null, Boolean(on));
  done();
}

/** Approves or declines a request to join. */
export async function decideJoin(id: number, approve: boolean) {
  await inv.decideJoinRequest(await currentActor(), Number(id), Boolean(approve));
  done();
}

/** Removes a member and hands everything they own to a successor; their Tokens, shares and keys end. */
export async function removeMemberWithHandover(personId: string, successorId: string) {
  await removeMember(await currentActor(), String(personId), String(successorId));
  done();
}
