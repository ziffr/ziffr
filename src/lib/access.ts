import "server-only";
import { db } from "./db";
import { getActions, getAllSeries, getBreakdowns, getProfiles, getSeriesValues } from "./data";
import type { CanvasData, Dashboard, Metric, Share, ShareRole, TeamTemplate } from "./types";

// GLOSSARY: Share / Viewer / Editor.
// A user sees a metric if they own it, submit to it, it was shared with them,
// or it sits on a dashboard shared with them.

export async function getShares(): Promise<Share[]> {
  const { data } = await db.from("shares").select("*");
  return data ?? [];
}

export type DashboardAccess = Dashboard & { role: "owner" | ShareRole };

export async function visibleDashboards(viewer: string): Promise<DashboardAccess[]> {
  const [{ data: dashboards }, shares] = await Promise.all([db.from("dashboards").select("*").order("id"), getShares()]);
  return (dashboards ?? [])
    .map((d) => {
      if (d.owner_id === viewer) return { ...d, role: "owner" as const };
      const s = shares.find((s) => s.object_type === "dashboard" && s.object_id === d.id && s.user_id === viewer);
      return s ? { ...d, role: s.role } : null;
    })
    .filter((d): d is DashboardAccess => d !== null);
}

export async function visibleMetricIds(viewer: string, metrics: Metric[]): Promise<Set<number>> {
  const [{ data: tokens }, shares, dashboards] = await Promise.all([
    db.from("tokens").select("metric_id").eq("submitter_id", viewer),
    getShares(),
    visibleDashboards(viewer),
  ]);
  const ids = new Set<number>();
  for (const m of metrics) if (m.owner_id === viewer) ids.add(m.id);
  for (const t of tokens ?? []) ids.add(t.metric_id);
  for (const s of shares) if (s.object_type === "metric" && s.user_id === viewer) ids.add(s.object_id);
  const sharedDash = dashboards.filter((d) => d.role !== "owner").map((d) => d.id);
  if (sharedDash.length) {
    const { data: ws } = await db.from("widgets").select("metric_ids").in("dashboard_id", sharedDash);
    for (const w of ws ?? []) for (const id of w.metric_ids) ids.add(id);
  }
  // Derived metrics are visible when all their inputs are.
  for (const m of metrics) {
    if (!m.formula || ids.has(m.id)) continue;
    const inputs = [...m.formula.matchAll(/\{([a-z0-9-]+)\}/g)].map((x) => metrics.find((y) => y.slug === x[1])?.id);
    if (inputs.length && inputs.every((i) => i !== undefined && ids.has(i)) && m.owner_id === viewer) ids.add(m.id);
  }
  return ids;
}

/** Visible metrics + their series + people: everything a canvas draws from. */
export async function getCanvasData(viewer: string): Promise<CanvasData> {
  const [{ metrics, series, observations }, people, actions, { data: tokens }, { data: templates }] = await Promise.all([
    getAllSeries(), getProfiles(), getActions(), db.from("tokens").select("metric_id, submitter_id"),
    db.from("team_templates").select("id, owner_id, kind, name, description, view, slots, body, w, h, updated_at").order("name"),
  ]);
  const ids = await visibleMetricIds(viewer, metrics);
  const visible = metrics.filter((m) => ids.has(m.id));
  const [breakdowns, { targets, projections }] = await Promise.all([getBreakdowns([...ids], observations), getSeriesValues([...ids])]);
  const openActions: Record<number, number> = {};
  for (const a of actions) if (a.status !== "closed" && ids.has(a.metric_id)) openActions[a.metric_id] = (openActions[a.metric_id] ?? 0) + 1;
  return {
    viewer,
    metrics: visible,
    series: Object.fromEntries(visible.map((m) => [m.slug, series[m.slug] ?? []])),
    people,
    openActions,
    breakdowns,
    targets,
    projections,
    templates: (templates ?? []) as TeamTemplate[],
    submitters: (tokens ?? []).reduce<Record<number, string[]>>((acc, t) => ((acc[t.metric_id] ??= []).push(t.submitter_id), acc), {}),
  };
}
