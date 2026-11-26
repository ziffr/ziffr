// View Links (GLOSSARY: View Link): what someone outside the team gets to see. Only the one dashboard or deck, only
// the Metrics it shows, people's names without their contact details, and nothing to act on. Made, listed and
// revoked by the owner of the dashboard or deck.
import { isTagWidget } from "./tag-widgets";
import { withoutNestedTagSources } from "./tag-source";
import { tagWidgetCount } from "./tag-lists";
import { randomBytes } from "node:crypto";
import { db } from "./db";
import { openOne, openRows, reserveIds } from "./sealed-columns";
import { mapViewWords, openFrozenData, opening, openObject, sealFrozenData, sealing, sealObject } from "./sealed-words";
import { workspaceCipher } from "./workspace-keys";
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { getCanvasData } from "./access";
import { assertSeesMetrics } from "./sharing";
import { deckMetricIds } from "./visibility";
import { widgetMetricIds } from "./widget-metrics";
import { audit } from "./audit-log";
import { mentionsPerson, nameHider } from "./hide-names";
import { peopleToHide } from "./submissions";
import { recordView } from "./usage";
import { stripOutsideContent, widgetWithoutOutside } from "./deck-content";
import { forReader, snapshotForLink, type SnapshotWords } from "./snapshots";
import { dataAsOfEach } from "./snapshot-periods";
import { withoutKeptNumbers } from "./snapshot-parts";
import { yearStartOf } from "./fiscal-year";
import { keptUnit } from "./units";
import { keptMethod } from "./attainment-method";
import { normalizeMetric } from "./metric-row";
import { numberStyleOf } from "./workspace-settings";
import { effectiveLimit } from "./limits";
import { trialEnded, trialLastDay, trialLimitMessage } from "./trials";
import type { CanvasData, Widget } from "./types";
import { withoutUnseenInputs } from "./formula";

/** How long a View Link may live at most, in days: the ceiling; a Workspace may set a shorter life (limits.ts). */
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
  /** A dashboard's introduction (spec 0013), shown above its widgets; empty when it has none. */
  intro?: string;
  /** Frozen links made while stories were their own thing (spec 0010) keep the introduction here. */
  story?: { intro: string };
  /** Set when the link shows a Snapshot (spec 0013): which period, and when it was taken. */
  snapshot?: { label: string; takenAt: string };
  asOf: string;
  /** The Workspace's name, for the frame of the page a View Link opens on (ticket #542); set only by openViewLink. */
  workspaceName?: string;
  /** The Workspace, for the address of its logo (brand-logo.ts); set only by openViewLink, and never sent to a browser. */
  workspaceId?: string;
};

const pick = <T extends Record<string, unknown>>(o: T, keep: Set<number>) => Object.fromEntries(Object.entries(o).filter(([k]) => keep.has(Number(k)))) as T;
const table = (type: "dashboard" | "deck") => (type === "deck" ? "decks" : "dashboards");

/** A Metric as it may leave the Workspace: without the words that are for people inside it (its description and, spec
 * 0060, its Calculation Note). Both are left empty, which a {calculation note} Placeholder fills in as nothing. */
const insideOnly = <M extends { description: string; calculation_note?: string | null }>(m: M): M => ({ ...m, description: "", calculation_note: "" });

/** The people a shown view refers to, as the page may draw them: only the owners of the shown Metrics (the one place a
 * view names a person), by id, name and colour. No role, no contact details, and no one else of the Workspace, Guests
 * and Contacts included (rule 3; ticket #902). Also cuts down frozen copies and Snapshots made with the whole list. */
function peopleShown(people: CanvasData["people"], metrics: { owner_id: string }[]): CanvasData["people"] {
  const owners = new Set(metrics.map((m) => m.owner_id));
  return people.filter((p) => owners.has(p.id)).map((p) => ({ id: p.id, name: p.name, role: "", color: p.color, slack_handle: "", email: "", phone: null }));
}

/** What may go out with a View Link or a Snapshot (spec 0013) of what one person sees: only these Metrics and their
 * own series, people's names without contact details, the theme in use and the default, and nothing to act on. */
export function shownData(full: CanvasData, ids: Set<number>, themeId: number | null): CanvasData {
  // A description and a Calculation Note are for people inside the Workspace, so neither goes out with a view (rule 3).
  const metrics = full.metrics.filter((m) => ids.has(m.id)).map(insideOnly);
  // Only the shown Metrics' own series: a derived Metric's inputs stay out (its comparisons then do not show).
  const slugs = new Set(metrics.map((m) => m.slug));
  return {
    viewer: "",
    // Nor does its formula name a Metric that is not shown.
    metrics: withoutUnseenInputs(metrics, slugs),
    series: Object.fromEntries(Object.entries(full.series).filter(([slug]) => slugs.has(slug))),
    people: peopleShown(full.people, metrics),
    openActions: {},
    submitters: {},
    targets: pick(full.targets, ids),
    projections: pick(full.projections, ids),
    // Only the shown Metrics' Condensed Values, like their series.
    condensed: pick(full.condensed ?? {}, ids),
    breakdowns: pick(full.breakdowns, ids),
    templates: [],
    // A Theme goes out as it looks, without the id of the person who made it (rule 3).
    themes: full.themes.filter((t) => t.id === themeId || t.is_default).map((t) => ({ ...t, owner_id: "" })),
    canEditThemes: false,
    groups: [],
    pending: pick(full.pending, ids),
    locked: pick(full.locked, ids),
    yearStart: full.yearStart,
    numberStyle: full.numberStyle,
    attainmentMethod: full.attainmentMethod,
    ...(full.today ? { today: full.today } : {}),
  };
}

/** Everything a View Link page needs, built as its owner sees it inside their workspace and cut down to the one
 * object. For a live link, only the Metrics agreed to when it was made. */
export async function buildView(type: "dashboard" | "deck", id: number, allowed?: number[], allowedWidgets?: number[] | null, allowedShapes?: string[] | null): Promise<ViewPayload | null> {
  const { data: stored } = await db().from(table(type)).select("*").eq("id", id).maybeSingle();
  // A dashboard's introduction is sealed with the Workspace Key (spec 0028).
  const obj = type === "dashboard" ? await openOne("dashboards", String(stored?.workspace_id), stored) : stored;
  if (!obj) return null;
  const ws = obj.workspace_id as string;
  // A link shows no Snapshot Part and nothing of a slide that keeps numbers (spec 0061): who sees those is decided
  // per person, and someone with a link is nobody Ziffr knows. They are left out before anything else is read.
  const slides = type === "deck" ? withoutKeptNumbers(obj.document as unknown).document : undefined;
  let widgets: Widget[] | undefined;
  let metricIds: number[];
  if (type === "dashboard") {
    const { data } = await db().from("widgets").select("*").eq("dashboard_id", id).eq("workspace_id", ws).order("y").order("x");
    // Nothing in a free layout may load from another site when shown through the link (spec 0009).
    widgets = ((await openRows("widgets", ws, data)) as Widget[]).map(widgetWithoutOutside);
    metricIds = [...new Set(widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)))];
  } else metricIds = deckMetricIds(slides);
  // Only the series this link can show are read; it filters them further below.
  const full = await getCanvasData(ws, obj.owner_id, { seriesOf: metricIds });
  // Only Metrics the owner sees and, for a live link, agreed to when making it; added ones stay out.
  const ids = new Set(metricIds.filter((m) => full.metrics.some((x) => x.id === m) && (!allowed || allowed.includes(m))));
  // Only widgets the link was made with, and only those whose every Metric is shown: titles and settings (story
  // panels, free layouts) can name a Metric, so a widget that draws any left-out Metric stays out whole. Each widget
  // goes out with the fields drawing needs, nothing else.
  if (widgets) {
    widgets = widgets
      .filter((w) => !allowedWidgets || allowedWidgets.includes(w.id))
      // A widget of "all Metrics tagged X" is never shown to someone outside: a link shows a list its maker chose (spec 0038).
      .filter((w) => !isTagWidget(w))
      .filter((w) => widgetMetricIds(w.metric_ids, w.settings).every((m) => ids.has(m)))
      .map((w) => ({ id: w.id, template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h }) as Widget);
  }
  // The deck as this link shows it: only the records it had when the link was made, nothing from other sites.
  const document = type === "deck" ? deckForLink(withoutNestedTagSources(stripOutsideContent(slides)), ids, allowedShapes ?? null) : undefined;
  // A deck made from a Snapshot draws its Metrics as of the period's end: then only that much goes out (spec 0013).
  // Read from the deck this link shows, so a widget added since cannot make a Metric go out whole again.
  const data = type === "deck" ? dataAsOfEach(shownData(full, ids, obj.theme_id ?? null), deckAsOf(document)) : shownData(full, ids, obj.theme_id ?? null);
  return { type, id, name: obj.name, themeId: obj.theme_id ?? null, data, widgets, document, footer: type === "deck" ? obj.footer : undefined, intro: type === "dashboard" ? String(obj.intro ?? "") : undefined, asOf: new Date().toISOString() };
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

/** For each Metric of a deck that every widget drawing it draws as of a day (`asOf`), the latest such day. A Metric
 * drawn anywhere without one, or inside a free layout, is left out: it is sent whole, as before. */
export function deckAsOf(document: unknown): Map<number, string> {
  const store = (document as { store?: Record<string, { type?: string; props?: { metricIds?: unknown; settings?: unknown } }> } | null)?.store ?? {};
  const ends = new Map<number, string>();
  const whole = new Set<number>();
  for (const r of Object.values(store)) {
    if (r?.type !== "ziffr-widget") continue;
    let settings: Record<string, unknown> = {};
    try { settings = (typeof r.props?.settings === "string" ? JSON.parse(r.props.settings) : r.props?.settings ?? {}) as Record<string, unknown>; } catch { settings = {}; }
    const ids = widgetMetricIds(Array.isArray(r.props?.metricIds) ? (r.props!.metricIds as unknown[]).map(Number) : [], settings);
    const asOf = typeof settings.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(settings.asOf) && !(settings.canvas as { document?: unknown } | null)?.document ? settings.asOf : null;
    for (const id of ids) {
      if (!asOf) whole.add(id);
      else if (!ends.has(id) || ends.get(id)! < asOf) ends.set(id, asOf);
    }
  }
  for (const id of whole) ends.delete(id);
  return ends;
}

/** Every string of a value through `change`. */
function mapStrings(value: unknown, change: (text: string) => string): unknown {
  if (typeof value === "string") return change(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, change));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, change)]));
  return value;
}

/** The one rule for people's names on a View Link (ticket #590; GLOSSARY: View Link, Guest): someone with the link is
 * signed out and is no one the Workspace knows, so unless the link's maker ticked "Show names" the page carries no
 * person at all: no list of people, no Metric owner, and in every word of it (dashboard, widgets, slides, Snapshot
 * words) the names, first names, emails and handles of the Workspace's people, and of those a frozen copy kept,
 * read "Someone" (hide-names.ts, as for a Guest). Rule 3: what is not sent cannot leak, so the people are dropped
 * rather than hidden by the page (contact details are loaded only to find them in words, never sent). With names on, the list is what shownData keeps: names and colours, no contact details. */
export async function viewForLink(kept: ViewPayload, workspaceId: string, showNames: boolean): Promise<ViewPayload> {
  // Served through the same cut as made, as for people below: a frozen copy's formulas name only Metrics it shows.
  const metricsShown = withoutUnseenInputs(kept.data.metrics, new Set(kept.data.metrics.map((m) => m.slug)));
  const view = { ...kept, data: { ...kept.data, metrics: metricsShown } };
  // A Theme is drawn by its looks: never the id of whoever made it, also in a frozen copy made before that was left out.
  const themes = view.data.themes.map((t) => ({ ...t, owner_id: "" }));
  // Served through the same cut as made: frozen copies and Snapshots kept the whole list before (ticket #902).
  if (showNames) return { ...view, data: { ...view.data, themes, people: peopleShown(view.data.people, view.data.metrics) } };
  const people = [...(await peopleToHide(workspaceId)), ...view.data.people];
  const hide = nameHider(people);
  const mentions = mentionsPerson(people);
  const words = mapStrings({ ...view, data: { ...view.data, people: [], series: {}, themes } }, hide) as ViewPayload;
  // A slug and a formula are not words but keys: kept as they are so the series still match, unless one names a person
  // (anywhere, in any case), then it becomes an opaque key and its series follow. Matched by Metric id, not by place.
  const original = new Map(view.data.metrics.map((m) => [m.id, m]));
  const series: ViewPayload["data"]["series"] = {};
  const metrics = words.data.metrics.map((m) => {
    const o = original.get(m.id)!;
    const slug = mentions(o.slug) ? `metric-${m.id}` : o.slug;
    if (view.data.series[o.slug]) series[slug] = view.data.series[o.slug];
    return { ...m, slug, formula: o.formula && mentions(o.formula) ? null : o.formula, owner_id: "" };
  });
  return { ...words, data: { ...words.data, people: [], series, metrics }, workspaceName: view.workspaceName };
}

/** A link's content for whoever opens it, or null when it does not exist, was revoked or has expired. With
 * `count`, a link that works also adds to its dashboard's or deck's View Count (spec 0031): once, a number and no
 * visitor, in the background, never delayed or stopped by it. The page passes false for a prefetch or a HEAD. */
export async function openViewLink(token: string, opts: { count?: boolean } = {}): Promise<ViewPayload | null> {
  const view = await openLinkContent(token, opts);
  if (!view) return null;
  // The page's frame says whose numbers these are: the Workspace's name, and (in the Themes it already carries) its
  // logo and colours. Nothing else about the Workspace leaves with it (AGENTS.md rule 3).
  const { data: link } = await db().from("view_links").select("workspace_id, show_names, workspaces(name)").eq("token", token).maybeSingle();
  if (!link) return null;
  const named = await viewForLink(view, String(link.workspace_id), Boolean(link.show_names));
  return { ...named, workspaceName: (link.workspaces as unknown as { name: string } | null)?.name ?? undefined, workspaceId: link.workspace_id as string };
}

async function openLinkContent(token: string, opts: { count?: boolean }): Promise<ViewPayload | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token))) return null;
  const { data: link } = await db().from("view_links").select("*").eq("token", token).maybeSingle();
  if (!link || link.revoked_at || link.expires_at < new Date().toISOString().slice(0, 10)) return null;
  // A link of a trial that has ended shows nothing, though its last day may run to midnight (never outlives the trial).
  if (await trialEnded(String(link.workspace_id))) return null;
  // A Snapshot's link counts for its dashboard (object_id); recordView ignores an id that is gone.
  if (opts.count && (link.object_type === "dashboard" || link.object_type === "deck")) {
    void recordView({ workspaceId: String(link.workspace_id) }, { kind: link.object_type, id: Number(link.object_id) }, "link");
  }
  if (link.frozen) {
    // A frozen link keeps its values; its quarters follow the workspace's year start as everywhere else (spec 0017).
    const cipher = await workspaceCipher(String(link.workspace_id));
    // The data is opened first (it is sealed as a whole), then the words in it; data that does not open ends the link.
    const sealedData = openFrozenData(cipher, "view_links", link.id, link.frozen as ViewPayload);
    if (!sealedData) return null;
    const frozen = mapViewWords(sealedData, opening(cipher, "view_links", link.id));
    // A quarter it showed as "to date" stays so: counted as of the day the link was made (spec 0018).
    // Its numbers are written in the workspace's Number Style now, and a Metric kept before units had a side shows
    // the unit its format used to add (spec 0022). Its Attainment keeps the methods it was made with (#130).
    const ws = String(link.workspace_id);
    const [yearStart, numberStyle] = await Promise.all([yearStartOf(ws), numberStyleOf(ws)]);
    // A link made before descriptions were left out of what goes out still holds them: they are not sent (rule 3).
    const metrics = frozen.data.metrics.map((m) => insideOnly(normalizeMetric(keptUnit(m))));
    return { ...frozen, data: { ...frozen.data, metrics, yearStart, numberStyle, attainmentMethod: keptMethod(frozen.data.attainmentMethod), today: frozen.data.today ?? String(link.created_at).slice(0, 10) } };
  }
  // A link to a Snapshot reads it each time, so a deleted Snapshot ends the link; its words are those kept with it.
  if (link.snapshot_id) {
    // The words kept with the link are sealed for it; a link made before they were kept reads the Snapshot's own.
    const kept = link.snapshot_words ? (openObject(await workspaceCipher(String(link.workspace_id)), { table: "view_links", column: "snapshot_words", row: link.id }, link.snapshot_words) as SnapshotWords) : null;
    const s = await snapshotForLink(Number(link.snapshot_id), Number(link.object_id), kept);
    const { data: dash } = await db().from("dashboards").select("owner_id, workspace_id").eq("id", link.object_id).maybeSingle();
    if (!s || !dash) return null;
    // As any View Link: only what the dashboard's owner may see now, and only the Metrics agreed when it was made
    // (visibility carries all the way through, #193). A widget drawing any other Metric stays out whole.
    const seen = await forReader({ personId: dash.owner_id as string, workspaceId: dash.workspace_id as string }, s.widgets, s.data, s.themeId, link.metric_ids ?? []);
    return snapshotPayload(link.object_id, s, seen);
  }
  return buildView(link.object_type, link.object_id, link.metric_ids ?? [], link.widget_ids ?? null, link.shape_ids ?? null);
}

/** What a View Link to a Snapshot shows: its widgets as the reader may see them, with the words kept with it. */
function snapshotPayload(dashboardId: number, s: NonNullable<Awaited<ReturnType<typeof snapshotForLink>>>, seen: Awaited<ReturnType<typeof forReader>>): ViewPayload {
  return { type: "dashboard", id: dashboardId, name: s.name, themeId: s.themeId, data: seen.data, widgets: seen.widgets.map((w) => ({ id: w.id, template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h }) as Widget), intro: s.intro, snapshot: { label: s.label, takenAt: s.takenAt }, asOf: s.takenAt };
}

/** Exactly what the person on the other end of a View Link to this dashboard (or one of its shown Snapshots) would see
 * now, for its owner to look at before agreeing to make it (GLOSSARY: Share Proposal). Only the owner, only while their
 * role may share, and only Metrics they see, as when the link is made; null when there is nothing to show. */
export async function previewViewLink(actor: Actor, dashboardId: number, snapshotId: number | null): Promise<ViewPayload | null> {
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  await assertOwner(actor, "dashboard", dashboardId);
  assertCan(actor, "share");
  if (snapshotId !== null) {
    const s = await snapshotForLink(snapshotId, dashboardId);
    if (!s) return null;
    const ids = s.data.metrics.map((m) => m.id);
    await assertSeesMetrics(actor, ids);
    return snapshotPayload(dashboardId, s, await forReader(actor, s.widgets, s.data, s.themeId, ids));
  }
  const view = await buildView("dashboard", dashboardId);
  if (!view) return null;
  await assertSeesMetrics(actor, view.data.metrics.map((m) => m.id));
  return view;
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
  const { data } = await db().from("view_links").select("id, token, label, expires_at, revoked_at, created_at, frozen, show_names, snapshot_id, dashboard_snapshots(label, deleted_at)").eq("workspace_id", actor.workspaceId).eq("object_type", type).eq("object_id", id).order("id", { ascending: false });
  return (data ?? []).map((l) => {
    const s = l.dashboard_snapshots as unknown as { label: string; deleted_at: string | null } | null;
    // A link to a deleted Snapshot no longer works: it reads as revoked.
    return { id: l.id, token: l.token, label: l.label, expires_at: l.expires_at, revoked: Boolean(l.revoked_at) || Boolean(s?.deleted_at), created_at: l.created_at, frozen: Boolean(l.frozen), showNames: Boolean(l.show_names), snapshotId: (l.snapshot_id as number | null) ?? null, snapshotLabel: s?.label ?? null };
  });
}

/** Makes a View Link to the actor's dashboard or deck, live or frozen, ending on a day within MAX_DAYS; for a
 * dashboard, `snapshotId` makes it show one of its shown Snapshots (spec 0013). A View Link is sharing, so Guests
 * make none. `opts.view` makes a live or frozen link from that very payload (for a dashboard or deck, not a Snapshot). Returns the token. */
export async function createViewLink(actor: Actor, type: "dashboard" | "deck", id: number, input: { label: string; expires: string; frozen: boolean; snapshotId?: number | null; showNames?: boolean }, opts: { accessKeyId?: number; view?: ViewPayload } = {}): Promise<string> {
  if (input?.snapshotId !== undefined && input?.snapshotId !== null) return createSnapshotLink(actor, id, Number(input.snapshotId), input, opts);
  await assertOwner(actor, type, id);
  assertCan(actor, "share");
  // A link shows what its maker chose: a widget that follows a Tag needs its list fixed first (spec 0038).
  if (type === "dashboard" && (await tagWidgetCount(actor.workspaceId, id)) > 0) throw new Refused("This dashboard has a widget that shows all Metrics with a Tag. Fix the list first, then make the link.");
  const today = new Date().toISOString().slice(0, 10);
  const maxDays = await effectiveLimit("viewLinkDays", actor.workspaceId);
  const latest = new Date(Date.now() + maxDays * 86400000).toISOString().slice(0, 10);
  const asked = String(input?.expires ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asked) || asked < today || asked > latest) throw new Refused(`Pick an end date within ${maxDays} days.`);
  // In a trial a link ends with the trial at the latest. The date asked for is what is written: the database clamps it
  // and remembers it, so subscribing gives it back (`expires` is the date the link really has, for the Audit Log).
  const trialEnd = await trialLastDay(actor.workspaceId);
  const expires = trialEnd && trialEnd < asked ? trialEnd : asked;
  // `opts.view` is a payload the caller already checked (a Share Proposal's): the link is made from exactly it, with no second read in between.
  const view = opts.view ?? await buildView(type, id);
  if (!view) throw new Forbidden();
  // Only what its owner may see goes out.
  await assertSeesMetrics(actor, view.data.metrics.map((m) => m.id));
  const token = randomBytes(24).toString("base64url");
  // A frozen link keeps the words it shows, sealed for it with the Workspace Key (spec 0028), so its id is taken first.
  const [linkId] = await reserveIds("view_links", 1);
  const cipher = await workspaceCipher(actor.workspaceId);
  const frozen = input?.frozen ? sealFrozenData(cipher, "view_links", linkId, mapViewWords(view, sealing(cipher, "view_links", linkId))) : null;
  const { data: made, error: madeError } = await db().from("view_links").insert({ id: linkId, token, object_type: type, object_id: id, created_by: actor.personId, label: String(input?.label ?? "").slice(0, 80), expires_at: asked, frozen, show_names: input?.showNames === true, metric_ids: view.data.metrics.map((m) => m.id), widget_ids: view.widgets?.map((w) => w.id) ?? null,
    // Every record the deck has now, not only shapes: anything added later stays out of a live link.
    shape_ids: type === "deck" ? Object.keys((view.document as { store?: object } | null)?.store ?? {}) : null,
    workspace_id: actor.workspaceId }).select("id").single();
  // A trial's limit (ZF437) or any other refusal of the database: no link was made, so no token goes out.
  if (madeError) throw new Refused(trialLimitMessage(madeError.code) ?? "The View Link could not be made. Try again.");
  // Never the token: whoever reads the record must not be able to open the link from it.
  await audit(actor, { kind: "view_link.created", object: { type, id, name: view.name }, accessKeyId: opts.accessKeyId, details: { link_id: made?.id ?? null, frozen: Boolean(input?.frozen), show_names: input?.showNames === true, expires_on: expires, metrics: view.data.metrics.length } });
  return token;
}

/** The end date of a new View Link, checked: from today to `maxDays` ahead (the Workspace's longest life of a View Link). */
export function endDate(expires: unknown, maxDays: number = MAX_DAYS): string {
  const today = new Date().toISOString().slice(0, 10);
  const latest = new Date(Date.now() + maxDays * 86400000).toISOString().slice(0, 10);
  const e = String(expires ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e) || e < today || e > latest) throw new Refused(`Pick an end date within ${maxDays} days.`);
  return e;
}

/** A View Link to one of the actor's dashboard's Snapshots, once it is shown: what it kept and its words, read when
 * the link is opened. Like any View Link, only its dashboard's owner makes one, and only of Metrics they see. */
async function createSnapshotLink(actor: Actor, dashboardId: number, snapshotId: number, input: { label: string; expires: string; showNames?: boolean }, opts: { accessKeyId?: number } = {}): Promise<string> {
  if (!Number.isInteger(dashboardId) || !Number.isInteger(snapshotId)) throw new Forbidden();
  await assertOwner(actor, "dashboard", dashboardId);
  assertCan(actor, "share");
  const asked = endDate(input?.expires, await effectiveLimit("viewLinkDays", actor.workspaceId));
  // In a trial a link ends with the trial at the latest. The date asked for is what is written: the database clamps it
  // and remembers it, so subscribing gives it back (`expires` is the date the link really has, for the Audit Log).
  const trialEnd = await trialLastDay(actor.workspaceId);
  const expires = trialEnd && trialEnd < asked ? trialEnd : asked;
  const s = await snapshotForLink(snapshotId, dashboardId);
  // Only a shown Snapshot of this dashboard: a draft is not for anyone else yet.
  if (!s) throw new Refused("Show the Snapshot to everyone with access first, then make a link to it.");
  await assertSeesMetrics(actor, s.data.metrics.map((m) => m.id));
  const token = randomBytes(24).toString("base64url");
  const [linkId] = await reserveIds("view_links", 1);
  const { data: made, error: madeError } = await db().from("view_links").insert({ id: linkId, token, object_type: "dashboard", object_id: dashboardId, created_by: actor.personId, label: String(input?.label ?? "").slice(0, 80), expires_at: asked, frozen: null, show_names: input?.showNames === true, snapshot_id: snapshotId,
    // The words as the owner sees them now: someone outside reads these, whatever is written in Ziffr later. Sealed for
    // the link with the Workspace Key (spec 0028).
    snapshot_words: sealObject(await workspaceCipher(actor.workspaceId), { table: "view_links", column: "snapshot_words", row: linkId }, s.words), metric_ids: s.data.metrics.map((m) => m.id), widget_ids: null, shape_ids: null, workspace_id: actor.workspaceId }).select("id").single();
  // A trial's limit (ZF437) or any other refusal of the database: no link was made, so no token goes out.
  if (madeError) throw new Refused(trialLimitMessage(madeError.code) ?? "The View Link could not be made. Try again.");
  await audit(actor, { kind: "view_link.created", object: { type: "dashboard", id: dashboardId, name: s.name }, accessKeyId: opts.accessKeyId, details: { link_id: made?.id ?? null, frozen: true, show_names: input?.showNames === true, snapshot_id: snapshotId, period: s.label, expires_on: expires, metrics: s.data.metrics.length } });
  return token;
}

/** Switches "Show names" of a View Link on or off (ticket #590), also for one already made: only its owner, only while
 * their role may share, and never for a revoked one. Takes effect the next time the link is opened. */
export async function setViewLinkNames(actor: Actor, linkId: number, showNames: boolean, opts: { accessKeyId?: number } = {}) {
  if (!Number.isInteger(linkId) || typeof showNames !== "boolean") throw new Forbidden();
  const { data: l } = await db().from("view_links").select("object_type, object_id").eq("id", linkId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!l) throw new Forbidden();
  await assertOwner(actor, l.object_type, l.object_id);
  assertCan(actor, "share");
  const { data: changed } = await db().from("view_links").update({ show_names: showNames }).eq("id", linkId).eq("workspace_id", actor.workspaceId).is("revoked_at", null).select("id");
  if (!changed?.length) return;
  const { data: obj } = await db().from(table(l.object_type)).select("name").eq("id", l.object_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "view_link.names_changed", object: { type: l.object_type, id: l.object_id, name: obj?.name ?? null }, accessKeyId: opts.accessKeyId, details: { link_id: linkId, show_names: showNames } });
}

/** Revokes a View Link; its owner may, whatever their role now. */
export async function revokeViewLink(actor: Actor, linkId: number, opts: { accessKeyId?: number } = {}) {
  const { data: l } = await db().from("view_links").select("object_type, object_id").eq("id", linkId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!l) throw new Forbidden();
  await assertOwner(actor, l.object_type, l.object_id);
  const { data: revoked } = await db().from("view_links").update({ revoked_at: new Date().toISOString() }).eq("id", linkId).eq("workspace_id", actor.workspaceId).is("revoked_at", null).select("id");
  if (!revoked?.length) return;
  const { data: obj } = await db().from(table(l.object_type)).select("name").eq("id", l.object_id).eq("workspace_id", actor.workspaceId).maybeSingle();
  await audit(actor, { kind: "view_link.revoked", object: { type: l.object_type, id: l.object_id, name: obj?.name ?? null }, accessKeyId: opts.accessKeyId, details: { link_id: linkId } });
}
