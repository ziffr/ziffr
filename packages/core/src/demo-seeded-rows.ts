// Which rows of the demo the seed made (GLOSSARY: Demo Mode, Demo Reset; spec 0051, ticket 6): the database keeps their keys
// in `demo_seeded_rows`, filled after every Demo Reset. The words trigger uses it to keep the seed's words; the core asks it
// where it has a choice to make before a write, so a visitor's edit is not turned into a refusal by the database.

import { db } from "./db";

/** Whether the row with this id of this table was made by the seed of the demo's current Generation. Only for tables whose
 * key is the row's id (`demo_row_key`). A false answer means the row is a visitor's, or the key table is not filled yet. */
export async function madeBySeed(table: string, id: number | string): Promise<boolean> {
  const { data } = await db().from("demo_seeded_rows").select("row_key").eq("table_name", table).eq("row_key", String(id)).maybeSingle();
  return Boolean(data);
}
