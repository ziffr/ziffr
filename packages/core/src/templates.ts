// Team Widget Templates, slide layouts and Dashboard Templates (GLOSSARY: Widget Template, Dashboard Template): everyone in the Workspace uses them, only
// their creator changes them. A template is seen by the whole team, so only someone who may change the widget and
// sees every Metric it draws publishes it. Every function takes the Actor first.
import { db } from "./db";
import { assertCan, Forbidden, type Actor } from "./actor";
import { assertCanEditDashboard, editableWidget } from "./dashboards";
import { assertSeesMetrics } from "./sharing";
import { NOT_IN_DASHBOARD_TEMPLATES, SLIDE_SHAPES, toDashboardTemplate, toSlideLayout, toTemplate, type Choices } from "./team-templates";
import { widgetMetricIds } from "./widget-metrics";
import { TEMPLATES } from "./widget-templates";
import { getMetrics } from "./workspace-data";
import { ensureBaseline, recordVersion } from "./versions";
import type { AnchorRule, SlideShape, Widget, WidgetSettings } from "./types";

const RULES: AnchorRule[] = ["max", "min", "last", "first", "largest-step"];
const cleanChoices = (c: Choices): Choices => Object.fromEntries(Object.entries(c ?? {}).filter(([, v]) => v === "drop" || RULES.includes(v as AnchorRule)));
const cleanLabels = (labels: unknown) => (Array.isArray(labels) ? labels.slice(0, 50).map((l) => String(l).slice(0, 40)) : []);
const names = (name: string, description: string, fallback: string) => ({
  name: String(name ?? "").trim().slice(0, 80) || fallback,
  description: String(description ?? "").trim().slice(0, 300),
});

/** A template of the actor's workspace that the actor created, or Forbidden. */
async function ownTemplate(actor: Actor, id: number, kind?: "widget" | "slide" | "dashboard") {
  const { data } = await db().from("team_templates").select("owner_id, kind").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.owner_id !== actor.personId || (kind && data.kind !== kind)) throw new Forbidden();
}

/** Writes a template, new or replacing one of the actor's own of the same kind, and records the version. */
async function store(actor: Actor, kind: "widget" | "slide" | "dashboard", replaceId: number | null | undefined, row: Record<string, unknown>): Promise<number> {
  if (replaceId) {
    await ownTemplate(actor, replaceId, kind);
    await ensureBaseline("template", replaceId, actor.personId);
    await db().from("team_templates").update(row).eq("id", replaceId).eq("workspace_id", actor.workspaceId);
    await recordVersion("template", replaceId, actor.personId, { message: "Replaced" });
    return replaceId;
  }
  assertCan(actor, "create");
  const { data, error } = await db().from("team_templates").insert({ ...row, kind, owner_id: actor.personId, workspace_id: actor.workspaceId }).select("id").single();
  if (error || !data) throw new Error("The template could not be saved.");
  await recordVersion("template", data.id, actor.personId, { message: "Created" });
  return data.id;
}

/** Saves a slide of the actor's own deck as a team slide layout. The shapes come from the editor, so each is checked. */
export async function saveSlideLayout(actor: Actor, input: { deckId: number; shapes: SlideShape[]; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }): Promise<number> {
  const { data: deck } = await db().from("decks").select("owner_id").eq("id", input.deckId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!deck || deck.owner_id !== actor.personId) throw new Forbidden();
  const shapes = Array.isArray(input.shapes) ? input.shapes : [];
  if (shapes.length > 80 || JSON.stringify(shapes).length > 400_000) throw new Error("This slide is too large to save as a layout.");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const clean: SlideShape[] = shapes
    .filter((sh) => sh && SLIDE_SHAPES.includes(String(sh.type)) && sh.props && typeof sh.props === "object")
    .map((sh) => ({ type: String(sh.type), x: num(sh.x), y: num(sh.y), rotation: num(sh.rotation), opacity: Math.min(1, Math.max(0, num(sh.opacity) || 1)), props: sh.props }));
  const metricIds: number[] = [];
  for (const sh of clean.filter((x) => x.type === "ziffr-widget")) {
    const template = String(sh.props.template);
    if (!(template in TEMPLATES) || TEMPLATES[template as keyof typeof TEMPLATES].kind === "layout") throw new Forbidden();
    let settings: WidgetSettings = {};
    try { settings = JSON.parse(String(sh.props.settings ?? "{}")); } catch { throw new Forbidden(); }
    const ids = Array.isArray(sh.props.metricIds) ? (sh.props.metricIds as unknown[]).map(Number) : [];
    metricIds.push(...widgetMetricIds(ids, settings));
  }
  await assertSeesMetrics(actor, metricIds);
  const t = toSlideLayout(clean, await getMetrics(actor.workspaceId), cleanChoices(input.choices), cleanLabels(input.labels));
  return store(actor, "slide", input.replaceId, { ...names(input.name, input.description, "Untitled layout"), view: "slide", slots: t.slots, body: t.body, w: 0, h: 0, updated_at: new Date().toISOString() });
}

/** Saves a widget as a team template, new or replacing one of the actor's own. Built from the stored widget, never
 * from what the browser sends. */
export async function saveTemplate(actor: Actor, input: { widgetId: number; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }): Promise<number> {
  const w = await editableWidget(actor, Number(input.widgetId));
  await assertSeesMetrics(actor, widgetMetricIds(w.metric_ids, w.settings));
  if (TEMPLATES[w.template].kind === "layout") throw new Error("Free layouts cannot be saved as templates yet.");
  const t = toTemplate(w, await getMetrics(actor.workspaceId), cleanChoices(input.choices), cleanLabels(input.labels));
  return store(actor, "widget", input.replaceId, { ...names(input.name, input.description, "Untitled template"), view: w.template, slots: t.slots, body: t.body, w: w.w, h: w.h, updated_at: new Date().toISOString() });
}

/** Most widgets and bytes a Dashboard Template keeps, so one cannot fill the database. */
const MAX_DASHBOARD_TEMPLATE = { widgets: 60, bytes: 400_000 };

/** The widgets of a dashboard the actor may change and whose Metrics they all see; Forbidden for anything else, a
 * story too. Saving a template publishes the Metrics as suggestions to the whole team, hence the second check. */
async function templatableDashboard(actor: Actor, dashboardId: number) {
  if (!Number.isInteger(dashboardId)) throw new Forbidden();
  await assertCanEditDashboard(actor, dashboardId);
  const { data: d } = await db().from("dashboards").select("kind").eq("id", dashboardId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!d || d.kind === "story") throw new Forbidden();
  const { data } = await db().from("widgets").select("template, metric_ids, settings, title, x, y, w, h").eq("dashboard_id", dashboardId).eq("workspace_id", actor.workspaceId);
  const widgets = (data ?? []) as Pick<Widget, "template" | "metric_ids" | "settings" | "title" | "x" | "y" | "w" | "h">[];
  await assertSeesMetrics(actor, widgets.flatMap((w) => (NOT_IN_DASHBOARD_TEMPLATES.includes(w.template) ? [] : widgetMetricIds(w.metric_ids ?? [], w.settings))));
  return widgets;
}

/** What saving a dashboard as a template would make: its Slots (with the Metrics that fill them now), the widgets left
 * out and what changes on the way. For the save dialog; nothing is stored. */
export async function dashboardTemplateDraft(actor: Actor, dashboardId: number) {
  const widgets = await templatableDashboard(actor, Number(dashboardId));
  const t = toDashboardTemplate(widgets, await getMetrics(actor.workspaceId));
  return { slots: t.slots, leftOut: t.leftOut, notices: t.notices, widgets: t.body.widgets.length };
}

/** Saves a dashboard as a team Dashboard Template, new or replacing one of the actor's own. Built from the stored
 * widgets, never from what the browser sends; `labels` name the Slots in the order the draft lists them. */
export async function saveDashboardTemplate(actor: Actor, input: { dashboardId: number; name: string; description: string; labels: string[]; replaceId?: number | null }): Promise<number> {
  const widgets = await templatableDashboard(actor, Number(input.dashboardId));
  const t = toDashboardTemplate(widgets, await getMetrics(actor.workspaceId), cleanLabels(input.labels));
  if (!t.body.widgets.length) throw new Error("This dashboard has nothing a template can keep.");
  if (t.body.widgets.length > MAX_DASHBOARD_TEMPLATE.widgets || JSON.stringify(t.body).length > MAX_DASHBOARD_TEMPLATE.bytes) throw new Error("This dashboard is too large to save as a template.");
  return store(actor, "dashboard", input.replaceId, { ...names(input.name, input.description, "Untitled dashboard template"), view: "dashboard", slots: t.slots, body: t.body, w: 0, h: 0, updated_at: new Date().toISOString() });
}

/** Renames a template the actor created. */
export async function renameTemplate(actor: Actor, id: number, name: string, description: string) {
  await ownTemplate(actor, id);
  await ensureBaseline("template", id, actor.personId);
  await db().from("team_templates").update({ ...names(name, description, "Untitled template"), updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("template", id, actor.personId);
}

/** Deletes a template the actor created. */
export async function deleteTemplate(actor: Actor, id: number) {
  await ownTemplate(actor, id);
  await db().from("team_templates").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
}
