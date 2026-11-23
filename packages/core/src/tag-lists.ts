// Fixing the list of a Tag widget (GLOSSARY: Tag, View Link; spec 0038). Every function takes the Actor first.
import { Forbidden, Refused, type Actor } from "./actor";
import { assertCanEditDashboard } from "./dashboards";
import { db } from "./db";
import { openRows, sealedPatch } from "./sealed-columns";
import { tagSourceId, withoutTagSource } from "./tag-source";
import { resolveTagWidgets, tagWidgetsOf } from "./tag-widgets";
import { ensureBaseline, recordVersion } from "./versions";
import type { Widget } from "./types";

/** How many widgets of a dashboard show a Tag: a View Link needs none of them (it shows what its maker chose, a fixed list). */
export async function tagWidgetCount(workspaceId: string, dashboardId: number): Promise<number> {
  return (await tagWidgetsOf(workspaceId, dashboardId)).length;
}

/** "Fix the list": every Tag widget of the dashboard becomes a fixed list of the Metrics the actor sees now, and says so in the
 * dashboard's Versions. For the dashboard's owner and Editors; the Tag is no longer followed. Answers how many widgets it fixed. */
export async function fixTagLists(actor: Actor, dashboardId: number): Promise<number> {
  if (!Number.isSafeInteger(dashboardId)) throw new Forbidden();
  await assertCanEditDashboard(actor, dashboardId);
  const tagged = await tagWidgetsOf(actor.workspaceId, dashboardId);
  if (!tagged.length) return 0;
  const resolved = await resolveTagWidgets(actor, tagged, true);
  // A widget with nothing to show has no list to fix: it needs another Tag or its removal first.
  if (resolved.some((w) => !w.metric_ids.length)) throw new Refused("A widget on this dashboard shows no Metric you can see for its Tag. Pick another Tag for it, or remove it, then fix the lists.");
  await ensureBaseline("dashboard", dashboardId, actor.personId);
  for (const w of resolved) {
    const { error } = await db().from("widgets").update(await sealedPatch("widgets", actor.workspaceId, w.id, { metric_ids: w.metric_ids, settings: withoutTagSource(w.settings) })).eq("id", w.id).eq("workspace_id", actor.workspaceId);
    if (error) throw new Error("The list could not be fixed.");
    await recordVersion("widget", w.id, actor.personId, { message: "Fixed the list of Metrics of a Tag" });
  }
  await recordVersion("dashboard", dashboardId, actor.personId, { message: "Fixed the lists of Metrics of Tag widgets" });
  return resolved.length;
}


/** After a merge: the widgets that showed the first Tag follow the Tag it was merged into (a rename needs nothing: the id stays). */
export async function followMergedTag(actor: Actor, from: string, into: string): Promise<void> {
  const workspaceId = actor.workspaceId;
  const { data } = await db().from("widgets").select("*").eq("workspace_id", workspaceId).not("settings->tagSource", "is", null);
  for (const w of (await openRows("widgets", workspaceId, data)) as Widget[]) {
    if (tagSourceId(w.settings) !== from) continue;
    await ensureBaseline("widget", w.id, actor.personId);
    await db().from("widgets").update(await sealedPatch("widgets", workspaceId, w.id, { settings: { ...w.settings, tagSource: { id: into } } })).eq("id", w.id).eq("workspace_id", workspaceId);
    await recordVersion("widget", w.id, actor.personId, { message: "Follows the Tag it was merged into" });
  }
}
