// The feed kit's runner against the running app and its database (spec 0012, ticket #161): a dry run records
// nothing, a second run records nothing new, and a backfill fills the empty periods before the current one.
import { afterEach, describe, expect, it } from "vitest";
import { addFeedToMetric, createFeed, createFeedKey } from "@ziffr/core/feeds";
import { periodStart } from "@ziffr/core/format";
import { valuesOf, workspace } from "@ziffr/core/test/db-fixtures";
import { defineFeed, runFeed, shiftPeriod } from "../src/index";

const URL = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("@ziffr/feed-kit against the app", () => {
  it("records nothing on a dry run, fills three missing periods, and nothing new when run again", async () => {
    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Pipeline", submission_rule: "add" });
    const { id: feedId } = await createFeed(w.actor(sara), "CRM");
    await addFeedToMetric(w.actor(sara), m.id, feedId);
    const { secret } = await createFeedKey(w.actor(sara), feedId, { name: "Runner", expiresOn: inDays(30) });
    const current = periodStart(new Date(), "month");
    await w.value(m.id, shiftPeriod(current, "month", -2), 1, sara);
    const feed = defineFeed({ name: "CRM", metrics: { [m.slug]: { fetch: ({ period }) => Number(period.slice(5, 7)) } } });
    const options = { url: URL, feedKey: secret, backfill: 4 };

    const dry = await runFeed(feed, { ...options, dryRun: true });
    expect(dry.items.map((i) => i.period)).toEqual([-4, -3, -1, 0].map((n) => shiftPeriod(current, "month", n)));
    expect(await valuesOf(m.id)).toHaveLength(1);

    const first = await runFeed(feed, options);
    expect(first.counts).toEqual({ recorded: 1, imported: 3, awaitingApproval: 0, locked: 0, refused: 0 });
    expect(await valuesOf(m.id)).toHaveLength(5);

    // The rule adds, so a second value for the current period would show; the same batch replays instead.
    const again = await runFeed(feed, options);
    expect(again.items.map((i) => i.period)).toEqual([current]);
    const { data: obs } = await (await import("@ziffr/core/db")).db().from("observations").select("period_start, value").eq("metric_id", m.id).eq("period_start", current);
    expect(obs).toEqual([{ period_start: current, value: Number(current.slice(5, 7)) }]);
  });
});
