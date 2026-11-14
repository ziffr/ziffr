// View Links (GLOSSARY: View Link): what someone outside the team gets to see. Only the one dashboard or deck, only
// the Metrics it shows, people's names without their contact details, and nothing to act on. Made, listed and
// revoked by the owner of the dashboard or deck.
import { randomBytes } from "node:crypto";

/** The demo workspace (ADR 0005): shared by every visitor, so it makes no View Links. */
const DEMO_WORKSPACE_ID = "d3e00000-0000-4000-8000-000000000001";
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { getCanvasData } from "./access";
import { assertSeesMetrics } from "./sharing";
import { deckMetricIds } from "./visibility";
import { widgetMetricIds } from "./widget-metrics";
import { audit } from "./audit-log";
import type { CanvasData, Widget } from "./types";

/** How long a View Link may live at most, in days. */
export const MAX_DAYS = 90;

/** What a View Link page shows. */
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

const pick = <T extends Record<string, unknown>>(o: T, keep: Set<number>) => Object.fromEntries(Object.entries(o).filter(([k]) => keep.has(Number(k)))) as T;
const table = (type: "dashboard" | "deck") => (type === "deck" ? "decks" : "dashboards");

/** Everything a View Link page needs, built as its owner sees it inside their workspace and cut down to the one
 * object. For a live link, only the Metrics agreed to when it was made. */
export async function buildView(type: "dashboard" | "deck", id: number, allowed?: number[], allowedWidgets?: number[] | null, allowedShapes?: string[] | null): Promise<ViewPayload | null> {
  const { data: obj } = await db().from(table(type)).select("*").eq("id", id).maybeSingle();
  if (!obj) return null;
  const ws = obj.workspace_id as string;
  let widgets: Widget[] | undefined;
  let metricIds: number[];
  if (type === "dashboard") {
    const { data } = await db().from("widgets").select("*").eq("dashboard_id", id).eq("workspace_id", ws).order("y").order("x");
    widgets = (data ?? []) as Widget[];
    metricIds = [...new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))];
  } else metricIds = deckMetricIds(obj.document);
  // Only the series this link can show are read; it filters them further below.
  const full = await getCanvasData(ws, obj.owner_id, { seriesOf: metricIds });
  // Only Metrics the owner sees and, for a live link, agreed to when making it; added ones stay out.
  const ids = new Set(metricIds.filter((m) => full.metrics.some((x) => x.id === m) && (!allowed || allowed.includes(m))));
  const metrics = full.metrics.filter((m) => ids.has(m.id));
  // Only widgets the link was made with, and only those whose every Metric is shown: titles and settings (story
  // panels, free layouts) can name a Metric, so a widget that draws any left-out Metric stays out whole. Each widget
  // goes out with the fields drawing needs, nothing else.
  if (widgets) {
    widgets = widgets
      .filter((w) => !allowedWidgets || allowedWidgets.includes(w.id))
      .filter((w) => widgetMetricIds(w.metric_ids, w.settings).every((m) => ids.has(m)))
      .map((w) => ({ id: w.id, template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h }) as Widget);
  }
  // Only the shown Metrics' own series: a derived Metric's inputs stay out (its comparisons then do not show).
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
  return { type, id, name: obj.name, themeId: obj.theme_id ?? null, data, widgets, document: type === "deck" ? deckForLink(obj.document, ids, allowedShapes ?? null) : undefined, footer: type === "deck" ? obj.footer : undefined, asOf: new Date().toISOString() };
}

/** A deck's slides as a View Link may show them: only the records the deck had when the link was made (for a live
 * link: shapes, pages, assets, bindings alike), and no widget that draws a left-out Metric. */
function deckForLink(document: unknown, shown: Set<number>, records: string[] | null): unknown {
  const doc = document as { store?: Record<string, { type?: string; props?: { metricIds?: unknown; settings?: unknown } }> } | null;
  if (!doc?.store) return document;
  const keep = Object.entries(doc.store).filter(([key, r]) => {
    if (records && !records.includes(key)) return false;
    if (r?.type !== "ziffr-widget") return true;
    const ids = Array.isArray(r.props?.metricIds) ? (r.props!.metricIds as unknown[]).map(Number) : [];
    return deckMetricIds({ store: { x: r } }).concat(ids).every((m) => shown.has(m));
  });
  return { ...doc, store: Object.fromEntries(keep) };
}

/** A link's content for whoever opens it, or null when it does not exist, was revoked or has expired. */
export async function openViewLink(token: string): Promise<ViewPayload | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token))) return null;
  const { data: link } = await db().from("view_links").select("*").eq("token", token).maybeSingle();
  if (!link || link.revoked_at || link.expires_at < new Date().toISOString().slice(0, 10)) return null;
  if (link.frozen) return link.frozen as ViewPayload;
  return buildView(link.object_type, link.object_id, link.metric_ids ?? [], link.widget_ids ?? null, link.shape_ids ?? null);
}

/** Refuses anyone but the owner of the dashboard or deck, in their workspace. */
async function assertOwner(actor: Actor, type: "dashboard" | "deck", id: number) {
  if (type !== "dashboard" && type !== "deck") throw new Forbidden();
  const { data } = await db().from(table(type)).select("owner_id").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.owner_id !== actor.personId) throw new Forbidden();
}

/** The View Links of a dashboard or deck, for its owner. */
export async function listViewLinks(actor: Actor, type: "dashboard" | "deck", id: number) {
  await assertOwner(actor, type, id);
  const { data } = await db().from("view_links").select("id, token, label, expires_at, revoked_at, created_at, frozen").eq("workspace_id", actor.workspaceId).eq("object_type", type).eq("object_id", id).order("id", { ascending: false });
  return (data ?? []).map((l) => ({ id: l.id, token: l.token, label: l.label, expires_at: l.expires_at, revoked: Boolean(l.revoked_at), created_at: l.created_at, frozen: Boolean(l.frozen) }));
}

/** Makes a View Link to the actor's dashboard or deck, live or frozen, ending on a day within MAX_DAYS. A View Link
 * is sharing, so Guests make none. Returns the token. */
export async function createViewLink(actor: Actor, type: "dashboard" | "deck", id: number, input: { label: string; expires: string; frozen: boolean }): Promise<string> {
  // Visitors share the demo: a View Link from it would let anyone publish their own text under this site.
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("View Links cannot be made in the demo.");
  await assertOwner(actor, type, id);
  assertCan(actor, "share");
  const today = new Date().toISOString().slice(0, 10);
  const latest = new Date(Date.now() + MAX_DAYS * 86400000).toISOString().slice(0, 10);
  const expires = String(input?.expires ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || expires < today || expires > latest) throw new Error(`Pick an end date within ${MAX_DAYS} days.`);
  const view = await buildView(type, id);
  if (!view) throw new Forbidden();
  // Only what its owner may see goes out.
  await assertSeesMetrics(actor, view.data.metrics.map((m) => m.id));
  const token = randomBytes(24).toString("base64url");
  const { data: made } = await db().from("view_links").insert({ token, object_type: type, object_id: id, created_by: actor.personId, label: String(input?.label ?? "").slice(0, 80), expires_at: expires, frozen: input?.frozen ? view : null, metric_ids: view.data.metrics.map((m) => m.id), widget_ids: view.widgets?.map((w) => w.id) ?? null,
    // Every record the deck has now, not only shapes: anything added later stays out of a live link.
    shape_ids: type === "deck" ? Object.keys((view.document as { store?: object } | null)?.store ?? {}) : null,
    workspace_id: actor.workspaceId }).select("id").single();
  // Never the token: whoever reads the record must not be able to open the link from it.
  await audit(actor, { kind: "view_link.created", object: { type, id, name: view.name }, details: { link_id: made?.id ?? null, frozen: Boolean(input?.frozen), expires_on: expires, metrics: view.data.metrics.length } });
  return token;
}

/** Revokes a View Link; its owner may, whatever their role now. */
export async function revokeViewLink(actor: Actor, linkId: number) {
  const { data: l } = await db().from("view_links").select("object_type, object_id").eq("id", linkId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!l) throw new Forbidden();
  await assertOwner(actor, l.object_type, l.object_id);
  const { data: revoked } = await db().from("view_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId).eq("workspace_id", actor.workspaceId).is("revoked_at", null).select("id");
  if (!revoked?.length) return;
  const { data: obj } = await db().from(table(l.object_type)).select("name").eq("id", l.object_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "view_link.revoked", object: { type: l.object_type, id: l.object_id, name: obj?.name ?? null }, details: { link_id: linkId } });
}
