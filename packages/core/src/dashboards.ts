// Dashboards and widgets (GLOSSARY: Dashboard, Widget, Widget Template, Pool, Free Layout, Analysis Canvas). Every
// function takes the Actor first and works only inside the actor's Workspace: owners and Editors change a dashboard,
// saved widgets are their owner's, and every Metric a widget draws must be one the actor sees.
import { db } from "./db";
import { insertSealed, openOne, openRows, sealedPatch, sealRow } from "./sealed-columns";
import { assertCan, Forbidden, type Actor } from "./actor";
import { visibleDashboards, readableActions } from "./access";
import { assertSeesMetrics } from "./sharing";
import { fillsComplete, fromTemplate } from "./team-templates";
import { widgetMetricIds } from "./widget-metrics";
import { DEFAULT_TEMPLATE, TEMPLATES, templateOf } from "./widget-templates";
import { designSettings } from "./built-in-designs";
import { allowedDesign } from "./view-designs";
import { assertSettingsDesigns, checkedDesignSetting } from "./widget-designs";
import { ensureBaseline, recordVersion } from "./versions";
import { assertNoOutsideContent } from "./deck-content";
import { firstFreePlace } from "./free-place";
import { isDisplayPeriod, SHOWN_BY } from "./display-periods";
import type { TeamTemplate, TemplateId, Widget, WidgetSettings, WidgetTemplate } from "./types";

/** What can be dropped onto a dashboard or saved to the Pool. */
export type DropSource =
  | { type: "metric"; id: number }
  | { type: "widget"; id: number }
  | { type: "spec"; template: TemplateId; metricIds: number[]; settings?: WidgetSettings; title?: string }
  /** A team template; fills holds the Metrics per slot, asked for when it is dropped. */
  | { type: "template"; id: number; fills?: number[][] };

/** The largest settings a widget may store, so a browser cannot fill the database. */
const MAX_SETTINGS = 200_000;
const title = (t: unknown) => (t === null || t === undefined ? null : String(t).slice(0, 200));
const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(Number.isInteger).slice(0, 50) : []);
function settings(s: unknown): WidgetSettings {
  const v = (s && typeof s === "object" && !Array.isArray(s) ? s : {}) as WidgetSettings;
  if (JSON.stringify(v).length > MAX_SETTINGS) throw new Error("This widget is too large to save.");
  // A widget drawn as of a day (spec 0013) names that day and nothing else.
  if (v.asOf !== undefined && v.asOf !== null && !(typeof v.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.asOf))) throw new Error("This widget's day is not one.");
  // Show by (spec 0018): one of the Display Periods or nothing; any other text would draw nothing sensible.
  if (v.display !== undefined && !isDisplayPeriod(v.display)) throw new Error("A widget is shown by a week, month, quarter, half-year or year.");
  // A free layout keeps a tldraw document: nothing in it may load from another site (spec 0009).
  assertNoOutsideContent((v as { canvas?: { document?: unknown } | null }).canvas?.document, "layout");
  // A View Design in a widget, in the widget a Free layout starts from, or in a widget on its artboard, is checked like
  // a file brought in (spec 0024), at every depth.
  if (v.design !== undefined) v.design = checkedDesignSetting(v.design);
  assertSettingsDesigns(v);
  return v;
}

/** Settings as a browser sent them: never the widget a Free layout starts from, which only the server sets (when a
 * widget becomes a Free layout). `keep` is the seed the widget has now; a browser may only clear it (null). */
function fromBrowser(s: unknown, keep?: WidgetSettings["canvasSeed"]): WidgetSettings {
  const v = settings(s);
  const sent = (s as WidgetSettings | null | undefined)?.canvasSeed;
  delete v.canvasSeed;
  if (sent !== null && keep) v.canvasSeed = keep;
  else if (sent === null) v.canvasSeed = null;
  return v;
}

/** The actor's role on a dashboard of their workspace, or null. */
export async function dashboardRole(actor: Actor, dashboardId: number) {
  return (await visibleDashboards(actor.workspaceId, actor.personId)).find((d) => d.id === dashboardId)?.role ?? null;
}

/** Refuses anyone but the dashboard's owner and its Editors. */
export async function assertCanEditDashboard(actor: Actor, dashboardId: number) {
  const role = await dashboardRole(actor, dashboardId);
  if (role !== "owner" && role !== "editor") throw new Forbidden();
}

/** The widget, if the actor may change it: on a dashboard they edit, or a saved widget of their own. */
export async function editableWidget(actor: Actor, id: number): Promise<Widget> {
  const w = (await openOne("widgets", actor.workspaceId, (await db().from("widgets").select("*").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle()).data)) as Widget | null;
  if (!w) throw new Forbidden();
  if (w.dashboard_id === null) {
    if (w.owner_id !== actor.personId) throw new Forbidden();
  } else await assertCanEditDashboard(actor, w.dashboard_id);
  return w;
}

/** A team template made into a widget: every slot filled, every Metric one the actor sees. */
async function fromTeamTemplate(actor: Actor, id: number, fills: number[][] | undefined) {
  const { data } = await db().from("team_templates").select("*").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  const t = data as TeamTemplate | null;
  if (!t || t.kind !== "widget" || !fills || !fillsComplete(t.slots, fills)) throw new Forbidden();
  const w = fromTemplate(t as WidgetTemplate, fills);
  // A team template keeps the checked copy of its widget's View Design, also after the design left the Workspace.
  w.settings = settings(w.settings);
  await assertSeesMetrics(actor, widgetMetricIds(w.metric_ids, w.settings));
  return { ...w, w: t.w, h: t.h };
}

/** What a dropped thing becomes as a widget: checked that the actor may open it and sees every Metric it draws. */
export async function specFrom(actor: Actor, source: DropSource) {
  if (source?.type === "metric") {
    await assertSeesMetrics(actor, [Number(source.id)]);
    const t = TEMPLATES[DEFAULT_TEMPLATE];
    return { template: t.id, metric_ids: [Number(source.id)], settings: t.settings, title: null as string | null, w: t.size.w, h: t.size.h };
  }
  if (source?.type === "widget") {
    const w = (await openOne("widgets", actor.workspaceId, (await db().from("widgets").select("*").eq("id", Number(source.id)).eq("workspace_id", actor.workspaceId).maybeSingle()).data)) as Widget | null;
    if (!w) throw new Forbidden();
    if (w.dashboard_id === null ? w.owner_id !== actor.personId : !(await dashboardRole(actor, w.dashboard_id))) throw new Forbidden();
    // A copy may only draw Metrics the actor sees, even from a dashboard shared with them.
    const s = settings(w.settings);
    await assertSeesMetrics(actor, widgetMetricIds(w.metric_ids ?? [], s));
    return { template: w.template, metric_ids: w.metric_ids, settings: s, title: w.title, w: w.w, h: w.h };
  }
  if (source?.type === "template") return fromTeamTemplate(actor, Number(source.id), source.fills);
  if (source?.type !== "spec" || !(source.template in TEMPLATES)) throw new Forbidden();
  const metricIds = ids(source.metricIds);
  const s = fromBrowser(source.settings ?? TEMPLATES[source.template].settings);
  // A widget of a Workspace's View Design draws the design as the Workspace keeps it, never one the browser made up.
  if (source.template === "design") s.design = await allowedDesign(actor, s.design);
  else delete s.design;
  if (source.template === "design" && !s.design) throw new Forbidden();
  await assertSeesMetrics(actor, widgetMetricIds(metricIds, s));
  const t = templateOf({ template: source.template, settings: s });
  return { template: source.template, metric_ids: metricIds, settings: s, title: title(source.title), w: t.size.w, h: t.size.h };
}

/** Creates a dashboard owned by the actor; Guests create nothing. */
export async function createDashboard(actor: Actor, name: string): Promise<number> {
  assertCan(actor, "create");
  const { data, error } = await db().from("dashboards").insert({ name: String(name ?? "").trim().slice(0, 120) || "Untitled", owner_id: actor.personId, workspace_id: actor.workspaceId }).select("id").single();
  if (error || !data) throw new Error("The dashboard could not be created.");
  return data.id;
}

/** The longest introduction a dashboard keeps. */
export const MAX_INTRO = 4000;

/** Changes a dashboard's name and introduction (spec 0013): its owner and Editors only, each change a Version. */
export async function saveDashboardText(actor: Actor, dashboardId: number, text: { name?: unknown; intro?: unknown }) {
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  await assertCanEditDashboard(actor, dashboardId);
  const update: Record<string, string> = {};
  if (text?.name !== undefined) {
    const name = String(text.name ?? "").trim().slice(0, 120);
    if (!name) throw new Error("Give the dashboard a name.");
    update.name = name;
  }
  // The introduction is sealed with the Workspace Key, bound to its dashboard (spec 0028).
  if (text?.intro !== undefined) update.intro = (await sealRow("dashboards", actor.workspaceId, { id: dashboardId, intro: String(text.intro ?? "").slice(0, MAX_INTRO) })).intro as string;
  if (!Object.keys(update).length) return;
  await ensureBaseline("dashboard", dashboardId, actor.personId);
  const { error } = await db().from("dashboards").update(update).eq("id", dashboardId).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The dashboard could not be saved.");
  await recordVersion("dashboard", dashboardId, actor.personId);
}

/** Drops something onto a dashboard: always an independent copy (GLOSSARY: Widget). Without a position it lands in
 * the first free place in reading order. Returns the new widget's id. */
export async function placeWidget(actor: Actor, dashboardId: number, source: DropSource, pos?: { x: number; y: number }): Promise<number> {
  await assertCanEditDashboard(actor, dashboardId);
  await ensureBaseline("dashboard", dashboardId, actor.personId);
  const spec = await specFrom(actor, source);
  let x = 0;
  let y = 0;
  if (pos) {
    x = Math.max(0, Math.min(11, Math.round(Number(pos.x) || 0)));
    y = Math.max(0, Math.min(10_000, Math.round(Number(pos.y) || 0)));
  } else {
    const { data: existing } = await db().from("widgets").select("x,y,w,h").eq("dashboard_id", dashboardId).eq("workspace_id", actor.workspaceId);
    ({ x, y } = firstFreePlace(existing ?? [], spec.w, spec.h));
  }
  const placed = await insertSealed("widgets", actor.workspaceId, [{ ...spec, owner_id: actor.personId, dashboard_id: dashboardId, saved: false, x, y }]);
  await recordVersion("dashboard", dashboardId, actor.personId);
  return placed[0].id as number;
}

/** Saves where the widgets of a dashboard sit and how large they are; only widgets of that dashboard move. */
export async function saveLayout(actor: Actor, dashboardId: number, items: { i: string; x: number; y: number; w: number; h: number }[]) {
  await assertCanEditDashboard(actor, dashboardId);
  await ensureBaseline("dashboard", dashboardId, actor.personId);
  const n = (v: unknown, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  await Promise.all((Array.isArray(items) ? items.slice(0, 200) : []).map((it) =>
    db().from("widgets").update({ x: n(it.x, 0, 11), y: n(it.y, 0, 10_000), w: n(it.w, 1, 12), h: n(it.h, 1, 100) })
      .eq("id", Number(it.i)).eq("dashboard_id", dashboardId).eq("workspace_id", actor.workspaceId)));
  await recordVersion("dashboard", dashboardId, actor.personId);
}

/** Changes a widget's template, settings, title or Metrics (including Free Layouts and composed stories). */
export async function updateWidget(actor: Actor, id: number, patch: { template?: TemplateId; settings?: WidgetSettings; title?: string | null; metricIds?: number[] }) {
  const cur = await editableWidget(actor, id);
  if (patch.template && !(patch.template in TEMPLATES)) throw new Forbidden();
  const metricIds = patch.metricIds ? ids(patch.metricIds) : undefined;
  const newSettings = patch.settings !== undefined ? fromBrowser(patch.settings, cur.settings?.canvasSeed) : undefined;
  // A View Design of the Workspace, or the one the widget has; any other view keeps none (spec 0024).
  const template = patch.template ?? cur.template;
  if (newSettings && template === "design") newSettings.design = await allowedDesign(actor, newSettings.design, cur.settings?.design);
  else if (newSettings) delete newSettings.design;
  if (patch.template === "design" && !(newSettings?.design ?? cur.settings?.design)) throw new Forbidden();
  if (metricIds || newSettings) await assertSeesMetrics(actor, widgetMetricIds(metricIds ?? cur.metric_ids ?? [], newSettings));
  await ensureBaseline("widget", id, actor.personId);
  if (cur.dashboard_id) await ensureBaseline("dashboard", cur.dashboard_id, actor.personId);
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = title(patch.title);
  if (metricIds) update.metric_ids = metricIds;
  if (newSettings) update.settings = newSettings;
  if (patch.template) {
    update.template = patch.template;
    // A widget shown by quarter stays so in another view that draws a series (spec 0018).
    const keep = SHOWN_BY.includes(patch.template) && cur.settings?.display ? { display: cur.settings.display } : {};
    update.settings = { ...TEMPLATES[patch.template].settings, ...keep, ...(newSettings ?? {}) };
    if (patch.template === "design") update.settings = { ...designSettings((newSettings?.design ?? cur.settings.design)!.body), ...(newSettings ?? {}), design: newSettings?.design ?? cur.settings.design };
    // A free layout starts from the widget as it is, placed on the artboard when the editor first opens.
    // A widget that already is a free layout stays as it is: starting again from itself would nest a seed in a seed, each
    // level a longer place for its words to be sealed at (spec 0028).
    if (patch.template === "canvas") update.settings = cur.template === "canvas" ? cur.settings : { canvasSeed: { template: cur.template, metric_ids: cur.metric_ids, settings: cur.settings }, canvas: null };
    // A composed story starts with one panel: this Metric's change on the previous year, as period bars.
    if (patch.template === "story") update.settings = { ...(update.settings as object), panels: [{ type: "period-bars", metricIds: cur.metric_ids ?? [], measure: "pct-yoy", periods: 6, highlight: "projection", projections: true }] };
  }
  const { error } = await db().from("widgets").update(await sealedPatch("widgets", actor.workspaceId, id, update)).eq("id", id).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The widget could not be updated.");
  await recordVersion("widget", id, actor.personId);
  if (cur.dashboard_id) await recordVersion("dashboard", cur.dashboard_id, actor.personId);
}

/** Turns a widget into a team template, filled with these Metrics. */
export async function applyTemplate(actor: Actor, id: number, templateId: number, fills: number[][]) {
  const cur = await editableWidget(actor, id);
  const w = await fromTeamTemplate(actor, templateId, fills);
  await ensureBaseline("widget", id, actor.personId);
  if (cur.dashboard_id) await ensureBaseline("dashboard", cur.dashboard_id, actor.personId);
  const { error } = await db().from("widgets").update(await sealedPatch("widgets", actor.workspaceId, id, { template: w.template, metric_ids: w.metric_ids, settings: w.settings, w: w.w, h: w.h, ...(w.title ? { title: w.title } : {}) })).eq("id", id).eq("workspace_id", actor.workspaceId);
  if (error) throw new Error("The template could not be applied.");
  await recordVersion("widget", id, actor.personId, { message: "Made from a template" });
  if (cur.dashboard_id) await recordVersion("dashboard", cur.dashboard_id, actor.personId);
}

/** Removes a widget from its dashboard, or a saved widget from its owner's Pool. */
export async function removeWidget(actor: Actor, id: number) {
  const cur = await editableWidget(actor, id);
  if (cur.dashboard_id) await ensureBaseline("dashboard", cur.dashboard_id, actor.personId);
  await db().from("widgets").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
  if (cur.dashboard_id) await recordVersion("dashboard", cur.dashboard_id, actor.personId);
}

/** Saves a copy of a widget, or an analysis result, into the actor's Pool; Guests create nothing. */
export async function saveToPool(actor: Actor, source: DropSource, name: string) {
  assertCan(actor, "create");
  const spec = await specFrom(actor, source);
  await insertSealed("widgets", actor.workspaceId, [{ ...spec, title: title(name), owner_id: actor.personId, dashboard_id: null, saved: true }]);
}

/** Deletes one of the actor's saved widgets. */
export async function deleteSavedWidget(actor: Actor, id: number) {
  await db().from("widgets").delete().eq("id", id).eq("saved", true).eq("owner_id", actor.personId).eq("workspace_id", actor.workspaceId);
}

/** Gives a dashboard a Theme of the workspace, or null to follow the team default. */
export async function setDashboardTheme(actor: Actor, dashboardId: number, themeId: number | null) {
  await assertCanEditDashboard(actor, dashboardId);
  if (themeId !== null && !(await db().from("themes").select("id").eq("id", themeId).eq("workspace_id", actor.workspaceId).maybeSingle()).data) throw new Forbidden();
  await ensureBaseline("dashboard", dashboardId, actor.personId);
  await db().from("dashboards").update({ theme_id: themeId }).eq("id", dashboardId).eq("workspace_id", actor.workspaceId);
  await recordVersion("dashboard", dashboardId, actor.personId);
}

/** Adds Metrics to the actor's Analysis Canvas, a scratch canvas of their own. */
export async function canvasAdd(actor: Actor, metricIds: number[]) {
  const wanted = ids(metricIds);
  await assertSeesMetrics(actor, wanted);
  const { data: existing } = await db().from("analysis_canvas").select("metric_id").eq("user_id", actor.personId).eq("workspace_id", actor.workspaceId);
  const have = new Set((existing ?? []).map((e) => e.metric_id));
  const rows = wanted.filter((m) => !have.has(m)).map((m, i) => ({ user_id: actor.personId, metric_id: m, position: have.size + i }));
  if (rows.length) await db().from("analysis_canvas").insert(rows);
}

/** Takes a Metric off the actor's Analysis Canvas. */
export async function canvasRemove(actor: Actor, metricId: number) {
  await db().from("analysis_canvas").delete().eq("user_id", actor.personId).eq("metric_id", metricId).eq("workspace_id", actor.workspaceId);
}

/** Sets the Metrics on the actor's Analysis Canvas, in this order. */
export async function canvasSet(actor: Actor, metricIds: number[]) {
  const wanted = ids(metricIds);
  await assertSeesMetrics(actor, wanted);
  await db().from("analysis_canvas").delete().eq("user_id", actor.personId).eq("workspace_id", actor.workspaceId);
  if (wanted.length) await db().from("analysis_canvas").insert(wanted.map((m, i) => ({ user_id: actor.personId, metric_id: m, position: i })));
}

/** A Metric's history for the history popover: every value, the Actions the actor may read, superseded values. */
export async function metricHistory(actor: Actor, metricId: number) {
  await assertSeesMetrics(actor, [metricId]);
  const ws = actor.workspaceId;
  const [{ data: obs }, actions, { data: superseded }] = await Promise.all([
    db().from("observations").select("*").eq("metric_id", metricId).eq("workspace_id", ws).order("period_start", { ascending: false }).order("created_at", { ascending: false }).limit(400),
    readableActions(ws, actor.personId, { metricId }).then((a) => [...a].sort((x, y) => y.created_at.localeCompare(x.created_at))),
    db().from("observation_history").select("*").eq("metric_id", metricId).eq("workspace_id", ws).order("superseded_at", { ascending: false }).limit(100),
  ]);
  // Values are sealed with the Workspace Key; one that does not open is left out, never shown as ciphertext.
  const opened = (rows: Record<string, unknown>[] | null, table: "observations" | "observation_history") => openRows(table, ws, rows).then((r) => r.filter((x) => typeof x.value === "number"));
  return { observations: await opened(obs, "observations"), actions, superseded: await opened(superseded, "observation_history") };
}

/** The Metrics on the actor's Analysis Canvas in this workspace, in order. */
export async function canvasMetricIds(actor: Actor): Promise<number[]> {
  const { data } = await db().from("analysis_canvas").select("metric_id").eq("user_id", actor.personId).eq("workspace_id", actor.workspaceId).order("position");
  return (data ?? []).map((r) => r.metric_id as number);
}
