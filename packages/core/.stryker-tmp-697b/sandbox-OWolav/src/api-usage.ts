// @ts-nocheck
// A Workspace's own Usage figures for a program (ticket #370, spec 0031; GLOSSARY: Usage, View Count, Access Key).
// `usage:read` is a scope of its own, only for a program's key (never an assistant's: text in a Workspace could talk
// one into reading what goes unused), and only while the key's creator is an Owner or Admin, as the Usage page is. The
// answer is counts: per day the views of dashboards, decks and Metrics and the values by Source, and as of now how many
// Metrics, Metrics without values, things not opened for 90 days and Submitters without values. Never a name, an id, a
// person or a value, and nothing about another Workspace or the Installation. Only what the key's creator sees: a
// Workspace Role grants no Metric, so values, views and counts cover the Metrics, dashboards and decks the creator sees,
// as the Usage page does, since the Feed that sends them writes Metrics other people may see.
import { assertScope, Forbidden, type KeyActor } from "./actor";
import { visibleDashboards, visibleDecks, visibleMetricIds } from "./access";
import { db } from "./db";
import { UsageRangeError, usageRange, USAGE_MIN_WORKSPACES } from "./installation-usage";
import { DEMO_WORKSPACE_ID } from "./team";
import { inUse } from "./metric-row";
import { allRows, getMetrics } from "./workspace-data";
import { workspaceUsage } from "./usage-report";

export { UsageRangeError };

/** The fewest people a Workspace needs before it returns event figures or counts Submitters: with fewer, a day's total
 * minus one's own activity is another person's. The same number as the Installation's rule, one change for both. */
export const USAGE_MIN_PEOPLE = USAGE_MIN_WORKSPACES;

/** Calls a Workspace's keys may make in an hour: each one runs the Usage page's loaders and up to 400 days of counts. */
export const WORKSPACE_USAGE_CALLS_PER_HOUR = 30;

/** Figures counted in a day; a period's value is the sum of its days. Events, so held back while the Workspace is small. */
export const WORKSPACE_EVENT_FIGURES = ["workspace_values", "workspace_views_dashboards", "workspace_views_decks", "workspace_views_metrics"] as const;
/** Figures that split the day's values by Source: events, held back like them. */
export const WORKSPACE_SOURCE_FIGURES = ["workspace_values_web", "workspace_values_email", "workspace_values_slack", "workspace_values_telegram", "workspace_values_api", "workspace_values_feed", "workspace_values_mcp"] as const;
/** Figures counted as of now; a period's value is the last. */
export const WORKSPACE_STATE_FIGURES = ["workspace_metrics", "workspace_metrics_without_values", "workspace_metrics_not_opened", "workspace_dashboards_not_opened", "workspace_decks_not_opened", "workspace_submitters_without_values", "workspace_archive_suggestions"] as const;
/** The state figures that rest on 90 days of counting. */
const UNOPENED = ["workspace_metrics_not_opened", "workspace_dashboards_not_opened", "workspace_decks_not_opened", "workspace_archive_suggestions"];
const SUBMITTERS = "workspace_submitters_without_values";
/** Most Metric ids one call sends to the database to count values for. */
const MAX_METRICS = 20_000;

/** One day's figures: whole numbers by key, no other keys. */
export type WorkspaceUsageDay = { day: string } & { [figure: string]: number | string };
/** What the endpoint answers: the days asked for, the figures as of now (for yesterday), and the figures left out. */
export type WorkspaceUsageFigures = { days: WorkspaceUsageDay[]; state: WorkspaceUsageDay; withheld: string[] };

/** Thrown when the Workspace's keys made all the calls they may this hour. */
export class UsageLimit extends Error {
  constructor() { super(`${WORKSPACE_USAGE_CALLS_PER_HOUR} calls an hour are allowed for a Workspace's usage figures; try again later.`); this.name = "UsageLimit"; }
}

const DAY = 86_400_000;
const WAYS: Record<string, (typeof WORKSPACE_SOURCE_FIGURES)[number]> = { web: "workspace_values_web", email: "workspace_values_email", slack: "workspace_values_slack", telegram: "workspace_values_telegram", api: "workspace_values_api", feed: "workspace_values_feed", mcp: "workspace_values_mcp" };
const VIEW: Record<string, string> = { dashboard: "workspace_views_dashboards", deck: "workspace_views_decks", metric: "workspace_views_metrics" };

/** Refuses what is not a live program key of an Owner or Admin with the scope, in a Workspace that is not the demo. */
async function assertMay(actor: KeyActor): Promise<void> {
  assertScope(actor, "usage:read");
  if (actor.workspaceId === DEMO_WORKSPACE_ID || (actor.role !== "owner" && actor.role !== "admin")) throw new Forbidden("Only Owners and Admins read usage figures.");
  // A program's key only, whatever scopes the row holds (the database refuses an assistant's row with this scope too).
  const { data: key } = await db().from("access_keys").select("kind, revoked_at").eq("id", Number(actor.key.id)).eq("workspace_id", actor.workspaceId).maybeSingle();
  if (!key || key.kind !== "program" || key.revoked_at) throw new Forbidden();
}

/** Takes one of the Workspace's calls this hour, atomically in the database, so calls at once cannot pass the limit. */
async function assertWithinLimit(actor: KeyActor): Promise<void> {
  const { data, error } = await db().rpc("claim_workspace_usage_call", { p_ws: actor.workspaceId, p_max: WORKSPACE_USAGE_CALLS_PER_HOUR });
  if (error) throw new Error("The call could not be counted.");
  if (data !== true) throw new UsageLimit();
}

/** The figures of the key's own Workspace (scope usage:read) for the days asked for (at most 400, not after yesterday;
 * left out: the last 30), or Forbidden. Only Metrics, dashboards and decks the key's creator sees are counted. Views
 * are counted from `usage_since` on: a day before it has no view figures, not zero. Event figures are returned only
 * for days on which at least 3 people were in the Workspace (from the day the third joined); below that, and the
 * Submitters, they are left out and named in `withheld`, as is what is not opened until 90 days were counted. */
export async function workspaceUsageFigures(actor: KeyActor, input: { from?: unknown; to?: unknown } = {}, now: Date = new Date()): Promise<WorkspaceUsageFigures> {
  await assertMay(actor);
  await assertWithinLimit(actor);
  const { from, to } = usageRange(input);
  const ws = actor.workspaceId;
  const creator = { personId: actor.personId, workspaceId: ws, role: actor.role };
  const [report, allMetrics, dashboards, decks, { data: joined }] = await Promise.all([
    workspaceUsage(creator, now),
    getMetrics(ws),
    visibleDashboards(ws, actor.personId),
    visibleDecks(ws, actor.personId),
    db().from("memberships").select("created_at").eq("workspace_id", ws).order("created_at", { ascending: true }).limit(USAGE_MIN_PEOPLE),
  ]);
  const seen = await visibleMetricIds(ws, actor.personId, allMetrics);
  const seenMetrics = [...seen].slice(0, MAX_METRICS);
  const people = joined?.length ?? 0;
  // The first day on which the Workspace had enough people: the day its third person joined.
  const enoughFrom = people >= USAGE_MIN_PEOPLE ? String(joined![USAGE_MIN_PEOPLE - 1].created_at).slice(0, 10) : null;
  const withheld: string[] = [];
  if (enoughFrom === null) withheld.push(...WORKSPACE_EVENT_FIGURES, ...WORKSPACE_SOURCE_FIGURES, SUBMITTERS);
  const counting = report.countingSince;
  const notReady = counting === null || report.fillsInOn !== null;
  if (notReady) withheld.push(...UNOPENED);

  const whole = (n: unknown) => Number.isSafeInteger(Number(n)) && Number(n) >= 0 ? Number(n) : 0;
  const days = new Map<string, WorkspaceUsageDay>();
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    const row: WorkspaceUsageDay = { day };
    if (enoughFrom !== null && day >= enoughFrom) {
      row.workspace_values = 0;
      for (const f of WORKSPACE_SOURCE_FIGURES) row[f] = 0;
      // Counting began on `usage_since`: before it a view is unknown, not none.
      if (counting !== null && day >= counting) { row.workspace_views_dashboards = 0; row.workspace_views_decks = 0; row.workspace_views_metrics = 0; }
    }
    days.set(day, row);
  }

  if (enoughFrom !== null && seenMetrics.length) {
    const first = from < enoughFrom ? enoughFrom : from;
    const { data: ways } = first <= to ? await db().rpc("workspace_usage_values", { p_workspace: ws, p_metrics: seenMetrics, p_from: first, p_to: to }) : { data: [] };
    for (const w of (ways ?? []) as { day: string; way: string; n: number }[]) {
      const row = days.get(String(w.day));
      if (!row || typeof row.workspace_values !== "number") continue;
      row.workspace_values += whole(w.n);
      const f = WAYS[w.way];
      if (f) row[f] = (row[f] as number) + whole(w.n);
    }
    const ids = { dashboard: new Set(dashboards.map((d) => d.id)), deck: new Set(decks.map((d) => d.id)), metric: seen } as Record<string, Set<number>>;
    const views = await allRows<{ day: string; subject_kind: string; subject_id: number; n_app: number; n_link: number }>((a, b) =>
      db().from("view_counts").select("day, subject_kind, subject_id, n_app, n_link").eq("workspace_id", ws).gte("day", first).lte("day", to).order("day").order("subject_kind").order("subject_id").range(a, b));
    for (const v of views) {
      const row = days.get(String(v.day));
      const f = VIEW[v.subject_kind];
      if (row && f && typeof row[f] === "number" && ids[v.subject_kind]?.has(v.subject_id)) row[f] = (row[f] as number) + whole(v.n_app) + whole(v.n_link);
    }
  }

  const state: WorkspaceUsageDay = {
    day: new Date(now.getTime() - DAY).toISOString().slice(0, 10),
    workspace_metrics: inUse(allMetrics).filter((m) => seen.has(m.id)).length,
    workspace_metrics_without_values: report.noValues.length,
  };
  if (!notReady) {
    state.workspace_metrics_not_opened = report.notOpened.metrics.length;
    state.workspace_dashboards_not_opened = report.notOpened.dashboards.length;
    state.workspace_decks_not_opened = report.notOpened.decks.length;
    state.workspace_archive_suggestions = report.suggested.length;
  }
  if (enoughFrom !== null) state[SUBMITTERS] = report.submitters.length;
  return { days: [...days.values()], state, withheld: [...new Set(withheld)] };
}
