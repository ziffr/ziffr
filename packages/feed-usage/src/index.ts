// The Usage Feed (spec 0031, GLOSSARY: Usage Feed, Usage Key, Feed): a Feed built on @ziffr/feed-kit whose Metrics are
// the Installation's daily Usage figures. It reads `GET /api/v1/installation/usage` of the Installation to look at,
// with a Usage Key, and the kit sends each period's figure with a Feed Key to the operator's own Workspace, which may
// be on another Installation. Event figures are summed over the period, end-of-day figures take the period's last
// day; a figure the endpoint leaves out (withheld, or the day has none) is absent, never zero. No state, no other
// outgoing request.
import { defineFeed, type FeedDefinition, type MetricSource } from "@ziffr/feed-kit";

/** Figures counted "in a state", taken at the end of the UTC day; a period's value is its last day's. */
export const STATE_FIGURES = [
  "workspaces", "workspaces_trial", "workspaces_free", "workspaces_paid",
  "people", "people_active_7d", "workspaces_active_7d",
  "metrics", "metrics_archived", "dashboards", "widgets", "decks", "workflows", "feeds", "packs_installed",
] as const;

/** Figures counting "events" in the UTC day; a period's value is the sum of its days. */
export const EVENT_FIGURES = [
  "workspaces_created", "trials_started", "trials_kept", "trials_closed", "sizes_booked", "workspaces_deleted", "signups",
  "values_web", "values_email", "values_slack", "values_telegram", "values_api", "values_feed", "values_mcp", "values_derived",
  "api_calls", "feed_calls", "mcp_calls", "emails_sent", "views_dashboards", "views_decks", "views_metrics",
] as const;

/** The Metric slug of a figure: its name with hyphens, such as `people-active-7d`. */
export function slugOf(figure: string): string {
  return figure.replace(/_/g, "-");
}

/** Where the Feed reads and where it sends. */
export type UsageSettings = {
  /** The Installation to read (ZIFFR_USAGE_SOURCE_URL, else ZIFFR_APP_URL). */
  sourceUrl: string;
  /** A Usage Key (ZIFFR_USAGE_KEY). */
  usageKey: string;
  /** The Installation that holds the operator's Workspace (ZIFFR_USAGE_FEED_URL, else the source). */
  feedUrl: string;
  /** The Feed Key of the Feed in that Workspace (ZIFFR_USAGE_FEED_KEY). */
  feedKey: string;
};

/** The settings from an environment, or null while either key is missing: then the Feed is off and does nothing. */
export function settingsFrom(vars: Record<string, string | undefined>): UsageSettings | null {
  const given = (k: string) => (vars[k] ?? "").trim();
  const usageKey = given("ZIFFR_USAGE_KEY");
  const feedKey = given("ZIFFR_USAGE_FEED_KEY");
  if (!usageKey || !feedKey) return null;
  const sourceUrl = given("ZIFFR_USAGE_SOURCE_URL") || given("ZIFFR_APP_URL");
  if (!sourceUrl) throw new Error("Set ZIFFR_USAGE_SOURCE_URL (or ZIFFR_APP_URL) to the Installation whose figures are read.");
  return { sourceUrl, usageKey, feedUrl: given("ZIFFR_USAGE_FEED_URL") || sourceUrl, feedKey };
}

/** One day of the endpoint's answer: `day` and whole numbers by figure. Anything else is ignored. */
export type UsageRow = { day: string } & Record<string, unknown>;

/** How the endpoint is called: a fetch, so tests can stand in for Ziffr. */
export type Fetcher = (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** The longest range the endpoint answers (400 days), so one call covers every period a run can ask for. */
const WINDOW_DAYS = 400;

/** Reads the endpoint once: yesterday and the 399 days before it. The endpoint allows 60 calls an hour, so a run makes
 * one call, not one per Metric and period. */
export async function readUsage(settings: Pick<UsageSettings, "sourceUrl" | "usageKey">, options: { now?: Date; fetcher?: Fetcher } = {}): Promise<UsageRow[]> {
  const yesterday = addDays((options.now ?? new Date()).toISOString().slice(0, 10), -1);
  const url = new URL("/api/v1/installation/usage", settings.sourceUrl);
  url.searchParams.set("from", addDays(yesterday, -(WINDOW_DAYS - 1)));
  url.searchParams.set("to", yesterday);
  const call = options.fetcher ?? ((u, init) => fetch(u, init));
  const res = await call(url.toString(), { headers: { authorization: `Bearer ${settings.usageKey}`, accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  // The endpoint answers 404 to a key it does not know, so it is not known to be there.
  if (res.status === 404) throw new Error("The Installation did not accept the Usage Key (404): check ZIFFR_USAGE_KEY and ZIFFR_USAGE_SOURCE_URL.");
  if (res.status === 429) throw new Error("The Usage Key is over its limit of 60 calls an hour; the next run tries again.");
  if (!res.ok) throw new Error(`The usage endpoint answered ${res.status}.`);
  const body = (await res.json()) as { days?: unknown };
  if (!Array.isArray(body?.days)) throw new Error("The usage endpoint's answer has no `days`.");
  return body.days.filter((d): d is UsageRow => Boolean(d) && typeof (d as UsageRow).day === "string");
}

/** The value of one figure for the period [from, to): null when no day in it carries the figure (never zero). Today
 * is not rolled up yet, so a running period holds the days so far. */
export function figureForPeriod(rows: UsageRow[], figure: string, kind: "event" | "state", from: string, to: string): number | null {
  const own = rows
    .filter((r) => r.day >= from && r.day < to)
    .map((r) => ({ day: r.day, n: r[figure] }))
    .filter((r): r is { day: string; n: number } => typeof r.n === "number" && Number.isFinite(r.n))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (!own.length) return null;
  return kind === "event" ? own.reduce((s, r) => s + r.n, 0) : own[own.length - 1].n;
}

/** The Feed: one Metric per figure. `read` is called at most once per run, by the first fetch. */
export function usageFeed(read: () => Promise<UsageRow[]>): FeedDefinition {
  let rows: Promise<UsageRow[]> | null = null;
  const once = () => (rows ??= read());
  const source = (figure: string, kind: "event" | "state"): MetricSource => ({
    fetch: async ({ period, periodEnd }) => figureForPeriod(await once(), figure, kind, period, periodEnd),
  });
  const metrics: Record<string, MetricSource> = {};
  for (const f of STATE_FIGURES) metrics[slugOf(f)] = source(f, "state");
  for (const f of EVENT_FIGURES) metrics[slugOf(f)] = source(f, "event");
  return defineFeed({ name: "Ziffr usage", metrics });
}
