// Practice Workspaces (spec 0063; GLOSSARY: Practice Workspace, Made-up Person): nothing reaches anyone but the person
// one was made for, or an address they entered themselves. Every place that sends, or that would let somebody else in,
// asks here first. It fails closed: a question that cannot be answered sends nothing. The database holds the same rule
// where it can see it (practice_allows), so a place that forgets to ask still cannot queue a message to anybody else or
// keep a connection that was not switched on.
// What may leave, and nothing more:
//  - email, Slack and Telegram to the person themself, each only while switched on, and only to the one address or chat
//    account recorded for it, compared with where the message would really go, at the moment it goes;
//  - View Links, Calendar Links and Webhooks the person makes.
import { Forbidden } from "./actor";
import { db } from "./db";
import { isInstallationAdmin } from "./installation-admins";
import { ServerFault } from "./server-fault";

/** Why a Delivery of a Practice Workspace stays in the Outbox, as the Outbox says it. */
export const PRACTICE_HELD = "Practice Workspace: nothing is sent.";
/** The refusal of something that would reach somebody else from a Practice Workspace, or let them in. */
export const PRACTICE_REFUSED = "This is a Practice Workspace: nothing reaches anyone but you or an address you entered yourself, and nobody else can be let in.";

/** Thrown where a person asks for something a Practice Workspace does not do; its message is for people. */
export class PracticeRefused extends Forbidden {
  constructor(message = PRACTICE_REFUSED) {
    super(message);
    this.name = "PracticeRefused";
  }
}

/** The ways something can leave a Workspace, or somebody can look into it from outside. A new way is added here, so it
 * has to be named by whoever adds it. */
export type WayOut = "email" | "slack" | "telegram" | "webhook" | "invitation" | "view_link" | "calendar_link" | "billing" | "feedback" | "marketplace_report";

/** The ways the person of a Practice Workspace may switch on, to reach themself. */
export const SELF_WAYS = ["email", "slack", "telegram"] as const;
/** One of the ways to oneself. */
export type SelfWay = (typeof SELF_WAYS)[number];
const isSelfWay = (way: WayOut): way is SelfWay => (SELF_WAYS as readonly string[]).includes(way);

/** Who something would reach, where the place that sends knows it. */
export type Reaches = {
  /** The person a message is for, or who made the Webhook. */
  recipientId?: string;
  /** Where a message would really go: the email address, "team:user" on Slack, the chat id on Telegram. */
  destination?: string;
};

// Whom a Workspace was made for never changes (the database refuses to change the mark), so an answer read once holds
// for as long as the process runs. Only answers about a Workspace that exists are kept.
const known = new Map<string, string | null>();
const KEPT = 10_000;

/** Whom a Practice Workspace was made for; null for an ordinary Workspace; "" for one that is gone, which counts as
 * made for nobody. Throws when it cannot be read. */
export async function practiceFor(workspaceId: string): Promise<string | null> {
  const before = known.get(workspaceId);
  if (before !== undefined) return before;
  const { data, error } = await db().from("workspaces").select("practice_for").eq("id", workspaceId).maybeSingle();
  if (error) throw new ServerFault("Whether this Workspace may send could not be read, so nothing was sent.");
  if (!data) return "";
  const madeFor = (data.practice_for as string | null) ?? null;
  if (known.size >= KEPT) known.clear();
  known.set(workspaceId, madeFor);
  return madeFor;
}

/** Whether a Workspace is a Practice Workspace (one that is gone counts as one: nothing is sent for it). */
export async function isPracticeWorkspace(workspaceId: string): Promise<boolean> {
  return (await practiceFor(workspaceId)) !== null;
}

/** An address or account as it is recorded and compared. */
export const asDestination = (value: string): string => value.trim().toLowerCase();

/** The destination recorded for a way that is switched on, or undefined when it is off. Read every time: a switch changes. */
async function switched(workspaceId: string, way: SelfWay): Promise<{ destination: string | null } | undefined> {
  const { data, error } = await db().from("practice_ways").select("destination").eq("workspace_id", workspaceId).eq("way", way).maybeSingle();
  if (error) throw new ServerFault("Whether this way is switched on could not be read, so nothing was sent.");
  return data ? { destination: (data.destination as string | null) ?? null } : undefined;
}

/** The address the sign-in service holds as verified for a person now, or null. Never the one a profile merely says. */
export async function verifiedSignInAddress(personId: string): Promise<string | null> {
  const { data: profile, error } = await db().from("profiles").select("auth_user_id").eq("id", personId).maybeSingle();
  if (error) throw new ServerFault("The sign-in address could not be read, so nothing was sent.");
  if (!profile?.auth_user_id) return null;
  const { data, error: failed } = await db().auth.admin.getUserById(profile.auth_user_id as string);
  if (failed) throw new ServerFault("The sign-in address could not be read, so nothing was sent.");
  const user = data?.user;
  return user?.email && user.email_confirmed_at ? asDestination(user.email) : null;
}

/** Whether a way is open in a Workspace at all: always in an ordinary one; in a Practice Workspace only a way to oneself
 * that is switched on, while its person is still an Installation Admin. What connects or hands out a bot asks this;
 * what sends asks `heldBack` with where it would go. */
export async function wayOpen(workspaceId: string, way: SelfWay): Promise<boolean> {
  const madeFor = await practiceFor(workspaceId);
  if (madeFor === null) return true;
  return madeFor !== "" && (await switched(workspaceId, way)) !== undefined && (await isInstallationAdmin({ personId: madeFor }));
}

/** Whether a new message to this person by this way may be queued. Where it would go is compared again when it is sent. */
export async function mayQueue(workspaceId: string, way: SelfWay, recipientId: string): Promise<boolean> {
  const madeFor = await practiceFor(workspaceId);
  return madeFor === null || (recipientId === madeFor && (await wayOpen(workspaceId, way)));
}

/** A message to oneself may go only when it is for the person, to the very destination recorded for the way. */
async function toOneself(workspaceId: string, way: SelfWay, madeFor: string, reaches: Reaches): Promise<boolean> {
  if (reaches.recipientId !== madeFor || !reaches.destination) return false;
  const on = await switched(workspaceId, way);
  if (!on?.destination || on.destination !== asDestination(reaches.destination)) return false;
  if (!(await isInstallationAdmin({ personId: madeFor }))) return false;
  // Email also only while the sign-in service still holds that address as theirs.
  return way !== "email" || (await verifiedSignInAddress(madeFor)) === on.destination;
}

/** Whether a Practice Workspace may do this. Everything not named here is held back. */
async function allowed(workspaceId: string, way: WayOut, madeFor: string, reaches: Reaches): Promise<boolean> {
  if (!madeFor) return false;
  if (way === "view_link" || way === "calendar_link") return true;
  // A Webhook the person made: asked in general when one is set up, and with its maker when it is sent.
  if (way === "webhook") return reaches.recipientId === undefined || reaches.recipientId === madeFor;
  return isSelfWay(way) && toOneself(workspaceId, way, madeFor, reaches);
}

/** Whether this must not leave the Workspace by this way. Asked where it would leave, with who and where it would reach.
 * Throws, so nothing leaves, when it cannot be answered. */
export async function heldBack(workspaceId: string, way: WayOut, reaches: Reaches = {}): Promise<boolean> {
  const madeFor = await practiceFor(workspaceId);
  return madeFor !== null && !(await allowed(workspaceId, way, madeFor, reaches));
}

/** Refuses, in plain words, what a Practice Workspace does not do. */
export async function assertMayLeave(workspaceId: string, way: WayOut, reaches: Reaches = {}): Promise<void> {
  if (await heldBack(workspaceId, way, reaches)) throw new PracticeRefused();
}

/** Refuses to set up a way to oneself that is not switched on, saying where it is switched on. */
export async function assertWayOpen(workspaceId: string, way: SelfWay): Promise<void> {
  if (!(await wayOpen(workspaceId, way))) throw new PracticeRefused("This is a Practice Workspace: switch this way on under Connectors, Send to yourself, first.");
}

/** Whether an address is under the reserved name .invalid, which can never be routed: a made-up person's address. The
 * mail transport takes none, whichever Workspace or none it comes from. */
export function neverRouted(address: string): boolean {
  const domain = String(address).slice(String(address).lastIndexOf("@") + 1).trim().toLowerCase().replace(/[.>\s]+$/, "");
  return domain === "invalid" || domain.endsWith(".invalid");
}
