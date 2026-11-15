// @ziffr/feed-kit (spec 0012, GLOSSARY: Feed, Feed Key, Import): the contract a Feed is written against, and the
// runner that turns it into calls to Ziffr's API. A Feed says, for each Metric slug, how to fetch one period's value
// from its system; the runner asks Ziffr which periods are current or still missing, fetches them, and records them
// in batches. It keeps no state: the periods Ziffr already has are the state, so a run is safe to repeat. Secrets for
// the other system stay where the Feed runs; nothing but values and Breakdowns is sent to Ziffr.
import { createHash } from "node:crypto";
import { FEED_BATCH_MAX, Ziffr, type BreakdownRow, type FeedItem, type FeedItemResult, type FeedMetric } from "@ziffr/sdk";
import { periodEnd, recentPeriods, type Period } from "./periods.js";

export { periodEnd, recentPeriods, shiftPeriod, type Period } from "./periods.js";
export { parseArgs, printReport, usage } from "./args.js";
export type { BreakdownRow, FeedItem, FeedItemResult, FeedMetric } from "@ziffr/sdk";

/** What a fetch is asked for: one period of one Metric. `period` is its first day, `periodEnd` the day after its last
 * (an exclusive bound), both YYYY-MM-DD. `current` says whether the period is still running. */
export type FetchContext = { slug: string; period: string; periodEnd: string; current: boolean; metric: FeedMetric };

/** What a fetch gives back: a number, a value with its Breakdown (GLOSSARY: Breakdown), or null when the other system
 * has no value for the period yet (nothing is sent). */
export type FetchResult = number | { value: number; breakdown?: BreakdownRow[] } | null | undefined;

/** How one Metric's values are fetched from the other system. */
export type MetricSource = { fetch: (ctx: FetchContext) => FetchResult | Promise<FetchResult> };

/** A Feed: a name for its reports, and a source per Metric slug. */
export type FeedDefinition = { name: string; metrics: Record<string, MetricSource> };

/** Checks a Feed's shape and returns it, typed: the one thing a Feed's file exports by default. */
export function defineFeed(feed: FeedDefinition): FeedDefinition {
  if (!feed || typeof feed.name !== "string" || !feed.name.trim()) throw new Error("A Feed needs a name.");
  if (!feed.metrics || typeof feed.metrics !== "object" || !Object.keys(feed.metrics).length) throw new Error("A Feed needs at least one Metric slug in `metrics`.");
  for (const [slug, source] of Object.entries(feed.metrics)) {
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw new Error(`"${slug}" is not a Metric slug.`);
    if (typeof source?.fetch !== "function") throw new Error(`The Metric "${slug}" needs a fetch function.`);
  }
  return feed;
}

/** The part of the SDK's client a run uses. */
export type FeedClient = { feed: Pick<Ziffr["feed"], "metrics" | "submit"> };

/** How a run goes. */
export type RunOptions = {
  /** Where Ziffr runs; defaults to ZIFFR_URL. */
  url?: string;
  /** The Feed Key; defaults to ZIFFR_FEED_KEY. */
  feedKey?: string;
  /** How many periods before the current one to fill when they have no value yet (default 0). */
  backfill?: number;
  /** Fetch and report, but send nothing to Ziffr. */
  dryRun?: boolean;
  /** Fetches running at once (default 4). */
  concurrency?: number;
  /** A client to use instead of one made from url and feedKey (tests). */
  client?: FeedClient;
  /** Where progress lines go (default: nowhere). */
  log?: (line: string) => void;
};

/** What a run did. */
export type RunReport = {
  feed: string;
  dryRun: boolean;
  /** The items sent, or that would have been sent in a dry run. */
  items: FeedItem[];
  /** Ziffr's answer per item sent (empty in a dry run). */
  results: FeedItemResult[];
  /** Periods whose fetch gave no value. */
  skipped: { metric: string; period: string }[];
  /** Periods whose fetch failed, with the error's message. */
  failed: { metric: string; period: string; error: string }[];
  /** Slugs the Feed defines that Ziffr does not list for it: not chosen as a Submitter yet, or the API Source is off. */
  unknown: string[];
  /** Counts of the results. */
  counts: { recorded: number; imported: number; awaitingApproval: number; locked: number; refused: number };
};

/** Runs a Feed once: for each of its Metrics, the current period and any of the `backfill` periods before it that
 * have no value yet are fetched and recorded. A failing fetch is reported and stops nothing else. Batches carry an
 * idempotency key made from the Feed and the values, so a repeated run with the same values records nothing twice. */
export async function runFeed(feed: FeedDefinition, options: RunOptions = {}): Promise<RunReport> {
  defineFeed(feed);
  const log = options.log ?? (() => {});
  const client = options.client ?? clientFrom(options);
  const listed = new Map<string, FeedMetric>();
  for await (const m of client.feed.metrics()) listed.set(m.slug, m);
  const unknown = Object.keys(feed.metrics).filter((s) => !listed.has(s));
  for (const s of unknown) log(`${s}: Ziffr does not list this Metric for the Feed (choose the Feed under the Metric's Settings, and keep its API Source on).`);

  // What to fetch: the current period always (its value may still change), earlier ones only while they are empty.
  const plan: FetchContext[] = [];
  for (const [slug] of Object.entries(feed.metrics)) {
    const metric = listed.get(slug);
    if (!metric) continue;
    const filled = new Set(metric.filled);
    for (const period of recentPeriods(metric.current, metric.period as Period, options.backfill ?? 0)) {
      const current = period === metric.current;
      if (!current && filled.has(period)) continue;
      plan.push({ slug, period, periodEnd: periodEnd(period, metric.period as Period), current, metric });
    }
  }

  const items: FeedItem[] = [];
  const skipped: RunReport["skipped"] = [];
  const failed: RunReport["failed"] = [];
  await inParallel(plan, Math.max(1, options.concurrency ?? 4), async (ctx) => {
    try {
      const got = toItem(ctx, await feed.metrics[ctx.slug].fetch(ctx));
      if (got) items.push(got);
      else skipped.push({ metric: ctx.slug, period: ctx.period });
    } catch (e) {
      failed.push({ metric: ctx.slug, period: ctx.period, error: (e as Error).message });
      log(`${ctx.slug} ${ctx.period}: fetch failed: ${(e as Error).message}`);
    }
  });
  // A stable order, so the same values make the same batches and the same idempotency keys.
  items.sort((a, b) => (a.metric === b.metric ? String(a.period).localeCompare(String(b.period)) : a.metric.localeCompare(b.metric)));

  const results: FeedItemResult[] = [];
  if (!options.dryRun) {
    // Past periods go in batches of their own; each Metric's current value in a batch of one. A repeated run then
    // sends the very same current batch, Ziffr replays its first answer, and a Metric that adds up values does not
    // count the same value twice.
    const isCurrent = (i: FeedItem) => i.period === listed.get(i.metric)?.current;
    const past = items.filter((i) => !isCurrent(i));
    const batches = [
      ...Array.from({ length: Math.ceil(past.length / FEED_BATCH_MAX) }, (_, n) => past.slice(n * FEED_BATCH_MAX, (n + 1) * FEED_BATCH_MAX)),
      ...items.filter(isCurrent).map((i) => [i]),
    ];
    for (const batch of batches) {
      const { results: r, replayed } = await client.feed.submit(batch, { idempotencyKey: idempotencyKey(feed.name, batch) });
      if (replayed) log(`${batch.length === 1 ? `${batch[0].metric} ${batch[0].period}` : `a batch of ${batch.length}`}: already sent with these values; nothing recorded twice.`);
      results.push(...r);
    }
  }
  for (const r of results) if (r.status === "refused" || r.status === "locked") log(`${r.metric} ${r.period ?? ""}: ${r.status}${r.code ? ` (${r.code})` : ""}: ${r.detail}`);
  const counts = {
    recorded: results.filter((r) => r.status === "recorded" && !r.imported).length,
    imported: results.filter((r) => r.imported).length,
    awaitingApproval: results.filter((r) => r.status === "awaiting_approval").length,
    locked: results.filter((r) => r.status === "locked").length,
    refused: results.filter((r) => r.status === "refused").length,
  };
  return { feed: feed.name, dryRun: Boolean(options.dryRun), items, results, skipped, failed, unknown, counts };
}

/** One sentence about a run, for a log or a cron mail. */
export function summary(report: RunReport): string {
  const c = report.counts;
  const head = report.dryRun ? `${report.feed} (dry run): would send ${report.items.length} values` : `${report.feed}: sent ${report.items.length} values: ${c.recorded} recorded, ${c.imported} imported, ${c.awaitingApproval} awaiting Approval, ${c.locked} locked, ${c.refused} refused`;
  const tail = [report.skipped.length ? `${report.skipped.length} without a value yet` : "", report.failed.length ? `${report.failed.length} fetches failed` : "", report.unknown.length ? `${report.unknown.length} Metrics not listed for the Feed` : ""].filter(Boolean);
  return `${head}${tail.length ? `; ${tail.join(", ")}` : ""}.`;
}

/** A client from the options or ZIFFR_URL and ZIFFR_FEED_KEY. */
function clientFrom(options: RunOptions): FeedClient {
  const url = options.url ?? process.env.ZIFFR_URL;
  const key = options.feedKey ?? process.env.ZIFFR_FEED_KEY;
  if (!url) throw new Error("Set ZIFFR_URL to where Ziffr runs, such as https://ziffr.example.com.");
  if (!key) throw new Error("Set ZIFFR_FEED_KEY to a Feed Key (Settings, Feeds).");
  return new Ziffr({ url, accessKey: key });
}

/** A fetch's answer as an item, or null for "no value yet". A value that is not a finite number is an error. */
function toItem(ctx: FetchContext, got: FetchResult): FeedItem | null {
  if (got === null || got === undefined) return null;
  const value = typeof got === "number" ? got : Number(got.value);
  if (!Number.isFinite(value)) throw new Error(`fetch gave ${JSON.stringify(got)}, not a number`);
  const breakdown = typeof got === "object" && Array.isArray(got.breakdown) && got.breakdown.length
    ? got.breakdown.map((r) => ({ label: String(r.label).trim().slice(0, 200), value: Number(r.value) })).filter((r) => r.label && Number.isFinite(r.value))
    : undefined;
  return { metric: ctx.slug, period: ctx.period, value, ...(breakdown?.length ? { breakdown } : {}) };
}

/** The same Feed and values always make the same key; any other value makes another. */
function idempotencyKey(feed: string, batch: FeedItem[]): string {
  return `feed-kit-${createHash("sha256").update(JSON.stringify([feed, batch])).digest("hex").slice(0, 48)}`;
}

/** Runs `work` for every item, at most `n` at once. */
async function inParallel<T>(all: T[], n: number, work: (x: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, all.length) }, async () => {
    while (next < all.length) await work(all[next++]);
  }));
}
