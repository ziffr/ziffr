"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { TEMPLATES, DEFAULT_TEMPLATE } from "@/views/templates";
import { assertCanEditDashboard, assertCanEditWidget, assertCanSeeMetrics, dashboardRole, forbidden, widgetMetricIds } from "@/lib/guards";
import { fillsComplete, fromTemplate } from "@/lib/team-templates";
import { deliver } from "@/lib/deliveries";
import { finishTask } from "@/lib/threads";
import type { ConnectorId } from "@/connectors";
import { ensureBaseline, recordVersion } from "@/lib/versions";
import type { ActionKind, ShareRole, TeamTemplate, TemplateId, Widget, WidgetSettings, WidgetTemplate } from "@/lib/types";

// PROTOTYPE: identity is the "View as" cookie, so these checks enforce the sharing model
// (Owner / Editor / Viewer) rather than real security. Real auth replaces viewerId() later.

const done = () => revalidatePath("/", "layout");

export type DropSource =
  | { type: "metric"; id: number }
  | { type: "widget"; id: number }
  | { type: "spec"; template: TemplateId; metricIds: number[]; settings?: WidgetSettings; title?: string }
  /** A team template; fills holds the metrics per slot, asked for when it is dropped. */
  | { type: "template"; id: number; fills?: number[][] };

/** A team template made into a widget: every slot filled, every metric one the viewer can see. */
async function fromTeamTemplate(id: number, fills: number[][] | undefined, viewer: string) {
  const { data } = await db.from("team_templates").select("*").eq("id", id).single();
  const t = data as TeamTemplate | null;
  if (!t || t.kind !== "widget" || !fills || !fillsComplete(t.slots, fills)) forbidden();
  const w = fromTemplate(t as WidgetTemplate, fills!);
  await assertCanSeeMetrics(widgetMetricIds(w.metric_ids, w.settings), viewer);
  return { ...w, w: t!.w, h: t!.h };
}

async function specFrom(source: DropSource, viewer: string) {
  if (source.type === "metric") {
    await assertCanSeeMetrics([source.id], viewer);
    const t = TEMPLATES[DEFAULT_TEMPLATE];
    return { template: t.id, metric_ids: [source.id], settings: t.settings, title: null as string | null, w: t.size.w, h: t.size.h };
  }
  if (source.type === "widget") {
    const { data } = await db.from("widgets").select("*").eq("id", source.id).single();
    const w = data as Widget;
    if (!w) forbidden();
    if (w.dashboard_id === null ? w.owner_id !== viewer : !(await dashboardRole(w.dashboard_id, viewer))) forbidden();
    return { template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title, w: w.w, h: w.h };
  }
  if (source.type === "template") return fromTeamTemplate(source.id, source.fills, viewer);
  if (!(source.template in TEMPLATES)) forbidden();
  await assertCanSeeMetrics(widgetMetricIds(source.metricIds, source.settings), viewer);
  const t = TEMPLATES[source.template];
  return { template: source.template, metric_ids: source.metricIds, settings: source.settings ?? t.settings, title: source.title ?? null, w: t.size.w, h: t.size.h };
}

/** Dropping onto a dashboard always places an independent copy (GLOSSARY: Widget). */
export async function placeWidget(dashboardId: number, source: DropSource, pos?: { x: number; y: number }) {
  const viewer = await viewerId();
  await assertCanEditDashboard(dashboardId, viewer);
  await ensureBaseline("dashboard", dashboardId, viewer);
  const spec = await specFrom(source, viewer);
  let { x, y } = pos ?? { x: 0, y: 0 };
  if (!pos) {
    const { data: existing } = await db.from("widgets").select("y,h").eq("dashboard_id", dashboardId);
    y = Math.max(0, ...(existing ?? []).map((e) => e.y + e.h));
    x = 0;
  }
  const { error } = await db.from("widgets").insert({ ...spec, owner_id: viewer, dashboard_id: dashboardId, saved: false, x, y });
  if (error) throw new Error(`Widget not placed: ${error.message}`);
  await recordVersion("dashboard", dashboardId, viewer);
  done();
}

export async function saveLayout(dashboardId: number, items: { i: string; x: number; y: number; w: number; h: number }[]) {
  const viewer = await viewerId();
  await assertCanEditDashboard(dashboardId, viewer);
  await ensureBaseline("dashboard", dashboardId, viewer);
  await Promise.all(items.map((it) => db.from("widgets").update({ x: it.x, y: it.y, w: it.w, h: it.h }).eq("id", Number(it.i)).eq("dashboard_id", dashboardId)));
  await recordVersion("dashboard", dashboardId, viewer);
}

export async function updateWidget(id: number, patch: { template?: TemplateId; settings?: WidgetSettings; title?: string | null; metricIds?: number[] }) {
  const viewer = await viewerId();
  await assertCanEditWidget(id, viewer);
  if (patch.template && !(patch.template in TEMPLATES)) forbidden();
  if (patch.metricIds || patch.settings) {
    const { data: cur } = await db.from("widgets").select("metric_ids").eq("id", id).single();
    await assertCanSeeMetrics(widgetMetricIds(patch.metricIds ?? cur?.metric_ids ?? [], patch.settings), viewer);
  }
  await ensureBaseline("widget", id, viewer);
  const { data: w0 } = await db.from("widgets").select("dashboard_id").eq("id", id).single();
  if (w0?.dashboard_id) await ensureBaseline("dashboard", w0.dashboard_id, viewer);
  const { metricIds, ...rest } = patch;
  const update: Record<string, unknown> = { ...rest, ...(metricIds ? { metric_ids: metricIds } : {}) };
  if (patch.template) {
    const t = TEMPLATES[patch.template];
    update.settings = { ...t.settings, ...(patch.settings ?? {}) };
    if (patch.template === "canvas") {
      // A free layout starts from the widget as it is, placed on the artboard when the editor first opens.
      const { data: w } = await db.from("widgets").select("template, metric_ids, settings").eq("id", id).single();
      update.settings = { canvasSeed: w ? { template: w.template, metric_ids: w.metric_ids, settings: w.settings } : null, canvas: null };
    }
    if (patch.template === "story") {
      // A composed story starts with one panel: this metric's change on the previous year, as period bars.
      const { data: w } = await db.from("widgets").select("metric_ids").eq("id", id).single();
      update.settings = { ...(update.settings as object), panels: [{ type: "period-bars", metricIds: w?.metric_ids ?? [], measure: "pct-yoy", periods: 6, highlight: "projection", projections: true }] };
    }
  }
  const { error } = await db.from("widgets").update(update).eq("id", id);
  if (error) throw new Error(`Widget not updated: ${error.message}`);
  await recordVersion("widget", id, viewer);
  const { data: w } = await db.from("widgets").select("dashboard_id").eq("id", id).single();
  if (w?.dashboard_id) await recordVersion("dashboard", w.dashboard_id, viewer);
  done();
}

/** Change visualization to a team template: the widget becomes the template, filled with these metrics. */
export async function applyTemplate(id: number, templateId: number, fills: number[][]) {
  const viewer = await viewerId();
  await assertCanEditWidget(id, viewer);
  const w = await fromTeamTemplate(templateId, fills, viewer);
  await ensureBaseline("widget", id, viewer);
  const { data: w0 } = await db.from("widgets").select("dashboard_id").eq("id", id).single();
  if (w0?.dashboard_id) await ensureBaseline("dashboard", w0.dashboard_id, viewer);
  const { error } = await db.from("widgets").update({ template: w.template, metric_ids: w.metric_ids, settings: w.settings, w: w.w, h: w.h, ...(w.title ? { title: w.title } : {}) }).eq("id", id);
  if (error) throw new Error(`Template not applied: ${error.message}`);
  await recordVersion("widget", id, viewer, { message: "Made from a template" });
  if (w0?.dashboard_id) await recordVersion("dashboard", w0.dashboard_id, viewer);
  done();
}

export async function removeWidget(id: number) {
  const viewer = await viewerId();
  await assertCanEditWidget(id, viewer);
  const { data: w } = await db.from("widgets").select("dashboard_id").eq("id", id).single();
  if (w?.dashboard_id) await ensureBaseline("dashboard", w.dashboard_id, viewer);
  await db.from("widgets").delete().eq("id", id);
  if (w?.dashboard_id) await recordVersion("dashboard", w.dashboard_id, viewer);
  done();
}

/** Save a copy of a widget (or an analysis result) into the viewer's Pool. */
export async function saveToPool(source: DropSource, title: string) {
  const viewer = await viewerId();
  const spec = await specFrom(source, viewer);
  const { error } = await db.from("widgets").insert({ ...spec, title, owner_id: viewer, dashboard_id: null, saved: true });
  if (error) throw new Error(`Widget not saved: ${error.message}`);
  done();
}

export async function deleteSavedWidget(id: number) {
  await db.from("widgets").delete().eq("id", id).eq("saved", true).eq("owner_id", await viewerId());
  done();
}

export async function createDashboardNamed(name: string) {
  const viewer = await viewerId();
  const { data } = await db.from("dashboards").insert({ name, owner_id: viewer }).select("id").single();
  done();
  return data?.id as number;
}

export async function setShare(objectType: "metric" | "dashboard", objectId: number, userId: string, role: ShareRole | null) {
  const viewer = await viewerId();
  if (objectType !== "metric" && objectType !== "dashboard") forbidden();
  if (role !== null && role !== "viewer" && role !== "editor") forbidden();
  if (objectType === "metric" && role === "editor") forbidden();
  const { data: obj } = await db.from(objectType === "metric" ? "metrics" : "dashboards").select("owner_id").eq("id", objectId).single();
  if (!obj || obj.owner_id !== viewer || userId === viewer) forbidden();
  await db.from("shares").delete().eq("object_type", objectType).eq("object_id", objectId).eq("user_id", userId);
  if (role) await db.from("shares").insert({ object_type: objectType, object_id: objectId, user_id: userId, role });
  done();
}

// Analysis Canvas: one scratch canvas per user.
export async function canvasAdd(metricIds: number[]) {
  const viewer = await viewerId();
  await assertCanSeeMetrics(metricIds, viewer);
  const { data: existing } = await db.from("analysis_canvas").select("metric_id").eq("user_id", viewer);
  const have = new Set((existing ?? []).map((e) => e.metric_id));
  const rows = metricIds.filter((m) => !have.has(m)).map((m, i) => ({ user_id: viewer, metric_id: m, position: have.size + i }));
  if (rows.length) await db.from("analysis_canvas").insert(rows);
  done();
}

export async function canvasRemove(metricId: number) {
  const viewer = await viewerId();
  await db.from("analysis_canvas").delete().eq("user_id", viewer).eq("metric_id", metricId);
  done();
}

export async function canvasSet(metricIds: number[]) {
  const viewer = await viewerId();
  await assertCanSeeMetrics(metricIds, viewer);
  await db.from("analysis_canvas").delete().eq("user_id", viewer);
  if (metricIds.length) await db.from("analysis_canvas").insert(metricIds.map((m, i) => ({ user_id: viewer, metric_id: m, position: i })));
  done();
}

/** History popover: every Observation plus Actions for one metric. */
export async function getHistory(metricId: number) {
  await assertCanSeeMetrics([metricId], await viewerId());
  const [{ data: obs }, { data: actions }, { data: superseded }] = await Promise.all([
    db.from("observations").select("*").eq("metric_id", metricId).order("period_start", { ascending: false }).order("created_at", { ascending: false }).limit(400),
    db.from("actions").select("*").eq("metric_id", metricId).order("created_at", { ascending: false }),
    db.from("observation_history").select("*").eq("metric_id", metricId).order("superseded_at", { ascending: false }).limit(100),
  ]);
  return { observations: obs ?? [], actions: actions ?? [], superseded: superseded ?? [] };
}

/** Ask a Question or assign a Task right where the viewer is. */
export async function assignInPlace(input: { metricId: number; period: string; assigneeId: string; kind: ActionKind; text: string; due?: string | null; breakdownLabel?: string | null; via?: ConnectorId | null }) {
  const viewer = await viewerId();
  await assertCanSeeMetrics([input.metricId], viewer);
  if (input.kind !== "question" && input.kind !== "task") forbidden();
  const { data: obs } = await db
    .from("observations")
    .select("id")
    .eq("metric_id", input.metricId)
    .eq("period_start", input.period)
    .order("created_at", { ascending: false })
    .limit(1);
  const { data } = await db
    .from("actions")
    .insert({
      metric_id: input.metricId,
      period_start: input.period,
      observation_id: obs?.[0]?.id ?? null,
      asker_id: viewer,
      assignee_id: input.assigneeId,
      question: input.text,
      kind: input.kind,
      due_date: input.due || null,
      breakdown_label: input.breakdownLabel ? String(input.breakdownLabel).slice(0, 200) : null,
    })
    .select("id")
    .single();
  // Tell the assignee where they want to hear it, or where the asker chose for this one message.
  if (data) await deliver({ kind: input.kind, actionId: data.id, senderId: viewer, recipientId: input.assigneeId, via: input.via });
  done();
  return data?.id as number;
}

export async function markTaskDone(actionId: number) {
  await finishTask(actionId, await viewerId());
  done();
}
