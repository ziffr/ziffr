// Putting a Version of a dashboard back (GLOSSARY: Version): its words and widgets replaced, all or nothing. The core
// has no transaction across two statements, so the order of the writes does the work: nothing is removed until all that
// replaces it is stored.
import { db } from "./db";
import { insertSealed, sealedPatch } from "./sealed-columns";
import { ServerFault } from "./server-fault";

type Row = Record<string, unknown>;

const failed = () => new ServerFault("The dashboard could not be restored.");

/** One step of taking back a failed restore. What made the restore fail is what gets reported, so its own failure is not. */
async function takeBack(step: () => PromiseLike<unknown>): Promise<void> {
  try {
    await step();
  } catch {
    // The dashboard then keeps more than it should, never less.
  }
}

/** Which of these widgets are still stored; null when the database does not say. */
async function widgetsLeft(ws: string, ids: number[]): Promise<number | null> {
  try {
    const { data, error } = await db().from("widgets").select("id").eq("workspace_id", ws).in("id", ids);
    return error || !data ? null : data.length;
  } catch {
    return null;
  }
}

/** Replaces a dashboard's words and widgets, all or nothing: the new widgets are written first (one statement), then the
 * words, and the old widgets go last; a step that fails takes back the ones before it. The dashboard is never left
 * without its widgets: if the database stops answering part way, it holds both sets, and restoring again clears that.
 * The caller has checked who acts and what the widgets may show. */
export async function replaceDashboard(ws: string, dashboardId: number, words: Row, widgets: Row[]): Promise<void> {
  const [old, was] = await Promise.all([
    db().from("widgets").select("id").eq("dashboard_id", dashboardId).eq("workspace_id", ws),
    db().from("dashboards").select("name, theme_id, intro").eq("id", dashboardId).eq("workspace_id", ws).single(),
  ]);
  if (old.error || !old.data || was.error || !was.data) throw failed();
  const oldIds = old.data.map((w) => w.id as number);
  // Sealed before anything is written, so a Workspace Key that cannot be used stops the restore with nothing changed.
  const patch = await sealedPatch("dashboards", ws, dashboardId, words);
  const added = (await insertSealed("widgets", ws, widgets)).map((w) => w.id as number);
  let removing = false;
  try {
    const written = await db().from("dashboards").update(patch).eq("id", dashboardId).eq("workspace_id", ws);
    if (written.error) throw failed();
    if (!oldIds.length) return;
    removing = true;
    const removed = await db().from("widgets").delete().eq("workspace_id", ws).in("id", oldIds);
    if (removed.error) throw failed();
  } catch (e) {
    if (removing) {
      // The answer to a delete can be lost after it was done. The new widgets are taken away only once the old ones are
      // seen to be there still.
      const left = await widgetsLeft(ws, oldIds);
      if (left === 0) return;
      if (left === null) throw e;
    }
    // As they were stored: the words are still sealed for this dashboard.
    await takeBack(() => db().from("dashboards").update(was.data).eq("id", dashboardId).eq("workspace_id", ws));
    if (added.length) await takeBack(() => db().from("widgets").delete().eq("workspace_id", ws).in("id", added));
    throw e;
  }
}
