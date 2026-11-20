// The Usage Feed against the local database and the running app (spec 0031, ticket #366): it reads the endpoint with a
// real Usage Key and records the figures in a Workspace with a real Feed Key; a figure the endpoint leaves out gets no
// value; a wrong key reads nothing.
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@ziffr/core/db";
import { addFeedToMetric, createFeed, createFeedKey } from "@ziffr/core/feeds";
import { makeUsageKey, USAGE_FIGURES } from "@ziffr/core/installation-usage";
import { installationAdmin, valuesOf, workspace } from "@ziffr/core/test/db-fixtures";
import { runFeed } from "@ziffr/feed-kit";
import { EVENT_FIGURES, STATE_FIGURES, readUsage, slugOf, usageFeed } from "../src/index";

const URL = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("@ziffr/feed-usage", () => {
  it("knows exactly the figures the endpoint can return", () => {
    expect([...STATE_FIGURES, ...EVENT_FIGURES].sort()).toEqual([...USAGE_FIGURES].sort());
  });

  it("reads the endpoint with a Usage Key and records the figures with a Feed Key", async () => {
    const a = await installationAdmin(); cleanups.push(a.cleanup);
    const { secret: usageKey } = await makeUsageKey(a.actor);

    // Yesterday's row, put back as it was afterwards (the rollup may have written a real one in this database).
    const yesterday = inDays(-1);
    const before = (await db().from("installation_usage_daily").select("figures").eq("day", yesterday).maybeSingle()).data;
    cleanups.push(async () => {
      if (before) await db().from("installation_usage_daily").update({ figures: before.figures }).eq("day", yesterday);
      else await db().from("installation_usage_daily").delete().eq("day", yesterday);
    });
    // One Workspace behind the totals: the small-number rule leaves the splits out, so `values_email` is absent.
    await db().from("installation_usage_daily").upsert({ day: yesterday, figures: { workspaces: 1, signups: 3, people: 5, values_email: 9, values_email_ws: 1 } });

    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const signups = await w.metric(sara, { name: "Signups", slug: slugOf("signups"), period: "day" });
    const people = await w.metric(sara, { name: "People", slug: slugOf("people"), period: "day" });
    const email = await w.metric(sara, { name: "Values by email", slug: slugOf("values_email"), period: "day" });
    const { id: feedId } = await createFeed(w.actor(sara), "Ziffr usage");
    for (const m of [signups, people, email]) await addFeedToMetric(w.actor(sara), m.id, feedId);
    const { secret: feedKey } = await createFeedKey(w.actor(sara), feedId, { name: "Usage", expiresOn: inDays(30) });

    const rows = await readUsage({ sourceUrl: URL, usageKey });
    expect(rows.find((r) => r.day === yesterday)).toMatchObject({ signups: 3, people: 5, workspaces: 1 });
    const report = await runFeed(usageFeed(async () => rows), { url: URL, feedKey, backfill: 3 });

    expect(report.failed).toEqual([]);
    expect(report.counts.refused).toBe(0);
    expect(await valuesOf(signups.id)).toMatchObject([{ value: 3, submitter_id: feedId }]);
    expect(await valuesOf(people.id)).toMatchObject([{ value: 5, submitter_id: feedId }]);
    // Withheld by the endpoint, so absent: no value, not a zero.
    expect(await valuesOf(email.id)).toEqual([]);

    // A second run records nothing twice.
    await runFeed(usageFeed(async () => rows), { url: URL, feedKey, backfill: 3 });
    expect(await valuesOf(signups.id)).toHaveLength(1);
  });

  it("reads nothing with a key the Installation does not know", async () => {
    await expect(readUsage({ sourceUrl: URL, usageKey: "zu_000000_wrong" })).rejects.toThrow(/did not accept the Usage Key/);
  });
});
