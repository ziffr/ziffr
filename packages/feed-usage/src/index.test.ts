// The Usage Feed with a pretend endpoint and a pretend Ziffr (spec 0031, ticket #366): events are summed and states
// taken at the period's end, absent figures are absent and never zero, the settings turn it off, a failing endpoint
// fails loudly. The same against the real app is in test/.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runFeed, type FeedItem, type FeedMetric } from "@ziffr/feed-kit";
import { EVENT_FIGURES, STATE_FIGURES, WORKSPACE_EVENT_FIGURES, WORKSPACE_STATE_FIGURES, figureForPeriod, readUsage, readWorkspaceUsage, settingsFrom, slugOf, usageFeed, workspaceSettingsFrom, type Fetcher, type UsageRow } from "./index";

const rows: UsageRow[] = [
  { day: "2026-10-30", signups: 1, people: 10 },
  { day: "2026-11-01", signups: 2, people: 11, api_calls: 5 },
  { day: "2026-11-02", signups: 0, people: 12 },
  { day: "2026-11-03", signups: 4, people: 13, values_web: 0 },
];

const metric = (slug: string, over: Partial<FeedMetric> = {}): FeedMetric => ({ slug, name: slug, period: "month", unit: "", format: "number", decimals: 0, current: "2026-11-01", due_working_days: null, filled: [], ...over });
function fakeZiffr(metrics: FeedMetric[]) {
  const sent: FeedItem[] = [];
  return {
    sent,
    feed: {
      async *metrics() { yield* metrics; },
      submit: vi.fn(async (items: FeedItem[]) => {
        sent.push(...items);
        return { results: items.map((i) => ({ metric: i.metric, period: i.period ?? null, status: "recorded" as const, detail: "Recorded." })), replayed: false };
      }),
    },
  };
}

describe("figureForPeriod", () => {
  it("sums events over the period and takes the last day of a state", () => {
    expect(figureForPeriod(rows, "signups", "event", "2026-11-01", "2026-12-01")).toBe(6);
    expect(figureForPeriod(rows, "people", "state", "2026-11-01", "2026-12-01")).toBe(13);
    expect(figureForPeriod(rows, "people", "state", "2026-10-01", "2026-11-01")).toBe(10);
  });
  it("keeps a real zero and treats a missing figure as absent, never zero", () => {
    expect(figureForPeriod(rows, "values_web", "event", "2026-11-01", "2026-12-01")).toBe(0);
    expect(figureForPeriod(rows, "values_email", "event", "2026-11-01", "2026-12-01")).toBeNull();
    expect(figureForPeriod(rows, "people", "state", "2026-09-01", "2026-10-01")).toBeNull();
    expect(figureForPeriod([{ day: "2026-11-01", signups: "3" }, { day: "2026-11-02", signups: null }], "signups", "event", "2026-11-01", "2026-12-01")).toBeNull();
  });
});

describe("the Usage Feed", () => {
  it("has one hyphenated slug per figure, none twice", () => {
    const slugs = Object.keys(usageFeed(async () => []).metrics);
    expect(slugs).toHaveLength(new Set(slugs).size);
    expect(slugs).toHaveLength(STATE_FIGURES.length + EVENT_FIGURES.length);
    expect(slugs).toContain("people-active-7d");
    expect(slugOf("values_feed")).toBe("values-feed");
  });

  it("sends sums and end-of-day figures, and nothing for what is absent", async () => {
    const ziffr = fakeZiffr([metric("signups"), metric("people"), metric("values-email"), metric("api-calls", { filled: [] })]);
    const read = vi.fn(async () => rows);
    const report = await runFeed(usageFeed(read), { client: ziffr, backfill: 1 });
    // One read for the whole run, not one per figure.
    expect(read).toHaveBeenCalledTimes(1);
    expect(ziffr.sent).toEqual(expect.arrayContaining([
      { metric: "signups", period: "2026-11-01", value: 6 },
      { metric: "signups", period: "2026-10-01", value: 1 },
      { metric: "people", period: "2026-11-01", value: 13 },
      { metric: "people", period: "2026-10-01", value: 10 },
      { metric: "api-calls", period: "2026-11-01", value: 5 },
    ]));
    expect(ziffr.sent.some((i) => i.metric === "values-email")).toBe(false);
    expect(report.skipped.some((s) => s.metric === "values-email")).toBe(true);
    expect(report.failed).toEqual([]);
  });

  it("skips past periods that are already filled, so a run is safe to repeat and backfills only the gaps", async () => {
    const ziffr = fakeZiffr([metric("signups", { filled: ["2026-10-01"] })]);
    await runFeed(usageFeed(async () => rows), { client: ziffr, backfill: 1 });
    expect(ziffr.sent).toEqual([{ metric: "signups", period: "2026-11-01", value: 6 }]);
  });

  it("reports every figure as failed when the endpoint fails, and sends nothing", async () => {
    const ziffr = fakeZiffr([metric("signups"), metric("people")]);
    const report = await runFeed(usageFeed(async () => { throw new Error("The usage endpoint answered 500."); }), { client: ziffr });
    expect(ziffr.sent).toEqual([]);
    expect(report.failed).toHaveLength(2);
  });
});

describe("readUsage", () => {
  const ok = (body: unknown, status = 200): Fetcher => async () => ({ ok: status < 300, status, json: async () => body });

  it("asks once for the 400 days up to yesterday, with the Usage Key, and nothing else", async () => {
    const calls: { url: string; auth: string }[] = [];
    const fetcher: Fetcher = async (url, init) => { calls.push({ url, auth: init.headers.authorization }); return { ok: true, status: 200, json: async () => ({ days: rows }) }; };
    const got = await readUsage({ sourceUrl: "https://ziffr.example.com/", usageKey: "zu_secret" }, { now: new Date("2026-11-20T05:00:00Z"), fetcher });
    expect(got).toEqual(rows);
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://ziffr.example.com/api/v1/installation/usage");
    expect(url.searchParams.get("to")).toBe("2026-11-19");
    expect(url.searchParams.get("from")).toBe("2025-10-16");
    expect(calls[0].auth).toBe("Bearer zu_secret");
  });
  it("fails with a plain message for a key that is not accepted, a limit and any other answer", async () => {
    const s = { sourceUrl: "https://ziffr.example.com", usageKey: "k" };
    await expect(readUsage(s, { fetcher: ok(null, 404) })).rejects.toThrow(/did not accept the Usage Key/);
    await expect(readUsage(s, { fetcher: ok(null, 429) })).rejects.toThrow(/60 calls an hour/);
    await expect(readUsage(s, { fetcher: ok(null, 500) })).rejects.toThrow(/answered 500/);
    await expect(readUsage(s, { fetcher: ok({ nope: 1 }) })).rejects.toThrow(/no `days`/);
  });
  it("ignores rows without a day", async () => {
    expect(await readUsage({ sourceUrl: "https://z.example.com", usageKey: "k" }, { fetcher: ok({ days: [{ day: "2026-11-01", people: 1 }, { people: 2 }, null] }) })).toEqual([{ day: "2026-11-01", people: 1 }]);
  });
});

describe("settingsFrom", () => {
  it("is off unless both keys are set", () => {
    expect(settingsFrom({})).toBeNull();
    expect(settingsFrom({ ZIFFR_USAGE_KEY: "a", ZIFFR_APP_URL: "http://app:3000" })).toBeNull();
    expect(settingsFrom({ ZIFFR_USAGE_FEED_KEY: "b", ZIFFR_APP_URL: "http://app:3000" })).toBeNull();
    expect(settingsFrom({ ZIFFR_USAGE_KEY: " ", ZIFFR_USAGE_FEED_KEY: "b", ZIFFR_APP_URL: "http://app:3000" })).toBeNull();
  });
  it("reads from the source and sends to the same Installation unless told otherwise", () => {
    expect(settingsFrom({ ZIFFR_USAGE_KEY: "a", ZIFFR_USAGE_FEED_KEY: "b", ZIFFR_APP_URL: "http://app:3000" })).toEqual({ sourceUrl: "http://app:3000", usageKey: "a", feedUrl: "http://app:3000", feedKey: "b" });
    expect(settingsFrom({ ZIFFR_USAGE_KEY: "a", ZIFFR_USAGE_FEED_KEY: "b", ZIFFR_USAGE_SOURCE_URL: "https://mine.example.com", ZIFFR_USAGE_FEED_URL: "https://hosted.example.com" })).toMatchObject({ sourceUrl: "https://mine.example.com", feedUrl: "https://hosted.example.com" });
  });
  it("says what is missing when the keys are set but no Installation is named", () => {
    expect(() => settingsFrom({ ZIFFR_USAGE_KEY: "a", ZIFFR_USAGE_FEED_KEY: "b" })).toThrow(/ZIFFR_USAGE_SOURCE_URL/);
  });
});

describe("the Ziffr operations Pack", () => {
  it("holds one Metric Catalog entry for every figure, whose Metric slug is the figure's, with the period and Aggregation the Feed sums or takes the last by", () => {
    const pack = JSON.parse(readFileSync(new URL("../../../packs/ziffr-operations.pack.json", import.meta.url), "utf8")) as { contents: { metrics: { metric: { name: string; period: string; aggregation: string } }[] } };
    const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const entries = pack.contents.metrics.map((m) => ({ slug: slugify(m.metric.name), ...m.metric }));
    expect(entries.map((e) => e.slug).sort()).toEqual([...STATE_FIGURES, ...EVENT_FIGURES].map(slugOf).sort());
    expect(entries.every((e) => e.period === "day")).toBe(true);
    for (const f of STATE_FIGURES) expect(entries.find((e) => e.slug === slugOf(f))!.aggregation).toBe("last");
    for (const f of EVENT_FIGURES) expect(entries.find((e) => e.slug === slugOf(f))!.aggregation).toBe("sum");
  });
});

describe("the Workspace mode (--workspace)", () => {
  const ok = (body: unknown, status = 200): Fetcher => async () => ({ ok: status < 300, status, json: async () => body });

  it("is off unless both keys are set, and sends to the Installation that holds the Workspace", () => {
    expect(workspaceSettingsFrom({})).toBeNull();
    expect(workspaceSettingsFrom({ ZIFFR_USAGE_ACCESS_KEY: "a", ZIFFR_APP_URL: "http://app:3000" })).toBeNull();
    expect(workspaceSettingsFrom({ ZIFFR_USAGE_FEED_KEY: "b", ZIFFR_APP_URL: "http://app:3000" })).toBeNull();
    expect(workspaceSettingsFrom({ ZIFFR_USAGE_ACCESS_KEY: "a", ZIFFR_USAGE_FEED_KEY: "b", ZIFFR_APP_URL: "http://app:3000" })).toEqual({ url: "http://app:3000", accessKey: "a", feedKey: "b" });
    expect(workspaceSettingsFrom({ ZIFFR_USAGE_ACCESS_KEY: "a", ZIFFR_USAGE_FEED_KEY: "b", ZIFFR_USAGE_SOURCE_URL: "https://s.example.com", ZIFFR_USAGE_FEED_URL: "https://f.example.com" })?.url).toBe("https://f.example.com");
    expect(workspaceSettingsFrom({ ZIFFR_USAGE_ACCESS_KEY: "a", ZIFFR_USAGE_FEED_KEY: "b", ZIFFR_USAGE_SOURCE_URL: "https://s.example.com" })?.url).toBe("https://s.example.com");
    expect(() => workspaceSettingsFrom({ ZIFFR_USAGE_ACCESS_KEY: "a", ZIFFR_USAGE_FEED_KEY: "b" })).toThrow(/ZIFFR_USAGE_FEED_URL/);
  });

  it("asks /api/v1/usage once, with the Access Key, and puts the state on the day the answer names", async () => {
    const calls: { url: string; auth: string }[] = [];
    const fetcher: Fetcher = async (url, init) => { calls.push({ url, auth: init.headers.authorization }); return { ok: true, status: 200, json: async () => ({ days: [{ day: "2026-11-19", workspace_values: 4 }, { day: "bad" , x: 1}, null], state: { day: "2026-11-19", workspace_metrics: 12 }, withheld: [] }) }; };
    const got = await readWorkspaceUsage({ url: "https://ziffr.example.com", accessKey: "zk_x" }, { now: new Date("2026-11-20T05:00:00Z"), fetcher });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0].url).pathname).toBe("/api/v1/usage");
    expect(calls[0].auth).toBe("Bearer zk_x");
    expect(got.find((r) => r.day === "2026-11-19")).toEqual({ day: "2026-11-19", workspace_values: 4, workspace_metrics: 12 });
  });
  it("adds a row for the state's day when the days have none, and ignores a missing state", async () => {
    const s = { url: "https://z.example.com", accessKey: "k" };
    expect(await readWorkspaceUsage(s, { fetcher: ok({ days: [], state: { day: "2026-11-19", workspace_metrics: 3 } }) })).toEqual([{ day: "2026-11-19", workspace_metrics: 3 }]);
    expect(await readWorkspaceUsage(s, { fetcher: ok({ days: [{ day: "2026-11-19", workspace_values: 1 }] }) })).toEqual([{ day: "2026-11-19", workspace_values: 1 }]);
    expect(await readWorkspaceUsage(s, { fetcher: ok({ days: [], state: { workspace_metrics: 3 } }) })).toEqual([]);
  });
  it("takes only the listed state figures from the answer, never a key it makes up", async () => {
    const got = await readWorkspaceUsage({ url: "https://z.example.com", accessKey: "k" }, { fetcher: ok({ days: [], state: { day: "2026-11-19", workspace_metrics: 3, workspace_secret: 9, __proto__: { x: 1 } } }) });
    expect(got).toEqual([{ day: "2026-11-19", workspace_metrics: 3 }]);
  });
  it("fails in plain words for a key that is not accepted, one without the scope or the role, and a limit", async () => {
    const s = { url: "https://z.example.com", accessKey: "k" };
    await expect(readWorkspaceUsage(s, { fetcher: ok(null, 401) })).rejects.toThrow(/did not accept the Access Key/);
    await expect(readWorkspaceUsage(s, { fetcher: ok(null, 403) })).rejects.toThrow(/Owner or Admin/);
    await expect(readWorkspaceUsage(s, { fetcher: ok(null, 429) })).rejects.toThrow(/over its limit; the next run/);
    await expect(readUsage({ sourceUrl: "https://z.example.com", usageKey: "k" }, { fetcher: ok(null, 401) })).rejects.toThrow(/answered 401/);
  });

  it("has one slug per figure, sums events and takes the last state, and leaves a withheld figure absent", async () => {
    const slugs = Object.keys(usageFeed(async () => [], "workspace").metrics);
    expect(slugs).toHaveLength(WORKSPACE_STATE_FIGURES.length + WORKSPACE_EVENT_FIGURES.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    const ziffr = fakeZiffr([metric("workspace-views-metrics"), metric("workspace-metrics"), metric("workspace-values-web")]);
    await runFeed(usageFeed(async () => [{ day: "2026-11-01", workspace_views_metrics: 2 }, { day: "2026-11-02", workspace_views_metrics: 3, workspace_metrics: 9 }], "workspace"), { client: ziffr });
    expect(ziffr.sent).toEqual(expect.arrayContaining([{ metric: "workspace-views-metrics", period: "2026-11-01", value: 5 }, { metric: "workspace-metrics", period: "2026-11-01", value: 9 }]));
    expect(ziffr.sent.some((i) => i.metric === "workspace-values-web")).toBe(false);
  });

  it("is tied to the Workspace usage Pack: one entry per figure, daily, summed or last", () => {
    const pack = JSON.parse(readFileSync(new URL("../../../packs/workspace-usage.pack.json", import.meta.url), "utf8")) as { contents: { metrics: { metric: { name: string; period: string; aggregation: string } }[] } };
    const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const entries = pack.contents.metrics.map((m) => ({ slug: slugify(m.metric.name), ...m.metric }));
    expect(entries.map((e) => e.slug).sort()).toEqual([...WORKSPACE_STATE_FIGURES, ...WORKSPACE_EVENT_FIGURES].map(slugOf).sort());
    expect(entries.every((e) => e.period === "day")).toBe(true);
    for (const f of WORKSPACE_STATE_FIGURES) expect(entries.find((e) => e.slug === slugOf(f))!.aggregation).toBe("last");
    for (const f of WORKSPACE_EVENT_FIGURES) expect(entries.find((e) => e.slug === slugOf(f))!.aggregation).toBe("sum");
  });
});
