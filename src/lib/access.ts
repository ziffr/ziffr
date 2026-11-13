import "server-only";
import { db } from "./db";
import { tokenValid } from "./tokens";
import { getActions, getAllSeries, getBreakdowns, getProfiles, getSeriesValues } from "./data";
import type { Action, CanvasData, Dashboard, Group, Metric, Share, ShareRole, TeamTemplate, Theme } from "./types";

// GLOSSARY: Share / Viewer / Editor.
// A user sees a metric if they own it, submit to it, it was shared with them,
// or it sits on a dashboard shared with them.

export async function getGroups(): Promise<Group[]> {
  const [{ data: groups }, { data: members }] = await Promise.all([db.from("groups").select("id, name").order("name"), db.from("group_members").select("group_id, user_id")]);
  return (groups ?? []).map((g) => ({ ...g, members: (members ?? []).filter((m) => m.group_id === g.id).map((m) => m.user_id) }));
}

/** Shares as stored: to a person or to a Group. For the Share dialog. */
export async function getRawShares(): Promise<Share[]> {
  const { data } = await db.from("shares").select("*");
  return (data ?? []) as Share[];
}

/** Shares per person: a share with a Group counts for each of its members (the stronger role wins). */
export async function getShares(): Promise<Share[]> {
  const [raw, groups] = await Promise.all([getRawShares(), getGroups()]);
  const out: Share[] = raw.filter((s) => s.user_id);
  for (const s of raw.filter((x) => x.group_id)) {
    for (const user of groups.find((g) => g.id === s.group_id)?.members ?? []) {
      const have = out.find((x) => x.object_type === s.object_type && x.object_id === s.object_id && x.user_id === user);
      if (!have) out.push({ ...s, user_id: user, via_group: s.group_id! });
      else if (have.role === "viewer" && s.role === "editor") have.role = "editor";
    }
  }
  return out;
}

function byMetric(rows: { metric_id: number; period_start: string; state: string }[] | null, state: string, ids: Set<number>) {
  const out: Record<number, string[]> = {};
  for (const r of rows ?? []) if (r.state === state && ids.has(r.metric_id)) (out[r.metric_id] ??= []).push(r.period_start);
  return out;
}

/** Who may read a Thread: the people on it, then everyone, or only the members of its Group. */
export function threadReader(viewer: string, groups: Group[], metricOwner: (metricId: number) => string | undefined) {
  const mine = new Set(groups.filter((g) => g.members.includes(viewer)).map((g) => g.id));
  return (a: Pick<Action, "asker_id" | "assignee_id" | "metric_id" | "read_group_id">) =>
    a.asker_id === viewer || a.assignee_id === viewer || metricOwner(a.metric_id) === viewer || a.read_group_id === null || mine.has(a.read_group_id);
}

/** The Actions this viewer may read. */
export async function readableActions(viewer: string, filter?: { metricId?: number }) {
  const [actions, groups, { data: metrics }] = await Promise.all([getActions(filter), getGroups(), db.from("metrics").select("id, owner_id")]);
  const can = threadReader(viewer, groups, (id) => metrics?.find((m) => m.id === id)?.owner_id);
  return actions.filter(can);
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
    db.from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at"),
    getShares(),
    visibleDashboards(viewer),
  ]);
  const ids = new Set<number>();
  for (const m of metrics) if (m.owner_id === viewer) ids.add(m.id);
  // Submitters see their metrics; a stand-in only while their stand-in Token is valid.
  for (const t of tokens ?? []) if (t.submitter_id === viewer && tokenValid(t, tokens ?? [])) ids.add(t.metric_id);
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
  const [{ metrics, series, observations }, people, actions, { data: tokens }, { data: templates }, { data: themes }, { data: me }, groups, { data: states }] = await Promise.all([
    getAllSeries(), getProfiles(), readableActions(viewer), db.from("tokens").select("metric_id, submitter_id"),
    db.from("team_templates").select("id, owner_id, kind, name, description, view, slots, body, w, h, updated_at").order("name"),
    db.from("themes").select("id, owner_id, name, tokens, slides, is_default, updated_at").order("id"),
    db.from("profiles").select("is_owner").eq("id", viewer).single(),
    getGroups(),
    db.from("period_states").select("metric_id, period_start, state").in("state", ["approval", "locked"]),
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
    themes: (themes ?? []) as Theme[],
    canEditThemes: Boolean(me?.is_owner),
    groups,
    pending: byMetric(states, "approval", ids),
    locked: byMetric(states, "locked", ids),
    submitters: (tokens ?? []).reduce<Record<number, string[]>>((acc, t) => ((acc[t.metric_id] ??= []).push(t.submitter_id), acc), {}),
  };
}
