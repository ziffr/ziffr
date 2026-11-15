// The SQL Feed against the local Postgres and the running app (spec 0012, ticket #162): one query runs read-only
// against a real database, and its value is recorded in Ziffr.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { addFeedToMetric, createFeed, createFeedKey } from "@ziffr/core/feeds";
import { valuesOf, workspace } from "@ziffr/core/test/db-fixtures";
import { runFeed } from "@ziffr/feed-kit";
import { connect, sqlFeed } from "../src/index";

const URL = process.env.ZIFFR_TEST_URL ?? "http://localhost:3000";
// The local Supabase's database; its password is a fixed development value, not a secret.
const PG = process.env.FEED_SQL_TEST_URL ?? "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const c of cleanups.splice(0)) await c(); });
const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("@ziffr/feed-sql", () => {
  it("runs its query read-only against Postgres and records the value in Ziffr", async () => {
    const admin = postgres(PG, { max: 1, onnotice: () => {} });
    const table = `feed_sql_test_${randomUUID().slice(0, 8)}`;
    cleanups.push(async () => { await admin.unsafe(`drop table if exists ${table}`); await admin.end(); });
    await admin.unsafe(`create table ${table} (paid_at date, amount numeric, country text)`);
    const today = new Date().toISOString().slice(0, 10);
    await admin.unsafe(`insert into ${table} values ($1, 70, 'DE'), ($1, 30, 'FR'), ('2001-01-01', 999, 'DE')`, [today]);

    const w = await workspace(); cleanups.push(w.cleanup);
    const sara = await w.person("owner");
    const m = await w.metric(sara, { name: "Revenue", period: "day" });
    const { id: feedId } = await createFeed(w.actor(sara), "Warehouse");
    await addFeedToMetric(w.actor(sara), m.id, feedId);
    const { secret } = await createFeedKey(w.actor(sara), feedId, { name: "SQL", expiresOn: inDays(30) });

    const db = connect(PG, 5000);
    cleanups.push(() => db.close());
    const feed = sqlFeed({ name: "Warehouse", metrics: { [m.slug]: {
      value: `select sum(amount) from ${table} where paid_at >= :period_start::date and paid_at < :period_end::date`,
      breakdown: `select country, sum(amount) from ${table} where paid_at >= :period_start::date and paid_at < :period_end::date group by 1 order by 1`,
    } } }, db);
    const report = await runFeed(feed, { url: URL, feedKey: secret });
    expect(report.failed).toEqual([]);
    expect(report.counts.recorded).toBe(1);
    expect(await valuesOf(m.id)).toMatchObject([{ value: 100, submitter_id: feedId }]);
    // Read-only, whatever the query says.
    await expect(db.query(`insert into ${table} values ($1, 1, 'XX')`, [today])).rejects.toThrow(/read-only/);
  });
});
