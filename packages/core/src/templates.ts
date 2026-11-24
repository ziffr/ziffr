// Team Widget Templates, slide layouts, Dashboard, Deck and Workflow Templates (GLOSSARY: Widget Template, Dashboard
// Template, Deck Template, Workflow Template): everyone in the Workspace uses them, only
// their creator changes them. A template is seen by the whole team, so only someone who may change the widget and
// sees every Metric it draws publishes it. Every function takes the Actor first.
import { openWorkflowRow } from "./workflow-rows";
import { db } from "./db";
import { getGroups } from "./access";
import { mayReadItem } from "./checklist-rules";
import { openRows } from "./sealed-columns";
import { assertCan, Forbidden, Refused, type Actor } from "./actor";
import { assertCanEditDashboard, editableWidget } from "./dashboards";
import { assertSeesMetrics } from "./sharing";
import { NOT_IN_DASHBOARD_TEMPLATES, SLIDE_SHAPES, toDashboardTemplate, toDeckTemplate, toSlideLayout, toTemplate, toWorkflowTemplate, type Choices } from "./team-templates";
import { widgetMetricIds } from "./widget-metrics";
import { isTagWidget } from "./tag-widgets";
import { visibleTags } from "./tag-sight";
import { TEMPLATES } from "./widget-templates";
import { getMetrics } from "./workspace-data";
import { ensureBaseline, recordVersion } from "./versions";
import { visitorOptionalText } from "./demo-visitor-words";
import { assertWidgetDesigns } from "./widget-designs";
import type { AnchorRule, SlideShape, Widget, WidgetSettings, WorkflowConfig } from "./types";

const RULES: AnchorRule[] = ["max", "min", "last", "first", "largest-step"];
const cleanChoices = (c: Choices): Choices => Object.fromEntries(Object.entries(c ?? {}).filter(([, v]) => v === "drop" || RULES.includes(v as AnchorRule)));
// A visitor of the demo writes labels like any other words: checked by the demo's text rules before they are cut.
const cleanLabels = (actor: Actor, labels: unknown) => (Array.isArray(labels) ? labels.slice(0, 50).map((l) => String(visitorOptionalText(actor, String(l), "name")).slice(0, 40)) : []);
const names = (actor: Actor, name: string, description: string, fallback: string) => ({
  name: String(visitorOptionalText(actor, String(name ?? ""), "name")).trim().slice(0, 80) || fallback,
  description: String(visitorOptionalText(actor, String(description ?? ""), "description")).trim().slice(0, 300),
});

/** The kinds of template kept in one table: Widget Templates, slide layouts, Dashboard, Deck and Workflow Templates. */
type TemplateKind = "widget" | "slide" | "dashboard" | "deck" | "workflow";

/** A template of the actor's workspace that the actor created, or Forbidden. */
async function ownTemplate(actor: Actor, id: number, kind?: TemplateKind) {
  const { data } = await db().from("team_templates").select("owner_id, kind").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!data || data.owner_id !== actor.personId || (kind && data.kind !== kind)) throw new Forbidden();
}

/** Writes a template, new or replacing one of the actor's own of the same kind, and records the version. */
async function store(actor: Actor, kind: TemplateKind, replaceId: number | null | undefined, row: Record<string, unknown>): Promise<number> {
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

/** A shape's props without a web address: no `url`, and no link in its words. A template is seen by the whole team,
 * so it carries no link of whoever made it. */
function withoutLinks(props: Record<string, unknown>): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== "object") return node;
    const n = node as Record<string, unknown>;
    return Object.fromEntries(Object.entries(n).flatMap(([k, v]) => (k === "marks" && Array.isArray(v) ? [[k, v.filter((m) => (m as { type?: unknown })?.type !== "link")]] : [[k, strip(v)]])));
  };
  const { url: _u, ...rest } = props; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest.richText ? { ...rest, richText: strip(rest.richText) } : rest;
}

/** A slide's shapes as the editor sends them, each checked: known kinds only, numbers that are numbers, widgets of
 * views that exist with their View Designs checked. Answers the shapes and every Metric their widgets draw. */
export function cleanSlideShapes(shapes: unknown): { shapes: SlideShape[]; metricIds: number[] } {
  const list = Array.isArray(shapes) ? (shapes as SlideShape[]) : [];
  if (list.length > 80 || JSON.stringify(list).length > 400_000) throw new Error("This slide is too large to save as a layout.");
  assertWidgetDesigns(list);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const clean: SlideShape[] = list
    .filter((sh) => sh && SLIDE_SHAPES.includes(String(sh.type)) && sh.props && typeof sh.props === "object")
    .map((sh) => ({ type: String(sh.type), x: num(sh.x), y: num(sh.y), rotation: num(sh.rotation), opacity: Math.min(1, Math.max(0, num(sh.opacity) || 1)), props: withoutLinks(sh.props) }));
  const metricIds: number[] = [];
  for (const sh of clean.filter((x) => x.type === "ziffr-widget")) {
    const template = String(sh.props.template);
    if (!(template in TEMPLATES) || TEMPLATES[template as keyof typeof TEMPLATES].kind === "layout") throw new Forbidden();
    let settings: WidgetSettings = {};
    try { settings = JSON.parse(String(sh.props.settings ?? "{}")); } catch { throw new Forbidden(); }
    const ids = Array.isArray(sh.props.metricIds) ? (sh.props.metricIds as unknown[]).map(Number) : [];
    metricIds.push(...widgetMetricIds(ids, settings));
  }
  return { shapes: clean, metricIds };
}

/** Saves a slide of the actor's own deck as a team slide layout. The shapes come from the editor, so each is checked. */
export async function saveSlideLayout(actor: Actor, input: { deckId: number; shapes: SlideShape[]; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }): Promise<number> {
  const { data: deck } = await db().from("decks").select("owner_id").eq("id", input.deckId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!deck || deck.owner_id !== actor.personId) throw new Forbidden();
  const { shapes, metricIds } = cleanSlideShapes(input.shapes);
  await assertSeesMetrics(actor, metricIds);
  const t = toSlideLayout(shapes, await getMetrics(actor.workspaceId), cleanChoices(input.choices), cleanLabels(actor, input.labels));
  return store(actor, "slide", input.replaceId, { ...names(actor, input.name, input.description, "Untitled layout"), view: "slide", slots: t.slots, body: t.body, w: 0, h: 0, updated_at: new Date().toISOString() });
}

/** Most slides and bytes a Deck Template keeps, so one cannot fill the database. */
const MAX_DECK_TEMPLATE = { slides: 40, bytes: 2_000_000 };

/** The slides of a stored deck document, in the order the editor shows them (top to bottom, then left to right), each
 * with its own shapes in their order, in slide coordinates. */
export function storedSlides(document: unknown): SlideShape[][] {
  type Rec = { id?: unknown; typeName?: unknown; type?: unknown; parentId?: unknown; index?: unknown; x?: unknown; y?: unknown; rotation?: unknown; opacity?: unknown; props?: unknown };
  const records = Object.values(((document as { store?: Record<string, Rec> } | null)?.store ?? {})).filter((r) => r && r.typeName === "shape");
  const at = (r: Rec) => [Number(r.y) || 0, Number(r.x) || 0];
  const frames = records.filter((r) => r.type === "frame").sort((a, b) => at(a)[0] - at(b)[0] || at(a)[1] - at(b)[1]);
  return frames.map((f) => records
    .filter((r) => r.parentId === f.id)
    .sort((a, b) => String(a.index ?? "").localeCompare(String(b.index ?? "")))
    .map((r) => ({ type: String(r.type), x: Number(r.x) || 0, y: Number(r.y) || 0, rotation: Number(r.rotation) || 0, opacity: Number(r.opacity ?? 1), props: (r.props ?? {}) as Record<string, unknown> })));
}

/** Saves the actor's own deck as a team Deck Template, new or replacing one of the actor's own, as slide layouts are
 * saved by the deck's owner only: the template shows the deck's words to the whole team. Built from the deck as
 * stored, never from what the browser sends; each slide is checked as a slide layout is, and the actor must see every
 * Metric on it. */
export async function saveDeckTemplate(actor: Actor, input: { deckId: number; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }): Promise<number> {
  const { data: deck } = await db().from("decks").select("owner_id, theme_id, document").eq("id", Number(input.deckId)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!deck || deck.owner_id !== actor.personId) throw new Forbidden();
  const slides = storedSlides(deck.document);
  if (!slides.length) throw new Error("This deck has no slides to keep.");
  if (slides.length > MAX_DECK_TEMPLATE.slides || JSON.stringify(slides).length > MAX_DECK_TEMPLATE.bytes) throw new Error("This deck is too large to save as a template.");
  const cleaned = slides.map(cleanSlideShapes);
  await assertSeesMetrics(actor, cleaned.flatMap((c) => c.metricIds));
  const t = toDeckTemplate(cleaned.map((c) => c.shapes), await getMetrics(actor.workspaceId), cleanChoices(input.choices), cleanLabels(actor, input.labels));
  return store(actor, "deck", input.replaceId, { ...names(actor, input.name, input.description, "Untitled deck template"), view: "deck", slots: t.slots, body: { ...t.body, themeId: deck.theme_id ?? null }, w: 0, h: 0, updated_at: new Date().toISOString() });
}

/** Saves a Workflow of the actor's Workspace as a team Workflow Template, new or replacing one of the actor's own. Its
 * Approvers are left out, only how many there are kept: a template names no person (GLOSSARY: Workflow Template). */
export async function saveWorkflowTemplate(actor: Actor, input: { workflowId: number; name: string; description: string; replaceId?: number | null }): Promise<number> {
  // Its id comes along: the config's sealed numbers are bound to it. A template holds them plain (it names no person and no row).
  const data = await openWorkflowRow(actor.workspaceId, (await db().from("workflows").select("id, name, owner_id, config").eq("id", Number(input.workflowId)).eq("workspace_id", actor.workspaceId).maybeSingle()).data);
  if (!data) throw new Forbidden();
  // A template is the whole team's: an item whose words the actor may not read stays behind (rule 3); an item kept to a Group stays out of a team template whoever saves it (toWorkflowTemplate).
  const groupIds = (await getGroups(actor.workspaceId)).filter((g) => g.members.includes(actor.personId)).map((g) => g.id);
  const config = data.config as WorkflowConfig;
  const readable = { ...config, steps: config.steps.filter((s) => s.type !== "checklist" || mayReadItem(s, { id: actor.personId, role: actor.role, groupIds }, String(data.owner_id))) };
  const body = toWorkflowTemplate(readable, { forTeam: true });
  return store(actor, "workflow", input.replaceId, { ...names(actor, input.name, input.description, `${data.name} template`), view: "workflow", slots: [], body, w: 0, h: 0, updated_at: new Date().toISOString() });
}

/** The Tags the actor sees by id, for naming the Slots of Tag widgets: a Tag the actor does not see is not named. */
async function tagNamesFor(actor: Actor): Promise<Map<string, string>> {
  return new Map((await visibleTags(actor)).map((t) => [t.id, t.name]));
}

/** Saves a widget as a team template, new or replacing one of the actor's own. Built from the stored widget, never
 * from what the browser sends. */
export async function saveTemplate(actor: Actor, input: { widgetId: number; name: string; description: string; labels: string[]; choices: Choices; replaceId?: number | null }): Promise<number> {
  const w = await editableWidget(actor, Number(input.widgetId));
  await assertSeesMetrics(actor, widgetMetricIds(w.metric_ids, w.settings));
  if (TEMPLATES[w.template].kind === "layout") throw new Error("Free layouts cannot be saved as templates yet.");
  // A widget of "all Metrics tagged X" becomes a Slot only as part of a dashboard (spec 0038).
  if (isTagWidget(w)) throw new Refused("A widget that shows all Metrics with a Tag is saved as part of its dashboard: save the dashboard as a template.");
  const t = toTemplate(w, await getMetrics(actor.workspaceId), cleanChoices(input.choices), cleanLabels(actor, input.labels));
  return store(actor, "widget", input.replaceId, { ...names(actor, input.name, input.description, "Untitled template"), view: w.template, slots: t.slots, body: t.body, w: w.w, h: w.h, updated_at: new Date().toISOString() });
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
  const { data } = await db().from("widgets").select("id, template, metric_ids, settings, title, x, y, w, h").eq("dashboard_id", dashboardId).eq("workspace_id", actor.workspaceId);
  // A template keeps the words as plain text, as before: it is read opened (they are sealed in the widgets, spec 0028).
  const widgets = (await openRows("widgets", actor.workspaceId, data)).map((w) => { const kept: Record<string, unknown> = { ...w }; delete kept.id; return kept; }) as unknown as Pick<Widget, "template" | "metric_ids" | "settings" | "title" | "x" | "y" | "w" | "h">[];
  await assertSeesMetrics(actor, widgets.flatMap((w) => (NOT_IN_DASHBOARD_TEMPLATES.includes(w.template) ? [] : widgetMetricIds(w.metric_ids ?? [], w.settings))));
  return widgets;
}

/** What saving a dashboard as a template would make: its Slots (with the Metrics that fill them now), the widgets left
 * out and what changes on the way. For the save dialog; nothing is stored. */
export async function dashboardTemplateDraft(actor: Actor, dashboardId: number) {
  const widgets = await templatableDashboard(actor, Number(dashboardId));
  const t = toDashboardTemplate(widgets, await getMetrics(actor.workspaceId), [], await tagNamesFor(actor));
  return { slots: t.slots, leftOut: t.leftOut, notices: t.notices, widgets: t.body.widgets.length };
}

/** Saves a dashboard as a team Dashboard Template, new or replacing one of the actor's own. Built from the stored
 * widgets, never from what the browser sends; `labels` name the Slots in the order the draft lists them. */
export async function saveDashboardTemplate(actor: Actor, input: { dashboardId: number; name: string; description: string; labels: string[]; replaceId?: number | null }): Promise<number> {
  const widgets = await templatableDashboard(actor, Number(input.dashboardId));
  const t = toDashboardTemplate(widgets, await getMetrics(actor.workspaceId), cleanLabels(actor, input.labels), await tagNamesFor(actor));
  if (!t.body.widgets.length) throw new Error("This dashboard has nothing a template can keep.");
  if (t.body.widgets.length > MAX_DASHBOARD_TEMPLATE.widgets || JSON.stringify(t.body).length > MAX_DASHBOARD_TEMPLATE.bytes) throw new Error("This dashboard is too large to save as a template.");
  return store(actor, "dashboard", input.replaceId, { ...names(actor, input.name, input.description, "Untitled dashboard template"), view: "dashboard", slots: t.slots, body: t.body, w: 0, h: 0, updated_at: new Date().toISOString() });
}

/** Renames a template the actor created. */
export async function renameTemplate(actor: Actor, id: number, name: string, description: string) {
  await ownTemplate(actor, id);
  await ensureBaseline("template", id, actor.personId);
  await db().from("team_templates").update({ ...names(actor, name, description, "Untitled template"), updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", actor.workspaceId);
  await recordVersion("template", id, actor.personId);
}

/** Deletes a template the actor created. */
export async function deleteTemplate(actor: Actor, id: number) {
  await ownTemplate(actor, id);
  await db().from("team_templates").delete().eq("id", id).eq("workspace_id", actor.workspaceId);
}
