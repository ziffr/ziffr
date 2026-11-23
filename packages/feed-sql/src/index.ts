// @ziffr/feed-sql (spec 0012, GLOSSARY: Feed, Breakdown): a ready Feed for SQL databases and the reference example of
// one. A YAML file maps each Metric slug to a Postgres query that gives one period's value, with :period_start and
// :period_end as parameters (bound, never pasted into the text), and optionally a second query for its Breakdown.
// Queries run in a read-only transaction with a time limit, on a connection string from the environment, so the
// file itself holds no secret and can be kept in git.
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { parse } from "yaml";
import { bindFor, DEFAULT_DIALECT, DIALECTS, loadDriver, type Dialect } from "./dialect.js";
import { defineFeed, type FeedDefinition, type FetchContext } from "@ziffr/feed-kit";

/** One Metric's queries: `value` gives one row whose first column is the value (no row or null: no value yet);
 * `breakdown` gives rows of label and value. */
export type SqlMetric = { value: string; breakdown?: string };

/** What a SQL Feed's file says. `dialect` is the database language (default postgres); `connection_env` names the
 * environment variable with a read-only connection string (Postgres). */
export type SqlFeedConfig = { name: string; dialect?: Dialect; connection_env?: string; project?: string; max_bytes_billed?: number; warehouse?: string; role?: string; database?: string; schema?: string; statement_timeout_ms?: number; metrics: Record<string, SqlMetric> };

/** The connection string's variable when the file names none. */
export const DEFAULT_CONNECTION_ENV = "FEED_SQL_URL";

/** Reads and checks a SQL Feed's YAML file. */
export async function readConfig(path: string): Promise<SqlFeedConfig> {
  return checkConfig(parse(await readFile(path, "utf8")));
}

/** Checks a SQL Feed's settings: a name, a slug and a value query per Metric, and only the two known parameters. */
export function checkConfig(raw: unknown): SqlFeedConfig {
  const c = raw as Partial<SqlFeedConfig> | null;
  if (!c || typeof c !== "object") throw new Error("The file must hold name, connection_env and metrics.");
  if (typeof c.name !== "string" || !c.name.trim()) throw new Error("Give the Feed a name.");
  if (c.dialect !== undefined && !(DIALECTS as readonly unknown[]).includes(c.dialect)) throw new Error(`dialect must be one of ${DIALECTS.join(", ")}, not ${JSON.stringify(c.dialect)}.`);
  if (c.project !== undefined && (typeof c.project !== "string" || !c.project.trim())) throw new Error("project names a Google Cloud project, such as my-company-data.");
  if (c.max_bytes_billed !== undefined && !(Number.isSafeInteger(c.max_bytes_billed) && c.max_bytes_billed > 0)) throw new Error("max_bytes_billed is a whole number of bytes above zero, such as 10737418240.");
  if (c.connection_env !== undefined && !/^[A-Z_][A-Z0-9_]*$/.test(String(c.connection_env))) throw new Error("connection_env names an environment variable, such as WAREHOUSE_URL; the connection string itself never goes in the file.");
  // Snowflake names only (the driver reads them); a secret or free text does not belong in the file.
  for (const key of ["warehouse", "role", "database", "schema"] as const) {
    if (c[key] !== undefined && !/^[A-Za-z0-9_$.-]+$/.test(String(c[key]))) throw new Error(`${key} is a Snowflake name such as ANALYTICS_WH; it must not hold a secret or spaces.`);
  }
  if (!c.metrics || typeof c.metrics !== "object" || !Object.keys(c.metrics).length) throw new Error("List at least one Metric slug under metrics.");
  for (const [slug, m] of Object.entries(c.metrics)) {
    if (typeof m?.value !== "string" || !m.value.trim()) throw new Error(`${slug}: give a value query.`);
    for (const q of [m.value, m.breakdown].filter((x): x is string => typeof x === "string")) {
      const unknown = [...q.matchAll(/(?<!:):([a-z_]+)\b/g)].map((x) => x[1]).filter((p) => p !== "period_start" && p !== "period_end");
      if (unknown.length) throw new Error(`${slug}: only :period_start and :period_end may be used, not :${unknown[0]}.`);
    }
  }
  return c as SqlFeedConfig;
}

/** A query with :period_start and :period_end turned into the dialect's bound parameters (Postgres `$1` and `$2`,
 * see `bindFor`). A `::cast` stays as it is. */
export function bind(query: string, dialect: Dialect = DEFAULT_DIALECT): string {
  return bindFor(dialect, query);
}

/** Opens the runner for the file's dialect: Postgres from the connection string in the environment, the others from
 * their optional driver file. */
export async function openRunner(config: SqlFeedConfig, env: Record<string, string | undefined>, load?: (file: string) => Promise<unknown>): Promise<SqlRunner> {
  const dialect = config.dialect ?? DEFAULT_DIALECT;
  if (dialect !== "postgres") return (await loadDriver(dialect, load)).connect(config as unknown as Record<string, unknown>, env);
  const variable = config.connection_env ?? DEFAULT_CONNECTION_ENV;
  const url = env[variable];
  if (!url) throw new Error(`Set ${variable} to a read-only connection string for the database.`);
  return connect(url, config.statement_timeout_ms);
}

/** The database a SQL Feed reads: a function that runs one query read-only and gives its rows, and a way to close. */
export type SqlRunner = { query: (text: string, params: string[]) => Promise<Record<string, unknown>[]>; close: () => Promise<void> };

/** Connects to Postgres with the connection string; every query runs in a read-only transaction with a time limit,
 * so a Feed cannot change the database even if its user could. */
export function connect(url: string, timeoutMs = 30_000): SqlRunner {
  const sql = postgres(url, { max: 2, idle_timeout: 5, connect_timeout: 10, onnotice: () => {} });
  return {
    query: async (text, params) => sql.begin("read only", async (tx) => {
      await tx.unsafe(`set local statement_timeout = ${Math.max(1000, Math.min(Math.trunc(timeoutMs) || 30_000, 600_000))}`);
      // The text is the file's own query; the period goes in as bound parameters only.
      return [...(await tx.unsafe(text, params))] as Record<string, unknown>[];
    }) as Promise<Record<string, unknown>[]>,
    close: () => sql.end({ timeout: 5 }),
  };
}

/** A Feed from a SQL Feed's settings and a database to read. */
export function sqlFeed(config: SqlFeedConfig, db: SqlRunner): FeedDefinition {
  const checked = checkConfig(config);
  const metrics = Object.fromEntries(Object.entries(checked.metrics).map(([slug, m]) => [slug, {
    fetch: async (ctx: FetchContext) => {
      const params = [ctx.period, ctx.periodEnd];
      const rows = await db.query(bind(m.value, checked.dialect), params);
      const first = rows[0] ? Object.values(rows[0])[0] : null;
      if (first === null || first === undefined) return null;
      const value = Number(first);
      if (!Number.isFinite(value)) throw new Error(`the value query gave ${JSON.stringify(first)}, not a number`);
      if (!m.breakdown) return value;
      const parts = (await db.query(bind(m.breakdown, checked.dialect), params)).map((r) => Object.values(r)).map(([label, v]) => ({ label: String(label ?? ""), value: Number(v) }));
      return { value, breakdown: parts.filter((p) => p.label && Number.isFinite(p.value)) };
    },
  }]));
  return defineFeed({ name: checked.name, metrics });
}
