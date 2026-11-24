// Which rows of the demo the seed made (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 6): the database keeps their keys
// in `demo_seeded_rows`, filled after every Demo Reset. The words trigger uses it to keep the seed's words; the core asks it
// where it has a choice to make before a write, so a visitor's edit is not turned into a refusal by the database.

import type { Actor } from "./actor";
import { db } from "./db";
import { DemoShowcase } from "./demo";
import { inDemoVisit } from "./demo-visitor-words";

/** Whether the row with this id of this table was made by the seed of the demo's current Generation. Only for tables whose
 * key is the row's id (`demo_row_key`). A false answer means the row is a visitor's, or the key table is not filled yet. */
export async function madeBySeed(table: string, id: number | string): Promise<boolean> {
  const { data } = await db().from("demo_seeded_rows").select("row_key").eq("table_name", table).eq("row_key", String(id)).maybeSingle();
  return Boolean(data);
}

/** In a demo visit, refuses in plain words a change to how a thing the seed made looks or is (its Theme, a restore of an old
 * state), which the database's words list would refuse too: the refusal here comes before any write, so no change is half done. */
export async function refuseSeeded(actor: Pick<Actor, "workspaceId">, table: "dashboards" | "themes" | "team_templates", id: number): Promise<void> {
  if (inDemoVisit(actor) && await madeBySeed(table, id)) throw new DemoShowcase();
}
