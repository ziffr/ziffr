// Pages across a Demo Reset (GLOSSARY: Demo Reset; spec 0051, ticket 7): a reset gives the seed's dashboards and decks new
// ids, so a page open on an old id finds nothing. `demo_previous_ids` (migration 20270127120000) keeps each old id with its
// name; the successor is the demo's dashboard or deck of that name that the person may open now. Nothing is returned that the
// person may not see: a name that matches only something closed to them gives no successor, never a hint that it exists.
import type { Actor } from "./actor";
import { visibleDashboards, visibleDecks } from "./access";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";

/** What a page has its id for: a dashboard or a deck. */
export type SuccessorKind = "dashboard" | "deck";

/** The new id for an old one, by the name the old one had: the same name among what the person may open, the oldest if several
 * (so a visitor's later namesake never wins), never the old id itself. Null when nothing matches. Pure. */
export function pickSuccessor(name: string, candidates: { id: number; name: string }[], oldId: number): number | null {
  const same = candidates.filter((c) => c.id !== oldId && c.name === name).map((c) => c.id);
  return same.length ? Math.min(...same) : null;
}

/** The id that replaces a dashboard's or deck's old one after a Demo Reset, for the demo only, or null (not the demo, an id
 * that was not kept, nothing the person may open by that name, a table that cannot be read). */
export async function demoSuccessor(actor: Actor, kind: SuccessorKind, oldId: number): Promise<number | null> {
  if (actor.workspaceId !== DEMO_WORKSPACE_ID || !Number.isSafeInteger(oldId) || oldId < 1) return null;
  const { data, error } = await db().from("demo_previous_ids").select("name").eq("kind", kind).eq("old_id", oldId).maybeSingle();
  if (error || !data) return null;
  const open = kind === "dashboard" ? await visibleDashboards(actor.workspaceId, actor.personId) : await visibleDecks(actor.workspaceId, actor.personId);
  return pickSuccessor(String(data.name), open, oldId);
}
