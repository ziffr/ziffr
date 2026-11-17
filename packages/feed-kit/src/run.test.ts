// The feed kit with a pretend Ziffr (spec 0012, ticket #161): which periods a run fetches, what it sends, dry runs,
// failing fetches, idempotency keys and the period arithmetic. The same against the real app is in test/.
import { describe, expect, it, vi } from "vitest";
import type { FeedItem, FeedItemResult, FeedMetric } from "@ziffr/sdk";
import { defineFeed, periodEnd, periodStart, recentPeriods, runFeed, shiftPeriod, summary, type FetchContext } from "./index";
import { parseArgs } from "./cli";

const metric = (over: Partial<FeedMetric> = {}): FeedMetric => ({ slug: "revenue", name: "Revenue", period: "month", unit: "EUR", format: "currency", decimals: 0, current: "2026-11-01", due_working_days: null, filled: [], ...over });

/** A pretend Ziffr: lists these Metrics, records every item, and replays a key it has seen. */
function fakeZiffr(metrics: FeedMetric[]) {
  const seen = new Map<string, FeedItemResult[]>();
  const sent: { items: FeedItem[]; key?: string }[] = [];
  return {
    sent,
    feed: {
      async *metrics() { yield* metrics; },
      submit: vi.fn(async (items: FeedItem[], o: { idempotencyKey?: string } = {}) => {
        if (o.idempotencyKey && seen.has(o.idempotencyKey)) return { results: seen.get(o.idempotencyKey)!, replayed: true };
        sent.push({ items, key: o.idempotencyKey });
        const results = items.map((i) => ({ metric: i.metric, period: i.period ?? null, status: "recorded" as const, imported: i.period !== "2026-11-01", detail: "Recorded." }));
        if (o.idempotencyKey) seen.set(o.idempotencyKey, results);
        return { results, replayed: false };
      }),
    },
  };
}

describe("periods", () => {
  it("step by calendar months, weeks and days, the same in every time zone", () => {
    expect(shiftPeriod("2026-01-01", "month", -2)).toBe("2025-11-01");
    expect(shiftPeriod("2026-11-30", "week", 1)).toBe("2026-12-07");
    expect(shiftPeriod("2024-03-01", "day", -1)).toBe("2024-02-29");
    expect(periodEnd("2026-12-01", "month")).toBe("2027-01-01");
    expect(recentPeriods("2026-11-01", "month", 2)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(() => shiftPeriod("Nov", "month", 1)).toThrow();
  });
  it("step by quarters and years, which start from the workspace's year start", () => {
    expect(shiftPeriod("2026-01-01", "quarter", -1)).toBe("2025-10-01");
    expect(periodEnd("2026-04-01", "year")).toBe("2027-04-01");
    expect(recentPeriods("2026-07-01", "quarter", 2)).toEqual(["2026-01-01", "2026-04-01", "2026-07-01"]);
    expect(periodStart("2026-11-17", "quarter")).toBe("2026-10-01");
    expect(periodStart("2026-11-17", "quarter", 2)).toBe("2026-11-01");
    expect(periodStart("2026-02-10", "year", 4)).toBe("2025-04-01");
    expect(periodStart("2026-11-17", "year")).toBe("2026-01-01");
    expect(periodStart("2026-11-19", "week")).toBe("2026-11-16");
    expect(periodStart("2026-11-19", "month")).toBe("2026-11-01");
  });
});

describe("runFeed", () => {
  it("fetches a quarterly Metric's quarters, each to the day after its last", async () => {
    const ziffr = fakeZiffr([metric({ period: "quarter", current: "2026-10-01", filled: [] })]);
    const fetch = vi.fn(async (ctx: FetchContext) => (ctx.current ? 8 : 7));
    await runFeed(defineFeed({ name: "Board", metrics: { revenue: { fetch } } }), { client: ziffr, backfill: 1 });
    expect(fetch.mock.calls.map(([c]) => [c.period, c.periodEnd, c.current])).toEqual([["2026-07-01", "2026-10-01", false], ["2026-10-01", "2027-01-01", true]]);
  });
  it("fetches the current period and the empty ones before it, and sends them", async () => {
    const ziffr = fakeZiffr([metric({ filled: ["2026-09-01"] })]);
    const fetch = vi.fn(async ({ period }: FetchContext) => (period === "2026-10-01" ? { value: 10, breakdown: [{ label: "EMEA", value: 10 }] } : 20));
    const report = await runFeed(defineFeed({ name: "CRM", metrics: { revenue: { fetch } } }), { client: ziffr, backfill: 2 });
    expect(fetch.mock.calls.map(([c]) => [c.period, c.periodEnd, c.current])).toEqual([["2026-10-01", "2026-11-01", false], ["2026-11-01", "2026-12-01", true]]);
    // Past periods in one batch, the current value in one of its own, so a repeated run replays it.
    expect(ziffr.sent.map((s) => s.items)).toEqual([[{ metric: "revenue", period: "2026-10-01", value: 10, breakdown: [{ label: "EMEA", value: 10 }] }], [{ metric: "revenue", period: "2026-11-01", value: 20 }]]);
    expect(report.counts).toEqual({ recorded: 1, imported: 1, awaitingApproval: 0, locked: 0, refused: 0 });
    expect(summary(report)).toMatch(/^CRM: sent 2 values: 1 recorded, 1 imported/);
  });
  it("sends nothing on a dry run, and nothing new on a repeated run with the same values", async () => {
    const ziffr = fakeZiffr([metric()]);
    const feed = defineFeed({ name: "CRM", metrics: { revenue: { fetch: () => 5 } } });
    const dry = await runFeed(feed, { client: ziffr, dryRun: true });
    expect(dry.items).toHaveLength(1);
    expect(ziffr.feed.submit).not.toHaveBeenCalled();
    await runFeed(feed, { client: ziffr });
    const again = await runFeed(feed, { client: ziffr });
    expect(ziffr.sent).toHaveLength(1);
    expect(again.results).toHaveLength(1);
    await runFeed(defineFeed({ name: "CRM", metrics: { revenue: { fetch: () => 6 } } }), { client: ziffr });
    expect(ziffr.sent).toHaveLength(2);
    expect(ziffr.sent[0].key).not.toBe(ziffr.sent[1].key);
  });
  it("reports a failing fetch, a period without a value and a Metric Ziffr does not list, and stops nothing", async () => {
    const ziffr = fakeZiffr([metric(), metric({ slug: "deals", period: "week", current: "2026-11-09" })]);
    const report = await runFeed(defineFeed({ name: "CRM", metrics: {
      revenue: { fetch: () => { throw new Error("CRM is down"); } },
      deals: { fetch: () => null },
      leads: { fetch: () => 1 },
    } }), { client: ziffr });
    expect(report.failed).toEqual([{ metric: "revenue", period: "2026-11-01", error: "CRM is down" }]);
    expect(report.skipped).toEqual([{ metric: "deals", period: "2026-11-09" }]);
    expect(report.unknown).toEqual(["leads"]);
    expect(report.items).toEqual([]);
  });
  it("refuses a value that is not a number, and a Feed without a name or Metrics", async () => {
    const ziffr = fakeZiffr([metric()]);
    const report = await runFeed(defineFeed({ name: "CRM", metrics: { revenue: { fetch: () => ({ value: Number.NaN }) } } }), { client: ziffr });
    expect(report.failed[0].error).toMatch(/not a number/);
    expect(() => defineFeed({ name: "", metrics: { revenue: { fetch: () => 1 } } })).toThrow();
    expect(() => defineFeed({ name: "CRM", metrics: {} })).toThrow();
    expect(() => defineFeed({ name: "CRM", metrics: { "Not A Slug": { fetch: () => 1 } } })).toThrow();
  });
  it("sends more than 500 past values in batches of 500, and the current value alone", async () => {
    const ziffr = fakeZiffr([metric({ period: "day", current: "2026-11-15" })]);
    await runFeed(defineFeed({ name: "CRM", metrics: { revenue: { fetch: () => 1 } } }), { client: ziffr, backfill: 700 });
    expect(ziffr.sent.map((s) => s.items.length)).toEqual([500, 200, 1]);
  });
});

describe("the ziffr-feed command", () => {
  it("reads run, a file and its options, and refuses anything else", () => {
    expect(parseArgs(["run", "feed.mjs", "--backfill", "12", "--dry-run"])).toEqual({ file: "feed.mjs", backfill: 12, dryRun: true, json: false });
    expect(() => parseArgs(["go", "feed.mjs"])).toThrow(/Usage/);
    expect(() => parseArgs(["run", "feed.mjs", "--backfill", "-1"])).toThrow();
    expect(() => parseArgs(["run", "feed.mjs", "--fast"])).toThrow(/Unknown option/);
  });
});
