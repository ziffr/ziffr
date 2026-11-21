// Dashboard Templates (spec 0014, GLOSSARY: Dashboard Template, Slot): listing them and making a dashboard from one.
// Every function takes the Actor first. A dashboard made from a template is the actor's own, independent copy, and
// every Metric that fills a Slot must be one the actor sees. Saving a dashboard as a template is in templates.ts.
import { inUse } from "./metric-row";
import { assertSettingsDesigns } from "./widget-designs";
import { db } from "./db";
import { insertSealed } from "./sealed-columns";
import { assertCan, can, Forbidden, type Actor } from "./actor";
import { visibleMetricIds } from "./access";
import { BUILT_IN_DASHBOARD_TEMPLATES } from "./built-in-dashboard-templates";
import { createDashboard } from "./dashboards";
import { assertSeesMetrics } from "./sharing";
import { fillsComplete, fromDashboardTemplate } from "./team-templates";
import { recordVersion } from "./versions";
import { widgetMetricIds } from "./widget-metrics";
import { getMetrics } from "./workspace-data";
import type { DashboardTemplate } from "./types";

/** A Dashboard Template as a person picks one. Its body holds Slot numbers, never Metrics, so its Preview can be
 * drawn in the browser with Sample Data (spec 0014, #191). */
export type DashboardTemplateSummary = Pick<DashboardTemplate, "id" | "owner_id" | "name" | "description" | "slots" | "body"> & { widgets: number };

/** A template by id: a built-in one by its text id, a team one by number, only of the actor's workspace. */
export async function dashboardTemplate(actor: Pick<Actor, "workspaceId" | "role">, id: number | string): Promise<DashboardTemplate | null> {
  if (typeof id === "string" && !/^\d+$/.test(id)) return BUILT_IN_DASHBOARD_TEMPLATES.find((t) => t.id === id) ?? null;
  const n = Number(id);
  // A Guest gets the built-in templates only, never one of the team's by id (rule 3).
  if (!Number.isInteger(n) || actor.role === "guest") return null;
  const { data } = await db().from("team_templates").select("id, owner_id, kind, name, description, slots, body").eq("id", n).eq("workspace_id", actor.workspaceId).eq("kind", "dashboard").maybeSingle();
  return (data as DashboardTemplate | null) ?? null;
}

/** The built-in Dashboard Templates and the team's own. A Slot's suggested Metrics are cut to the ones this person
 * sees: a template is seen by the whole team, its original Metrics are not (rule 3). */
export async function listDashboardTemplates(actor: Pick<Actor, "workspaceId" | "personId"> & Pick<Actor, "role">, visible?: ReadonlySet<number>): Promise<DashboardTemplateSummary[]> {
  // A Guest creates nothing: the built-in templates only, never the team's (rule 3).
  const { data } = actor.role === "guest" ? { data: [] } : await db().from("team_templates").select("id, owner_id, kind, name, description, slots, body").eq("workspace_id", actor.workspaceId).eq("kind", "dashboard").order("name");
  // A page that already decided what the person sees passes it, so visibility is not worked out twice.
  const seen = visible ?? await visibleMetricIds(actor.workspaceId, actor.personId, await getMetrics(actor.workspaceId));
  return [...BUILT_IN_DASHBOARD_TEMPLATES, ...((data ?? []) as DashboardTemplate[])].map((t) => ({
    id: t.id, owner_id: t.owner_id, name: t.name, description: t.description,
    slots: t.slots.map((s) => ({ label: s.label, multiple: s.multiple, exampleIds: (s.exampleIds ?? []).filter((id) => seen.has(id)) })),
    body: t.body, widgets: t.body.widgets.length,
  }));
}

/** What the "new dashboard" dialog offers: the templates, and the Metrics this person may fill Slots with (id and
 * name only). Nothing for a Guest, who creates nothing. */
export async function dashboardTemplateChoices(actor: Actor): Promise<{ templates: DashboardTemplateSummary[]; metrics: { id: number; name: string }[] }> {
  if (!can(actor, "create")) return { templates: [], metrics: [] };
  const { seen, choices } = await metricChoices(actor);
  return { templates: await listDashboardTemplates(actor, seen), metrics: choices };
}

/** The Metrics a person may fill a template's Slots with, by id and name only, and the ids they see. */
export async function metricChoices(actor: Pick<Actor, "workspaceId" | "personId">): Promise<{ seen: ReadonlySet<number>; choices: { id: number; name: string }[] }> {
  const metrics = await getMetrics(actor.workspaceId);
  const seen = await visibleMetricIds(actor.workspaceId, actor.personId, metrics);
  // Archived Metrics fill no Slot (GLOSSARY: Archived Metric).
  return { seen, choices: inUse(metrics).filter((m) => seen.has(m.id)).map((m) => ({ id: m.id, name: m.name })) };
}

/** Makes a dashboard owned by the actor from a Dashboard Template, with one list of Metrics per Slot. Every Slot must
 * be filled and every Metric seen by the actor; Guests create nothing. One Version names the template. */
export async function createDashboardFromTemplate(actor: Actor, input: { template: number | string; name: string; fills: number[][] }): Promise<number> {
  assertCan(actor, "create");
  const t = await dashboardTemplate(actor, input.template);
  const fills = Array.isArray(input.fills) ? input.fills.map((f) => (Array.isArray(f) ? f.map(Number).filter(Number.isInteger).slice(0, 50) : [])) : [];
  if (!t || !fillsComplete(t.slots, fills)) throw new Forbidden();
  const widgets = fromDashboardTemplate(t.body, fills.slice(0, t.slots.length));
  // A template keeps its widgets' View Designs: checked again as they become widgets (spec 0024).
  for (const w of widgets) assertSettingsDesigns(w.settings);
  await assertSeesMetrics(actor, widgets.flatMap((w) => widgetMetricIds(w.metric_ids, w.settings)));
  const id = await createDashboard(actor, String(input.name ?? "").trim() || t.name);
  if (widgets.length) {
    const placed = await insertSealed("widgets", actor.workspaceId, widgets.map((w) => ({ ...w, owner_id: actor.personId, dashboard_id: id, saved: false })));
    if (placed.length !== widgets.length) throw new Error("The dashboard could not be made from the template.");
  }
  await recordVersion("dashboard", id, actor.personId, { message: `Made from the template “${t.name}”` });
  return id;
}
