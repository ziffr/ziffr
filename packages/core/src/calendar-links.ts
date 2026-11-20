// Calendar Links (spec 0027, ticket #243; GLOSSARY: Calendar Link, Schedule): a secret address a calendar app subscribes
// to, showing one person's Schedule in one Workspace. Only the secret's SHA-256 is stored; the address is shown once.
// Anyone with it sees what it shows, so every fetch checks again that the link stands and its person still belongs to
// the Workspace, and builds the Schedule as that person, with what they may see now. It ends when they leave (a
// trigger on memberships), when they or an Owner or Admin revoke it, and with the Workspace.
import { createHash, randomBytes } from "node:crypto";
import { Forbidden, type Actor, type WorkspaceRoleName } from "./actor";
import { audit } from "./audit-log";
import { calendarFile } from "./calendar-ics";
import { db } from "./db";
import { calendarEntries } from "./schedule";
import { DEMO_WORKSPACE_ID } from "./team";

/** Most fetches of one link in an hour; more are refused (429) until the hour is over. */
export const CALENDAR_FETCHES_PER_HOUR = 60;

/** A secret as the address carries it: 32 random bytes, base64url. */
const SECRET = /^[A-Za-z0-9_-]{43}$/;
const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** A person's own Calendar Link as their page shows it: never the address, which is shown once when it is made. */
export type CalendarLinkInfo = { noNames: boolean; createdAt: string; lastFetchedAt: string | null };

/** A Calendar Link as the Workspace's Owners and Admins see it: whose, made and last fetched, never the address. */
export type CalendarLinkListed = { personId: string; name: string; createdAt: string; lastFetchedAt: string | null };

/** Refuses keys and the demo: the demo's made-up people are shared by every visitor, so a link there would be anyone's. */
function assertMayHaveLink(actor: Actor): void {
  if (actor.key) throw new Forbidden();
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no Calendar Links. Make one in your own Workspace.");
}

/** The actor's own Calendar Link in this Workspace, or null. */
export async function myCalendarLink(actor: Actor): Promise<CalendarLinkInfo | null> {
  if (actor.key) throw new Forbidden();
  const { data } = await db().from("calendar_links").select("no_names, created_at, last_fetched_at").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  return data ? { noNames: Boolean(data.no_names), createdAt: String(data.created_at), lastFetchedAt: (data.last_fetched_at as string | null) ?? null } : null;
}

/** Makes the actor's Calendar Link, replacing (and so ending) one they had. Returns the secret for the address
 * `/cal/<secret>.ics`, shown this once. The "no names" choice carries over unless given. */
export async function makeCalendarLink(actor: Actor, opts: { noNames?: boolean } = {}): Promise<{ secret: string }> {
  assertMayHaveLink(actor);
  const secret = randomBytes(32).toString("base64url");
  const before = await myCalendarLink(actor);
  const noNames = typeof opts.noNames === "boolean" ? opts.noNames : before?.noNames ?? false;
  const { error } = await db().from("calendar_links").upsert({
    workspace_id: actor.workspaceId, person_id: actor.personId, secret_hash: hash(secret), no_names: noNames,
    created_at: new Date().toISOString(), last_fetched_at: null, window_started_at: null, window_fetches: 0,
  }, { onConflict: "workspace_id,person_id" });
  if (error) throw new Error("The calendar link could not be made.");
  // Whose and whether names show: never the address or its hash.
  await audit(actor, { kind: "calendar_link.made", object: { type: "person", id: actor.personId }, details: { replaced: Boolean(before), no_names: noNames } });
  return { secret };
}

/** Changes whether the actor's Calendar Link shows names; the address stays the same. Returns false without a link. */
export async function setCalendarNoNames(actor: Actor, noNames: boolean): Promise<boolean> {
  assertMayHaveLink(actor);
  const before = await myCalendarLink(actor);
  if (!before) return false;
  if (before.noNames === Boolean(noNames)) return true;
  const { data } = await db().from("calendar_links").update({ no_names: Boolean(noNames) }).eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).select("id");
  // Showing names again puts Metric names into a calendar others may see: recorded like making the link.
  if (data?.length) await audit(actor, { kind: "calendar_link.names_changed", object: { type: "person", id: actor.personId }, details: { no_names: Boolean(noNames) } });
  return Boolean(data?.length);
}

/** Ends a person's Calendar Link at once: their own, or anyone's for an Owner or Admin. Returns false when there was none. */
export async function revokeCalendarLink(actor: Actor, personId: string = actor.personId): Promise<boolean> {
  if (actor.key) throw new Forbidden();
  if (personId !== actor.personId && actor.role !== "owner" && actor.role !== "admin") throw new Forbidden("Only Owners and Admins revoke someone else's Calendar Link.");
  if (typeof personId !== "string" || personId.length > 200) throw new Forbidden();
  const { data } = await db().from("calendar_links").delete().eq("workspace_id", actor.workspaceId).eq("person_id", personId).select("id");
  if (!data?.length) return false;
  await audit(actor, { kind: "calendar_link.revoked", object: { type: "person", id: personId }, details: { own: personId === actor.personId } });
  return true;
}

/** Who has a Calendar Link in the Workspace, for Owners and Admins: name, made and last fetched. */
export async function listCalendarLinks(actor: Actor): Promise<CalendarLinkListed[]> {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden();
  const { data } = await db().from("calendar_links").select("person_id, created_at, last_fetched_at, profiles(name)").eq("workspace_id", actor.workspaceId).order("created_at");
  return (data ?? []).map((r) => ({
    personId: String(r.person_id), name: (r.profiles as unknown as { name: string } | null)?.name ?? "Someone",
    createdAt: String(r.created_at), lastFetchedAt: (r.last_fetched_at as string | null) ?? null,
  }));
}

/** What a fetch of a Calendar Link's address answers. Unknown, revoked and ended links are all "not_found", alike. */
export type CalendarFetch = { status: "ok"; ics: string; etag: string } | { status: "not_found" } | { status: "rate_limited" };

/** A fetch of `/cal/<secret>.ics`: the link's person's Schedule as an iCalendar file, built now as that person.
 * `origin` is the Installation's address the events link to. Every fetch counts towards the hourly limit. */
export async function fetchCalendar(secret: unknown, origin: string, now = new Date()): Promise<CalendarFetch> {
  if (typeof secret !== "string" || !SECRET.test(secret)) return { status: "not_found" };
  const { data } = await db().rpc("fetch_calendar_link", { p_hash: hash(secret), p_limit: CALENDAR_FETCHES_PER_HOUR });
  const link = (data as { workspace_id: string; person_id: string; no_names: boolean; allowed: boolean }[] | null)?.[0];
  if (!link) return { status: "not_found" };
  // The person must still belong to the Workspace; their role now is the one they act with.
  const [{ data: member }, { data: ws }] = await Promise.all([
    db().from("memberships").select("role").eq("workspace_id", link.workspace_id).eq("user_id", link.person_id).maybeSingle(),
    db().from("workspaces").select("name, trial_ends_at").eq("id", link.workspace_id).maybeSingle(),
  ]);
  if (!member || !ws || link.workspace_id === DEMO_WORKSPACE_ID) return { status: "not_found" };
  // An ended trial shows nothing more, as its keys do not work either.
  if (ws.trial_ends_at && new Date(String(ws.trial_ends_at)) <= now) return { status: "not_found" };
  if (!link.allowed) return { status: "rate_limited" };
  const actor: Actor = { personId: link.person_id, workspaceId: link.workspace_id, role: member.role as WorkspaceRoleName };
  const { timeZone, entries } = await calendarEntries(actor, now);
  // DTSTAMP is the day's start, so the same Schedule gives the same file, and the same ETag, all day.
  const day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const ics = calendarFile({ workspaceId: link.workspace_id, workspaceName: String(ws.name), timeZone, entries, noNames: link.no_names, origin, now: day });
  return { status: "ok", ics, etag: `"${hash(ics).slice(0, 32)}"` };
}
