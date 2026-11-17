// Dashboards built by programs (spec 0014, with stories folded into dashboards by spec 0013; GLOSSARY: Dashboard,
// Finding, Widget Template, Dashboard Template, Access Key). A key with dashboards:read reads what its creator sees; one with dashboards:write builds as its
// creator, through the very functions the web app uses, so it may change only what the creator may change, and only
// while the creator's role may create. A key never shares, deletes, publishes a View Link, picks a theme, moves widgets
// to exact places, edits a Free Layout or saves a template: who sees what stays a decision people make. Every change
// it makes is a Version that names the key, so the owner can see it and restore what came before.
import { isDisplayPeriod, type DisplayPeriod } from "./display-periods";
import { assertCan, assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { visibleDashboards, visibleMetricIds } from "./access";
import { audit } from "./audit-log";
import { createDashboardFromTemplate, listDashboardTemplates } from "./dashboard-templates";
import { createDashboard, MAX_INTRO, placeWidget, removeWidget, saveDashboardText, updateWidget } from "./dashboards";
import { db } from "./db";
import { DEMO_WORKSPACE_ID } from "./team";
import { withVersionNote } from "./versions";
import { widgetMetricIds } from "./widget-metrics";
import { TEMPLATES } from "./widget-templates";
import { getMetrics } from "./workspace-data";
import type { Metric, TemplateId, Widget, WidgetSettings, WidgetTemplate } from "./types";

/** Dashboards one key may create in any 24 hours. */
export const DASHBOARDS_PER_DAY = 50;
/** Widget and Finding changes one key may make in any 24 hours. */
export const CHANGES_PER_DAY = 500;

/** A request that names something it cannot use, such as a Metric the creator does not see or a view a key may not
 * place. The API answers 422 with the message, which never says whether a hidden Metric exists. */
export class Unusable extends Error {
  constructor(message: string) { super(message); this.name = "Unusable"; }
}

/** Built-in views a key may place: not a Free Layout (a drawing), not a composed Finding (its panels need the
 * editor); Findings are added with addFindingWithKey instead. */
export const KEY_VIEWS = (Object.keys(TEMPLATES) as TemplateId[]).filter((id) => TEMPLATES[id].kind !== "layout" && id !== "story");

/** The few settings a key may set; anything else a widget can hold stays with the editor. */
export type KeySettings = { window?: number; showTarget?: boolean; showForecast?: boolean; rows?: number; display?: DisplayPeriod | null };

/** A Finding's words, as plain text; Placeholders such as {metric} or {change yoy} are filled in when it is drawn. An
 * empty text falls back to words drawn from the data. */
export type FindingWords = { kicker?: string; headline?: string; subline?: string; footnote?: string; source?: string };

const WORD_LIMITS: Record<keyof FindingWords, number> = { kicker: 200, headline: 200, subline: 200, footnote: 500, source: 200 };

/** A dashboard as a program sees it in a list. */
export type ApiDashboardSummary = { id: number; name: string; role: "owner" | "editor" | "viewer"; path: string };

/** One widget as a program sees it: what it shows, never its settings (which can hold a Free Layout's drawing and
 * are not needed to decide what to change) and never values (read those per Metric). */
export type ApiWidget = { id: number; view: TemplateId; title: string | null; metrics: string[]; x: number; y: number; w: number; h: number; words?: FindingWords; display?: DisplayPeriod };

/** A dashboard with its introduction and its widgets, in reading order. */
export type ApiDashboard = ApiDashboardSummary & { intro: string; widgets: ApiWidget[] };

/** A template as a program sees it: a built-in view, a team Widget Template or a Dashboard Template, with its Slots
 * and the Metrics suggested for each (only those the creator sees). */
export type ApiTemplate = { id: string | number; kind: "view" | "widget" | "dashboard"; name: string; description: string; slots: { label: string; multiple: boolean; suggested: string[] }[] };

const creatorOf = (actor: KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

const pathOf = (d: { id: number }) => `/dashboards/${d.id}`;

/** Whether a widget is a Finding, which carries words a key may write. */
const isFinding = (w: Pick<Widget, "template">) => TEMPLATES[w.template]?.kind === "story";

/** Runs a change as the key's creator, with every Version it records naming the key. */
async function asKey<T>(actor: KeyActor, fn: (creator: Actor) => Promise<T>): Promise<T> {
  assertScope(actor, "dashboards:write");
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new Forbidden("The demo has no Access Keys.");
  // Changes check only the role on one dashboard, and a Guest can be an Editor there: a key builds only while its
  // creator's role may create, as the scope promises.
  assertCan(creatorOf(actor), "create");
  const { data } = await db().from("access_keys").select("name").eq("id", Number(actor.key.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  const name = (data?.name as string | undefined) ?? null;
  return withVersionNote(name ? `Changed through the API (key “${name}”)` : "Changed through the API", () => fn(creatorOf(actor)));
}

/** The Metrics the creator sees, by slug and by id. */
async function seenMetrics(actor: Pick<Actor, "workspaceId" | "personId">) {
  const metrics = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  const visible = metrics.filter((m) => seen.has(m.id));
  return { bySlug: new Map(visible.map((m) => [m.slug, m])), byId: new Map(visible.map((m) => [m.id, m])) };
}

/** Ids for slugs the creator sees; any other slug is unusable, with the same words whether it exists or not. */
function idsFor(bySlug: Map<string, Metric>, slugs: unknown): number[] {
  const list = Array.isArray(slugs) ? slugs.slice(0, 50).map(String) : [];
  return list.map((s) => {
    const m = bySlug.get(s);
    if (!m) throw new Unusable(`No Metric “${s.slice(0, 100)}” that the key's creator sees.`);
    return m.id;
  });
}

/** The dashboard with the creator's role on it, or Forbidden (404) when they do not see it. */
async function visible(actor: Pick<Actor, "workspaceId" | "personId">, id: number) {
  if (!Number.isInteger(id)) throw new Forbidden();
  const d = (await visibleDashboards(actor.workspaceId, actor.personId)).find((x) => x.id === id);
  if (!d) throw new Forbidden();
  return d;
}

/** A widget of this dashboard, or Forbidden. */
async function widgetOn(actor: Pick<Actor, "workspaceId">, dashboardId: number, widgetId: number): Promise<Widget> {
  if (!Number.isInteger(widgetId)) throw new Forbidden();
  const { data } = await db().from("widgets").select("*").eq("id", widgetId).eq("dashboard_id", dashboardId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data) throw new Forbidden();
  return data as Widget;
}

const summary = (d: { id: number; name: string; role: string }): ApiDashboardSummary => ({
  id: d.id, name: d.name, role: d.role === "owner" || d.role === "editor" ? d.role : "viewer", path: pathOf(d),
});

function wordsOf(s: WidgetSettings): FindingWords {
  return { kicker: s.kicker ?? "", headline: s.headline ?? "", subline: s.subline ?? "", footnote: s.footnote ?? "", source: s.source ?? "" };
}

/** Only the allowed settings, in their ranges; anything else was refused by the API's schema already. */
function keySettings(s: KeySettings | undefined): WidgetSettings {
  const out: WidgetSettings = {};
  if (!s) return out;
  if (Number.isInteger(s.window)) out.window = Math.max(1, Math.min(120, s.window!));
  if (typeof s.showTarget === "boolean") out.showTarget = s.showTarget;
  if (typeof s.showForecast === "boolean") out.showForecast = s.showForecast;
  if (Number.isInteger(s.rows)) out.rows = Math.max(1, Math.min(50, s.rows!));
  // Show by (spec 0018): a Display Period, or null for the Metric's own period (an absent key leaves it as it is).
  if (isDisplayPeriod(s.display)) out.display = s.display;
  else if (s.display === null) out.display = undefined;
  return out;
}

/** Finding words cut to their limits; an empty text removes the word, so the data's own words show. */
function cleanWords(words: FindingWords): WidgetSettings {
  const out: Record<string, string | undefined> = {};
  for (const k of Object.keys(WORD_LIMITS) as (keyof FindingWords)[]) {
    if (words[k] === undefined) continue;
    const t = String(words[k] ?? "").trim().slice(0, WORD_LIMITS[k]);
    out[k] = t || undefined;
  }
  return out as WidgetSettings;
}

/** The dashboards the key's creator sees, by id, a page at a time (scope dashboards:read). */
export async function listDashboardsWithKey(actor: KeyActor, opts: { after?: number | null; limit?: number } = {}) {
  assertScope(actor, "dashboards:read");
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? 50) || 50, 1), 100);
  const all = (await visibleDashboards(actor.workspaceId, actor.personId))
    .filter((d) => opts.after == null || d.id > opts.after)
    .sort((a, b) => a.id - b.id);
  const items = all.slice(0, limit).map(summary);
  return { items, next: all.length > limit ? items[items.length - 1].id : null };
}

/** One dashboard with its introduction and its widgets in reading order (scope dashboards:read). A widget's Metrics are named by
 * slug, and only those the creator sees; a dashboard shared with them makes its Metrics visible to them anyway. */
export async function getDashboardWithKey(actor: KeyActor, id: number): Promise<ApiDashboard> {
  assertScope(actor, "dashboards:read");
  return asSeen(actor, Number(id));
}

/** A dashboard as getDashboardWithKey shows it, without the scope check: what a key just changed is answered back
 * even when it may not read dashboards otherwise. */
async function asSeen(actor: Pick<Actor, "workspaceId" | "personId">, id: number): Promise<ApiDashboard> {
  const d = await visible(actor, Number(id));
  const [{ data }, { byId }] = await Promise.all([
    db().from("widgets").select("*").eq("dashboard_id", d.id).eq("workspace_id", actor.workspaceId).order("y").order("x").order("id"),
    seenMetrics(actor),
  ]);
  const widgets = ((data ?? []) as Widget[]).map((w): ApiWidget => ({
    id: w.id, view: w.template, title: w.title, x: w.x, y: w.y, w: w.w, h: w.h,
    metrics: [...new Set(widgetMetricIds(w.metric_ids ?? [], w.settings))].map((m) => byId.get(m)?.slug).filter((s): s is string => Boolean(s)),
    ...(isFinding(w) ? { words: wordsOf(w.settings ?? {}) } : {}),
    // The one setting that changes which numbers a widget shows, so a program can tell quarters from months.
    ...(isDisplayPeriod(w.settings?.display) ? { display: w.settings.display } : {}),
  }));
  return { ...summary(d), intro: d.intro ?? "", widgets };
}

/** Creates an empty dashboard owned by the key's creator, with an introduction if given (scope dashboards:write).
 * The Audit Log names the key. */
export async function createDashboardWithKey(actor: KeyActor, input: { name: string; intro?: string }): Promise<ApiDashboard> {
  const id = await asKey(actor, async (creator) => {
    const made = await createDashboard(creator, input.name);
    if (input.intro) await saveDashboardText(creator, made, { intro: String(input.intro).slice(0, MAX_INTRO) });
    await audit(creator, { kind: "dashboard.created", object: { type: "dashboard", id: made, name: String(input.name ?? "").slice(0, 120) }, accessKeyId: Number(actor.key.id), details: { via: "api" } });
    return made;
  });
  return asSeen(actor, id);
}

/** Makes a dashboard owned by the key's creator from a Dashboard Template, with Metrics by slug per Slot (scope
 * dashboards:write). */
export async function createDashboardFromTemplateWithKey(actor: KeyActor, input: { template: string | number; name?: string; fills: string[][] }): Promise<ApiDashboard> {
  const id = await asKey(actor, async (creator) => {
    const { bySlug } = await seenMetrics(creator);
    const fills = (Array.isArray(input.fills) ? input.fills.slice(0, 50) : []).map((f) => idsFor(bySlug, f));
    const templates = await listDashboardTemplates(creator);
    const t = templates.find((x) => String(x.id) === String(input.template));
    if (!t) throw new Unusable("No such Dashboard Template; see GET /templates?kind=dashboard.");
    if (t.slots.length !== fills.length || t.slots.some((s, i) => !fills[i].length || (!s.multiple && fills[i].length !== 1))) {
      throw new Unusable(`Fill each of the template's ${t.slots.length} Slots in order: ${t.slots.map((s) => `${s.label} (${s.multiple ? "one or more" : "one"})`).join(", ")}.`);
    }
    const made = await createDashboardFromTemplate(creator, { template: t.id, name: input.name ?? "", fills });
    await audit(creator, { kind: "dashboard.created", object: { type: "dashboard", id: made, name: String(input.name || t.name).slice(0, 120) }, accessKeyId: Number(actor.key.id), details: { via: "api", kind: "dashboard", template: t.name } });
    return made;
  });
  return asSeen(actor, id);
}

/** What a key adds to a dashboard: a built-in view with Metrics, or a team Widget Template with its Slots filled. */
export type KeyWidgetInput = { view?: TemplateId; template?: number; metrics?: string[]; fills?: string[][]; title?: string | null; settings?: KeySettings };

/** Adds a widget to a dashboard the creator may change, in the first free place (scope dashboards:write). Answers
 * the widget as programs see it. */
export async function addWidgetWithKey(actor: KeyActor, dashboardId: number, input: KeyWidgetInput): Promise<ApiWidget> {
  const widgetId = await asKey(actor, async (creator) => {
    const d = await visible(creator, Number(dashboardId));
    const { bySlug } = await seenMetrics(creator);
    if (input.template !== undefined) {
      const { data } = await db().from("team_templates").select("id, kind, slots").eq("id", Number(input.template)).eq("workspace_id", creator.workspaceId).maybeSingle();
      const t = data as Pick<WidgetTemplate, "id" | "kind" | "slots"> | null;
      if (!t || t.kind !== "widget") throw new Unusable("No such Widget Template; see GET /templates?kind=widget.");
      const fills = (input.fills ?? []).map((f) => idsFor(bySlug, f));
      if (t.slots.length !== fills.length || t.slots.some((s, i) => !fills[i].length || (!s.multiple && fills[i].length !== 1))) throw new Unusable(`Fill each of the template's ${t.slots.length} Slots in order.`);
      return placeWidget(creator, d.id, { type: "template", id: t.id, fills });
    }
    const view = input.view ?? "number";
    if (!KEY_VIEWS.includes(view)) throw new Unusable(`A key may place these views: ${KEY_VIEWS.join(", ")}.`);
    const metricIds = idsFor(bySlug, input.metrics);
    if (!metricIds.length) throw new Unusable("Name at least one Metric.");
    return placeWidget(creator, d.id, { type: "spec", template: view, metricIds, settings: { ...TEMPLATES[view].settings, ...keySettings(input.settings) }, ...(input.title ? { title: input.title } : {}) });
  });
  return (await asSeen(actor, Number(dashboardId))).widgets.find((w) => w.id === widgetId)!;
}

/** Changes a widget's view, Metrics, title or allowed settings (scope dashboards:write). A Free Layout and a composed
 * Finding are refused: the first is a drawing, the second's words are changed with updateFindingWithKey. */
export async function updateWidgetWithKey(actor: KeyActor, dashboardId: number, widgetId: number, input: Omit<KeyWidgetInput, "template" | "fills">): Promise<ApiWidget> {
  await asKey(actor, async (creator) => {
    const d = await visible(creator, Number(dashboardId));
    const cur = await widgetOn(creator, d.id, Number(widgetId));
    if (!KEY_VIEWS.includes(cur.template)) throw new Unusable(isFinding(cur) ? "Change a Finding's words with PATCH /dashboards/{id}/findings/{findingId}." : "This widget can only be changed in Ziffr.");
    if (input.view !== undefined && !KEY_VIEWS.includes(input.view)) throw new Unusable(`A key may use these views: ${KEY_VIEWS.join(", ")}.`);
    const { bySlug } = await seenMetrics(creator);
    const metricIds = input.metrics !== undefined ? idsFor(bySlug, input.metrics) : undefined;
    if (metricIds && !metricIds.length) throw new Unusable("Name at least one Metric.");
    const settings = input.settings ? { ...(input.view ? TEMPLATES[input.view].settings : cur.settings), ...keySettings(input.settings) } : undefined;
    // updateWidget checks the creator may change the widget and sees its Metrics, and records the Versions.
    await updateWidget(creator, cur.id, {
      ...(input.view && input.view !== cur.template ? { template: input.view } : {}),
      ...(settings ? { settings } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(metricIds ? { metricIds } : {}),
    });
  });
  return (await asSeen(actor, Number(dashboardId))).widgets.find((w) => w.id === Number(widgetId))!;
}

/** Removes a widget or a Finding from a dashboard the creator may change (scope dashboards:write). The dashboard's
 * Version keeps it, so it can be restored. */
export async function removeWidgetWithKey(actor: KeyActor, dashboardId: number, widgetId: number): Promise<void> {
  await asKey(actor, async (creator) => {
    const d = await visible(creator, Number(dashboardId));
    const cur = await widgetOn(creator, d.id, Number(widgetId));
    // A Free Layout is a drawing only Ziffr changes, removing it included; a Finding may go.
    if (!KEY_VIEWS.includes(cur.template) && !isFinding(cur)) throw new Unusable("This widget can only be changed in Ziffr.");
    await removeWidget(creator, cur.id);
  });
}

/** Changes a dashboard's name or introduction (scope dashboards:write). */
export async function updateDashboardWithKey(actor: KeyActor, dashboardId: number, input: { name?: string; intro?: string }): Promise<ApiDashboard> {
  await asKey(actor, async (creator) => {
    const d = await visible(creator, Number(dashboardId));
    await saveDashboardText(creator, d.id, { name: input.name, intro: input.intro === undefined ? undefined : String(input.intro).slice(0, MAX_INTRO) });
  });
  return asSeen(actor, Number(dashboardId));
}

/** Adds a Finding about one Metric below everything on a dashboard, full width, with its words (scope
 * dashboards:write). Words a program writes are a draft: the dashboard's owner finishes them in Ziffr. */
export async function addFindingWithKey(actor: KeyActor, dashboardId: number, input: FindingWords & { metric: string }): Promise<ApiWidget> {
  const widgetId = await asKey(actor, async (creator) => {
    const d = await visible(creator, Number(dashboardId));
    const { bySlug } = await seenMetrics(creator);
    const [metricId] = idsFor(bySlug, [input.metric]);
    // Last in reading order, so a dashboard read top to bottom tells it in the order it was written.
    const { data: placed } = await db().from("widgets").select("y, h").eq("dashboard_id", d.id).eq("workspace_id", creator.workspaceId);
    const y = Math.max(0, ...(placed ?? []).map((w) => Number(w.y) + Number(w.h)));
    // placeWidget checks the creator may change the dashboard and sees the Metric, and keeps a Version.
    const id = await placeWidget(creator, d.id, { type: "spec", template: "story", metricIds: [metricId], settings: { ...TEMPLATES.story.settings, ...cleanWords(input) } }, { x: 0, y });
    await db().from("widgets").update({ w: 12 }).eq("id", id).eq("workspace_id", creator.workspaceId);
    return id;
  });
  return (await asSeen(actor, Number(dashboardId))).widgets.find((w) => w.id === widgetId)!;
}

/** Changes a Finding's words (scope dashboards:write). Only a Finding: other widgets have no words. */
export async function updateFindingWithKey(actor: KeyActor, dashboardId: number, findingId: number, input: FindingWords): Promise<ApiWidget> {
  await asKey(actor, async (creator) => {
    const d = await visible(creator, Number(dashboardId));
    const cur = await widgetOn(creator, d.id, Number(findingId));
    if (!isFinding(cur)) throw new Unusable("Only a Finding has words; change a widget's title with PATCH /dashboards/{id}/widgets/{widgetId}.");
    const words = cleanWords(input);
    if (Object.keys(words).length) await updateWidget(creator, cur.id, { settings: { ...cur.settings, ...words } });
  });
  return (await asSeen(actor, Number(dashboardId))).widgets.find((w) => w.id === Number(findingId))!;
}

/** The templates a key can build with: the built-in views, the team's Widget Templates and the Dashboard Templates
 * (scope dashboards:read). Suggested Metrics are only those the creator sees. */
export async function listTemplatesWithKey(actor: KeyActor, kind?: ApiTemplate["kind"]): Promise<ApiTemplate[]> {
  assertScope(actor, "dashboards:read");
  const { byId } = await seenMetrics(actor);
  const slugs = (ids?: number[]) => (ids ?? []).map((id) => byId.get(id)?.slug).filter((s): s is string => Boolean(s));
  const out: ApiTemplate[] = [];
  if (!kind || kind === "view") {
    for (const id of KEY_VIEWS) out.push({ id, kind: "view", name: TEMPLATES[id].label, description: TEMPLATES[id].blurb, slots: [] });
  }
  if (!kind || kind === "widget") {
    const { data } = await db().from("team_templates").select("id, name, description, slots").eq("workspace_id", actor.workspaceId).eq("kind", "widget").order("name");
    for (const t of (data ?? []) as Pick<WidgetTemplate, "id" | "name" | "description" | "slots">[]) {
      out.push({ id: t.id, kind: "widget", name: t.name, description: t.description, slots: t.slots.map((s) => ({ label: s.label, multiple: s.multiple, suggested: slugs(s.exampleIds) })) });
    }
  }
  if (!kind || kind === "dashboard") {
    for (const t of await listDashboardTemplates(actor)) {
      out.push({ id: t.id, kind: "dashboard", name: t.name, description: t.description, slots: t.slots.map((s) => ({ label: s.label, multiple: s.multiple, suggested: slugs(s.exampleIds) })) });
    }
  }
  return out;
}

/** Whether the key may create another dashboard ("create"), or make another change ("change"), now; if not,
 * the seconds until it may. Counted in Postgres from the Access Log's successful calls of the last 24 hours. Counting
 * and recording are not one transaction, so a burst can pass a few over; the minute's limit keeps that small. */
export async function admitBuild(actor: KeyActor, what: "create" | "change"): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  let q = db().from("access_log").select("at", { count: "exact" }).eq("key_id", Number(actor.key.id)).gt("at", since).gte("status", 200).lt("status", 300);
  q = what === "create"
    ? q.eq("method", "POST").in("route", ["/api/v1/dashboards", "/api/v1/dashboards/from-template"])
    // Widgets and Findings changed, and a dashboard's name or introduction (PATCH /dashboards/{id}).
    : q.in("method", ["POST", "PATCH", "DELETE"]).or("route.like./api/v1/dashboards/%/widgets%,route.like./api/v1/dashboards/%/findings%,and(method.eq.PATCH,route.like./api/v1/dashboards/%)");
  const { data, count } = await q.order("at", { ascending: true }).limit(1);
  const max = what === "create" ? DASHBOARDS_PER_DAY : CHANGES_PER_DAY;
  if ((count ?? 0) < max) return { ok: true };
  const oldest = data?.[0] ? new Date(data[0].at).getTime() : Date.now();
  return { ok: false, retryAfter: Math.max(1, Math.ceil((oldest + 86_400_000 - Date.now()) / 1000)) };
}
