"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { TEMPLATES, DEFAULT_TEMPLATE } from "@/views/templates";
import type { ActionKind, ShareRole, TemplateId, Widget, WidgetSettings } from "@/lib/types";

// PROTOTYPE: permission checks are minimal; the UI only offers what the viewer may do.

const done = () => revalidatePath("/", "layout");

export type DropSource = { type: "metric"; id: number } | { type: "widget"; id: number } | { type: "spec"; template: TemplateId; metricIds: number[]; settings?: WidgetSettings; title?: string };

async function specFrom(source: DropSource) {
  if (source.type === "metric") {
    const t = TEMPLATES[DEFAULT_TEMPLATE];
    return { template: t.id, metric_ids: [source.id], settings: t.settings, title: null as string | null, w: t.size.w, h: t.size.h };
  }
  if (source.type === "widget") {
    const { data } = await db.from("widgets").select("*").eq("id", source.id).single();
    const w = data as Widget;
    return { template: w.template, metric_ids: w.metric_ids, settings: w.settings, title: w.title, w: w.w, h: w.h };
  }
  const t = TEMPLATES[source.template];
  return { template: source.template, metric_ids: source.metricIds, settings: source.settings ?? t.settings, title: source.title ?? null, w: t.size.w, h: t.size.h };
}

/** Dropping onto a dashboard always places an independent copy (GLOSSARY: Widget). */
export async function placeWidget(dashboardId: number, source: DropSource, pos?: { x: number; y: number }) {
  const viewer = await viewerId();
  const spec = await specFrom(source);
  let { x, y } = pos ?? { x: 0, y: 0 };
  if (!pos) {
    const { data: existing } = await db.from("widgets").select("y,h").eq("dashboard_id", dashboardId);
    y = Math.max(0, ...(existing ?? []).map((e) => e.y + e.h));
    x = 0;
  }
  await db.from("widgets").insert({ ...spec, owner_id: viewer, dashboard_id: dashboardId, saved: false, x, y });
  done();
}

export async function saveLayout(dashboardId: number, items: { i: string; x: number; y: number; w: number; h: number }[]) {
  await Promise.all(items.map((it) => db.from("widgets").update({ x: it.x, y: it.y, w: it.w, h: it.h }).eq("id", Number(it.i)).eq("dashboard_id", dashboardId)));
}

export async function updateWidget(id: number, patch: { template?: TemplateId; settings?: WidgetSettings; title?: string | null }) {
  const update: Record<string, unknown> = { ...patch };
  if (patch.template) {
    const t = TEMPLATES[patch.template];
    update.settings = { ...t.settings, ...(patch.settings ?? {}) };
  }
  await db.from("widgets").update(update).eq("id", id);
  done();
}

export async function removeWidget(id: number) {
  await db.from("widgets").delete().eq("id", id);
  done();
}

/** Save a copy of a widget (or an analysis result) into the viewer's Pool. */
export async function saveToPool(source: DropSource, title: string) {
  const viewer = await viewerId();
  const spec = await specFrom(source);
  await db.from("widgets").insert({ ...spec, title, owner_id: viewer, dashboard_id: null, saved: true });
  done();
}

export async function deleteSavedWidget(id: number) {
  await db.from("widgets").delete().eq("id", id).eq("saved", true);
  done();
}

export async function createDashboardNamed(name: string) {
  const viewer = await viewerId();
  const { data } = await db.from("dashboards").insert({ name, owner_id: viewer }).select("id").single();
  done();
  return data?.id as number;
}

export async function setShare(objectType: "metric" | "dashboard", objectId: number, userId: string, role: ShareRole | null) {
  await db.from("shares").delete().eq("object_type", objectType).eq("object_id", objectId).eq("user_id", userId);
  if (role) await db.from("shares").insert({ object_type: objectType, object_id: objectId, user_id: userId, role });
  done();
}

// Analysis Canvas: one scratch canvas per user.
export async function canvasAdd(metricIds: number[]) {
  const viewer = await viewerId();
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
  await db.from("analysis_canvas").delete().eq("user_id", viewer);
  if (metricIds.length) await db.from("analysis_canvas").insert(metricIds.map((m, i) => ({ user_id: viewer, metric_id: m, position: i })));
  done();
}

/** History popover: every Observation plus Actions for one metric. */
export async function getHistory(metricId: number) {
  const [{ data: obs }, { data: actions }] = await Promise.all([
    db.from("observations").select("*").eq("metric_id", metricId).order("period_start", { ascending: false }).order("created_at", { ascending: false }).limit(400),
    db.from("actions").select("*").eq("metric_id", metricId).order("created_at", { ascending: false }),
  ]);
  return { observations: obs ?? [], actions: actions ?? [] };
}

/** Ask a Question or assign a Task right where the viewer is. */
export async function assignInPlace(input: { metricId: number; period: string; assigneeId: string; kind: ActionKind; text: string; due?: string | null }) {
  const viewer = await viewerId();
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
    })
    .select("id")
    .single();
  done();
  return data?.id as number;
}

export async function markTaskDone(actionId: number) {
  await db.from("actions").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", actionId);
  done();
}
