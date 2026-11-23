// The SQL Feed's settings and queries without a database (spec 0012, ticket #162): what a file must say, which
// parameters a query may use, and how they are bound.
import { describe, expect, it } from "vitest";
import { bind, checkConfig, openRunner, sqlFeed, type SqlRunner } from "./index";

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

describe("Snowflake names", () => {
  it("takes warehouse, role, database and schema names and refuses anything else", () => {
    expect(checkConfig({ ...ok, dialect: "snowflake", warehouse: "SMALL_WH", role: "FEED_RO", database: "ANALYTICS", schema: "PUBLIC" }).role).toBe("FEED_RO");
    expect(() => checkConfig({ ...ok, role: "x password=1" })).toThrow(/role is a Snowflake name/);
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

describe("dialect", () => {
  it("defaults to postgres and refuses an unknown dialect", () => {
    expect(checkConfig(ok).dialect).toBeUndefined();
    for (const dialect of ["postgres", "bigquery", "snowflake"]) expect(checkConfig({ ...ok, dialect }).dialect).toBe(dialect);
    expect(() => checkConfig({ ...ok, dialect: "mysql" })).toThrow(/dialect must be one of postgres, bigquery, snowflake/);
  });
  it("binds each dialect's own parameter syntax, with Postgres unchanged", () => {
    const q = "select :period_start::date, x where d >= :period_start and d < :period_end";
    expect(bind(q)).toBe("select $1::date, x where d >= $1 and d < $2");
    expect(bind(q, "postgres")).toBe(bind(q));
    const range = "select 1 where d >= :period_start and d < :period_end";
    expect(bind(range, "bigquery")).toBe("select 1 where d >= @period_start and d < @period_end");
    expect(bind(range, "snowflake")).toBe("select 1 where d >= :1 and d < :2");
  });
  it("sends the dialect's text to the runner with the two dates in order", async () => {
    const calls: [string, string[]][] = [];
    const db: SqlRunner = { query: async (text, params) => (calls.push([text, params]), [{ v: 1 }]), close: async () => {} };
    const feed = sqlFeed({ ...ok, dialect: "bigquery" }, db);
    await feed.metrics.revenue.fetch({ slug: "revenue", period: "2026-11-01", periodEnd: "2026-12-01", current: true, metric: {} as never });
    expect(calls[0]).toEqual(["select sum(amount) from orders where paid_at >= @period_start and paid_at < @period_end", ["2026-11-01", "2026-12-01"]]);
  });
});

describe("openRunner", () => {
  const fake: SqlRunner = { query: async () => [], close: async () => {} };
  it("hands the settings and environment to the driver file of a non-Postgres dialect", async () => {
    const seen: unknown[] = [];
    const load = async (file: string) => ({ connect: (config: unknown, env: unknown) => (seen.push(file, config, env), fake) });
    expect(await openRunner({ ...ok, dialect: "snowflake" }, { A: "1" }, load)).toBe(fake);
    expect(seen).toEqual(["snowflake", { ...ok, dialect: "snowflake" }, { A: "1" }]);
  });
  it("says which package to install when a driver is missing", async () => {
    const missing = async () => { throw Object.assign(new Error("Cannot find module"), { code: "ERR_MODULE_NOT_FOUND" }); };
    await expect(openRunner({ ...ok, dialect: "bigquery" }, {}, missing)).rejects.toThrow(/@google-cloud\/bigquery/);
    await expect(openRunner({ ...ok, dialect: "snowflake" }, {}, missing)).rejects.toThrow(/snowflake-sdk/);
  });
  it("passes other driver errors on, and Postgres still asks for its connection string", async () => {
    await expect(openRunner({ ...ok, dialect: "bigquery" }, {}, async () => { throw new Error("bad credentials"); })).rejects.toThrow("bad credentials");
    await expect(openRunner(ok, {})).rejects.toThrow(/Set WAREHOUSE_URL/);
  });
});
