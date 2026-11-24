// What the demo walk's pass for Metrics, Threads and sharing (spec 0051, ticket 11) reads from the database: the web app's tests may
// not query it themselves (.github/scripts/app-db-access.mjs). Tests only.
import { db } from "../db";
import { DEMO_WORKSPACE_ID } from "../team";

/** The newest row of a table of the demo that fits the filter, as the columns asked for; a clear failure when there is none. */
export async function demoLatestRow(table: "metrics" | "groups" | "tags" | "actions" | "access_requests" | "shares" | "delivery_preferences", columns: string, where: Record<string, string | number | boolean> = {}): Promise<Record<string, unknown>> {
  let q = db().from(table).select(columns).eq("workspace_id", DEMO_WORKSPACE_ID);
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
  const { data } = await q.order("id", { ascending: false }).limit(1).maybeSingle();
  if (!data) throw new Error(`The walk found no ${table} row for ${JSON.stringify(where)}.`);
  return data as unknown as Record<string, unknown>;
}

/** How many rows of a table of the demo fit the filter (what a visitor's change did or did not leave behind). */
export async function demoCountRows(table: "metrics" | "tags" | "groups" | "shares" | "series_values" | "metric_tags", where: Record<string, string | number | boolean> = {}): Promise<number> {
  let q = db().from(table).select("*", { count: "exact", head: true }).eq("workspace_id", DEMO_WORKSPACE_ID);
  for (const [k, v] of Object.entries(where)) q = q.eq(k, v);
  return (await q).count ?? 0;
}
