// What the web app's pages read (spec 0001: one core). Every loader takes the Actor first, reads one Workspace only,
// and returns only what that person may see; pages render it and query nothing themselves.
import { feedIdsAmong } from "./feed-people";
import { db } from "./db";
import { Forbidden, type Actor } from "./actor";
import { readableActions, threadReader, getGroups, visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { getMetrics } from "./workspace-data";
import { peopleIn } from "./submissions";
import { assertSeesMetrics } from "./sharing";
import { DEMO_WORKSPACE_ID } from "./team";
import { normalizeMetric } from "./metric-row";
import { tokenValid } from "./tokens";
import { workingPeriod } from "./workflow-rules";
import { STARTER_THEME } from "./themes";
import { createTrialWorkspace, trialSettings } from "./trials";
import { stripOutsideContent, widgetWithoutOutside } from "./deck-content";
import { snapshotAccess } from "./snapshots";
import type { Action, Metric, Period, Widget } from "./types";
import { periodStart } from "./periods";
import { yearStartFor, yearStartOf } from "./fiscal-year";
import { numberStyleOf } from "./workspace-settings";
import { ensureWorkspaceKey } from "./workspace-keys";

const inDemo = (actor: Actor) => actor.workspaceId === DEMO_WORKSPACE_ID;
const isAdmin = async (actor: Actor) => actor.role === "owner" || actor.role === "admin";

/** The Connectors page: preferences, the Deliveries the person may read, and the Token codes that are theirs. */
export async function connectorsView(actor: Actor) {
  const ws = actor.workspaceId;
  const [{ data: prefs }, { data: deliveries }, { data: tokens }, readable] = await Promise.all([
    db().from("delivery_preferences").select("user_id, kind, connector").eq("workspace_id", ws),
    // Named columns only: a Delivery's reply token answers as its recipient, and its Message-ID is for the provider's
    // logs; neither may reach a browser.
    db().from("deliveries").select("id, connector, recipient_id, sender_id, kind, action_id, prompt_id, subject, body, external_ref, status, created_at, mail_state, last_error, actions(kind, status, question), prompts(source, answered_at, submitter_id, metric_id)").eq("workspace_id", ws).order("id", { ascending: false }).limit(80),
    db().from("tokens").select("code, metric_id, submitter_id").eq("workspace_id", ws),
    readableActions(ws, actor.personId),
  ]);
  const can = new Set(readable.map((a) => a.id));
  // Deliveries about a thread the person may not read stay hidden; prompts and notices are private to their sender
  // and recipient, except in the demo, where anyone plays them.
  const visible = (deliveries ?? []).filter((d) => (d.action_id ? can.has(d.action_id) : inDemo(actor) || d.recipient_id === actor.personId || d.sender_id === actor.personId));
  // A Token code opens someone's submission form: only their own go to the browser (in the demo, all of the demo).
  const own = (tokens ?? []).filter((t) => inDemo(actor) || t.submitter_id === actor.personId);
  // A form link in an older Prompt's text opens its recipient's form: only they (and the demo) see it.
  const shown = visible.map((d) => (inDemo(actor) || d.recipient_id === actor.personId ? d : { ...d, body: String(d.body).replace(/\S*\/submit\/tk-[A-Za-z0-9_-]+/g, "[their personal form link]") }));
  return { prefs: prefs ?? [], deliveries: shown, tokens: own, isAdmin: await isAdmin(actor) };
}

/** How many of the latest Prompts and incoming messages the Sources page shows. */
export const SOURCES_SHOWN = 300;

/** The Sources page: the latest Prompts and intake log of the workspace, and the form links that are the person's. */
export async function sourcesView(actor: Actor) {
  const ws = actor.workspaceId;
  // The latest SOURCES_SHOWN of each, oldest first as the page shows them; named columns only.
  let tokens = db().from("tokens").select("id, code, metric_id, submitter_id").eq("workspace_id", ws);
  // A Token code opens someone's submission form: only the person's own are read (in the demo, all of the demo).
  if (!inDemo(actor)) tokens = tokens.eq("submitter_id", actor.personId);
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
  const shown = (log ?? []).map((l) => (inDemo(actor) || !l.token_code || mine.has(l.token_code) ? l : { ...l, token_code: null, sender: viaCode(l.source) ? "" : l.sender }));
  return { prompts: (asked ?? []).reverse(), log: shown.reverse(), tokens: own ?? [] };
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
    : ["template", "theme", "workflow", "master"].includes(v.object_type);
  const shown = (versions ?? []).filter(keep);
  const widgetIds = new Set(shown.filter((v) => v.object_type === "widget").map((v) => v.object_id));
  return {
    metrics: metrics.filter((m) => visible.has(m.id)),
    dashboards,
    versions: shown,
    superseded: (superseded ?? []).filter((x) => visible.has(x.metric_id)),
    decks: decks ?? [],
    widgets: (widgets ?? []).filter((w) => widgetIds.has(w.id)),
  };
}

/** The Workflows page: the workspace's Workflows and, for the Metrics the person sees, their states and submitters
 * (with the names of the Feeds among them). */
export async function workflowsView(actor: Actor) {
  const ws = actor.workspaceId;
  const [all, { data: workflows }] = await Promise.all([getMetrics(ws), db().from("workflows").select("*").eq("workspace_id", ws).order("id")]);
  const ids = [...(await visibleMetricIds(ws, actor.personId, all))];
  const [{ data: states }, { data: tokens }] = await Promise.all([
    db().from("period_states").select("*").eq("workspace_id", ws).in("metric_id", ids),
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
  return { workflows: workflows ?? [], states: states ?? [], tokens: tokens ?? [], feeds, metrics, assigned: metrics.map((m) => ({ id: m.id, workflow_id: (m as Metric & { workflow_id?: number | null }).workflow_id ?? null })) };
}

/** The Metric Catalog: example Metrics anyone may start from; the same for every workspace. */
export async function metricCatalog() {
  const { data } = await db().from("catalog_metrics").select("*").order("category").order("id");
  return data ?? [];
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
    db().from("workflows").select("*").eq("workspace_id", ws).order("id"),
    db().from("metrics").select("workflow_id, owner_id").eq("id", metricId).eq("workspace_id", ws).single(),
    db().from("period_states").select("*").eq("workspace_id", ws).eq("metric_id", metricId).eq("period_start", current).maybeSingle(),
    // Every period whose value waits for Approval, not only the Workflow's: the page marks those values as not
    // approved yet, as widgets do (GLOSSARY: Approval).
    db().from("period_states").select("period_start").eq("workspace_id", ws).eq("metric_id", metricId).eq("state", "approval"),
  ]);
  // A Token code opens someone's submission form, so a code goes to the browser only for the person's own Tokens, or
  // to the Metric's owner and admins, who hand the links out (in the demo, all of them). Everyone else sees who submits.
  const allCodes = inDemo(actor) || row?.owner_id === actor.personId || (await isAdmin(actor));
  // A Feed's Token is never handed out: a Feed presents its key, and its Token opens no form (spec 0012).
  const { data: feeds } = await db().from("feeds").select("person_id").eq("workspace_id", ws).in("person_id", (tokens ?? []).map((t) => t.submitter_id));
  const feedIds = new Set((feeds ?? []).map((f) => f.person_id as string));
  const shown = (tokens ?? []).map((t) => ({ ...t, feed: feedIds.has(t.submitter_id), code: !feedIds.has(t.submitter_id) && (allCodes || t.submitter_id === actor.personId) ? t.code : null }));
  const pending = (waiting ?? []).map((p) => p.period_start as string);
  return { tokens: shown, workflows: workflows ?? [], workflowId: (row?.workflow_id as number | null) ?? null, state, period: current, pending };
}

/** The actor's saved widgets (their Pool). */
export async function savedWidgets(actor: Actor): Promise<Widget[]> {
  const { data } = await db().from("widgets").select("*").eq("workspace_id", actor.workspaceId).eq("owner_id", actor.personId).eq("saved", true).order("id");
  return ((data ?? []) as Widget[]).map(widgetWithoutOutside);
}

/** A deck of the workspace with the actor's role on it; for one not shared with them, only who to ask. */
export async function deckView(actor: Actor, id: number) {
  const { data: deck } = await db().from("decks").select("*").eq("id", id).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!deck) return null;
  const role = (await visibleDecks(actor.workspaceId, actor.personId)).find((d) => d.id === id)?.role ?? null;
  if (!role) {
    const { data: owner } = await db().from("profiles").select("name").eq("id", deck.owner_id).single();
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
  if (!(await visibleDashboards(actor.workspaceId, actor.personId)).some((d) => d.id === dashboardId)) throw new Forbidden();
  const { data } = await db().from("widgets").select("*").eq("workspace_id", actor.workspaceId).eq("dashboard_id", dashboardId).order("y").order("x");
  return ((data ?? []) as Widget[]).map(widgetWithoutOutside);
}

/** For a dashboard of the workspace that is not shared with the actor: whom to ask. Null when there is none here. */
export async function closedDashboardOwner(actor: Actor, dashboardId: number): Promise<string | null> {
  const { data: d } = await db().from("dashboards").select("owner_id").eq("id", dashboardId).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!d) return null;
  const { data: p } = await db().from("profiles").select("name").eq("id", d.owner_id).single();
  return (p?.name as string | undefined)?.split(" ")[0] ?? "the owner";
}

/** The Team page's facts: everyone's role, domain joining, and the away dates of the workspace's people. */
export async function teamView(actor: Actor) {
  const ws = actor.workspaceId;
  const people = await peopleIn(ws);
  const [{ data: roles }, { data: space }, { data: away }] = await Promise.all([
    db().from("memberships").select("user_id, role").eq("workspace_id", ws),
    db().from("workspaces").select("join_domain").eq("id", ws).single(),
    db().from("away").select("*").in("user_id", people.map((p) => p.id)),
  ]);
  return { roles: roles ?? [], joinDomain: (space?.join_domain as string | null) ?? null, away: away ?? [] };
}

/** An Action with its Thread and Deliveries, if the actor may read it; null otherwise. */
export async function actionThread(actor: Actor, id: number) {
  const ws = actor.workspaceId;
  const { data: action } = await db().from("actions").select("*").eq("id", id).eq("workspace_id", ws).maybeSingle();
  if (!action) return null;
  const [groups, { data: metrics }] = await Promise.all([getGroups(ws), db().from("metrics").select("id, owner_id").eq("workspace_id", ws)]);
  const can = threadReader(actor.personId, groups, (m) => metrics?.find((x) => x.id === m)?.owner_id, ws);
  if (!can(action as Action & { workspace_id: string })) return null;
  const [{ data: messages }, { data: deliveries }] = await Promise.all([
    db().from("thread_messages").select("*").eq("workspace_id", ws).eq("action_id", id).order("created_at"),
    db().from("deliveries").select("id, connector, recipient_id, kind, external_ref, created_at").eq("workspace_id", ws).eq("action_id", id).order("id"),
  ]);
  return { action: action as Action, messages: messages ?? [], deliveries: deliveries ?? [] };
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
  const metric = normalizeMetric(token.metrics) as Metric;
  const [yearStart, numberStyle] = await Promise.all([yearStartOf(String(token.workspace_id)), numberStyleOf(String(token.workspace_id))]);
  const period = periodStart(new Date(), metric.period, yearStart);
  const { data: existing } = await db().from("observations").select("value").eq("metric_id", metric.id).eq("period_start", period).order("created_at", { ascending: false }).limit(1);
  return { metric, person: token.profiles as { id: string; name: string }, period, yearStart, numberStyle, current: existing?.[0] ? Number(existing[0].value) : null };
}

/** A signed-in person creates a workspace and becomes its Owner; it starts with the Theme Ziffr ships with. */
export async function createWorkspace(personId: string, name: string): Promise<string> {
  const title = String(name ?? "").trim().slice(0, 80);
  if (!title) throw new Error("Give the workspace a name.");
  // On an Installation that offers trials, every workspace is a Trial Workspace (spec 0021).
  const trials = trialSettings();
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
    // A trial starts filled, so its dashboard shows something at once. Loaded here, not at the top: the seed uses
    // the operations that themselves read this module. A seed that fails leaves an empty trial, not none.
    const { seedTrialWorkspace } = await import("./trial-seed");
    try {
      await seedTrialWorkspace({ personId, workspaceId: ws.id, role: "owner" });
    } catch (e) {
      console.error("The trial's starting Metrics could not be made:", (e as Error).message);
    }
  }
  return ws.id as string;
}

/** An ordinary workspace with its Owner. */
async function plainWorkspace(personId: string, title: string): Promise<{ id: string }> {
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
