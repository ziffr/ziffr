// Installation Admins (spec 0025, ticket #196; GLOSSARY: Installation Admin, Installation): who runs the Installation
// as a whole. Not a Workspace Role: an Owner of every Workspace is not one, and an Installation Admin sees no
// Workspace's data by being one. The first claims the Installation with the setup code from the server log; holding
// the log proves you run the server, which signing up first does not on an Installation that offers trials.
import { createHash, randomInt } from "node:crypto";
import { Forbidden, type Actor } from "./actor";
import { db } from "./db";
import { isAddress } from "./mail";
import { installationHref } from "./admin-address";
import { wellFormed } from "./announcement-rules";

/** A signed-in person acting on the Installation, outside any Workspace. Every function here checks who they are. */
export type InstallationActor = Pick<Actor, "personId">;

/** Wrong setup codes one person may enter in an hour. The code has 80 random bits, so this stops a flood, not luck. */
export const SETUP_CODE_TRIES_PER_HOUR = 5;

/** One Installation Admin as the admins section lists them: from the page (removable) or named on the server. */
export type InstallationAdminRow = { personId: string | null; name: string; email: string | null; from: "page" | "server"; addedAt: string | null; you: boolean };

/** One event of the Installation's own audit: who, what kind, about what, when. Never a setting's value. */
export type InstallationEvent = { at: string; actorName: string; kind: string; subject: string | null };

// Crockford's base32: no I, L, O or U, so a code read from a log and typed again is hard to get wrong.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** The addresses ZIFFR_INSTALLATION_ADMINS names, in lower case; only plain addresses count. */
export function serverAdminAddresses(env: Record<string, string | undefined> = process.env): string[] {
  return [...new Set(String(env.ZIFFR_INSTALLATION_ADMINS ?? "").split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter((a) => isAddress(a)))];
}

/** A setup code as Ziffr prints it: 16 characters (80 random bits) in four groups. */
export function newSetupCode(): string {
  const chars = Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return chars.match(/.{4}/g)!.join("-");
}

/** The hash a typed code is compared by: upper case, without dashes or spaces, with the letters people mistake for
 * digits read as those digits. */
export function setupCodeHash(typed: string): string {
  const plain = String(typed).toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1").slice(0, 64);
  return createHash("sha256").update(`ziffr-setup:${plain}`).digest("hex");
}

// The proven address and sign-in of a person: profiles keep an address only when a way of signing in proved it.
async function personOf(personId: string) {
  const { data } = await db().from("profiles").select("id, name, email, auth_user_id").eq("id", String(personId).slice(0, 64)).maybeSingle();
  return data as { id: string; name: string; email: string | null; auth_user_id: string | null } | null;
}

/** Whether the person is an Installation Admin: added on the page, or signed in with an address the server names. */
export async function isInstallationAdmin(actor: InstallationActor): Promise<boolean> {
  if (!actor?.personId) return false;
  const { data } = await db().from("installation_admins").select("person_id").eq("person_id", String(actor.personId).slice(0, 64)).maybeSingle();
  if (data) return true;
  const named = serverAdminAddresses();
  if (!named.length) return false;
  const person = await personOf(actor.personId);
  // Only someone who signed in: a Contact or a made-up demo person may carry an address but has no sign-in.
  return Boolean(person?.auth_user_id && person.email && named.includes(person.email.toLowerCase()));
}

/** Refuses anyone who is not an Installation Admin; callers answer "not found", so the page does not show it exists. */
export async function assertInstallationAdmin(actor: InstallationActor): Promise<void> {
  if (!(await isInstallationAdmin(actor))) throw new Forbidden("Only Installation Admins may do this.");
}

/** Whether the Installation has an Installation Admin: someone added on the page, or addresses named on the server.
 * While it has none, a setup code waits in the server log. */
export async function installationClaimed(): Promise<boolean> {
  if (serverAdminAddresses().length) return true;
  const { count } = await db().from("installation_admins").select("person_id", { count: "exact", head: true });
  return (count ?? 0) > 0;
}

/** Writes the setup code to the server log, and only there. */
export function printSetupCode(code: string): void {
  console.log([
    "",
    "Ziffr: this Installation has no Installation Admin yet.",
    `Ziffr: sign in, open ${installationHref("/installation")} and enter the setup code ${code}`,
    "Ziffr: it works once, for whoever enters it first. Anyone who can read this log can claim the Installation.",
    "",
  ].join("\n"));
}

/** Makes a setup code and prints it while the Installation has no Installation Admin. `fresh` (at start) always makes
 * a new one, since the old one may have left the log; otherwise one is made only when none waits (the claim page). */
export async function prepareSetupCode(opts: { fresh: boolean }, print: (code: string) => void = printSetupCode): Promise<"printed" | "waiting" | "claimed"> {
  if (serverAdminAddresses().length) {
    await db().from("installation_setup_codes").delete().eq("id", true);
    return "claimed";
  }
  // Checked and stored in one step under the claim lock, so no code is made while someone claims the Installation.
  const code = newSetupCode();
  const { data, error } = await db().rpc("prepare_setup_code", { p_code_hash: setupCodeHash(code), p_fresh: opts.fresh });
  if (error) throw new Error("The setup code could not be made.");
  if (data === "claimed" || data === "waiting") return data;
  if (data !== "made") throw new Error("The setup code could not be made.");
  print(code);
  return "printed";
}

/** Makes the actor the first Installation Admin, with the setup code. Once only: afterwards, and while the server
 * names its admins, nobody claims it; wrong codes are refused and limited per person. */
export async function claimInstallation(actor: InstallationActor, code: string): Promise<void> {
  const person = actor?.personId ? await personOf(actor.personId) : null;
  // A made-up demo person or a Contact has no sign-in, so it never runs an Installation.
  if (!person?.auth_user_id) throw new Forbidden("Sign in first.");
  if (serverAdminAddresses().length) throw new Error("This Installation's admins are named on the server.");
  if (typeof code !== "string" || code.length > 64) throw new Error("That is not the setup code.");
  const { data, error } = await db().rpc("claim_installation", { p_person: person.id, p_code_hash: setupCodeHash(code), p_tries_per_hour: SETUP_CODE_TRIES_PER_HOUR });
  if (error) throw new Error("The Installation could not be claimed. Try again.");
  if (data === "claimed") throw new Error("This Installation has an Installation Admin already.");
  if (data === "wait") throw new Error("Too many wrong codes. Try again in an hour.");
  if (data !== "ok") throw new Error("That is not the setup code. Copy it from the server log again.");
  await recordInstallationEvent(person.id, "installation.claimed", null);
}

/** What a database operation of an Installation Admin needs of the one acting: their name, and whether they are one
 * because the server names their address. Refuses anyone who is not an Installation Admin. */
export async function actingAdmin(actor: InstallationActor): Promise<{ name: string; onServer: boolean }> {
  await assertInstallationAdmin(actor);
  const me = await personOf(actor.personId);
  return { name: me?.name ?? "Someone", onServer: Boolean(me?.auth_user_id && me.email && serverAdminAddresses().includes(me.email.toLowerCase())) };
}

/** The Installation Admins, for an Installation Admin: those added on the page and those the server names. */
export async function installationAdmins(actor: InstallationActor): Promise<InstallationAdminRow[]> {
  await assertInstallationAdmin(actor);
  const { data: rows } = await db().from("installation_admins").select("person_id, added_at, profiles(name, email)").order("added_at");
  const page: InstallationAdminRow[] = (rows ?? []).map((r) => {
    const p = r.profiles as unknown as { name: string; email: string | null } | null;
    return { personId: r.person_id as string, name: p?.name ?? "Someone", email: p?.email ?? null, from: "page", addedAt: r.added_at as string, you: r.person_id === actor.personId };
  });
  const named = serverAdminAddresses();
  const { data: people } = named.length ? await db().from("profiles").select("id, name, email").in("email", named).not("auth_user_id", "is", null) : { data: [] };
  const server: InstallationAdminRow[] = named.map((email) => {
    const p = (people ?? []).find((x) => String(x.email).toLowerCase() === email);
    // Someone named who has not signed in yet is listed by address alone.
    return { personId: p?.id ?? null, name: p?.name ?? email, email, from: "server", addedAt: null, you: p?.id === actor.personId };
  });
  return [...page, ...server];
}

/** Adds an Installation Admin by the address of a person who has signed in to this Installation before. */
export async function addInstallationAdmin(actor: InstallationActor, email: string): Promise<void> {
  const me = await actingAdmin(actor);
  const address = String(email ?? "").trim().toLowerCase();
  if (!isAddress(address)) throw new Error("Enter one email address.");
  const { data: person } = await db().from("profiles").select("id, name").eq("email", address).not("auth_user_id", "is", null).maybeSingle();
  // The same answer for "nobody" and "someone without a sign-in": the form says nothing about Contacts.
  if (!person) throw new Error("Nobody has signed in here with that address yet. Ask them to sign in once, then add them.");
  // Checked and stored in one database step under the lock of blocking, so nobody is added while being blocked.
  const { data, error } = await db().rpc("add_installation_admin", { p_actor: actor.personId, p_actor_on_server: me.onServer, p_person: person.id });
  if (data === "forbidden") throw new Forbidden("Only Installation Admins may do this.");
  if (data === "blocked") throw new Error(`${person.name} is blocked. Unblock them under Users first.`);
  if (data === "exists") throw new Error(`${person.name} is an Installation Admin already.`);
  if (error || data !== "ok") throw new Error("They could not be added. Try again.");
  await recordInstallationEvent(actor.personId, "installation_admin.added", person.name as string);
}

/** Removes an Installation Admin added on the page, yourself included, but never the last one. Those the server
 * names stay until the server's settings change. */
export async function removeInstallationAdmin(actor: InstallationActor, personId: string): Promise<void> {
  await assertInstallationAdmin(actor);
  const id = String(personId ?? "").slice(0, 64);
  const person = await personOf(id);
  const named = serverAdminAddresses();
  // Others the server names who could sign in now: they keep the Installation run if the last one here goes.
  const { data: others } = named.length ? await db().from("profiles").select("id").in("email", named).not("auth_user_id", "is", null).neq("id", id) : { data: [] };
  const me = await personOf(actor.personId);
  const meOnServer = Boolean(me?.auth_user_id && me.email && named.includes(me.email.toLowerCase()));
  // The database checks again, under the lock, that the one removing is still an Installation Admin.
  const { data, error } = await db().rpc("remove_installation_admin", { p_actor: actor.personId, p_actor_on_server: meOnServer, p_person: id, p_server_admins: (others ?? []).length });
  if (error) throw new Error("They could not be removed. Try again.");
  if (data === "forbidden") throw new Forbidden("Only Installation Admins may do this.");
  if (data === "last") throw new Error("The last Installation Admin cannot be removed. Add another one first.");
  if (data !== "ok") throw new Error("They are not an Installation Admin added here.");
  await recordInstallationEvent(actor.personId, "installation_admin.removed", person?.name ?? "A former person");
}

/** Words for the audit as the database keeps them: lone surrogates removed, cut at 120 characters (not UTF-16 units, so an
 * emoji is never split into a half that Postgres refuses, which would drop the event). */
export function auditWords(raw: unknown): string {
  return Array.from(wellFormed(String(raw))).slice(0, 120).join("");
}

/** Records an event in the Installation's own audit: the person's name as it is now, the kind and what it was about
 * (a person's name or a setting's name, never a value). Best effort, like the Audit Log. */
export async function recordInstallationEvent(by: string, kind: string, subject: string | null): Promise<void> {
  try {
    const person = await personOf(by);
    const { error } = await db().from("installation_audit_events").insert({
      actor_id: String(by).slice(0, 64), actor_name: auditWords(String(person?.name ?? "Someone").trim()) || "Someone", kind, subject: subject === null ? null : auditWords(subject),
    });
    if (error) throw error;
  } catch (e) {
    console.error(`Installation audit: could not record ${kind} (${(e as { code?: string }).code ?? "error"})`);
  }
}

/** The latest events of the Installation's own audit, newest first, for an Installation Admin. */
export async function installationEvents(actor: InstallationActor, limit = 30): Promise<InstallationEvent[]> {
  await assertInstallationAdmin(actor);
  const { data } = await db().from("installation_audit_events").select("at, actor_name, kind, subject").order("id", { ascending: false }).limit(Math.min(Math.max(1, Math.floor(limit) || 30), 200));
  const events = (data ?? []).map((e) => ({ at: e.at as string, actorName: e.actor_name as string, kind: e.kind as string, subject: (e.subject as string | null) ?? null }));
  const names = await userNames(events.filter((e) => e.kind.startsWith("user.")).map((e) => e.subject ?? ""));
  return events.map((e) => (e.kind.startsWith("user.") && e.subject ? { ...e, subject: names.get(e.subject) ?? `a User without a name here (${e.subject.slice(0, 8)})` } : e));
}

/** The names of Users as they are now, by account id. The audit keeps the id alone, so a person who is deleted leaves
 * no name or address in it. A sealed Contact's name is never read here. */
async function userNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await db().from("profiles").select("auth_user_id, name, email").in("auth_user_id", ids).is("contact_workspace", null);
  return new Map((data ?? []).map((p) => [p.auth_user_id as string, String(p.name || p.email || "a User")]));
}

/** Records an event of the Installation's audit done by a service, not a person (such as Ziffr Cloud setting a limit). */
export async function recordServiceEvent(service: string, kind: string, subject: string | null): Promise<void> {
  const { error } = await db().from("installation_audit_events").insert({ actor_id: null, actor_name: auditWords(service), kind, subject: subject === null ? null : auditWords(subject) });
  if (error) console.error(`Installation audit: could not record ${kind} (${error.code ?? "error"})`);
}
