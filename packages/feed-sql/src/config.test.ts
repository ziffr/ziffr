// The SQL Feed's settings and queries without a database (spec 0012, ticket #162): what a file must say, which
// parameters a query may use, and how they are bound.
import { describe, expect, it } from "vitest";
import { bind, checkConfig, sqlFeed, type SqlRunner } from "./index";

const ok = { name: "Warehouse", connection_env: "WAREHOUSE_URL", metrics: { revenue: { value: "select sum(amount) from orders where paid_at >= :period_start and paid_at < :period_end" } } };

describe("checkConfig", () => {
  it("takes a name, a variable for the connection and a value query per slug", () => {
    expect(checkConfig(ok)).toEqual(ok);
  });
  it("refuses a connection string in the file, an unknown parameter and a Metric without a query", () => {
    expect(() => checkConfig({ ...ok, connection_env: "postgres://user:secret@db/x" })).toThrow(/environment variable/);
    expect(() => checkConfig({ ...ok, metrics: { revenue: { value: "select 1 where x = :country" } } })).toThrow(/:country/);
    expect(() => checkConfig({ ...ok, metrics: { revenue: {} } })).toThrow(/value query/);
    expect(() => checkConfig({ ...ok, name: "" })).toThrow(/name/);
  });
});

describe("bind", () => {
  it("turns the two parameters into $1 and $2 and leaves casts alone", () => {
    expect(bind("select :period_start::date, x::int where d < :period_end")).toBe("select $1::date, x::int where d < $2");
  });
});

describe("sqlFeed", () => {
  it("reads the first column as the value, rows as the Breakdown, and no row as no value yet", async () => {
    const calls: [string, string[]][] = [];
    const db: SqlRunner = {
      query: async (text, params) => {
        calls.push([text, params]);
        if (params[0] === "2026-10-01") return [];
        return text.includes("group by") ? [{ country: "DE", total: "7" }, { country: "FR", total: 3 }] : [{ sum: "10" }];
      },
      close: async () => {},
    };
    const feed = sqlFeed({ ...ok, metrics: { revenue: { ...ok.metrics.revenue, breakdown: "select country, sum(amount) from orders where paid_at >= :period_start group by 1" } } }, db);
    const ctx = (period: string) => ({ slug: "revenue", period, periodEnd: "2026-12-01", current: true, metric: {} as never });
    expect(await feed.metrics.revenue.fetch(ctx("2026-11-01"))).toEqual({ value: 10, breakdown: [{ label: "DE", value: 7 }, { label: "FR", value: 3 }] });
    expect(await feed.metrics.revenue.fetch(ctx("2026-10-01"))).toBeNull();
    expect(calls[0]).toEqual(["select sum(amount) from orders where paid_at >= $1 and paid_at < $2", ["2026-11-01", "2026-12-01"]]);
  });
});
