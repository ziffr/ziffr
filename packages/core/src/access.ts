// Who sees what in a Workspace (GLOSSARY: Share, Viewer, Editor, Group, Token, Thread). These load the facts of one
// workspace only; the decisions are made by the pure rules in visibility.ts, which ignore rows from any other one.
import { db } from "./db";
import { openRows } from "./sealed-columns";
import { checkViewDesignValue } from "./view-design";
import { tokenValid } from "./tokens";
import { widgetMetricIds } from "./widget-metrics";
import { canReadThread, deckMetricIds, expandGroupShares, objectRoles, visibleMetricIdsFrom, withEveryone } from "./visibility";
import { cleanLogo } from "./theme-look";
import { allRows, getActions, getBreakdowns, getMetrics, getSeriesOf, getSeriesValues, withInputs } from "./workspace-data";
import { Forbidden, type Actor } from "./actor";
import { peopleIn, peopleToHide } from "./submissions";
import { nameHider } from "./hide-names";
import type { Action, CanvasData, Dashboard, Group, Metric, Point, Profile, Share, ShareRole, TeamTemplate, Theme } from "./types";
import { yearStartOf } from "./fiscal-year";
import { condensedFor } from "./condensed-values";
import { unapprovedTotals } from "./total-parts";
import { attainmentMethodOf, numberStyleOf } from "./workspace-settings";
import { withoutUnseenInputs } from "./formula";

/** The Groups of a workspace with their members, Everyone filled in. */
export async function getGroups(ws: string): Promise<(Group & { workspace_id: string })[]> {
  const [{ data: groups }, members, memberships] = await Promise.all([
    // Everyone in the workspace first: it is the one most often shared with.
    db().from("groups").select("id, name, workspace_id, everyone").eq("workspace_id", ws).order("everyone", { ascending: false }).order("name"),
    // Read page by page: a dropped row would leave someone out of a Group, or of Everyone.
    allRows<{ group_id: number; user_id: string }>((from, to) => db().from("group_members").select("group_id, user_id").eq("workspace_id", ws).order("group_id").order("user_id").range(from, to)),
    allRows<{ user_id: string; role: string; workspace_id: string }>((from, to) => db().from("memberships").select("user_id, role, workspace_id").eq("workspace_id", ws).order("user_id").range(from, to)),
  ]);
  const byGroup = new Map<number, string[]>();
  for (const m of members) {
    const list = byGroup.get(m.group_id);
    if (list) list.push(m.user_id);
    else byGroup.set(m.group_id, [m.user_id]);
  }
  const stored = (groups ?? []).map((g) => ({ ...g, members: byGroup.get(g.id) ?? [] }));
  return withEveryone(ws, stored, memberships);
}

/** Shares as stored: to a person or to a Group. For the Share dialog. */
export async function getRawShares(ws: string): Promise<(Share & { workspace_id: string })[]> {
  return allRows<Share & { workspace_id: string }>((from, to) => db().from("shares").select("*").eq("workspace_id", ws).order("id").range(from, to));
}

/** Shares per person: a share with a Group counts for each of its members (the stronger role wins). */
export async function getShares(ws: string): Promise<(Share & { workspace_id: string })[]> {
  const [raw, groups] = await Promise.all([getRawShares(ws), getGroups(ws)]);
  return expandGroupShares(ws, raw, groups);
}

/** Periods per Metric in one state (awaiting approval, locked). */
function byMetric(rows: { metric_id: number; period_start: string; state: string }[] | null, state: string, ids: Set<number>) {
  const out: Record<number, string[]> = {};
  for (const r of rows ?? []) if (r.state === state && ids.has(r.metric_id)) (out[r.metric_id] ??= []).push(r.period_start);
  return out;
}

/** Who may read a Thread (decided by the core): the people on it, anyone else only for a Metric they see
 * (`visible`, from visibleMetricIds for the same viewer), then everyone, or only its Group's members. */
export function threadReader(viewer: string, groups: (Group & { workspace_id: string })[], metricOwner: (metricId: number) => string | undefined, ws: string, visible: ReadonlySet<number>, role?: Actor["role"]) {
  // A Checklist Task has no Metric to see: Owners, Admins and Members read it (or its Group's people), a Guest only a Task
  // they are on. Without the viewer's role nothing is assumed: only the people on it read it (spec 0045).
  return (a: Pick<Action, "asker_id" | "assignee_id" | "metric_id" | "read_group_id"> & { previous_assignee_id?: string | null; workspace_id: string }) =>
    a.metric_id === null
      ? canReadThread(ws, viewer, a, undefined, groups, role !== undefined && role !== "guest")
      : canReadThread(ws, viewer, a, metricOwner(a.metric_id), groups, visible.has(a.metric_id));
}

/** The Actions this viewer may read. */
export async function readableActions(ws: string, viewer: string, filter?: { metricId?: number }) {
  const [actions, groups, metrics, { data: member }] = await Promise.all([getActions(ws, filter), getGroups(ws), getMetrics(ws), db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", viewer).maybeSingle()]);
  const owners = new Map(metrics.map((m) => [m.id, m.owner_id]));
  const can = threadReader(viewer, groups, (id) => owners.get(id), ws, await visibleMetricIds(ws, viewer, metrics), member?.role as Actor["role"] | undefined);
  return actions.filter((a) => can(a as Action & { workspace_id: string }));
}

/** A dashboard with the viewer's role on it. */
export type DashboardAccess = Dashboard & { role: "owner" | ShareRole };

/** Shares per person (getShares of the same workspace), loaded once by a caller that makes several decisions. */
export type ExpandedShares = readonly (Share & { workspace_id: string })[];

/** Dashboards of the current workspace the viewer owns or that were shared with them. `shares` saves reading them
 * again when the caller already has them. */
export async function visibleDashboards(ws: string, viewer: string, shares?: ExpandedShares): Promise<DashboardAccess[]> {
  const [{ data: dashboards }, all] = await Promise.all([db().from("dashboards").select("*").eq("workspace_id", ws).order("id"), shares ?? getShares(ws)]);
  const roles = objectRoles(ws, viewer, "dashboard", dashboards ?? [], all);
  // Only the introductions of dashboards the viewer sees are opened (they are sealed with the Workspace Key, spec 0028).
  return (await openRows("dashboards", ws, (dashboards ?? []).filter((d) => roles.has(d.id)))).map((d) => ({ ...d, role: roles.get(d.id)! }));
}

/** A deck with the viewer's role on it. */
export type DeckAccess = { id: number; name: string; owner_id: string; updated_at: string; role: "owner" | ShareRole };

/** Decks of the current workspace the viewer owns or that were shared with them (directly or through a Group).
 * `shares` saves reading them again when the caller already has them. */
export async function visibleDecks(ws: string, viewer: string, shares?: ExpandedShares): Promise<DeckAccess[]> {
  const [{ data: decks }, all] = await Promise.all([db().from("decks").select("id, name, owner_id, updated_at, workspace_id").eq("workspace_id", ws).order("updated_at", { ascending: false }), shares ?? getShares(ws)]);
  const roles = objectRoles(ws, viewer, "deck", decks ?? [], all);
  return (decks ?? []).filter((d) => roles.has(d.id)).map((d) => ({ id: d.id, name: d.name, owner_id: d.owner_id, updated_at: d.updated_at, role: roles.get(d.id)! }));
}

/** Every Token of a workspace with what decides whether a Stand-in's is still valid. */
function tokenFacts(ws: string) {
  return allRows<{ metric_id: number; submitter_id: string; stand_in_id: string | null; stands_in_for: string | null; expires_at: string | null; workspace_id: string }>((from, to) =>
    db().from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at, workspace_id").eq("workspace_id", ws).order("id").range(from, to),
  );
}

/** The metrics of the current workspace the viewer sees (decided by the core). */
export async function visibleMetricIds(ws: string, viewer: string, metrics: Metric[]): Promise<Set<number>> {
  // Shares are read, and Groups expanded, once for the Metrics, dashboards and decks alike.
  const [tokens, shares] = await Promise.all([tokenFacts(ws), getShares(ws)]);
  const [dashboards, decks] = await Promise.all([visibleDashboards(ws, viewer, shares), visibleDecks(ws, viewer, shares)]);
  const sharedDash = dashboards.filter((d) => d.role !== "owner").map((d) => d.id);
  const sharedDecks = decks.filter((d) => d.role !== "owner").map((d) => d.id);
  const [{ data: widgets }, { data: docs }] = await Promise.all([
    sharedDash.length ? db().from("widgets").select("metric_ids, settings, workspace_id").eq("workspace_id", ws).in("dashboard_id", sharedDash) : Promise.resolve({ data: [] }),
    sharedDecks.length ? db().from("decks").select("document, workspace_id").eq("workspace_id", ws).in("id", sharedDecks) : Promise.resolve({ data: [] }),
  ]);
  return visibleMetricIdsFrom(ws, viewer, {
    metrics: metrics.map((m) => ({ ...m, workspace_id: (m as Metric & { workspace_id?: string }).workspace_id ?? "" })),
    tokens,
    shares,
    sharedDashboardWidgets: widgets ?? [],
    sharedDeckDocuments: docs ?? [],
  });
}

/** What each of many people sees, with the facts read once: the dashboards they may open (as `visibleDashboards`)
 * and the Metrics (as `visibleMetricIds`). For saying who will not see something; decided by the same rules. */
export async function visibilityOfMany(ws: string, metrics: Metric[]): Promise<(person: string) => { dashboards: Set<number>; metrics: Set<number> }> {
  const [tokens, shares, { data: dashboards }, { data: decks }] = await Promise.all([
    tokenFacts(ws), getShares(ws),
    db().from("dashboards").select("id, owner_id, workspace_id").eq("workspace_id", ws),
    db().from("decks").select("id, owner_id, workspace_id").eq("workspace_id", ws),
  ]);
  const shared = (type: "dashboard" | "deck") => [...new Set(shares.filter((s) => s.object_type === type).map((s) => s.object_id))];
  const [sharedDash, sharedDecks] = [shared("dashboard"), shared("deck")];
  const [{ data: widgets }, { data: docs }] = await Promise.all([
    sharedDash.length ? db().from("widgets").select("dashboard_id, metric_ids, settings, workspace_id").eq("workspace_id", ws).in("dashboard_id", sharedDash) : Promise.resolve({ data: [] }),
    sharedDecks.length ? db().from("decks").select("id, document, workspace_id").eq("workspace_id", ws).in("id", sharedDecks) : Promise.resolve({ data: [] }),
  ]);
  const facts = { metrics: metrics.map((m) => ({ ...m, workspace_id: (m as Metric & { workspace_id?: string }).workspace_id ?? "" })), tokens, shares };
  return (person) => {
    const dash = objectRoles(ws, person, "dashboard", dashboards ?? [], shares);
    const deck = objectRoles(ws, person, "deck", decks ?? [], shares);
    const sharedWith = (roles: ReadonlyMap<number, string>, id: number) => (roles.get(id) ?? "owner") !== "owner";
    return {
      dashboards: new Set(dash.keys()),
      metrics: visibleMetricIdsFrom(ws, person, { ...facts, sharedDashboardWidgets: (widgets ?? []).filter((w) => sharedWith(dash, w.dashboard_id)), sharedDeckDocuments: (docs ?? []).filter((d) => sharedWith(deck, d.id)) }),
    };
  };
}

/** The parts of CanvasData that are per Metric and can be large: values, Breakdowns, Target Series, Projections. */
export type CanvasSeries = Pick<CanvasData, "series" | "breakdowns" | "targets" | "projections" | "condensed">;

/** Which Metrics' series a page sends: some ids, or chosen from the visible Metrics (in the order they are listed). */
export type SeriesOf = number[] | ((visible: Metric[]) => number[]);

/** Most Metrics one request for series may name; a canvas asks for the few it is about to draw. */
export const MAX_SERIES_REQUEST = 200;

/** Series, Breakdowns, Target Series and Projections of some visible Metrics, with the visible inputs of the Derived
 * ones among them (comparisons resolve through them). A Metric with no values gets an empty series, so a missing
 * key always means "not sent". Only what is asked for is read from the database. */
export async function seriesFor(ws: string, metrics: Metric[], visible: Set<number>, ids: Iterable<number>): Promise<CanvasSeries> {
  const wanted = withInputs(metrics, [...ids].filter((id) => visible.has(id))).filter((id) => visible.has(id));
  if (!wanted.length) return { series: {}, breakdowns: {}, targets: {}, projections: {}, condensed: {} };
  // Derived values are computed from all their inputs, also ones the person does not see; only visible series go out.
  // A Total is worked out for what this person sees: a period only where they see every part counted, unless it is open.
  const aims: Record<number, Point[]> = {};
  const byId = new Map(metrics.map((m) => [m.id, m]));
  const [series, breakdowns, { targets, projections }, condensed] = await Promise.all([getSeriesOf(ws, metrics, wanted, {}, { sees: (id) => visible.has(id), aims }), getBreakdowns(ws, wanted), getSeriesValues(ws, wanted), condensedFor(ws, wanted)]);
  // A Total whose target is its parts' added up has that one, never a series stored under its own name.
  for (const id of wanted) if (byId.get(id)!.total?.targets === "parts") targets[id] = aims[id] ?? [];
  return {
    series: Object.fromEntries(wanted.map((id) => byId.get(id)!).map((m) => [m.slug, series[m.slug] ?? []])),
    breakdowns,
    targets,
    projections,
    // Only the visible Metrics' Condensed Values go out, like their series (`wanted` holds visible ids only).
    condensed,
  };
}

/** More series for a canvas that is open: the Metrics a person just placed or picked. Only Metrics they see; ids
 * come from a browser, so they are checked as whole numbers and capped. */
export async function canvasSeries(actor: Actor, ids: unknown): Promise<CanvasSeries> {
  if (!Array.isArray(ids) || ids.length > MAX_SERIES_REQUEST || !ids.every((id) => Number.isSafeInteger(id) && id > 0)) throw new Forbidden("Ask for at most 200 Metrics by id.");
  const ws = actor.workspaceId;
  const metrics = await getMetrics(ws);
  const visible = await visibleMetricIds(ws, actor.personId, metrics);
  return seriesFor(ws, metrics, visible, ids as number[]);
}

/** The people a person may be shown by name. A Member, Admin or Owner: everyone in the Workspace. A Guest sees only
 * themselves: a Guest does not see who else is in the Workspace (GLOSSARY: Guest; owner decision on #549, ticket
 * #560), not even the owners of what is shared with them, so everything that names people goes through here and reads
 * "Someone" for the rest. Never anyone's email or Slack handle (peopleIn). `loaded` is the Workspace's people when the
 * caller has them already. */
export async function peopleFor(actor: Pick<Actor, "workspaceId" | "personId" | "role">, loaded?: Profile[]): Promise<Profile[]> {
  const people = loaded ?? (await peopleIn(actor.workspaceId));
  return actor.role === "guest" ? people.filter((p) => p.id === actor.personId) : people;
}

/** For a Guest, a function that hides other people's names in text Ziffr itself wrote (an approval request saying who
 * sent a late value): they read "Someone" (peopleFor, ticket #560). Anyone else gets the text as it is. */
export async function systemTextFor(actor: Pick<Actor, "workspaceId" | "personId" | "role">): Promise<(text: string, system: boolean) => string> {
  if (actor.role !== "guest") return (text) => text;
  const hide = nameHider((await peopleToHide(actor.workspaceId)).filter((p) => p.id !== actor.personId));
  return (text, system) => (system ? hide(text) : text);
}

/** Visible metrics + people + the series of the Metrics the page draws: everything a canvas starts from. Without
 * `seriesOf` every visible Metric's series is sent; pages pass the ones they show, and fetch more with canvasSeries. */
export async function getCanvasData(ws: string, viewer: string, opts: { seriesOf?: SeriesOf } = {}): Promise<CanvasData> {
  const [metrics, people, actions, { data: tokens }, { data: templates }, { data: themes }, { data: me }, groups, { data: states }, yearStart, numberStyle, attainmentMethod, { data: designRows }] = await Promise.all([
    getMetrics(ws), peopleIn(ws),
    // Only the Actions still open, with the columns that decide who may read them: the canvas only counts them.
    allRows<Pick<Action, "id" | "metric_id" | "status" | "asker_id" | "assignee_id" | "read_group_id"> & { workspace_id: string }>((from, to) =>
      // A Checklist Task has no Metric (metric_id null) and is no open Action of any Metric: the canvas counts Metrics' only.
      db().from("actions").select("id, metric_id, status, asker_id, assignee_id, read_group_id, workspace_id").not("metric_id", "is", null).eq("workspace_id", ws).neq("status", "closed").order("id").range(from, to),
    ),
    db().from("tokens").select("metric_id, submitter_id").eq("workspace_id", ws),
    // Dashboard Templates stay out: a canvas never uses them, and their widgets can be large.
    db().from("team_templates").select("id, owner_id, kind, name, description, view, slots, body, w, h, updated_at").eq("workspace_id", ws).in("kind", ["widget", "slide"]).order("name"),
    db().from("themes").select("id, owner_id, name, tokens, slides, is_default, updated_at").eq("workspace_id", ws).order("id"),
    db().from("memberships").select("role").eq("workspace_id", ws).eq("user_id", viewer).maybeSingle(),
    getGroups(ws),
    db().from("period_states").select("metric_id, period_start, state").eq("workspace_id", ws).in("state", ["approval", "locked"]),
    yearStartOf(ws),
    numberStyleOf(ws),
    attainmentMethodOf(ws),
    // The Workspace's View Designs to choose from (spec 0024): names and checked files, no values.
    db().from("view_designs").select("id, name, body").eq("workspace_id", ws).order("id"),
  ]);
  const ids = await visibleMetricIds(ws, viewer, metrics);
  const visible = metrics.filter((m) => ids.has(m.id));
  const guest = !me || me.role === "guest";
  // A Guest's canvas names only themselves (peopleFor), not the Workspace.
  const named = await peopleFor({ workspaceId: ws, personId: viewer, role: guest ? "guest" : "member" }, people);
  const wanted = opts.seriesOf === undefined ? [...ids] : typeof opts.seriesOf === "function" ? opts.seriesOf(visible) : opts.seriesOf;
  const { series, breakdowns, targets, projections, condensed } = await seriesFor(ws, metrics, ids, wanted);
  // A Total's period is not approved yet while one of its parts' is not (spec 0058).
  const unapproved = await unapprovedTotals(ws, visible.map((metric) => ({ metric, points: series[metric.slug] ?? [] })));
  const owners = new Map(metrics.map((m) => [m.id, m.owner_id]));
  const canRead = threadReader(viewer, groups, (id) => owners.get(id), ws, ids);
  const openActions: Record<number, number> = {};
  for (const a of actions) if (a.metric_id !== null && ids.has(a.metric_id) && canRead(a)) openActions[a.metric_id] = (openActions[a.metric_id] ?? 0) + 1;
  return {
    viewer,
    // A formula goes to the browser only to someone who sees every Metric it names.
    metrics: withoutUnseenInputs(visible, new Set(visible.map((m) => m.slug))),
    series,
    people: named,
    openActions,
    breakdowns,
    targets,
    projections,
    condensed,
    templates: guest ? [] : ((templates ?? []) as TeamTemplate[]),
    // Guests place nothing; a row that no longer passes the checks is never sent.
    designs: me && me.role !== "guest" ? (designRows ?? []).flatMap((r) => { const c = checkViewDesignValue(r.body); return c.ok ? [{ id: Number(r.id), name: String(r.name), body: c.design }] : []; }) : [],
    // A stored logo that fails today's logo checks is shown as no logo (never deleted): the canvas draws it in an img.
    themes: ((themes ?? []) as Theme[]).map((t) => (t.slides?.logo ? { ...t, slides: { ...t.slides, logo: cleanLogo(t.slides.logo) } } : t)),
    // Owners and admins manage themes (GLOSSARY: Workspace Role).
    canEditThemes: me?.role === "owner" || me?.role === "admin",
    // A Guest shares nothing (GLOSSARY: Workspace Role), so of the Groups they get only the ones they are in, and of
    // their members only themselves: never who else is in which (AGENTS.md rule 3).
    groups: guest ? groups.filter((g) => g.members.includes(viewer)).map((g) => ({ ...g, members: [viewer] })) : groups,
    pending: { ...byMetric(states, "approval", ids), ...unapproved },
    locked: byMetric(states, "locked", ids),
    yearStart,
    numberStyle,
    attainmentMethod,
    // Who submits, only for the Metrics the viewer sees: another Metric's id and its people are not theirs to know, and a Guest sees only themselves.
    submitters: (tokens ?? []).filter((t) => ids.has(t.metric_id) && (!guest || t.submitter_id === viewer)).reduce<Record<number, string[]>>((acc, t) => ((acc[t.metric_id] ??= []).push(t.submitter_id), acc), {}),
  };
}

/** What sharing these metrics would show each person or Group that they cannot see on their own: they don't
 * own them, don't submit to them, and they were not shared with them directly. Keys: person id, or "g<id>". */
export async function revealedBy(ws: string, metricIds: number[], ownerId: string): Promise<Record<string, string[]>> {
  metricIds = metricIds.filter(Number.isInteger); // a malformed marker names no Metric
  const [people, groups, raw, tokens, { data: metricRows }] = await Promise.all([
    peopleIn(ws), getGroups(ws), getRawShares(ws), tokenFacts(ws),
    db().from("metrics").select("id, name, owner_id").eq("workspace_id", ws).in("id", metricIds),
  ]);
  // A Metric's name is sealed: opened here, never read from SQL.
  const metrics = await openRows("metrics", ws, metricRows);
  const shares = expandGroupShares(ws, raw, groups);
  // Who sees each Metric on their own, collected once and looked up per person and Metric: searching every Token and
  // share for each pair took people × Metrics × (Tokens + shares) steps.
  const key = (person: string, metricId: number) => `${metricId}\u0000${person}`;
  const seen = new Set<string>();
  for (const t of tokens) if (tokenValid(t, tokens)) seen.add(key(t.submitter_id, t.metric_id));
  for (const s of shares) if (s.object_type === "metric") seen.add(key(s.user_id, s.object_id));
  const own = (person: string, m: { id: number; owner_id: string }) => m.owner_id === person || seen.has(key(person, m.id));
  const out: Record<string, string[]> = {};
  for (const p of people) if (p.id !== ownerId) out[p.id] = metrics.filter((m) => !own(p.id, m)).map((m) => m.name as string);
  for (const g of groups) out[`g${g.id}`] = metrics.filter((m) => g.members.some((u) => u !== ownerId && !own(u, m))).map((m) => m.name);
  return out;
}

/** What can be shared and asked about. */
export type ObjectType = "metric" | "dashboard" | "deck";
/** Who can see something, and why. */
export type Audience = { person: string; how: string[] }[];

/** Everyone who can see a metric, dashboard or deck, and why (GLOSSARY: Share, Group, Token). */
export async function audience(ws: string, type: ObjectType, id: number, viewer: string, role?: Actor["role"]): Promise<{ owner: string; people: Audience } | null> {
  const table = type === "metric" ? "metrics" : type === "deck" ? "decks" : "dashboards";
  const { data: obj } = await db().from(table).select("owner_id").eq("workspace_id", ws).eq("id", id).maybeSingle();
  if (!obj) return null;
  const [people, groups, raw, { data: tokens }] = await Promise.all([peopleIn(ws), getGroups(ws), getRawShares(ws), db().from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("workspace_id", ws)]);
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
    const [{ data: widgetRows }, { data: dashboards }, { data: decks }] = await Promise.all([
      db().from("widgets").select("dashboard_id, metric_ids, settings").eq("workspace_id", ws).not("dashboard_id", "is", null),
      db().from("dashboards").select("id, name, owner_id").eq("workspace_id", ws),
      db().from("decks").select("id, name, owner_id, document").eq("workspace_id", ws),
    ]);
    // Only dashboards and decks the viewer can see are named.
    const [myDash, myDecks] = await Promise.all([visibleDashboards(ws, viewer), visibleDecks(ws, viewer)]);
    const via = (t: "dashboard" | "deck", oid: number, name: string, ownerId: string) => {
      const known = t === "dashboard" ? myDash.some((d) => d.id === oid) : myDecks.some((d) => d.id === oid);
      const label = known ? `on the ${t} ${name}` : `on a ${t} you can't see`;
      add(ownerId, label);
      for (const s of sharesOf(t, oid)) {
        if (s.user_id) add(s.user_id, label);
        if (s.group_id) for (const u of groups.find((x) => x.id === s.group_id)?.members ?? []) add(u, label);
      }
    };
    for (const d of dashboards ?? []) if ((widgetRows ?? []).some((w) => w.dashboard_id === d.id && widgetMetricIds(w.metric_ids, w.settings).includes(id))) via("dashboard", d.id, d.name, d.owner_id);
    for (const d of decks ?? []) if (deckMetricIds(d.document).includes(id)) via("deck", d.id, d.name, d.owner_id);
  }
  // A Guest does not see who else is in the Workspace (peopleFor): of the audience only their own line, and the owner
  // is not named (the viewer's own id when it is theirs, otherwise none).
  const guest = role === "guest";
  return { owner: guest && obj.owner_id !== viewer ? "" : obj.owner_id, people: [...how.entries()].filter(([person]) => !guest || person === viewer).map(([person, h]) => ({ person, how: [...new Set(h)] })) };
}
