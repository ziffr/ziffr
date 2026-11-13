import "server-only";
import { db } from "./db";
import { tokenValid } from "@ziffr/core/tokens";
import { widgetMetricIds } from "@ziffr/core/widget-metrics";
import { getActions, getAllSeries, getBreakdowns, getProfiles, getSeriesValues } from "./data";
import type { Action, CanvasData, Dashboard, Group, Metric, Share, ShareRole, TeamTemplate, Theme, WidgetSettings } from "@ziffr/core/types";

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

export type DeckAccess = { id: number; name: string; owner_id: string; updated_at: string; role: "owner" | ShareRole };

/** Decks the viewer owns or that were shared with them (directly or through a Group). */
export async function visibleDecks(viewer: string): Promise<DeckAccess[]> {
  const [{ data: decks }, shares] = await Promise.all([db.from("decks").select("id, name, owner_id, updated_at").order("updated_at", { ascending: false }), getShares()]);
  return (decks ?? [])
    .map((d) => {
      if (d.owner_id === viewer) return { ...d, role: "owner" as const };
      const s = shares.find((x) => x.object_type === ("deck" as string) && x.object_id === d.id && x.user_id === viewer);
      return s ? { ...d, role: s.role } : null;
    })
    .filter((d): d is DeckAccess => d !== null);
}

/** Every metric drawn by the widgets on a deck's slides. */
export function deckMetricIds(document: unknown): number[] {
  const store = (document as { store?: Record<string, { type?: string; props?: { metricIds?: unknown; settings?: unknown } }> } | null)?.store ?? {};
  const out: number[] = [];
  for (const r of Object.values(store)) {
    if (r?.type !== "ziffr-widget") continue;
    let settings: WidgetSettings | undefined;
    try { settings = typeof r.props?.settings === "string" ? JSON.parse(r.props.settings) : undefined; } catch {}
    out.push(...widgetMetricIds(Array.isArray(r.props?.metricIds) ? (r.props!.metricIds as number[]) : [], settings));
  }
  return [...new Set(out.map(Number).filter(Number.isFinite))];
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
  // Whatever a dashboard or deck shared with them shows, they see: widgets, story panels, widgets on slides.
  const sharedDash = dashboards.filter((d) => d.role !== "owner").map((d) => d.id);
  if (sharedDash.length) {
    const { data: ws } = await db.from("widgets").select("metric_ids, settings").in("dashboard_id", sharedDash);
    for (const w of ws ?? []) for (const id of widgetMetricIds(w.metric_ids, w.settings)) ids.add(id);
  }
  const sharedDecks = (await visibleDecks(viewer)).filter((d) => d.role !== "owner").map((d) => d.id);
  if (sharedDecks.length) {
    const { data: ds } = await db.from("decks").select("document").in("id", sharedDecks);
    for (const d of ds ?? []) for (const id of deckMetricIds(d.document)) ids.add(id);
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

/** What sharing these metrics would show each person or Group that they cannot see on their own: they don't
 * own them, don't submit to them, and they were not shared with them directly. Keys: person id, or "g<id>". */
export async function revealedBy(metricIds: number[], ownerId: string): Promise<Record<string, string[]>> {
  const [people, groups, shares, { data: tokens }, { data: metrics }] = await Promise.all([
    getProfiles(), getGroups(), getShares(), db.from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at"),
    db.from("metrics").select("id, name, owner_id").in("id", metricIds),
  ]);
  const own = (person: string, m: { id: number; owner_id: string }) =>
    m.owner_id === person ||
    (tokens ?? []).some((t) => t.metric_id === m.id && t.submitter_id === person && tokenValid(t, tokens ?? [])) ||
    shares.some((s) => s.object_type === "metric" && s.object_id === m.id && s.user_id === person);
  const out: Record<string, string[]> = {};
  for (const p of people) if (p.id !== ownerId) out[p.id] = (metrics ?? []).filter((m) => !own(p.id, m)).map((m) => m.name);
  for (const g of groups) out[`g${g.id}`] = (metrics ?? []).filter((m) => g.members.some((u) => u !== ownerId && !own(u, m))).map((m) => m.name);
  return out;
}

export type ObjectType = "metric" | "dashboard" | "deck";
export type Audience = { person: string; how: string[] }[];

/** Everyone who can see a metric, dashboard or deck, and why (GLOSSARY: Share, Group, Token). */
export async function audience(type: ObjectType, id: number, viewer: string): Promise<{ owner: string; people: Audience } | null> {
  const table = type === "metric" ? "metrics" : type === "deck" ? "decks" : "dashboards";
  const { data: obj } = await db.from(table).select("owner_id").eq("id", id).maybeSingle();
  if (!obj) return null;
  const [people, groups, raw, { data: tokens }] = await Promise.all([getProfiles(), getGroups(), getRawShares(), db.from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at")]);
  const how = new Map<string, string[]>(people.map((p) => [p.id, []]));
  const add = (person: string, why: string) => how.get(person)?.push(why);
  add(obj.owner_id, "owner");
  const roleWord = (r: string) => (r === "editor" ? "Editor" : "Viewer");
  const sharesOf = (t: string, oid: number) => raw.filter((s) => s.object_type === t && s.object_id === oid);
  for (const s of sharesOf(type, id)) {
    if (s.user_id) add(s.user_id, `shared as ${roleWord(s.role)}`);
    if (s.group_id) {
      const g = groups.find((x) => x.id === s.group_id);
      for (const u of g?.members ?? []) add(u, `${roleWord(s.role)} through ${g!.name}`);
    }
  }
  if (type === "metric") {
    for (const t of tokens ?? []) if (t.metric_id === id && tokenValid(t, tokens ?? [])) add(t.submitter_id, t.stands_in_for ? "stand-in" : "submits values");
    // Dashboards and decks that show it, and whoever they are shared with.
    const [{ data: ws }, { data: dashboards }, { data: decks }] = await Promise.all([
      db.from("widgets").select("dashboard_id, metric_ids, settings").not("dashboard_id", "is", null),
      db.from("dashboards").select("id, name, owner_id"),
      db.from("decks").select("id, name, owner_id, document"),
    ]);
    // Only dashboards and decks the viewer can see are named.
    const [myDash, myDecks] = await Promise.all([visibleDashboards(viewer), visibleDecks(viewer)]);
    const via = (t: "dashboard" | "deck", oid: number, name: string, ownerId: string) => {
      const known = t === "dashboard" ? myDash.some((d) => d.id === oid) : myDecks.some((d) => d.id === oid);
      const label = known ? `on the ${t} ${name}` : `on a ${t} you can't see`;
      add(ownerId, label);
      for (const s of sharesOf(t, oid)) {
        if (s.user_id) add(s.user_id, label);
        if (s.group_id) for (const u of groups.find((x) => x.id === s.group_id)?.members ?? []) add(u, label);
      }
    };
    for (const d of dashboards ?? []) if ((ws ?? []).some((w) => w.dashboard_id === d.id && widgetMetricIds(w.metric_ids, w.settings).includes(id))) via("dashboard", d.id, d.name, d.owner_id);
    for (const d of decks ?? []) if (deckMetricIds(d.document).includes(id)) via("deck", d.id, d.name, d.owner_id);
  }
  return { owner: obj.owner_id, people: [...how.entries()].map(([person, h]) => ({ person, how: [...new Set(h)] })) };
}
