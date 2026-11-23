// Dashboards by Tag (GLOSSARY: Tag, Widget, View Link; spec 0038): a widget that shows all Metrics tagged X. Every function
// takes the Actor first. The rule that matters: the Metrics such a widget draws are those the viewer sees THROUGH THEIR OWN
// ROLE, Shares and Groups, never through the dashboard's Share. Nothing here is stored as a list: `metric_ids` of a Tag widget
// stay empty and a dashboard's Share opens nothing through it (widgetMetricIds finds no Metric in it), so tagging a private
// Metric publishes it to no one. Two viewers may see different Metrics in one widget and neither is told about the others.
import { Forbidden, Refused, type Actor } from "./actor";
import { db } from "./db";
import { inUse } from "./metric-row";
import { TAG_WIDGET_MAX, tagSourceId, takesTagSource, withoutTagSource } from "./tag-source";
import { tagSight } from "./tag-sight";
import { openRows } from "./sealed-columns";
import { getMetrics } from "./workspace-data";
import type { Widget, WidgetSettings } from "./types";

/** Whether the widget shows a Tag instead of a list. */
export const isTagWidget = (w: Pick<Widget, "settings">): boolean => tagSourceId(w.settings) !== null;

/** The Metrics each Tag widget draws for this actor, and what the widget says about it. A viewer sees only the Metrics tagged X
 * that they may see themselves, not archived, by name, at most TAG_WIDGET_MAX; "more" counts the rest they see. A Tag the viewer
 * sees on no Metric reads the same whether it is removed, empty, or only on Metrics they cannot see: the widget names it only
 * when there is something to show. `canEdit` (the dashboard's owner or an Editor) is told the Tag was removed. */
export async function resolveTagWidgets(actor: Actor, widgets: Widget[], canEdit = false): Promise<Widget[]> {
  if (!widgets.some(isTagWidget)) return widgets;
  const [sight, metrics] = await Promise.all([tagSight(actor), getMetrics(actor.workspaceId)]);
  const live = new Map(inUse(metrics).map((m) => [m.id, m]));
  const exists = await existingTagIds(actor.workspaceId);
  return widgets.map((w) => {
    const id = tagSourceId(w.settings);
    if (!id) return w;
    const tag = sight.tags.find((t) => t.id === id);
    const tagged = tag ? [...sight.idsByMetric].filter(([metric, tags]) => tags.includes(id) && live.has(metric)).map(([metric]) => live.get(metric)!) : [];
    tagged.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id - b.id);
    const drawn = tagged.slice(0, TAG_WIDGET_MAX).map((m) => m.id);
    const removed = canEdit && !tagged.length && !exists.has(id);
    return { ...w, metric_ids: drawn, settings: { ...w.settings, tagView: { name: tagged.length && tag ? tag.name : null, more: tagged.length - drawn.length, removed } } };
  });
}

/** The ids of the Tags that still exist in a Workspace (rows only, no names). */
async function existingTagIds(ws: string): Promise<Set<string>> {
  const { data } = await db().from("tags").select("id").eq("workspace_id", ws);
  return new Set((data ?? []).map((r) => String(r.id)));
}

/** Checks the Tag source in settings a person sent for a widget of this view and says whether one is set: the Tag must be one
 * the actor sees and the view must take a list; `tagView` (what drawing adds) is never kept. Throws Refused or Forbidden. */
export async function checkTagSource(actor: Actor, template: Widget["template"], settings: WidgetSettings): Promise<boolean> {
  delete settings.tagView;
  if (settings.tagSource === undefined || settings.tagSource === null) { delete settings.tagSource; return false; }
  const id = tagSourceId(settings);
  if (!id) throw new Refused("That is not a Tag.");
  settings.tagSource = { id };
  if (!takesTagSource({ template, settings })) throw new Refused("Only a view that shows a list of Metrics can show all Metrics with a Tag.");
  // A Tag the actor does not see is refused as one that does not exist: its name alone says nothing (spec 0038).
  if (!(await tagSight(actor)).tags.some((t) => t.id === id)) throw new Forbidden();
  return true;
}

/** The Tag widgets of a dashboard, as stored. */
export async function tagWidgetsOf(workspaceId: string, dashboardId: number): Promise<Widget[]> {
  const { data } = await db().from("widgets").select("*").eq("workspace_id", workspaceId).eq("dashboard_id", dashboardId).not("settings->tagSource", "is", null);
  return ((await openRows("widgets", workspaceId, data)) as Widget[]).filter(isTagWidget);
}

/** A widget as a copy that records the Metrics drawn now for the actor (a deck, a Snapshot): the list, no Tag to follow. */
export async function recordedWidgets(actor: Actor, widgets: Widget[]): Promise<Widget[]> {
  const drawn = await resolveTagWidgets(actor, widgets, false);
  return drawn.map((w) => (isTagWidget(w) ? { ...w, settings: withoutTagSource(w.settings) } : w));
}
