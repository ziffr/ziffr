import "server-only";
// View Links (GLOSSARY: View Link): what someone outside the team gets to see. Only the one dashboard or deck,
// only the metrics it shows, people's names without their contact details, and nothing to act on.
import { db } from "./db";
import { deckMetricIds, getCanvasData } from "./access";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import type { CanvasData, Widget } from "@ziffr/core/types";

export type ViewPayload = {
  type: "dashboard" | "deck";
  id: number;
  name: string;
  themeId: number | null;
  data: CanvasData;
  widgets?: Widget[];
  document?: unknown;
  footer?: string | null;
  asOf: string;
};

const pick = <T extends Record<string, unknown>>(o: T, ids: Set<number>) => Object.fromEntries(Object.entries(o).filter(([k]) => ids.has(Number(k)))) as T;

/** Everything a View Link page needs, built as its owner sees it and cut down to the object. */
export async function buildView(type: "dashboard" | "deck", id: number, allowed?: number[]): Promise<ViewPayload | null> {
  const { data: obj } = await db.from(type === "deck" ? "decks" : "dashboards").select("*").eq("id", id).maybeSingle();
  if (!obj) return null;
  let widgets: Widget[] | undefined;
  let metricIds: number[];
  if (type === "dashboard") {
    const { data } = await db.from("widgets").select("*").eq("dashboard_id", id).order("y").order("x");
    widgets = (data ?? []) as Widget[];
    metricIds = [...new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))];
  } else metricIds = deckMetricIds(obj.document);
  const full = await getCanvasData(obj.owner_id);
  // Only metrics the owner can see and, for a live link, agreed to when making it; added ones stay out.
  const ids = new Set(metricIds.filter((m) => full.metrics.some((x) => x.id === m) && (!allowed || allowed.includes(m))));
  const metrics = full.metrics.filter((m) => ids.has(m.id));
  // Only the shown metrics' own series: a derived metric's inputs stay out (its comparisons then do not show).
  const slugs = new Set(metrics.map((m) => m.slug));
  const data: CanvasData = {
    viewer: "",
    metrics,
    series: Object.fromEntries(Object.entries(full.series).filter(([slug]) => slugs.has(slug))),
    people: full.people.map((p) => ({ id: p.id, name: p.name, role: p.role, color: p.color, slack_handle: "", email: "", phone: null })),
    openActions: {},
    submitters: {},
    targets: pick(full.targets, ids),
    projections: pick(full.projections, ids),
    breakdowns: pick(full.breakdowns, ids),
    templates: [],
    themes: full.themes.filter((t) => t.id === obj.theme_id || t.is_default),
    canEditThemes: false,
    groups: [],
    pending: pick(full.pending, ids),
    locked: pick(full.locked, ids),
  };
  return { type, id, name: obj.name, themeId: obj.theme_id ?? null, data, widgets, document: type === "deck" ? obj.document : undefined, footer: type === "deck" ? obj.footer : undefined, asOf: new Date().toISOString() };
}

/** A link's content, or null when it does not exist, was revoked or has expired. */
export async function openViewLink(token: string): Promise<ViewPayload | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data: link } = await db.from("view_links").select("*").eq("token", token).maybeSingle();
  if (!link || link.revoked_at || link.expires_at < new Date().toISOString().slice(0, 10)) return null;
  if (link.frozen) return link.frozen as ViewPayload;
  return buildView(link.object_type, link.object_id, link.metric_ids ?? []);
}
