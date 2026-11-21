// Sharing, Groups and people for programs (GLOSSARY: Share, Group, Contact, Workspace Role, Access Key; ticket #434). A
// key with shares:write, groups:write or people:write acts as its creator through the very functions the web app's
// server actions call (sharing.ts, team.ts, invitations.ts, handover.ts), so it has the creator's rights and no more:
// only the owner shares, only Owners and Admins manage Groups and people, only Owners make Owners. These scopes only
// a person's own key may hold (KEY_ONLY_SCOPES): an assistant never gets them and no MCP tool calls these functions,
// so text in a Thread cannot talk an assistant into widening who sees what. Everything returned is something the
// creator may see: a Metric, dashboard or deck they cannot see is "not found", the same whether it exists or not.
import { assertScope, Forbidden, type Actor, type KeyActor, type Scope, type WorkspaceRoleName } from "./actor";
import { db } from "./db";
import { auditedAsKey } from "./audit-log";
import { canSee, decideAccess, share, shareWithGroup, whoCanSee } from "./sharing";
import { peopleFor, type ObjectType } from "./access";
import { getMetrics } from "./workspace-data";
import { addContact, createGroup, deleteGroup, removeContact, renameGroup, setGroupMember } from "./team";
import { removeMember } from "./handover";
import { createInviteLink, decideJoinRequest, inviteByEmail, openInvitations, openJoinRequests, resendInvitation, revokeInvitation, setRole } from "./invitations";
import { linkTo } from "./deliveries";
import type { ShareRole } from "./types";

/** The key's creator: everything a key does here is done as them, with their current role. */
const creatorOf = (actor: KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

/** Refuses a key without the scope, then does the work as its creator; what the work records in the Audit Log names the key. */
function acting<T>(actor: KeyActor, scope: Scope, work: (creator: Actor) => Promise<T>): Promise<T> {
  assertScope(actor, scope);
  return auditedAsKey(Number(actor.key.id), () => work(creatorOf(actor)));
}

const TYPES: ObjectType[] = ["metric", "dashboard", "deck"];

/** The id of the Metric (by slug), dashboard or deck (by number) the creator sees; anything else is "not found". */
async function seenObject(creator: Actor, type: unknown, ref: unknown): Promise<{ type: ObjectType; id: number }> {
  if (!TYPES.includes(type as ObjectType)) throw new Forbidden();
  const t = type as ObjectType;
  let id: number | undefined;
  if (t === "metric") id = (await getMetrics(creator.workspaceId)).find((m) => m.slug === ref)?.id;
  else id = typeof ref === "number" && Number.isInteger(ref) ? ref : typeof ref === "string" && /^\d{1,10}$/.test(ref) ? Number(ref) : undefined;
  if (id === undefined || !(await canSee(creator, t, id))) throw new Forbidden("That was not found.");
  return { type: t, id };
}

// ---- Shares ---------------------------------------------------------------------------------------------------

/** What a Share set looks like to a program. */
export type ApiShare = { type: ObjectType; id: string | number; person: string | null; group: number | null; role: ShareRole | null };

/** Shares a Metric (by slug), dashboard or deck (by id) the creator owns with a member or a Group as Viewer or Editor,
 * or takes the Share away with a null role (scope shares:write). The same checks as the app: the owner only, members
 * of this Workspace only, a deck only with Metrics its owner sees. */
export async function shareWithKey(actor: KeyActor, input: { type: unknown; id: unknown; person?: string | null; group?: number | null; role: ShareRole | null }): Promise<ApiShare> {
  return acting(actor, "shares:write", async (creator) => {
    const o = await seenObject(creator, input.type, input.id);
    // Seen but not owned: a thing the creator may look at, so saying why they may not share it tells them nothing new.
    const { data: owned } = await db().from(o.type === "metric" ? "metrics" : o.type === "deck" ? "decks" : "dashboards").select("owner_id").eq("id", o.id).eq("workspace_id", creator.workspaceId).maybeSingle();
    if (owned?.owner_id !== creator.personId) throw new Forbidden("Only the owner shares this.");
    if ((input.person ? 1 : 0) + (input.group !== undefined && input.group !== null ? 1 : 0) !== 1) throw new Error("Name one person or one Group to share with.");
    if (input.person) await share(creator, o.type, o.id, input.person, input.role);
    else await shareWithGroup(creator, o.type, o.id, input.group as number, input.role);
    return { type: o.type, id: input.id as string | number, person: input.person ?? null, group: input.group ?? null, role: input.role };
  });
}

/** Who can see a Metric, dashboard or deck the creator sees, and why, with the open requests for access when they own it
 * (scope shares:write). Contacts and people by id and name only. */
export async function whoCanSeeWithKey(actor: KeyActor, type: unknown, ref: unknown) {
  return acting(actor, "shares:write", async (creator) => {
    const o = await seenObject(creator, type, ref);
    const seen = await whoCanSee(creator, o.type, o.id);
    const names = new Map((await peopleFor(creator)).map((p) => [p.id, p.name]));
    return {
      owner: seen.owner,
      is_owner: seen.isOwner,
      people: seen.people.filter((p) => p.how.length).map((p) => ({ id: p.person, name: names.get(p.person) ?? "", how: p.how })),
      requests: seen.requests.map((r) => ({ id: r.id as number, person: r.requester_id as string, name: names.get(r.requester_id as string) ?? "", requested_at: r.created_at as string })),
    };
  });
}

/** The owner grants Viewer access to an open request or declines it (scope shares:write); the requester is told. */
export async function decideAccessWithKey(actor: KeyActor, requestId: number, grant: boolean): Promise<{ id: number; granted: boolean }> {
  return acting(actor, "shares:write", async (creator) => {
    await decideAccess(creator, requestId, grant);
    return { id: requestId, granted: grant };
  });
}

// ---- Groups ---------------------------------------------------------------------------------------------------

/** A Group as a program sees it after a change. */
export type ChangedGroup = { id: number; name: string; everyone: false };

const groupName = async (creator: Actor, id: number): Promise<string> => {
  const { data } = await db().from("groups").select("name").eq("id", id).eq("workspace_id", creator.workspaceId).maybeSingle();
  if (!data) throw new Forbidden();
  return data.name as string;
};

/** Makes a Group (scope groups:write; Owners and Admins). */
export async function createGroupWithKey(actor: KeyActor, name: string): Promise<ChangedGroup> {
  return acting(actor, "groups:write", async (creator) => {
    const id = await createGroup(creator, name);
    return { id, name: await groupName(creator, id), everyone: false };
  });
}

/** Renames a Group; never Everyone. */
export async function renameGroupWithKey(actor: KeyActor, id: number, name: string): Promise<ChangedGroup> {
  return acting(actor, "groups:write", async (creator) => {
    await renameGroup(creator, id, name);
    return { id, name: await groupName(creator, id), everyone: false };
  });
}

/** Deletes a Group; what was shared with it stops being shared. Never Everyone. */
export async function deleteGroupWithKey(actor: KeyActor, id: number): Promise<{ removed: number }> {
  return acting(actor, "groups:write", async (creator) => {
    await deleteGroup(creator, id);
    return { removed: id };
  });
}

/** Puts a member of the Workspace into a Group or takes them out. */
export async function setGroupMemberWithKey(actor: KeyActor, groupId: number, personId: string, member: boolean): Promise<{ group: number; person: string; member: boolean }> {
  return acting(actor, "groups:write", async (creator) => {
    await setGroupMember(creator, groupId, personId, member);
    return { group: groupId, person: personId, member };
  });
}

// ---- People ---------------------------------------------------------------------------------------------------

/** Adds a Contact (scope people:write): a person without a sign-in who only submits values. Returns their id and name. */
export async function addContactWithKey(actor: KeyActor, input: { name: string; email?: string; slack_handle?: string; phone?: string }): Promise<{ id: string; name: string; contact: true }> {
  return acting(actor, "people:write", async (creator) => {
    const id = await addContact(creator, { name: input.name, email: input.email, slackHandle: input.slack_handle, phone: input.phone });
    return { id, name: input.name.trim(), contact: true };
  });
}

/** Changes a member's Workspace Role (scope people:write): Owners and Admins; only Owners make or change Owners. */
export async function setRoleWithKey(actor: KeyActor, personId: string, role: WorkspaceRoleName): Promise<{ id: string; role: WorkspaceRoleName }> {
  return acting(actor, "people:write", async (creator) => {
    await setRole(creator, personId, role);
    return { id: personId, role };
  });
}

/** Removes a Contact, or a member with everything they own handed to `successor` (scope people:write). A member needs a
 * successor who is another member and not a Guest; nobody removes themselves. */
export async function removePersonWithKey(actor: KeyActor, personId: string, successor: string | null): Promise<{ removed: string }> {
  return acting(actor, "people:write", async (creator) => {
    const { data: contact } = await db().from("contacts").select("person_id").eq("workspace_id", creator.workspaceId).eq("person_id", personId).maybeSingle();
    if (contact) await removeContact(creator, personId);
    else {
      if (!successor) throw new Error("Name who takes over what they own: successor.");
      await removeMember(creator, personId, successor);
    }
    return { removed: personId };
  });
}

// ---- Invitations ----------------------------------------------------------------------------------------------

/** An invitation as a program sees it: never its token, so a list cannot be used to join. */
export type ApiInvitation = { id: number; email: string | null; role: WorkspaceRoleName; expires_at: string; created_at: string; emailed: boolean; email_error: string | null };

type InvitationRow = { id: number; email: string | null; role: string; expires_at: string; created_at: string; email_sent_at: string | null; email_error: string | null };
const asInvitation = (r: InvitationRow): ApiInvitation => ({ id: r.id, email: r.email, role: r.role as WorkspaceRoleName, expires_at: r.expires_at, created_at: r.created_at, emailed: Boolean(r.email_sent_at), email_error: r.email_error });

/** The Workspace's open invitations (scope people:write; Owners and Admins). */
export async function listInvitationsWithKey(actor: KeyActor): Promise<ApiInvitation[]> {
  return acting(actor, "people:write", async (creator) => {
    return (await openInvitations(creator)).map((r) => asInvitation(r as InvitationRow));
  });
}

/** Invites an address with a role for 14 days (scope people:write) and emails it, as the app does. The answer holds no
 * token: the link goes only to that address. */
export async function inviteWithKey(actor: KeyActor, input: { email: string; role: WorkspaceRoleName; contact?: string | null }): Promise<ApiInvitation> {
  return acting(actor, "people:write", async (creator) => {
    const { token } = await inviteByEmail(creator, { email: input.email, role: input.role, contactPersonId: input.contact ?? null });
    const { data } = await db().from("invitations").select("id, email, role, expires_at, created_at, email_sent_at, email_error").eq("workspace_id", creator.workspaceId).eq("token", token).single();
    return asInvitation(data as InvitationRow);
  });
}

/** Makes an invite link for Members or Guests (scope people:write), good for 7 days. Anyone with the link joins, so the
 * answer is the link itself and nothing else keeps it; it is shown to the caller once, as in the app. */
export async function inviteLinkWithKey(actor: KeyActor, role: "member" | "guest"): Promise<{ url: string; role: "member" | "guest" }> {
  return acting(actor, "people:write", async (creator) => {
    const token = await createInviteLink(creator, role);
    return { url: linkTo(`/invite/${token}`), role };
  });
}

/** Revokes an open invitation of the Workspace. */
export async function revokeInvitationWithKey(actor: KeyActor, id: number): Promise<{ removed: number }> {
  return acting(actor, "people:write", async (creator) => {
    await revokeInvitation(creator, id);
    return { removed: id };
  });
}

/** Emails an open invitation again; the core limits how often. */
export async function resendInvitationWithKey(actor: KeyActor, id: number): Promise<{ id: number }> {
  return acting(actor, "people:write", async (creator) => {
    await resendInvitation(creator, id);
    return { id };
  });
}

// ---- Join requests --------------------------------------------------------------------------------------------

/** A request to join by the Workspace's domain: who asks, with the address they proved, as the approvers see it. */
export type ApiJoinRequest = { id: number; requested_at: string; person: { id: string; name: string; email: string | null } };

/** The open requests to join (scope people:write). */
export async function listJoinRequestsWithKey(actor: KeyActor): Promise<ApiJoinRequest[]> {
  return acting(actor, "people:write", async (creator) => {
    return (await openJoinRequests(creator)).map((r) => ({ id: r.id, requested_at: r.at, person: { id: r.person.id, name: r.person.name, email: r.person.email } }));
  });
}

/** Approves (as Member) or declines a request to join. */
export async function decideJoinRequestWithKey(actor: KeyActor, id: number, approve: boolean): Promise<{ id: number; approved: boolean }> {
  return acting(actor, "people:write", async (creator) => {
    await decideJoinRequest(creator, id, approve);
    return { id, approved: approve };
  });
}
