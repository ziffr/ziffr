// Invitations, domain joining and roles (GLOSSARY: Invitation, Domain Joining, Workspace Role, Contact). Owners and
// Admins invite and change roles; only Owners make or remove Owners, and a workspace never loses its last Owner.
// Joining by domain is off until an Owner sets the domain, and every request is approved by an Owner or Admin.
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { sendingLimit } from "./sending-limit";
import { sendingLimitDefault } from "./sending-limits";
import { openNames } from "./sealed-columns";
import { assertCan, Forbidden, type Actor, type WorkspaceRoleName } from "./actor";
import { DEMO_WORKSPACE_ID } from "./team";
import { linkTo } from "./deliveries";
import { brandedParts, headerSafe, sentByLine, isAddress, mailboxKey, mailOn, sendMail, type MailTransport } from "./mail";
import { audit, recordAudit } from "./audit-log";
import { assertNotTrial } from "./trials";
import { refuseInDemo } from "./demo";
import { personalWebhooksOf, recordPersonalWebhooksEnded } from "./personal-webhooks";

const ROLES: WorkspaceRoleName[] = ["owner", "admin", "member", "guest"];
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

/** Refuses the demo before anything is emailed: its made-up people's addresses reach nobody. */
function notDemo(actor: Actor) {
  refuseInDemo(actor);
}

/** Only Owners may grant or take away the Owner role. */
function assertMayGrant(actor: Actor, role: WorkspaceRoleName) {
  assertCan(actor, "manage-members");
  if (!ROLES.includes(role)) throw new Forbidden();
  if (role === "owner" && actor.role !== "owner") throw new Forbidden("Only Owners make Owners.");
}

const token = () => randomBytes(24).toString("base64url");
const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/** How many times an invitation may be emailed, and how long between two. */
const MAX_SENDS = 3;
const RESEND_AFTER = 60_000;

const ROLE_LABEL: Record<WorkspaceRoleName, string> = { owner: "an Owner", admin: "an Admin", member: "a Member", guest: "a Guest" };

/** Invitation emails one workspace may send in 24 hours, unless ZIFFR_LIMIT_INVITATION_EMAILS_PER_WORKSPACE_PER_DAY says otherwise (the default). With the next, it keeps an invitation from being a way to
 * mail strangers: anyone who may invite could otherwise send any address mail. */
export const INVITATION_EMAILS_PER_WORKSPACE = sendingLimitDefault("invitationsPerWorkspace");
/** Invitation emails one address may get in 24 hours, from all workspaces together. */
export const INVITATION_EMAILS_PER_ADDRESS = 3;
/** Invitation emails one person may cause in 24 hours (by inviting or resending), from all their workspaces. */
export const INVITATION_EMAILS_PER_SENDER = 50;

/** Emails an invitation with its link (spec 0004), and notes on it whether that worked. Never throws: the
 * invitation stands either way, and the Team page says whether it went out. A send is claimed first, in one
 * database transaction with the limits (claim_invitation_email), so sends at once cannot pass them. */
async function emailInvitation(id: number, sender: string, transport?: MailTransport): Promise<boolean> {
  const { data: inv } = await db().from("invitations").select("id, workspace_id, token, email, role, expires_at, email_sends, workspaces(name), profiles!invitations_created_by_fkey(name, email)").eq("id", id).maybeSingle();
  if (!inv?.email || inv.email_sends >= MAX_SENDS) return false;
  // Claimed in the database under locks on the address and the workspace, counting the day's real sends there.
  const { data: claim, error } = await db().rpc("claim_invitation_email", {
    p_invitation: inv.id, p_sender: sender, p_address_key: mailboxKey(inv.email),
    p_per_workspace: await sendingLimit("invitationsPerWorkspace"), p_per_address: INVITATION_EMAILS_PER_ADDRESS, p_per_sender: INVITATION_EMAILS_PER_SENDER,
  });
  if (error) return false;
  if (claim === "limit") {
    await db().from("invitations").update({ email_error: "Too many invitation emails today; send the link yourself." }).eq("id", id);
    return false;
  }
  if (claim !== "ok") return false;
  // Names people chose go in the body, quoted, never in the subject, so the subject cannot pass for another sender's.
  // Each on one line, at most 80 characters, without quote marks of its own, and always inside quotes after fixed text.
  const named = (s: string) => headerSafe(s).replace(/[“”"«»„]/g, "'").slice(0, 80);
  const workspace = named((inv.workspaces as unknown as { name: string } | null)?.name ?? "a workspace");
  const inviterRow = inv.profiles as unknown as { name: string; email: string | null } | null;
  const inviter = named(inviterRow?.name ?? "someone");
  // Ziffr's own line about who is behind it, in the plain text and the HTML alike: the Workspace's brand never replaces it.
  const by = { name: inviter, email: inviterRow?.email, did: "invited you to" };
  const until = new Date(inv.expires_at).toISOString().slice(0, 10);
  try {
    const text = [
        "Hi,", "",
        `You are invited to join the workspace “${workspace}” on Ziffr as ${ROLE_LABEL[inv.role as WorkspaceRoleName] ?? "a Member"}, by “${inviter}”.`, "",
        `Join here: ${linkTo(`/invite/${inv.token}`)}`, "",
        `The invitation works until ${until}, and only for this address (${inv.email}).`,
        "The names above were chosen by the people in that workspace. If you did not expect this, you can ignore it.",
      "", sentByLine(by, workspace),
      ].join("\n");
    await sendMail({ to: inv.email, subject: "You are invited to a workspace on Ziffr", text, ...(await brandedParts(inv.workspace_id, { text }, by)) }, transport);
    return true;
  } catch (e) {
    // Only the kind of failure: the server's own words may hold addresses or settings.
    await db().from("invitations").update({ email_error: `The mail server refused it (${(e as { code?: string }).code ?? "error"}).` }).eq("id", id);
    return false;
  }
}

/** Invites someone by email with a role, for 14 days, and emails them the link once mail is set up. Inviting a
 * Contact makes them a member who keeps their history. Returns the token for the link the invitee follows, and whether the email really went out (false when mail is not set up, the daily limit held it back, or the mail server refused it). */
export async function inviteByEmail(actor: Actor, input: { email: string; role: WorkspaceRoleName; contactPersonId?: string | null }, transport?: MailTransport): Promise<{ token: string; emailed: boolean }> {
  notDemo(actor);
  await assertNotTrial(actor.workspaceId, "Inviting people");
  assertMayGrant(actor, input.role);
  const email = String(input.email ?? "").trim().toLowerCase();
  // The same check as sending, so an invitation is never made for an address mail cannot go to.
  if (!isAddress(email)) throw new Error("Enter a valid email address.");
  if (input.contactPersonId) {
    const { data } = await db().from("contacts").select("person_id").eq("workspace_id", actor.workspaceId).eq("person_id", input.contactPersonId).maybeSingle();
    if (!data) throw new Forbidden();
  }
  const t = token();
  const { data: made, error } = await db().from("invitations").insert({
    workspace_id: actor.workspaceId, token: t, email, role: input.role, contact_person_id: input.contactPersonId ?? null,
    created_by: actor.personId, expires_at: new Date(Date.now() + 14 * DAY).toISOString(),
  }).select("id").single();
  if (error || !made) throw new Error("The invitation could not be made.");
  // A Contact is named, not addressed: their address is a contact detail and stays out of the record.
  const name = input.contactPersonId ? await personName(input.contactPersonId, actor.workspaceId) : email;
  await audit(actor, { kind: "invitation.created", object: { type: "invitation", id: made.id, name }, details: { role: input.role, by: "email", contact: Boolean(input.contactPersonId) } });
  const emailed = (await mailOn()) ? await emailInvitation(made.id, actor.personId, transport) : false;
  return { token: t, emailed };
}

/** Emails an open invitation again, for Owners and Admins: at most three sends in all, a minute apart. */
export async function resendInvitation(actor: Actor, id: number, transport?: MailTransport): Promise<void> {
  notDemo(actor);
  await assertNotTrial(actor.workspaceId, "Inviting people");
  assertCan(actor, "manage-members");
  if (!(await mailOn())) throw new Error("Email is not set up on this Ziffr.");
  const { data: inv } = await db().from("invitations").select("id, email, email_sends, email_sent_at, revoked_at, accepted_at, expires_at").eq("id", Number(id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!inv || !inv.email || inv.revoked_at || inv.accepted_at || new Date(inv.expires_at).getTime() < Date.now()) throw new Forbidden();
  if (inv.email_sends >= MAX_SENDS) throw new Error("This invitation was emailed three times already; send the link yourself.");
  if (inv.email_sent_at && Date.now() - new Date(inv.email_sent_at).getTime() < RESEND_AFTER) throw new Error("It was emailed a moment ago.");
  if (!(await emailInvitation(inv.id, actor.personId, transport))) throw new Error("The email could not be sent; try again later.");
}

/** A link anyone with it can join by, as Member or Guest, for 7 days. Returns its token. */
export async function createInviteLink(actor: Actor, role: "member" | "guest"): Promise<string> {
  notDemo(actor);
  await assertNotTrial(actor.workspaceId, "An invite link");
  if (role !== "member" && role !== "guest") throw new Forbidden("Links invite Members or Guests.");
  assertMayGrant(actor, role);
  const t = token();
  const { data: made, error } = await db().from("invitations").insert({ workspace_id: actor.workspaceId, token: t, role, created_by: actor.personId, expires_at: new Date(Date.now() + 7 * DAY).toISOString() }).select("id").single();
  if (error || !made) throw new Error("The link could not be made.");
  await audit(actor, { kind: "invitation.created", object: { type: "invitation", id: made.id, name: "Invite link" }, details: { role, by: "link" } });
  return t;
}

/** The workspace's invitations that still work, for Owners and Admins. */
export async function openInvitations(actor: Actor) {
  assertCan(actor, "manage-members");
  // Never the token: whoever sees the list must not be able to use or pass on an invitation from it.
  const { data } = await db().from("invitations").select("id, email, role, expires_at, created_at, email_sent_at, email_sends, email_error").eq("workspace_id", actor.workspaceId).is("revoked_at", null).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("id", { ascending: false });
  return data ?? [];
}

/** Revokes an invitation of the workspace. */
export async function revokeInvitation(actor: Actor, id: number) {
  assertCan(actor, "manage-members");
  const { data } = await db().from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", actor.workspaceId).select("id, email, role, contact_person_id");
  if (!data?.length) throw new Forbidden();
  await audit(actor, { kind: "invitation.revoked", object: { type: "invitation", id: data[0].id, name: await invitationName(data[0], actor.workspaceId) }, details: { role: data[0].role } });
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
  // An invitation made before the workspace became a trial cannot exist, but a trial never takes a second person.
  await assertNotTrial(inv.workspace_id as string, "Joining");
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
  await recordAudit(inv.workspace_id, who.personId, { kind: "invitation.accepted", object: { type: "invitation", id: inv.id, name: await invitationName(inv, inv.workspace_id) }, details: { role: existing ? (existing.role as string) : (inv.role as string), already_member: Boolean(existing) } });
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
  // A Guest has no Personal Webhooks: they end with the change (the database removes them), noted first for the Audit Log.
  const ending = role === "guest" && current.role !== "guest" ? await personalWebhooksOf(actor.workspaceId, personId) : [];
  const { error } = await db().from("memberships").update({ role }).eq("workspace_id", actor.workspaceId).eq("user_id", personId);
  // The database refuses to leave a workspace without an Owner, also when two changes race.
  if (error) throw new Error(/at least one Owner/.test(error.message) ? "A workspace keeps at least one Owner. Make someone else Owner first." : "The role could not be changed.");
  await recordPersonalWebhooksEnded(actor.workspaceId, personId, ending, "guest", actor.personId);
  if (current.role !== role) await audit(actor, { kind: "member.role_changed", object: { type: "person", id: personId, name: await personName(personId, actor.workspaceId) }, details: { from: current.role, to: role } });
}

/** Switches domain joining on for the domain of the Owner's own verified address, or off with null. */
export async function setJoinDomain(actor: Actor, ownerEmail: string | null, on: boolean) {
  notDemo(actor);
  await assertNotTrial(actor.workspaceId, "Domain joining");
  if (actor.role !== "owner") throw new Forbidden("Only Owners switch domain joining.");
  let domain: string | null = null;
  if (on) {
    domain = ownerEmail ? domainOf(ownerEmail) : "";
    if (!domain) throw new Error("Your address needs to be verified first.");
    if (PUBLIC_DOMAINS.has(domain)) throw new Error(`${domain} is a public mail provider, not a company domain.`);
  }
  const { data: before } = await db().from("workspaces").select("join_domain").eq("id", actor.workspaceId).single();
  await db().from("workspaces").update({ join_domain: domain }).eq("id", actor.workspaceId);
  if ((before?.join_domain ?? null) !== domain) {
    await audit(actor, { kind: domain ? "domain_joining.on" : "domain_joining.off", object: { type: "workspace", id: actor.workspaceId }, details: { domain: domain ?? before?.join_domain ?? null } });
  }
}

/** Workspaces a signed-in person may ask to join by their verified address's domain, and that they are not in. */
export async function joinableWorkspaces(who: SignedIn) {
  if (!who.verifiedEmail) return [];
  const domain = domainOf(who.verifiedEmail);
  if (!domain || PUBLIC_DOMAINS.has(domain)) return [];
  const [{ data: spaces }, { data: mine }, { data: asked }] = await Promise.all([
    db().from("workspaces").select("id, name").eq("join_domain", domain).neq("id", DEMO_WORKSPACE_ID).is("trial_ends_at", null),
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
  if (!error) await recordAudit(workspaceId, who.personId, { kind: "join_request.created", object: { type: "person", id: who.personId, name: await personName(who.personId, workspaceId) } });
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
  // No request can reach a trial (joinableWorkspaces leaves them out), but one that got there anyway lets nobody in.
  if (approve) await assertNotTrial(actor.workspaceId, "Joining");
  const { data: r } = await db().from("join_requests").update({ status: approve ? "approved" : "declined", decided_by: actor.personId, decided_at: new Date().toISOString() })
    .eq("id", id).eq("workspace_id", actor.workspaceId).eq("status", "open").select("person_id");
  if (!r?.length) throw new Forbidden();
  if (approve) await db().from("memberships").upsert({ workspace_id: actor.workspaceId, user_id: r[0].person_id, role: "member" }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
  await audit(actor, { kind: approve ? "join_request.approved" : "join_request.declined", object: { type: "person", id: r[0].person_id, name: await personName(r[0].person_id, actor.workspaceId) }, details: approve ? { role: "member" } : {} });
}

/** An invitation as the Audit Log names it: the Contact's name, the invited address, or a link. */
async function invitationName(inv: { email: string | null; contact_person_id: string | null }, workspaceId: string): Promise<string | null> {
  if (inv.contact_person_id) return personName(inv.contact_person_id, workspaceId);
  return inv.email ?? "Invite link";
}

/** A person's name as the Audit Log keeps it; a Contact's opened with the Workspace's key. */
async function personName(personId: string, workspaceId: string): Promise<string | null> {
  const { data } = await db().from("profiles").select("id, name").eq("id", personId).maybeSingle();
  return data ? (((await openNames(workspaceId, [data]))[0].name as string | undefined) ?? null) : null;
}
