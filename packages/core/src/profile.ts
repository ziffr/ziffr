// Your profile (spec 0006, ticket #94; GLOSSARY: Workspace, Contact, Demo Mode): the name and colour others see you
// by. A profile is one per person, so a change shows in every workspace they belong to.
import { Forbidden, type Actor } from "./actor";
import { APPEARANCES, parseAppearance, type Appearance } from "./appearance";
import { db } from "./db";
import { isSealed } from "./workspace-keys";

/** The colours a person can be shown in; new people get one of them at random. */
export const PERSON_COLORS = ["#7C5A3A", "#3A6B7C", "#6B3A7C", "#3A7C52", "#7C3A45", "#5A5A7C"] as const;

/** The longest name a person can have. */
export const MAX_NAME = 80;

/** What a person sees of their own profile. */
export type MyProfile = { id: string; name: string; color: string; email: string | null };

// Control and format characters (zero-width, direction overrides and the like): a name is shown next to other people's
// in tables, share dialogs and emails, where these could hide text or pass one name off as another.
/** Characters no name in Ziffr may contain. */
export const HIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

/** A name as it would be stored, or an error saying why it cannot be. */
export function cleanName(input: unknown): { ok: true; name: string } | { ok: false; reason: string } {
  if (typeof input !== "string") return { ok: false, reason: "Give your name." };
  if (HIDDEN_CHARACTERS.test(input)) return { ok: false, reason: "Your name has characters that cannot be shown." };
  const name = input.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, reason: "Give your name." };
  // A name in the sealed format would read as a Contact's that does not open (spec 0028).
  if (isSealed(name)) return { ok: false, reason: "Your name has characters that cannot be shown." };
  if ([...name].length > MAX_NAME) return { ok: false, reason: `Keep your name to ${MAX_NAME} characters.` };
  return { ok: true, name };
}

// Only someone who is a member of the actor's workspace acts there; a Contact has no membership. The demo's made-up
// people keep their names because the database refuses every change to the demo (#271).
async function assertOwnRealProfile(actor: Actor) {
  if (actor.key) throw new Forbidden();
  const { data } = await db().from("memberships").select("workspace_id").eq("user_id", actor.personId);
  const spaces = (data ?? []).map((m) => m.workspace_id as string);
  if (!spaces.includes(actor.workspaceId)) throw new Forbidden();
}

/** The actor's own name, colour and the address Ziffr emails them at. */
export async function myProfile(actor: Actor): Promise<MyProfile> {
  const { data } = await db().from("profiles").select("id, name, color, email").eq("id", actor.personId).maybeSingle();
  if (!data) throw new Forbidden();
  return { id: data.id as string, name: data.name as string, color: data.color as string, email: (data.email as string | null) ?? null };
}

/** Changes the actor's own name and colour; there is no person to pass, so nobody else's can change.
 * Refused in the demo and for its people. Either field may be left out. */
export async function updateMyProfile(actor: Actor, input: { name?: unknown; color?: unknown }): Promise<void> {
  await assertOwnRealProfile(actor);
  const change: { name?: string; color?: string } = {};
  if (input?.name !== undefined) {
    const n = cleanName(input.name);
    if (!n.ok) throw new Error(n.reason);
    change.name = n.name;
  }
  if (input?.color !== undefined) {
    if (!(PERSON_COLORS as readonly unknown[]).includes(input.color)) throw new Error("Pick one of the colours.");
    change.color = input.color as string;
  }
  if (!Object.keys(change).length) return;
  const { error } = await db().from("profiles").update(change).eq("id", actor.personId);
  if (error) throw new Error("Your profile could not be saved.");
}

/** The actor's own Appearance (GLOSSARY: Appearance); System when none was chosen. Nobody else's can be read. It needs only the
 * person, so the page of someone signed in who has no Workspace yet is drawn in their choice too. */
export async function myAppearance(actor: Pick<Actor, "personId">): Promise<Appearance> {
  const { data } = await db().from("profiles").select("appearance").eq("id", actor.personId).maybeSingle();
  return parseAppearance(data?.appearance);
}

/** Sets the actor's own Appearance; there is no person to pass, so nobody else's can change. Refused in the demo and
 * for its people (their rows never change); the demo keeps the choice in the browser only. */
export async function setMyAppearance(actor: Actor, choice: unknown): Promise<Appearance> {
  await assertOwnRealProfile(actor);
  if (!(APPEARANCES as readonly unknown[]).includes(choice)) throw new Error("Pick one of the choices.");
  const { error } = await db().from("profiles").update({ appearance: choice as Appearance }).eq("id", actor.personId);
  if (error) throw new Error("Your appearance could not be saved.");
  return choice as Appearance;
}

/** What the actor's own Deliveries page shows: their Delivery Preferences and the team default beside them, whether
 * they stopped Prompts and reminders by email here, and their Away dates. Nobody else's. */
export async function myDeliverySettings(actor: Actor) {
  const ws = actor.workspaceId;
  const [{ data: mine }, { data: team }, { data: optedOut }, { data: away }, digestOut] = await Promise.all([
    db().from("delivery_preferences").select("kind, connector").eq("workspace_id", ws).eq("user_id", actor.personId).order("position"),
    db().from("delivery_preferences").select("kind, connector").eq("workspace_id", ws).is("user_id", null).order("position"),
    db().from("email_opt_outs").select("person_id").eq("workspace_id", ws).eq("person_id", actor.personId).maybeSingle(),
    db().from("away").select("starts, ends").eq("user_id", actor.personId).maybeSingle(),
    db().from("usage_digest_opt_outs").select("person_id").eq("person_id", actor.personId).maybeSingle(),
  ]);
  const rows = (r: { kind: unknown; connector: unknown }[] | null) => (r ?? []).map((p) => ({ kind: String(p.kind), connector: String(p.connector) }));
  return {
    mine: rows(mine),
    team: rows(team),
    optedOut: Boolean(optedOut),
    // The monthly usage email goes to Owners only (spec 0031), so only they are shown the switch.
    usageDigest: actor.role === "owner" ? { on: !digestOut.data } : null,
    away: away ? { starts: String(away.starts), ends: String(away.ends) } : null,
  };
}
