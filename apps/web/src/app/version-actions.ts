"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getMetrics } from "@/lib/data";
import { deckMetricIds, visibleDashboards, visibleDecks, visibleMetricIds } from "@/lib/access";
import { diffSummary, recordVersion, type VersionType } from "@/lib/versions";
import { TEMPLATES } from "@/views/templates";
import { cleanSlides, cleanTokens } from "@/lib/theme-tokens";
import type { ThemeSlides, ThemeTokens, WorkflowConfig } from "@ziffr/core/types";

const forbidden = () => {
  throw new Error("Forbidden");
};

/** Who may see and who may restore each kind of object (the same rules as editing it). */
async function access(type: VersionType, id: number, viewer: string): Promise<{ view: boolean; edit: boolean }> {
  if (type === "deck") {
    const role = (await visibleDecks(viewer)).find((d) => d.id === id)?.role;
    return { view: Boolean(role), edit: role === "owner" || role === "editor" };
  }
  if (type === "workflow") {
    const { data } = await db.from("workflows").select("owner_id").eq("id", id).single();
    return { view: Boolean(data), edit: data?.owner_id === viewer };
  }
  if (type === "theme") {
    const [{ data }, { data: me }] = await Promise.all([db.from("themes").select("id").eq("id", id).single(), db.from("profiles").select("is_owner").eq("id", viewer).single()]);
    return { view: Boolean(data), edit: Boolean(data && me?.is_owner) };
  }
  if (type === "template") {
    const { data } = await db.from("team_templates").select("owner_id").eq("id", id).single();
    return { view: Boolean(data), edit: data?.owner_id === viewer };
  }
  if (type === "metric") {
    const { data } = await db.from("metrics").select("owner_id").eq("id", id).single();
    const visible = await visibleMetricIds(viewer, await getMetrics());
    return { view: visible.has(id), edit: data?.owner_id === viewer };
  }
  const dashboardId = type === "dashboard" ? id : (await db.from("widgets").select("dashboard_id, owner_id").eq("id", id).single()).data?.dashboard_id;
  if (!dashboardId) {
    const { data } = await db.from("widgets").select("owner_id").eq("id", id).single();
    const own = data?.owner_id === viewer;
    return { view: own, edit: own };
  }
  const role = (await visibleDashboards(viewer)).find((d) => d.id === dashboardId)?.role;
  return { view: Boolean(role), edit: role === "owner" || role === "editor" };
}

export async function listVersions(type: VersionType, id: number) {
  const viewer = await viewerId();
  const a = await access(type, id, viewer);
  if (!a.view) forbidden();
  const { data } = await db.from("versions").select("id, version, snapshot, author_id, message, name, created_at, updated_at").eq("object_type", type).eq("object_id", id).order("version", { ascending: false }).limit(60);
  const rows = data ?? [];
  return {
    canRestore: a.edit,
    versions: rows.map((v, i) => ({
      id: v.id, version: v.version, author: v.author_id, message: v.message, name: v.name, at: v.updated_at,
      changes: diffSummary(type, (rows[i + 1]?.snapshot as Record<string, unknown>) ?? null, v.snapshot as Record<string, unknown>),
    })),
  };
}

export async function nameVersion(versionId: number, name: string) {
  const viewer = await viewerId();
  const { data: v } = await db.from("versions").select("object_type, object_id").eq("id", versionId).single();
  if (!v || !(await access(v.object_type, v.object_id, viewer)).edit) forbidden();
  await db.from("versions").update({ name: name.trim().slice(0, 80) || null }).eq("id", versionId);
}

/** Restoring writes the old state back and records it as a new version: history only ever grows. */
export async function restoreVersion(versionId: number) {
  const viewer = await viewerId();
  const { data: v } = await db.from("versions").select("*").eq("id", versionId).single();
  if (!v || !(await access(v.object_type, v.object_id, viewer)).edit) forbidden();
  const s = v.snapshot as Record<string, unknown>;
  const id = v.object_id as number;
  // A restore places widgets like a drop does: only metrics the restorer can see, only known templates.
  // Otherwise an old version could bring back a metric that was taken off a shared dashboard.
  if (v.object_type === "widget" || v.object_type === "dashboard") {
    const ws = (v.object_type === "widget" ? [s] : ((s.widgets as Record<string, unknown>[]) ?? [])) as { template?: string; metric_ids?: number[] }[];
    if (ws.some((w) => !w.template || !(w.template in TEMPLATES))) forbidden();
    const ids = [...new Set(ws.flatMap((w) => w.metric_ids ?? []))];
    const visible = await visibleMetricIds(viewer, await getMetrics());
    const hidden = ids.filter((m) => !visible.has(m));
    if (hidden.length) throw new Error("This version shows metrics that are not shared with you, so it cannot be restored by you. Ask the dashboard owner.");
  }
  if (v.object_type === "template" && !((s.view as string) in TEMPLATES || s.view === "slide")) forbidden();
  // A deck restore may only bring back metrics the restorer can see, as saving a deck does.
  if (v.object_type === "deck") {
    const { data: cur } = await db.from("decks").select("document").eq("id", v.object_id).single();
    const had = new Set(deckMetricIds(cur?.document));
    const added = deckMetricIds(s.document).filter((m) => !had.has(m));
    const visible = await visibleMetricIds(viewer, await getMetrics());
    if (added.some((m) => !visible.has(m))) throw new Error("This version shows metrics that are not shared with you, so it cannot be restored by you. Ask the deck owner.");
  }
  // A theme picked back then may be gone since; the dashboard or deck then follows the default.
  if ((v.object_type === "dashboard" || v.object_type === "deck") && s.theme_id) {
    const { data: t } = await db.from("themes").select("id").eq("id", s.theme_id as number).maybeSingle();
    if (!t) s.theme_id = null;
  }
  switch (v.object_type as VersionType) {
    case "workflow":
      await saveWorkflowRow(id, s);
      break;
    case "theme": {
      const tokens = cleanTokens(s.tokens as ThemeTokens);
      if (!tokens) forbidden();
      await db.from("themes").update({ name: s.name, tokens, ...(s.slides ? { slides: cleanSlides(s.slides as ThemeSlides) } : {}), updated_at: new Date().toISOString() }).eq("id", id);
      break;
    }
    case "template":
      await db.from("team_templates").update({ ...s, updated_at: new Date().toISOString() }).eq("id", id);
      break;
    case "widget":
      await db.from("widgets").update({ template: s.template, metric_ids: s.metric_ids, settings: s.settings, title: s.title }).eq("id", id);
      break;
    case "dashboard": {
      const { data: d } = await db.from("dashboards").select("owner_id").eq("id", id).single();
      await db.from("dashboards").update({ name: s.name, ...(s.theme_id !== undefined ? { theme_id: s.theme_id } : {}) }).eq("id", id);
      await db.from("widgets").delete().eq("dashboard_id", id);
      const ws = (s.widgets as Record<string, unknown>[]) ?? [];
      if (ws.length) await db.from("widgets").insert(ws.map((w) => ({ ...w, owner_id: d?.owner_id ?? viewer, dashboard_id: id, saved: false })));
      break;
    }
    case "deck":
      await db.from("decks").update({ name: s.name, ...(s.theme_id !== undefined ? { theme_id: s.theme_id } : {}), ...(s.footer !== undefined ? { footer: s.footer } : {}), document: s.document, updated_at: new Date().toISOString() }).eq("id", id);
      break;
    case "metric":
      await db.from("metrics").update(s).eq("id", id);
      break;
  }
  await recordVersion(v.object_type, id, viewer, { message: `Restored version ${v.version}${v.name ? ` (${v.name})` : ""}` });
  revalidatePath("/", "layout");
}

/** Names the current state, like a git tag: a named version is never merged into. */
export async function saveNamedVersion(type: VersionType, id: number, name: string) {
  const viewer = await viewerId();
  if (!(await access(type, id, viewer)).edit) forbidden();
  await recordVersion(type, id, viewer, { name: name.trim().slice(0, 80) || "Named version" });
}

async function saveWorkflowRow(id: number, s: Record<string, unknown>) {
  // Restores go through the same checks as edits.
  const { saveWorkflow } = await import("./workflow-actions");
  await saveWorkflow(id, String(s.name ?? ""), s.config as WorkflowConfig);
}
