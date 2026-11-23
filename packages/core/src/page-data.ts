// What the web app's pages read (spec 0001: one core). Every loader takes the Actor first, reads one Workspace only,
// and returns only what that person may see; pages render it and query nothing themselves.
import { withoutChecklistWords } from "./checklist";
import { withoutSnapshotAudience } from "./send-snapshot";
import { checklistAbout } from "./checklist-about";
import { openWorkflowRows } from "./workflow-rows";
import { guestWorkflowIds } from "./period-timeline";
import { feedIdsAmong } from "./feed-people";
import { db } from "./db";
import { openNames, openOne, openRows } from "./sealed-columns";
import { Forbidden, type Actor } from "./actor";
import { readableActions, systemTextFor, threadReader, getGroups, visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { getMetrics, getObservation, getSeriesOf } from "./workspace-data";
import { peopleIn, peopleToHide } from "./submissions";
import { assertSeesMetrics } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { mayManageWebhooks } from "./webhooks";
import { normalizeMetric } from "./metric-row";
import { tokenValid } from "./tokens";
import { workingPeriod } from "./workflow-rules";
import { STARTER_THEME } from "./themes";
import { workspaceLook } from "./workspace-look";
import { publicLook } from "./brand-logo";
import { createTrialWorkspace, trialSettingsInEffect } from "./trials";
import { assertMayOwnDefault } from "./workspace-limits";
import { stripOutsideContent, widgetWithoutOutside } from "./deck-content";
import { snapshotAccess } from "./snapshots";
import { nameHider } from "./hide-names";
import type { Action, Metric, Period, Point, Widget } from "./types";
import { periodStart } from "./periods";
import { yearStartFor, yearStartOf } from "./fiscal-year";
import { numberStyleOf } from "./workspace-settings";
import { ensureWorkspaceKey } from "./workspace-keys";
import { resolveTagWidgets } from "./tag-widgets";

const inDemo = (actor: Actor) => actor.workspaceId === DEMO_WORKSPACE_ID;
const isAdmin = async (actor: Actor) => actor.role === "owner" || actor.role === "admin";

/** The latest 80 Deliveries the person may be shown, taken per person first (their own, those they sent, those about a
 * thread), so other people's messages, such as Alerts, can never push theirs out of the 80; in the demo, anyone's. */
async function recentDeliveries(actor: Actor) {
  const columns = "id, connector, recipient_id, sender_id, kind, action_id, prompt_id, answer_source, alert_metric_id, heads_up_metric_a, heads_up_metric_b, subject, body, external_ref, status, created_at, mail_state, last_error, actions(kind, status), prompts(source, answered_at, answered_source, submitter_id, metric_id)";
  const base = () => db().from("deliveries").select(columns).eq("workspace_id", actor.workspaceId).order("id", { ascending: false }).limit(80);
  if (inDemo(actor)) return base();
  const [mine, sent, threads] = await Promise.all([base().eq("recipient_id", actor.personId), base().eq("sender_id", actor.personId), base().not("action_id", "is", null)]);
  const rows = new Map<number, NonNullable<typeof mine.data>[number]>();
  for (const r of [...(mine.data ?? []), ...(sent.data ?? []), ...(threads.data ?? [])]) rows.set(r.id as number, r);
  return { data: [...rows.values()].sort((a, b) => (b.id as number) - (a.id as number)).slice(0, 80) };
}

/** What a Guest was written is shown them without the other people's names: a Prompt's subject and text carry its
 * sender's, and a Guest does not see who else is in the Workspace (peopleFor, ticket #560). */
async function withoutOthersNames<T extends { subject?: unknown; body?: unknown }>(actor: Actor, rows: T[]): Promise<T[]> {
  if (actor.role !== "guest" || !rows.length) return rows;
  const hide = nameHider((await peopleToHide(actor.workspaceId)).filter((p) => p.id !== actor.personId));
  const hidden = (v: unknown) => (typeof v === "string" ? hide(v) : v);
  return rows.map((r) => ({ ...r, subject: hidden(r.subject), body: hidden(r.body) }));
}

/** The Connectors page: preferences, the Deliveries the person may read, and the Token codes that are theirs. */
export async function connectorsView(actor: Actor) {
  const ws = actor.workspaceId;
  const [{ data: prefs }, { data: deliveries }, { data: tokens }, readable] = await Promise.all([
    db().from("delivery_preferences").select("user_id, kind, connector, position").eq("workspace_id", ws).order("position"),
    // Named columns only: a Delivery's reply token answers as its recipient, and its Message-ID is for the provider's
    // logs; neither may reach a browser.
    recentDeliveries(actor),
    db().from("tokens").select("code, metric_id, submitter_id").eq("workspace_id", ws),
    readableActions(ws, actor.personId),
  ]);
  const can = new Set(readable.map((a) => a.id));
  // Deliveries about a thread the person may not read stay hidden; prompts and notices are private to their sender
  // and recipient, except in the demo, where anyone plays them.
  const opened = await openRows("deliveries", ws, deliveries);
  // An Alert message (GLOSSARY: Alert) about a Metric the person can no longer see disappears from the Outbox too:
  // its subject, its text and a "not sent" reason would each confirm the Metric (AGENTS.md rule 3).
  const alertMetrics = opened.some((d) => d.alert_metric_id || d.heads_up_metric_a) ? await visibleMetricIds(ws, actor.personId, await getMetrics(ws)) : new Set<number>();
  const visible = opened
    .filter((d) => !d.alert_metric_id || inDemo(actor) || alertMetrics.has(d.alert_metric_id as number))
    // A Heads-up message is listed only while the person sees both Metrics it is about, for the same reason.
    .filter((d) => !d.heads_up_metric_a || inDemo(actor) || [d.heads_up_metric_a, d.heads_up_metric_b].every((id) => id === null || alertMetrics.has(id as number)))
    .map((d) => ({ ...d, alert_metric_id: undefined, heads_up_metric_a: undefined, heads_up_metric_b: undefined }))
    .filter((d) => (d.action_id ? can.has(d.action_id) : inDemo(actor) || d.recipient_id === actor.personId || d.sender_id === actor.personId));
  // A Token code opens someone's submission form: only their own go to the browser, also in the demo (the demo refuses
  // the submission, but must teach the real rule for the person viewed as, ticket #609).
  const own = (tokens ?? []).filter((t) => t.submitter_id === actor.personId);
  // A form link in an older Prompt's text opens its recipient's form: only they see it.
  const shown = visible.map((d) => (d.recipient_id === actor.personId ? d : { ...d, body: String(d.body).replace(/\S*\/submit\/tk-[A-Za-z0-9_-]+/g, "[their personal form link]") }));
  // A Guest sees their own Delivery Preferences and the team default, not every member's (rule 3).
  const prefsShown = (prefs ?? []).filter((p) => actor.role !== "guest" || p.user_id === null || p.user_id === actor.personId);
  return { prefs: prefsShown, deliveries: await withoutOthersNames(actor, shown), tokens: own, isAdmin: await isAdmin(actor) };
}

/** How many of the latest Prompts and incoming messages the Sources page shows. */
export const SOURCES_SHOWN = 300;

/** The Sources page: the latest Prompts and intake log of the workspace, and the form links that are the person's. */
export async function sourcesView(actor: Actor) {
  const ws = actor.workspaceId;
  // The latest SOURCES_SHOWN of each, oldest first as the page shows them; named columns only.
  let tokens = db().from("tokens").select("id, code, metric_id, submitter_id").eq("workspace_id", ws);
  // A Token code opens someone's submission form: only the person's own are read, also in the demo (ticket #609).
  tokens = tokens.eq("submitter_id", actor.personId);
  const prompts = db().from("prompts").select("id, metric_id, submitter_id, source, text, period_start, sent_at, answered_at").eq("workspace_id", ws);
  const intake = db().from("intake_log").select("id, at, source, sender, sender_id, raw, metric_id, token_code, outcome, detail, marks").eq("workspace_id", ws);
  const [{ data: asked }, { data: log }, { data: own }] = await Promise.all([
    // Who was asked what, with any note, is the person's own outside the demo, as on the Connectors page.
    (inDemo(actor) ? prompts : prompts.eq("submitter_id", actor.personId)).order("sent_at", { ascending: false }).order("id", { ascending: false }).limit(SOURCES_SHOWN),
    // Incoming messages hold what a person wrote and the Token code that opens their form: outside the demo, only
    // the messages the person sent themselves (ticket #119).
    (inDemo(actor) ? intake : intake.eq("sender_id", actor.personId)).order("at", { ascending: false }).order("id", { ascending: false }).limit(SOURCES_SHOWN),
    tokens.order("id"),
  ]);
  // A message can name a Token that is not the sender's (a link someone forwarded): its code goes only to its owner.
  // On a form or API entry the sender is that code too, so it goes with it.
  const mine = new Set((own ?? []).map((t) => t.code));
  const viaCode = (source: string) => source === "web_form" || source === "api";
  const shown = (await openRows("intake_log", ws, log)).map((l) => (!l.token_code || mine.has(l.token_code) ? l : { ...l, token_code: null, sender: viaCode(l.source) ? "" : l.sender }));
  // The names of Metrics the page shows next to a line: only Metrics this person sees (their own, Shared, through a Group),
  // never the Workspace's whole list; a line about one they cannot see, or no longer see, shows no name.
  const all = await getMetrics(ws);
  const seen = await visibleMetricIds(ws, actor.personId, all);
  const metrics = all.filter((m) => seen.has(m.id)).map((m) => ({ id: m.id, name: String(m.name), sources: m.sources as string[] }));
  return { prompts: (await openRows("prompts", ws, asked)).reverse(), log: shown.reverse(), tokens: own ?? [], metrics };
}

/** The Activity page's raw material: versions and replaced values the person may see, and what labels them. */
export async function activityView(actor: Actor) {
  const ws = actor.workspaceId;
  const me = actor.personId;
  const [metrics, dashboards, { data: versions }, { data: superseded }, { data: decks }, { data: widgets }] = await Promise.all([
    getMetrics(ws), visibleDashboards(ws, me),
    db().from("versions").select("id, object_type, object_id, version, author_id, message, name, updated_at").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(200),
    db().from("observation_history").select("*").eq("workspace_id", ws).order("superseded_at", { ascending: false }).limit(100),
    db().from("decks").select("id, name, owner_id").eq("workspace_id", ws).eq("owner_id", me),
    db().from("widgets").select("id, dashboard_id, owner_id, metric_ids, title").eq("workspace_id", ws),
  ]);
  const visible = await visibleMetricIds(ws, me, metrics);
  const guestSees = await guestWorkflowIds(actor);
  const dash = new Set(dashboards.map((d) => d.id));
  const myDecks = new Set((decks ?? []).map((d) => d.id));
  const seenWidget = (id: number) => { const w = widgets?.find((x) => x.id === id); return w ? (w.dashboard_id ? dash.has(w.dashboard_id) : w.owner_id === me) : false; };
  // A Snapshot's words (spec 0013) follow its dashboard: shown ones for whoever may open it, drafts for its owner and
  // Editors, and only the Versions since it was shown for anyone else, as versionAccess and listVersions decide.
  const snapshotIds = [...new Set((versions ?? []).filter((v) => v.object_type === "snapshot").map((v) => v.object_id as number))];
  const { data: snaps } = snapshotIds.length ? await db().from("dashboard_snapshots").select("id, dashboard_id, shown_at").eq("workspace_id", ws).is("deleted_at", null).in("id", snapshotIds) : { data: [] };
  // The same rule as opening a Snapshot and listing its Versions (snapshotAccess): a draft only for owners and Editors
  // who see every Metric it kept; anyone else only the Versions since it was shown.
  const access = new Map(await Promise.all((snaps ?? []).map(async (s) => [s.id, await snapshotAccess(actor, s.id)] as const)));
  const seenSnapshot = (v: { object_id: number; updated_at: string }) => {
    const s = (snaps ?? []).find((x) => x.id === v.object_id);
    const a = access.get(v.object_id);
    if (!s || !a?.view) return false;
    if (a.edit) return true;
    return Boolean(s.shown_at) && v.updated_at >= s.shown_at;
  };
  // Only kinds that are listed here: anything new stays out until it says who may see it.
  const keep = (v: { object_type: string; object_id: number; updated_at: string }) =>
    v.object_type === "metric" ? visible.has(v.object_id)
    : v.object_type === "dashboard" ? dash.has(v.object_id)
    : v.object_type === "deck" ? myDecks.has(v.object_id)
    : v.object_type === "widget" ? seenWidget(v.object_id)
    : v.object_type === "snapshot" ? seenSnapshot(v)
    // A Guest sees only what is shared with them: of the rest, only the Workflows of their Metrics (rule 3).
    : guestSees ? v.object_type === "workflow" && guestSees.has(v.object_id)
    : ["template", "theme", "workflow", "master"].includes(v.object_type);
  const shown = (versions ?? []).filter(keep);
  const widgetIds = new Set(shown.filter((v) => v.object_type === "widget").map((v) => v.object_id));
  return {
    metrics: metrics.filter((m) => visible.has(m.id)),
    dashboards,
    versions: shown,
    // Replaced values are sealed with the Workspace Key; one that does not open is left out, never shown as ciphertext.
    superseded: (await openRows("observation_history", ws, superseded)).filter((x) => visible.has(x.metric_id) && typeof x.value === "number"),
    decks: decks ?? [],
    // Only the titles of widgets the person may see are opened (spec 0028).
    widgets: await openRows("widgets", ws, (widgets ?? []).filter((w) => widgetIds.has(w.id))),
  };
}

/** Workflows as the actor may be shown them: Webhook ids in a Tell step only for those who manage Webhooks, and
 * Checklist Items' words and people only where they may read them (rule 3, checklist.ts). */
function withoutWebhookIds<W extends { config: unknown }>(actor: Actor, workflows: W[]): W[] {
  if (mayManageWebhooks(actor)) return workflows;
  return workflows.map((w) => ({ ...w, config: { ...(w.config as object), steps: ((w.config as { steps?: Record<string, unknown>[] } | null)?.steps ?? []).map((step) => Object.fromEntries(Object.entries(step).filter(([k]) => k !== "webhooks"))) } }));
}

/** The Workflows page: the workspace's Workflows and, for the Metrics the person sees, their states and submitters
 * (with the names of the Feeds among them). */
export async function workflowsView(actor: Actor) {
  const ws = actor.workspaceId;
  const [all, { data: sealedWorkflows }] = await Promise.all([getMetrics(ws), db().from("workflows").select("*").eq("workspace_id", ws).order("id")]);
  // A Guest gets only the Workflows of the Metrics shared with them, never the rest of the Workspace's (rule 3).
  const guestSees = await guestWorkflowIds(actor);
  const workflows = await openWorkflowRows(ws, guestSees ? (sealedWorkflows ?? []).filter((w) => guestSees.has(w.id as number)) : sealedWorkflows);
  const ids = [...(await visibleMetricIds(ws, actor.personId, all))];
  const [{ data: states }, { data: tokens }] = await Promise.all([
    db().from("period_states").select("*").eq("workspace_id", ws).in("metric_id", ids).then(async (r) => ({ data: (await openRows("period_states", ws, r.data)).map((state) => { const { row_key, ...rest } = state as Record<string, unknown> & { row_key?: unknown }; return void row_key, rest as typeof state; }) })),
    db().from("tokens").select("metric_id, submitter_id, stand_in_id").eq("workspace_id", ws).in("metric_id", ids).is("stands_in_for", null),
  ]);
  const metrics = all.filter((m) => ids.includes(m.id));
  // A Feed submits as a profile of its own that is no member or Contact: its name comes from the feeds table, as on
  // the Metric's page, so the page never falls back to showing its id. Only the names of these Metrics' Feeds.
  const submitterIds = [...new Set((tokens ?? []).map((t) => t.submitter_id as string))];
  const { data: feedRows } = submitterIds.length
    ? await db().from("feeds").select("person_id, name").eq("workspace_id", ws).in("person_id", submitterIds)
    : { data: [] };
  const feeds = (feedRows ?? []).map((f) => ({ id: f.person_id as string, name: f.name as string }));
  // Webhook ids in a Tell step are for those who manage Webhooks; the rest of the Workspace gets the step without them (rule 3).
  const shown = await withoutSnapshotAudience(actor, await withoutChecklistWords(actor, withoutWebhookIds(actor, workflows ?? [])));
  return { workflows: shown, states: states ?? [], tokens: tokens ?? [], feeds, metrics, assigned: metrics.map((m) => ({ id: m.id, workflow_id: (m as Metric & { workflow_id?: number | null }).workflow_id ?? null })) };
}

/** The Metric Catalog as this Workspace has it: the entries every Workspace has, and its own part, from the Packs it
 * installed (spec 0030). A Derived Metric's entry is left out: its formula names other entries of its Pack, which
 * only setting the Pack up (#277) turns into Metrics. Never another Workspace's entries. */
export async function metricCatalog(actor: Pick<Actor, "workspaceId">) {
  const cols = "id, category, name, description, unit, unit_position, format, decimals, period, submission_rule, polarity, target_min, target_max, sources, aggregation, industries, segments, tags, pack_install_id";
  const [shared, own] = await Promise.all([
    db().from("catalog_metrics").select(cols).is("workspace_id", null).order("category").order("id"),
    db().from("catalog_metrics").select(cols).eq("workspace_id", actor.workspaceId).is("formula", null).order("category").order("id"),
  ]);
  return [...(shared.data ?? []), ...(own.data ?? [])];
}

/** What a Metric's page adds for someone who sees it: its Submitters, the workspace's Workflows, this period's state,
 * and the periods whose values wait for Approval. */
export async function metricExtras(actor: Actor, metricId: number, period: Period) {
  await assertSeesMetrics(actor, [metricId]);
  const ws = actor.workspaceId;
  const today = new Date().toISOString().slice(0, 10);
  const current = workingPeriod(today, period, await yearStartFor(ws, period));
  const [{ data: tokens }, { data: workflows }, { data: row }, { data: state }, { data: waiting }] = await Promise.all([
    db().from("tokens").select("id, code, metric_id, submitter_id, stand_in_id, stands_in_for").eq("workspace_id", ws).eq("metric_id", metricId),
    db().from("workflows").select("*").eq("workspace_id", ws).order("id").then(async (r) => ({ data: await openWorkflowRows(ws, r.data) })),
    db().from("metrics").select("workflow_id, owner_id").eq("id", metricId).eq("workspace_id", ws).single(),
    db().from("period_states").select("*").eq("workspace_id", ws).eq("metric_id", metricId).eq("period_start", current).maybeSingle().then(async (r) => ({ data: r.data ? (({ row_key, ...rest }) => (void row_key, rest))((await openRows("period_states", ws, [r.data]))[0] as Record<string, unknown> & { row_key?: unknown }) : null })),
    // Every period whose value waits for Approval, not only the Workflow's: the page marks those values as not
    // approved yet, as widgets do (GLOSSARY: Approval).
    db().from("period_states").select("period_start").eq("workspace_id", ws).eq("metric_id", metricId).eq("state", "approval"),
  ]);
  // A Token code opens someone's submission form, so a code goes to the browser only for the person's own Tokens, or
  // to the Metric's owner and admins, who hand the links out (also in the demo, for the person viewed as). Everyone else sees who submits.
  const allCodes = row?.owner_id === actor.personId || (await isAdmin(actor));
  // A Feed's Token is never handed out: a Feed presents its key, and its Token opens no form (spec 0012).
  const { data: feeds } = await db().from("feeds").select("person_id").eq("workspace_id", ws).in("person_id", (tokens ?? []).map((t) => t.submitter_id));
  const feedIds = new Set((feeds ?? []).map((f) => f.person_id as string));
  const shown = (tokens ?? []).map((t) => ({ ...t, feed: feedIds.has(t.submitter_id), code: !feedIds.has(t.submitter_id) && (allCodes || t.submitter_id === actor.personId) ? t.code : null }));
  const pending = (waiting ?? []).map((p) => p.period_start as string);
  // A Guest is shown only the Workflows of Metrics shared with them, not every Workflow's steps and people (rule 3).
  const guestSees = await guestWorkflowIds(actor);
  return { tokens: shown, workflows: await withoutSnapshotAudience(actor, await withoutChecklistWords(actor, withoutWebhookIds(actor, (workflows ?? []).filter((w) => !guestSees || guestSees.has(w.id as number))))), workflowId: (row?.workflow_id as number | null) ?? null, state, period: current, pending };
}

/** The actor's saved widgets (their Pool). */
export async function savedWidgets(actor: Actor): Promise<Widget[]> {
  const { data } = await db().from("widgets").select("*").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).eq("saved", true).order("id");
  return resolveTagWidgets(actor, ((await openRows("widgets", actor.workspaceId, data)) as Widget[]).map(widgetWithoutOutside), true);
}

/** A deck of the workspace with the actor's role on it; for one not shared with them, only who to ask. */
export async function deckView(actor: Actor, id: number) {
  const { data: deck } = await db().from("decks").select("*").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!deck) return null;
  const role = (await visibleDecks(actor.workspaceId, actor.personId)).find((d) => d.id === id)?.role ?? null;
  if (!role) {
    // Whom to ask: not told to a Guest, who does not see who else is in the Workspace (peopleFor).
    const { data: owner } = actor.role === "guest" ? { data: null } : await db().from("profiles").select("name").eq("id", deck.owner_id).single();
    return { role: null, ownerFirstName: (owner?.name as string | undefined)?.split(" ")[0] ?? "the owner", deck: null };
  }
  // Saved before content from other sites was refused, a deck still loads nothing from them (spec 0009).
  return { role, ownerFirstName: null, deck: { ...deck, document: stripOutsideContent(deck.document) } };
}

/** The documents of the decks the actor sees, for the decks list. */
export async function deckDocuments(actor: Actor) {
  const ids = (await visibleDecks(actor.workspaceId, actor.personId)).map((d) => d.id);
  if (!ids.length) return [];
  const { data } = await db().from("decks").select("id, document").eq("workspace_id", actor.workspaceId).in("id", ids);
  return (data ?? []).map((d) => ({ ...d, document: stripOutsideContent(d.document) }));
}

/** The widgets of a dashboard the actor sees, in reading order; Forbidden otherwise. */
export async function dashboardWidgets(actor: Actor, dashboardId: number): Promise<Widget[]> {
  const dash = (await visibleDashboards(actor.workspaceId, actor.personId)).find((d) => d.id === dashboardId);
  if (!dash) throw new Forbidden();
  const { data } = await db().from("widgets").select("*").eq("workspace_id", actor.workspaceId).eq("dashboard_id", dashboardId).order("y").order("x");
  // A widget of "all Metrics tagged X" draws what this viewer sees on their own, not what the dashboard's Share opens (spec 0038).
  return resolveTagWidgets(actor, ((await openRows("widgets", actor.workspaceId, data)) as Widget[]).map(widgetWithoutOutside), dash.role === "owner" || dash.role === "editor");
}

/** For a dashboard of the workspace that is not shared with the actor: whom to ask. Null when there is none here. */
export async function closedDashboardOwner(actor: Actor, dashboardId: number): Promise<string | null> {
  const { data: d } = await db().from("dashboards").select("owner_id").eq("id", dashboardId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!d) return null;
  // Not told to a Guest, who does not see who else is in the Workspace (peopleFor).
  const { data: p } = actor.role === "guest" ? { data: null } : await db().from("profiles").select("name").eq("id", d.owner_id).single();
  return (p?.name as string | undefined)?.split(" ")[0] ?? "the owner";
}

/** The Team page's facts: everyone's role, domain joining, and the away dates of the workspace's people. Refused to a
 * Guest, who only sees what is shared with them: not who else is here, their roles, Groups or days away. */
export async function teamView(actor: Actor) {
  if (actor.role === "guest") throw new Forbidden("Guests see what is shared with them, not the Workspace's members and Groups.");
  const ws = actor.workspaceId;
  const people = await peopleIn(ws);
  const [{ data: roles }, { data: space }, { data: away }] = await Promise.all([
    db().from("memberships").select("user_id, role").eq("workspace_id", ws),
    db().from("workspaces").select("join_domain").eq("id", ws).single(),
    db().from("away").select("*").in("user_id", people.map((p) => p.id)),
  ]);
  return { roles: roles ?? [], joinDomain: (space?.join_domain as string | null) ?? null, away: away ?? [] };
}

/** What the action page names of an Action's Metric for anyone on it: what its question names anyway, and how to
 * write its value. */
export type ActionMetric = Pick<Metric, "id" | "name" | "slug" | "period" | "owner_id" | "decimals" | "unit" | "unit_position">;

/** How many periods the action page's chart shows before and after the Action's one: daily Metrics more. */
const CHART_AROUND = { day: { before: 20, after: 10 }, other: { before: 8, after: 4 } } as const;

/** An Action with its Thread and Deliveries, if the actor may read it; null otherwise. Also its Metric (name, unit and
 * period, which its question names anyway), the value it is about, and the periods around it for a chart, but those
 * only for a viewer who sees the Metric (ticket 323): an Assignee or asker who does not, such as an Approver it was
 * never shared with, gets the task and its value, never the Metric's history. */
export async function actionThread(actor: Actor, id: number) {
  const ws = actor.workspaceId;
  const { data: found } = await db().from("actions").select("*").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!found) return null;
  const [opened] = (await openRows("actions", ws, [found])) as Action[];
  const hideSystem = await systemTextFor(actor);
  const action = { ...opened, question: hideSystem(opened.question, Boolean(opened.purpose)) } as Action;
  const [groups, metrics] = await Promise.all([getGroups(ws), getMetrics(ws)]);
  const visible = await visibleMetricIds(ws, actor.personId, metrics);
  const can = threadReader(actor.personId, groups, (m) => metrics.find((x) => x.id === m)?.owner_id, ws, visible, actor.role);
  if (!can(action as Action & { workspace_id: string })) return null;
  // A Checklist Task has no Metric (spec 0045): no chart and no value, only the Workflow and the period it is about.
  if (action.metric_id === null) {
    const about = (await checklistAbout(ws, [{ workflow_id: action.workflow_id, period_start: action.period_start }]))(action.workflow_id, action.period_start);
    const [{ data: messages }, { data: deliveries }] = await Promise.all([
      db().from("thread_messages").select("*").eq("workspace_id", ws).eq("action_id", id).order("created_at"),
      db().from("deliveries").select("id, connector, recipient_id, kind, external_ref, created_at").eq("workspace_id", ws).eq("action_id", id).order("id"),
    ]);
    return { action, metric: null, about, chartMetric: null, seesMetric: false, observation: null, chart: [] as Point[], messages: await openRows("thread_messages", ws, messages), deliveries: deliveries ?? [], externalLinks: [] as { system: string; url: string | null }[] };
  }
  const metric = metrics.find((m) => m.id === action.metric_id);
  if (!metric) return null;
  const seesMetric = visible.has(metric.id);
  const [{ data: messages }, { data: deliveries }, observation, series, { data: links }] = await Promise.all([
    db().from("thread_messages").select("*").eq("workspace_id", ws).eq("action_id", id).order("created_at"),
    db().from("deliveries").select("id, connector, recipient_id, kind, external_ref, created_at").eq("workspace_id", ws).eq("action_id", id).order("id"),
    getObservation(ws, action.observation_id),
    seesMetric ? getSeriesOf(ws, metrics, [metric.id]) : Promise.resolve({} as Record<string, Point[]>),
    db().from("webhook_external_ids").select("id, system, url").eq("workspace_id", ws).eq("action_id", id).order("created_at").limit(10),
  ]);
  // "Also in Microsoft To Do" (spec 0034): the system's label and an https address a Webhook's recipe gave; never the external id.
  const externalLinks = (await openRows("webhook_external_ids", ws, (links ?? []) as Record<string, unknown>[])).map((l) => ({ system: String(l.system), url: typeof l.url === "string" && /^https:\/\//.test(l.url) ? l.url : null }));
  const around = metric.period === "day" ? CHART_AROUND.day : CHART_AROUND.other;
  const pts = series[metric.slug] ?? [];
  const at = pts.findIndex((p) => p.period === action.period_start);
  const chart = seesMetric ? pts.slice(Math.max(0, at - around.before), at + around.after) : [];
  // The value is only the one this Action is about, and only of its own Metric.
  const value = observation && observation.metric_id === metric.id ? observation : null;
  // Security: someone on the Action who does not see its Metric gets only these few fields of it, never its
  // description, settings or Workflow; the whole Metric, for the chart, only goes to a viewer who sees it.
  const named: ActionMetric = { id: metric.id, name: metric.name, slug: metric.slug, period: metric.period, owner_id: metric.owner_id, decimals: metric.decimals, unit: metric.unit, unit_position: metric.unit_position };
  return { action, metric: named, about: null, chartMetric: seesMetric ? metric : null, seesMetric, observation: value, chart, messages: await openRows("thread_messages", ws, messages), deliveries: deliveries ?? [], externalLinks };
}

/** A personal form link's page, for anyone holding the code: the Metric, whose form it is, and this period's value.
 * Null when the code is unknown or a stand-in's link no longer works. */
export async function submissionForm(code: string) {
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(String(code))) return null;
  const { data: token } = await db().from("tokens").select("*, metrics(*), profiles!tokens_submitter_id_fkey(id, name)").eq("code", code).maybeSingle();
  if (!token) return null;
  // A Feed's Token opens no form: a Feed presents its key, and its form would show the period's value (spec 0012).
  if ((await feedIdsAmong([token.submitter_id as string])).size) return null;
  if (token.stands_in_for) {
    const { data: theirs } = await db().from("tokens").select("metric_id, submitter_id, stand_in_id, stands_in_for, expires_at").eq("metric_id", token.metric_id);
    if (!tokenValid(token, theirs ?? [])) return null;
  }
  const metric = normalizeMetric((await openOne("metrics", String(token.workspace_id), token.metrics)) as Metric) as Metric;
  const [yearStart, numberStyle] = await Promise.all([yearStartOf(String(token.workspace_id)), numberStyleOf(String(token.workspace_id))]);
  const period = periodStart(new Date(), metric.period, yearStart);
  const { data: existingRows } = await db().from("observations").select("id, value, value_sealed").eq("workspace_id", String(token.workspace_id)).eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
  const [existing] = await openRows("observations", String(token.workspace_id), (existingRows ?? []) as Record<string, unknown>[]);
  const [person] = await openNames(String(token.workspace_id), [token.profiles as { id: string; name: string }]);
  // A request that went by several ways and was answered on one says so on the others' form link (#613): the first answer
  // counted, and a new value follows the Metric's rule. Only the Source, never the value of someone else's answer.
  const { data: answered } = await db().from("prompts").select("answered_source").eq("workspace_id", String(token.workspace_id)).eq("metric_id", metric.id).eq("submitter_id", token.submitter_id as string).eq("period_start", period).not("answered_at", "is", null).not("answered_source", "is", null).neq("answered_source", "web_form").order("answered_at", { ascending: false }).limit(1);
  // The page wears the Workspace's Theme (ticket #542): only its look (name, logo, colours, fonts) goes to the browser.
  const look = publicLook(String(token.workspace_id), await workspaceLook(String(token.workspace_id)));
  return { metric, person, period, yearStart, numberStyle, current: typeof existing?.value === "number" ? existing.value : null, answeredOn: answered?.[0] ? String(answered[0].answered_source) : null, look };
}

/** A signed-in person creates a workspace and becomes its Owner; it starts with the Theme Ziffr ships with. */
export async function createWorkspace(personId: string, name: string): Promise<string> {
  const title = String(name ?? "").trim().slice(0, 80);
  if (!title) throw new Error("Give the workspace a name.");
  // On an Installation that offers trials, every workspace is a Trial Workspace (spec 0021).
  const trials = await trialSettingsInEffect();
  const ws = trials ? { id: await createTrialWorkspace(personId, title, trials) } : await plainWorkspace(personId, title);
  // Its Workspace Key before anything is written to it (spec 0028). A key that cannot be made now is made when first
  // needed, so the workspace is not refused for it.
  try {
    await ensureWorkspaceKey(ws.id);
  } catch (e) {
    console.error("The Workspace Key could not be made yet:", (e as Error).message);
  }
  // Never a copy of another workspace's Theme (logo, footer).
  await db().from("themes").insert({ ...STARTER_THEME, owner_id: personId, is_default: true, workspace_id: ws.id });
  if (trials) {
    // A trial starts with its Test Metric, a Workflow and a dashboard. Loaded here, not at the top: the seed uses
    // the operations that themselves read this module. A seed that fails leaves an empty trial, not none.
    const { seedTrialWorkspace } = await import("./trial-seed");
    try {
      await seedTrialWorkspace({ personId, workspaceId: ws.id, role: "owner" });
    } catch (e) {
      console.error("The trial's Test Metric could not be made:", (e as Error).message);
    }
  }
  return ws.id as string;
}

/** An ordinary workspace with its Owner. */
async function plainWorkspace(personId: string, title: string): Promise<{ id: string }> {
  // One Workspace on the default limit per person where the Installation says so (spec 0029); a trial is checked
  // by create_trial_workspace, which allows one per person anyway.
  await assertMayOwnDefault(personId);
  const { data: ws, error } = await db().from("workspaces").insert({ name: title }).select("id").single();
  if (error || !ws) throw new Error("The workspace could not be created.");
  await db().from("memberships").insert({ workspace_id: ws.id, user_id: personId, role: "owner" });
  return { id: ws.id as string };
}

/** Whether a person is a member of a workspace (for switching to it). */
export async function isMemberOf(personId: string, workspaceId: string): Promise<boolean> {
  const { data } = await db().from("memberships").select("workspace_id").eq("user_id", personId).eq("workspace_id", workspaceId).maybeSingle();
  return Boolean(data);
}

/** Whether any Metric the person sees has a value yet: the first-run checklist ticks "Add its first value" with it,
 * without the page reading every series. */
export async function hasVisibleValue(actor: Actor): Promise<boolean> {
  const metrics = await getMetrics(actor.workspaceId);
  const ids = [...(await visibleMetricIds(actor.workspaceId, actor.personId, metrics))];
  if (!ids.length) return false;
  // In groups of 500 ids, so the request stays short however many Metrics a workspace has.
  for (let i = 0; i < ids.length; i += 500) {
    const { count } = await db().from("observations").select("id", { count: "exact", head: true }).eq("workspace_id", actor.workspaceId).in("metric_id", ids.slice(i, i + 500));
    if ((count ?? 0) > 0) return true;
  }
  return false;
}
