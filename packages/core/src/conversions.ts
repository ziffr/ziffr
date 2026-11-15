// Turning one into another (spec 0010, ticket #149; GLOSSARY: Dashboard, Story, Deck, Finding): a story made from a
// dashboard, and the makings of a deck from a dashboard or a story. Each copy is new, owned by the person making it,
// and independent of where it came from; its numbers stay live. Only what the person may open can be copied, and
// placing a copy checks again that they see every Metric on it.
import { assertCan, Forbidden, type Actor } from "./actor";
import { visibleDashboards } from "./access";
import { placeWidget } from "./dashboards";
import { dashboardWidgets } from "./page-data";
import { createStory } from "./stories";
import { db } from "./db";
import type { Widget } from "./types";

/** A dashboard or story the actor may open, with its widgets in reading order. */
async function source(actor: Actor, id: number) {
  if (!Number.isInteger(id)) throw new Forbidden();
  const found = (await visibleDashboards(actor.workspaceId, actor.personId)).find((d) => d.id === id);
  if (!found) throw new Forbidden();
  const widgets = (await dashboardWidgets(actor, id)).sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
  return { found, widgets };
}

/** Makes a story from a dashboard: one Finding per widget, in reading order, each full width. Returns its id. */
export async function storyFromDashboard(actor: Actor, dashboardId: number): Promise<number> {
  assertCan(actor, "create");
  const { found, widgets } = await source(actor, dashboardId);
  if (found.kind === "story") throw new Forbidden("This is a story already.");
  const story = await createStory(actor, found.name);
  for (const w of widgets) {
    // placeWidget checks the actor sees every Metric of the widget, and copies it.
    await placeWidget(actor, story, { type: "spec", template: w.template, metricIds: w.metric_ids, settings: w.settings, title: w.title ?? undefined });
  }
  // One per row, in the dashboard's reading order.
  const { data: placed } = await db().from("widgets").select("id, h").eq("workspace_id", actor.workspaceId).eq("dashboard_id", story).order("id");
  let y = 0;
  for (const p of placed ?? []) {
    await db().from("widgets").update({ x: 0, y, w: 12 }).eq("id", p.id).eq("workspace_id", actor.workspaceId);
    y += Math.max(1, p.h as number);
  }
  return story;
}

/** What a new deck is made from: the title, the story's introduction, and the widgets in reading order, as the
 * deck editor lays them out (one slide each). Only for a dashboard or story the actor may open. */
export async function deckSeed(actor: Actor, id: number): Promise<{ name: string; intro: string; kind: "dashboard" | "story"; widgets: Pick<Widget, "template" | "metric_ids" | "settings" | "title">[] }> {
  const { found, widgets } = await source(actor, id);
  return {
    name: found.name,
    intro: found.kind === "story" ? String(found.intro ?? "") : "",
    kind: found.kind === "story" ? "story" : "dashboard",
    widgets: widgets.map((w) => ({ template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title })),
  };
}
