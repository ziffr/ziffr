// A person's Business Function in one Workspace (GLOSSARY: Business Function; spec 0052). The person picks it from a
// fixed list (@ziffr/pack) to say what part of the business they work in, so Ziffr can suggest Packs and who is asked
// for what. Visibility is the point: only the person and the Workspace's Owners and Admins may read it. Members never see
// another person's, Guests have none, and no page, API response, MCP tool, Export, View Link, Snapshot or Webhook a
// Member or Guest can read may carry one. The table is the core's alone (service role); these functions are the check.
import { Forbidden, type Actor } from "./actor";
import { audit } from "./audit-log";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { isBusinessFunction, type BusinessFunction } from "@ziffr/pack/business-functions";

export { BUSINESS_FUNCTIONS, BUSINESS_FUNCTION_LABELS, isBusinessFunction, type BusinessFunction } from "@ziffr/pack/business-functions";

/** Whether the actor is a real member of their Workspace who may have a function: a person (never a key), not a Guest,
 * not in the demo (it never holds a row). */
async function assertMayHaveOne(actor: Actor): Promise<void> {
  if (actor.key || actor.role === "guest" || actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden();
  const { data } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  // The role on the Actor is checked against the database, so a person who left or was demoted to Guest holds no function.
  if (!data || data.role === "guest") throw new Forbidden();
}

/** The actor's own Business Function, or null when they have none. Nobody else's can be read through this. */
export async function myBusinessFunction(actor: Actor): Promise<BusinessFunction | null> {
  // The demo never holds one, so its people simply have none.
  if (actor.workspaceId === DEMO_WORKSPACE_ID && !actor.key) return null;
  await assertMayHaveOne(actor);
  const { data } = await db().from("business_functions").select("function").eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId).maybeSingle();
  return isBusinessFunction(data?.function) ? data.function : null;
}

/** Sets the actor's own Business Function, or clears it with null. There is no person to pass, so nobody else's can
 * change, and an Access Key cannot. The value is checked against the list here; anything else is refused. Writes an
 * Audit Log line `person.business_function_changed` with the keys only (from, to) when something changed. */
export async function setMyBusinessFunction(actor: Actor, value: unknown): Promise<BusinessFunction | null> {
  await assertMayHaveOne(actor);
  if (value !== null && !isBusinessFunction(value)) throw new Error("Pick one of the choices.");
  const before = await myBusinessFunction(actor);
  if (before === value) return before;
  if (value === null) {
    const { error } = await db().from("business_functions").delete().eq("workspace_id", actor.workspaceId).eq("person_id", actor.personId);
    if (error) throw new Error("Your answer could not be saved.");
  } else {
    const { error } = await db().from("business_functions").upsert({ workspace_id: actor.workspaceId, person_id: actor.personId, function: value, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,person_id" });
    if (error) throw new Error("Your answer could not be saved.");
  }
  // Keys only, never a name: the log's readers are the Owners and Admins, who may see functions anyway.
  await audit(actor, { kind: "person.business_function_changed", object: { type: "person", id: actor.personId }, details: { from: before, to: value } });
  return value;
}

/** Every member's Business Function in the actor's Workspace, for its Owners and Admins only; a Member, a Guest or an
 * Access Key is refused (the demo has none). Only people who are still members and not Guests appear, and only those who gave one. */
export async function businessFunctions(actor: Actor): Promise<{ personId: string; function: BusinessFunction }[]> {
  if (actor.key || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden();
  if (actor.workspaceId === DEMO_WORKSPACE_ID) return [];
  const { data: me } = await db().from("memberships").select("role").eq("workspace_id", actor.workspaceId).eq("user_id", actor.personId).maybeSingle();
  if (!me || (me.role !== "owner" && me.role !== "admin")) throw new Forbidden();
  const [{ data: rows }, { data: members }] = await Promise.all([
    db().from("business_functions").select("person_id, function").eq("workspace_id", actor.workspaceId),
    // A person demoted to Guest keeps their membership row, so Guests are left out here: they have none to show.
    db().from("memberships").select("user_id").eq("workspace_id", actor.workspaceId).neq("role", "guest"),
  ]);
  const inside = new Set((members ?? []).map((m) => m.user_id as string));
  return (rows ?? []).filter((r) => inside.has(r.person_id as string) && isBusinessFunction(r.function)).map((r) => ({ personId: r.person_id as string, function: r.function as BusinessFunction }));
}
