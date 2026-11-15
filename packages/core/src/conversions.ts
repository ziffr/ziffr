// Turning one into another (spec 0010, ticket #149; spec 0013; GLOSSARY: Dashboard, Deck, Finding): the makings of a
// deck from a dashboard. The deck is new, owned by the person making it, and independent of where it came from; its
// numbers stay live. Only what the person may open can be copied, and placing a copy checks again that they see
// every Metric on it.
import { Forbidden, type Actor } from "./actor";
import { visibleDashboards } from "./access";
import { dashboardWidgets } from "./page-data";
import type { Widget } from "./types";

/** A dashboard the actor may open, with its widgets in reading order. */
async function source(actor: Actor, id: number) {
  if (!Number.isInteger(id)) throw new Forbidden();
  const found = (await visibleDashboards(actor.workspaceId, actor.personId)).find((d) => d.id === id);
  if (!found) throw new Forbidden();
  const widgets = (await dashboardWidgets(actor, id)).sort((a, b) => a.y - b.y || a.x - b.x || a.id - b.id);
  return { found, widgets };
}

/** What a new deck is made from: the dashboard's name and introduction, and its widgets in reading order, as the
 * deck editor lays them out (one slide each). Only for a dashboard the actor may open. */
export async function deckSeed(actor: Actor, id: number): Promise<{ name: string; intro: string; widgets: Pick<Widget, "template" | "metric_ids" | "settings" | "title">[] }> {
  const { found, widgets } = await source(actor, id);
  return {
    name: found.name,
    intro: String(found.intro ?? ""),
    widgets: widgets.map((w) => ({ template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title })),
  };
}
