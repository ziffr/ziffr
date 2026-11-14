// Invitations, domain joining and roles (GLOSSARY: Invitation, Domain Joining, Workspace Role, Contact). Owners and
// Admins invite and change roles; only Owners make or remove Owners, and a workspace never loses its last Owner.
// Joining by domain is off until an Owner sets the domain, and every request is approved by an Owner or Admin.
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { assertCan, Forbidden, type Actor, type WorkspaceRoleName } from "./actor";
import { DEMO_WORKSPACE_ID } from "./team";

const ROLES: WorkspaceRoleName[] = ["owner", "admin", "member", "guest"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 86_400_000;
/** Mail providers anyone can sign up with: their domain says nothing about a company. */
const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "msn.com", "yahoo.com", "yahoo.de", "ymail.com",
  "icloud.com", "me.com", "mac.com", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "web.de", "freenet.de", "posteo.de", "mailbox.org", "proton.me",
  "protonmail.com", "pm.me", "aol.com", "mail.com", "t-online.de", "yandex.com", "yandex.ru", "mail.ru", "qq.com", "163.com", "zoho.com",
  "fastmail.com", "tutanota.com", "tuta.io", "hey.com", "bluewin.ch", "orange.fr", "free.fr", "libero.it", "seznam.cz", "wp.pl", "o2.pl",
]);

/** A person who has signed in, with their proven address: confirmed through a way of signing in that proves it
 * (the email link, Google), null otherwise. Callers must never pass an address merely claimed by a provider. */
export type SignedIn = { personId: string; verifiedEmail: string | null };

/** Refuses the shared demo: invitations and joining there would bring strangers into every visitor's demo. */
function notDemo(actor: Actor) {
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no invitations.");
}

/** Only Owners may grant or take away the Owner role. */
function assertMayGrant(actor: Actor, role: WorkspaceRoleName) {
  assertCan(actor, "manage-members");
  if (!ROLES.includes(role)) throw new Forbidden();
  if (role === "owner" && actor.role !== "owner") throw new Forbidden("Only Owners make Owners.");
}

const token = () => randomBytes(24).toString("base64url");
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/** Invites someone by email with a role, for 14 days. Inviting a Contact makes them a member who keeps their
 * history. Returns the token for the link the invitee follows. */
export async function inviteByEmail(actor: Actor, input: { email: string; role: WorkspaceRoleName; contactPersonId?: string | null }): Promise<string> {
  notDemo(actor);
  assertMayGrant(actor, input.role);
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) throw new Error("Enter a valid email address.");
  if (input.contactPersonId) {
    const { data } = await db().from("contacts").select("person_id").eq("workspace_id", actor.workspaceId).eq("person_id", input.contactPersonId).maybeSingle();
    if (!data) throw new Forbidden();
  }
  const t = token();
  const { error } = await db().from("invitations").insert({
    workspace_id: actor.workspaceId, token: t, email, role: input.role, contact_person_id: input.contactPersonId ?? null,
    created_by: actor.personId, expires_at: new Date(Date.now() + 14 * DAY).toISOString(),
  });
  if (error) throw new Error("The invitation could not be made.");
  return t;
}

/** A link anyone with it can join by, as Member or Guest, for 7 days. Returns its token. */
export async function createInviteLink(actor: Actor, role: "member" | "guest"): Promise<string> {
  notDemo(actor);
  if (role !== "member" && role !== "guest") throw new Forbidden("Links invite Members or Guests.");
  assertMayGrant(actor, role);
  const t = token();
  const { error } = await db().from("invitations").insert({ workspace_id: actor.workspaceId, token: t, role, created_by: actor.personId, expires_at: new Date(Date.now() + 7 * DAY).toISOString() });
  if (error) throw new Error("The link could not be made.");
  return t;
}

/** The workspace's invitations that still work, for Owners and Admins. */
export async function openInvitations(actor: Actor) {
  assertCan(actor, "manage-members");
  // Never the token: whoever sees the list must not be able to use or pass on an invitation from it.
  const { data } = await db().from("invitations").select("id, email, role, expires_at, created_at").eq("workspace_id", actor.workspaceId).is("revoked_at", null).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("id", { ascending: false });
  return data ?? [];
}

/** Revokes an invitation of the workspace. */
export async function revokeInvitation(actor: Actor, id: number) {
  assertCan(actor, "manage-members");
  const { data } = await db().from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", actor.workspaceId).select("id");
  if (!data?.length) throw new Forbidden();
}

/** What an invitation offers, for its page: the workspace, the role and whether it still works. Nothing else. */
export async function invitationFor(t: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(t))) return null;
  const { data: inv } = await db().from("invitations").select("email, role, expires_at, revoked_at, accepted_at, workspaces(name)").eq("token", t).maybeSingle();
  if (!inv) return null;
  const usable = !inv.revoked_at && !inv.accepted_at && inv.expires_at > new Date().toISOString();
  return { workspace: (inv.workspaces as unknown as { name: string }).name, role: inv.role as WorkspaceRoleName, forEmail: inv.email as string | null, usable };
}

/** The signed-in person accepts an invitation and becomes a member with its role (one already a member keeps their
 * role). An email invitation needs that very address, verified, and works once. Returns the workspace. */
export async function acceptInvitation(who: SignedIn, t: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(t))) throw new Forbidden();
  const { data: inv } = await db().from("invitations").select("*").eq("token", t).maybeSingle();
  if (!inv || inv.revoked_at || inv.accepted_at || inv.expires_at <= new Date().toISOString()) throw new Error("This invitation does not work any more. Ask for a new one.");
  if (inv.email && inv.email !== who.verifiedEmail?.toLowerCase()) throw new Error(`This invitation is for ${inv.email}. Sign in with that address.`);
  if (inv.email) {
    // Claimed first, so the same email invitation cannot be used twice at once.
    const { data: claimed } = await db().from("invitations").update({ accepted_at: new Date().toISOString(), accepted_by: who.personId }).eq("id", inv.id).is("accepted_at", null).select("id");
    if (!claimed?.length) throw new Error("This invitation was used already.");
  }
  const { data: existing } = await db().from("memberships").select("role").eq("workspace_id", inv.workspace_id).eq("user_id", who.personId).maybeSingle();
  if (!existing) {
    const { error } = await db().from("memberships").insert({ workspace_id: inv.workspace_id, user_id: who.personId, role: inv.role });
    if (error) {
      // Not used up by a failed join: the invitation works again.
      if (inv.email) await db().from("invitations").update({ accepted_at: null, accepted_by: null }).eq("id", inv.id);
      throw new Error("Joining did not work. Try again.");
    }
  }
  if (inv.contact_person_id && inv.contact_person_id !== who.personId) {
    const { error } = await db().rpc("merge_contact", { ws: inv.workspace_id, contact: inv.contact_person_id, person: who.personId });
    if (error) throw new Error("Joining worked, but the contact's history could not be moved.");
  }
  return inv.workspace_id as string;
}

/** Changes a member's role. Owners and Admins may; only Owners make or remove Owners; the last Owner stays. */
export async function setRole(actor: Actor, personId: string, role: WorkspaceRoleName) {
  notDemo(actor);
  assertMayGrant(actor, role);
  const { data: current } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", personId).maybeSingle();
  if (!current) throw new Forbidden();
  if (current.role === "owner" && actor.role !== "owner") throw new Forbidden("Only Owners change an Owner's role.");
  if (current.role === "owner" && role !== "owner") {
    const { count } = await db().from("memberships").select("user_id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).eq("role", "owner");
    if ((count ?? 0) <= 1) throw new Error("A workspace keeps at least one Owner. Make someone else Owner first.");
  }
  const { error } = await db().from("memberships").update({ role }).eq("workspace_id", actor.workspaceId).eq("user_id", personId);
  // The database refuses to leave a workspace without an Owner, also when two changes race.
  if (error) throw new Error(/at least one Owner/.test(error.message) ? "A workspace keeps at least one Owner. Make someone else Owner first." : "The role could not be changed.");
}

/** Switches domain joining on for the domain of the Owner's own verified address, or off with null. */
export async function setJoinDomain(actor: Actor, ownerEmail: string | null, on: boolean) {
  notDemo(actor);
  if (actor.role !== "owner") throw new Forbidden("Only Owners switch domain joining.");
  let domain: string | null = null;
  if (on) {
    domain = ownerEmail ? domainOf(ownerEmail) : "";
    if (!domain) throw new Error("Your address needs to be verified first.");
    if (PUBLIC_DOMAINS.has(domain)) throw new Error(`${domain} is a public mail provider, not a company domain.`);
  }
  await db().from("workspaces").update({ join_domain: domain }).eq("id", actor.workspaceId);
}

/** Workspaces a signed-in person may ask to join by their verified address's domain, and that they are not in. */
export async function joinableWorkspaces(who: SignedIn) {
  if (!who.verifiedEmail) return [];
  const domain = domainOf(who.verifiedEmail);
  if (!domain || PUBLIC_DOMAINS.has(domain)) return [];
  const [{ data: spaces }, { data: mine }, { data: asked }] = await Promise.all([
    db().from("workspaces").select("id, name").eq("join_domain", domain).neq("id", DEMO_WORKSPACE_ID),
    db().from("memberships").select("workspace_id").eq("user_id", who.personId),
    db().from("join_requests").select("workspace_id").eq("person_id", who.personId).eq("status", "open"),
  ]);
  const member = new Set((mine ?? []).map((m) => m.workspace_id));
  const pending = new Set((asked ?? []).map((a) => a.workspace_id));
  return (spaces ?? []).filter((s) => !member.has(s.id)).map((s) => ({ id: s.id as string, name: s.name as string, asked: pending.has(s.id) }));
}

/** Asks to join a workspace by domain; an Owner or Admin decides. */
export async function requestToJoin(who: SignedIn, workspaceId: string) {
  if (!(await joinableWorkspaces(who)).some((w) => w.id === workspaceId)) throw new Forbidden();
  const { error } = await db().from("join_requests").insert({ workspace_id: workspaceId, person_id: who.personId });
  // Asked already: one open request per person is enough.
  if (error && error.code !== "23505") throw new Error("The request could not be sent.");
}

/** Open requests to join the workspace, with who asked, for Owners and Admins. */
export async function openJoinRequests(actor: Actor) {
  assertCan(actor, "manage-members");
  // With the requester's proven address, so approvers see who really asks, not only a name they chose.
  const { data } = await db().from("join_requests").select("id, created_at, profiles!join_requests_person_id_fkey(id, name, email)").eq("workspace_id", actor.workspaceId).eq("status", "open").order("id");
  return (data ?? []).map((r) => ({ id: r.id as number, at: r.created_at as string, person: r.profiles as unknown as { id: string; name: string; email: string | null } }));
}

/** Approves (as Member) or declines a request to join. */
export async function decideJoinRequest(actor: Actor, id: number, approve: boolean) {
  assertCan(actor, "manage-members");
  const { data: r } = await db().from("join_requests").update({ status: approve ? "approved" : "declined", decided_by: actor.personId, decided_at: new Date().toISOString() })
    .eq("id", id).eq("workspace_id", actor.workspaceId).eq("status", "open").select("person_id");
  if (!r?.length) throw new Forbidden();
  if (approve) await db().from("memberships").upsert({ workspace_id: actor.workspaceId, user_id: r[0].person_id, role: "member" }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
}
